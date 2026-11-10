-- SentinelaCPD: esquema inicial (executado só na primeira criação do volume)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS dispositivos (
  id             VARCHAR(50)  PRIMARY KEY,
  nome           VARCHAR(100) NULL,
  local          VARCHAR(100) NULL,
  estado         VARCHAR(30)  NOT NULL DEFAULT 'NORMAL',   -- NORMAL | ON_BATTERY | OVERHEATING_ALERT
  criado_em      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_contato TIMESTAMP    NULL
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
