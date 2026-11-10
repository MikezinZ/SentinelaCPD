-- Executado pela imagem oficial MySQL na primeira inicialização.
-- O banco selecionado é MYSQL_DATABASE (iot_db no .env.example).
-- Não contém credenciais nem altera tabelas existentes.
CREATE TABLE IF NOT EXISTS leituras_dht22 (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cliente_id VARCHAR(255) NOT NULL,
    topico VARCHAR(1024) NOT NULL,
    temperatura DECIMAL(5,2) NOT NULL,
    umidade DECIMAL(5,2) NOT NULL,
    corrente DECIMAL(8,3) NOT NULL,
    data_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_data_hora (data_hora),
    INDEX idx_cliente_data (cliente_id, data_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
