-- SentinelaCPD: esquema inicial (executado só na primeira criação do volume).
-- Bancos já existentes são atualizados pela migração em api/schema.py ao subir a API.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS dispositivos (
  id             VARCHAR(50)  PRIMARY KEY,
  nome           VARCHAR(100) NULL,
  local          VARCHAR(100) NULL,
  estado         VARCHAR(30)  NOT NULL DEFAULT 'NORMAL',   -- NORMAL | ON_BATTERY | OVERHEATING_ALERT
  criado_em      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_contato TIMESTAMP    NULL,
  ativo          TINYINT(1)   NOT NULL DEFAULT 1,
  firmware       VARCHAR(32)  NULL,
  energia        VARCHAR(10)  NOT NULL DEFAULT 'unknown'          -- mains | battery | unknown
);

CREATE TABLE IF NOT EXISTS leituras (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispositivo_id VARCHAR(50)  NOT NULL,
  temperatura    FLOAT        NULL,
  umidade        FLOAT        NULL,
  corrente       FLOAT        NULL,   -- A (RMS), quando o firmware enviar
  bateria        TINYINT      NULL,   -- %, quando o firmware enviar
  data_hora      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_disp_hora (dispositivo_id, data_hora),
  CONSTRAINT fk_leitura_disp FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
);

CREATE TABLE IF NOT EXISTS eventos (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispositivo_id VARCHAR(50)  NOT NULL,
  tipo           VARCHAR(30)  NOT NULL,   -- POWER_LOSS | LAST_GASP | POWER_RESTORED
  payload        JSON         NULL,
  data_hora      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ev_disp_hora (dispositivo_id, data_hora),
  CONSTRAINT fk_evento_disp FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
);

CREATE TABLE IF NOT EXISTS incidentes (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  dispositivo_id VARCHAR(50)  NOT NULL,
  tipo           VARCHAR(30)  NOT NULL DEFAULT 'QUEDA_ENERGIA',
  status         ENUM('ABERTO','FECHADO') NOT NULL DEFAULT 'ABERTO',
  inicio         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fim            TIMESTAMP    NULL,
  duracao_s      INT          NULL,
  INDEX idx_inc_disp_status (dispositivo_id, status),
  CONSTRAINT fk_inc_disp FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
);

-- ---------------------------------------------------------------- API v2
CREATE TABLE IF NOT EXISTS usuarios (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(120) NOT NULL UNIQUE,
    nome        VARCHAR(100) NOT NULL,
    papel       ENUM('viewer','operator','admin') NOT NULL DEFAULT 'viewer',
    senha_hash  VARCHAR(255) NOT NULL,
    ativo       TINYINT(1)   NOT NULL DEFAULT 1,
    criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessoes (
    token_hash  CHAR(64)  PRIMARY KEY,
    usuario_id  INT       NOT NULL,
    expira_em   TIMESTAMP NOT NULL,
    criado_em   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sessao_usuario (usuario_id),
    CONSTRAINT fk_sessao_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS limites (
    dispositivo_id         VARCHAR(50) PRIMARY KEY,
    versao                 INT    NOT NULL DEFAULT 1,
    temperature_min        FLOAT  NULL,
    temperature_max        FLOAT  NULL,
    humidity_min           FLOAT  NULL,
    humidity_max           FLOAT  NULL,
    current_max            FLOAT  NULL,
    temperature_hysteresis FLOAT  NULL,
    humidity_hysteresis    FLOAT  NULL,
    current_hysteresis     FLOAT  NULL,
    consecutive_samples    INT    NOT NULL DEFAULT 3,
    atualizado_em          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    atualizado_por         VARCHAR(100) NULL,
    CONSTRAINT fk_limite_disp FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
);

CREATE TABLE IF NOT EXISTS alertas (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    dispositivo_id   VARCHAR(50)  NOT NULL,
    tipo             VARCHAR(30)  NOT NULL,
    severidade       VARCHAR(10)  NOT NULL,
    mensagem         VARCHAR(255) NOT NULL,
    versao_regra     INT          NOT NULL DEFAULT 1,
    aberto_em        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reconhecido_em   TIMESTAMP    NULL,
    reconhecido_por  VARCHAR(100) NULL,
    nota             VARCHAR(500) NULL,
    resolvido_em     TIMESTAMP    NULL,
    INDEX idx_alerta_aberto (dispositivo_id, tipo, resolvido_em),
    INDEX idx_alerta_data (aberto_em),
    CONSTRAINT fk_alerta_disp FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
);
