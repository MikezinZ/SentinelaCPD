#pragma once

// Copie para config.h (ignorado pelo Git). Não envie segredos ao repositório.
// Senha diferente por placa, 12..63 caracteres ASCII imprimíveis.
// Anote em uma etiqueta antes de fechar a case. O exemplo desativa o portal.
#define CONFIG_AP_PASSWORD "TROQUE_ESTA_SENHA"

// O Wi-Fi do local será informado pelo celular, sem regravar o firmware.

// --- Configurações do Broker EMQX ---
// MQTT sem TLS SOMENTE na bancada. Não expor na internet.
// Deixe vazio para testar somente sensores e Wi-Fi.
#define MQTT_BROKER ""
#define MQTT_PORT   1883
#define MQTT_USER   ""
#define MQTT_PASS   ""
#define MQTT_TOPIC  "esp32/telemetria"

// --- Calibração dos Sensores ---
// Mantenha o fator já usado na bancada. Este é apenas o exemplo da N1.
#define FATOR_CALIBRACAO_CORRENTE 0.00055f
