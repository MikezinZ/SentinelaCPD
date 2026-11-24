"""Migração idempotente do banco para a API v2.

Roda na inicialização da API e do ingestor (cópia idêntica nos dois serviços).
O db/init.sql só é executado quando o volume do MySQL é criado; este módulo
atualiza também os bancos que já existem, sem apagar dados.
"""

TABELAS = [
    """CREATE TABLE IF NOT EXISTS usuarios (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        email       VARCHAR(120) NOT NULL UNIQUE,
        nome        VARCHAR(100) NOT NULL,
        papel       ENUM('viewer','operator','admin') NOT NULL DEFAULT 'viewer',
        senha_hash  VARCHAR(255) NOT NULL,
        ativo       TINYINT(1)   NOT NULL DEFAULT 1,
        criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS sessoes (
        token_hash  CHAR(64)  PRIMARY KEY,
        usuario_id  INT       NOT NULL,
        expira_em   TIMESTAMP NOT NULL,
        criado_em   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sessao_usuario (usuario_id),
        CONSTRAINT fk_sessao_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )""",
    """CREATE TABLE IF NOT EXISTS limites (
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
    )""",
    """CREATE TABLE IF NOT EXISTS alertas (
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
    )""",
    # Atualização de firmware (OTA remota pela dashboard)
    """CREATE TABLE IF NOT EXISTS firmwares (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        versao      VARCHAR(32)  NOT NULL,
        sequencia   INT          NOT NULL UNIQUE,
        alvo        VARCHAR(16)  NOT NULL,
        tamanho     INT          NOT NULL,
        sha256      CHAR(64)     NOT NULL,
        notas       VARCHAR(255) NULL,
        enviado_por VARCHAR(100) NULL,
        criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS ota_jobs (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        dispositivo_id VARCHAR(50)  NOT NULL,
        firmware_id    INT          NOT NULL,
        versao_origem  VARCHAR(32)  NULL,
        status         VARCHAR(20)  NOT NULL DEFAULT 'queued',
        detalhe        VARCHAR(255) NULL,
        token_hash     CHAR(64)     NOT NULL,
        criado_por     VARCHAR(100) NULL,
        criado_em      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        concluido_em   TIMESTAMP    NULL,
        INDEX idx_ota_disp (dispositivo_id, criado_em),
        CONSTRAINT fk_ota_disp FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id),
        CONSTRAINT fk_ota_fw FOREIGN KEY (firmware_id) REFERENCES firmwares(id)
    )""",
]

# Colunas novas em tabelas da N2 (MySQL 8.0 não tem ADD COLUMN IF NOT EXISTS).
COLUNAS = [
    ("dispositivos", "ativo", "TINYINT(1) NOT NULL DEFAULT 1"),
    ("dispositivos", "firmware", "VARCHAR(32) NULL"),
    ("dispositivos", "energia", "VARCHAR(10) NOT NULL DEFAULT 'unknown'"),  # mains | battery | unknown
]

# Limites padrão (ASHRAE TC 9.9 para temperatura; faixa prática de umidade do projeto).
LIMITES_PADRAO = dict(
    versao=1, temperature_min=18.0, temperature_max=27.0, humidity_min=40.0, humidity_max=60.0,
    current_max=None, temperature_hysteresis=1.0, humidity_hysteresis=3.0, current_hysteresis=None,
    consecutive_samples=3,
)


def migrar(conn):
    cur = conn.cursor()
    for sql in TABELAS:
        cur.execute(sql)
    for tabela, coluna, definicao in COLUNAS:
        cur.execute(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s",
            (tabela, coluna),
        )
        if cur.fetchone()[0] == 0:
            try:
                cur.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao}")
            except Exception as e:  # outro serviço pode ter criado a coluna ao mesmo tempo
                if getattr(e, "errno", None) != 1060:
                    raise
    conn.commit()
    cur.close()
