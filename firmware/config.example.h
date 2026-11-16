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


// --- Energia: manter -1 até confirmar circuito, GPIO e níveis elétricos ---
#define POWER_PRESENT_PIN -1
#define POWER_PRESENT_LEVEL 1
#define BATTERY_ADC_PIN -1
#define BATTERY_DIVIDER_RATIO 0.0f
#define BATTERY_CALIBRATION 1.0f

// --- OTA: habilitar somente com bootloader rollback validado, sensor de fonte e TLS ---
#define OTA_ENABLED 0
#define OTA_MANIFEST_URL ""
#define OTA_RELEASE_PREFIX "" // https://servidor/releases/ (barra final obrigatória)
#define OTA_CA_PEM "" // CA em PEM: usar literal R"PEM(...)PEM"
#define OTA_PUBLIC_KEY_PEM "" // SOMENTE a chave pública RSA; privada fica fora do Git/dispositivo

// Backend precisa oferecer MQTTS, credenciais por dispositivo e ACL.
#define MQTT_TLS_ENABLED 0
#define MQTT_CA_PEM ""
// Com TLS, configurar MQTT_PORT conforme o listener MQTTS real (normalmente 8883).
