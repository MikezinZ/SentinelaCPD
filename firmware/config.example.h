#ifndef CONFIG_H
#define CONFIG_H

// --- Credenciais Wi-Fi (Multi-AP) ---
#define WIFI_SSID_1 "NOME_DO_WIFI_1"
#define WIFI_PASS_1 "SENHA_DO_WIFI_1"

#define WIFI_SSID_2 "NOME_DO_HOTSPOT"
#define WIFI_PASS_2 "SENHA_DO_HOTSPOT"

// --- Configurações do Broker EMQX ---
#define MQTT_BROKER "IP_DO_COMPUTADOR_BROKER"
#define MQTT_PORT   1883
#define MQTT_USER   "usuario_mqtt"
#define MQTT_PASS   "senha_mqtt"
#define MQTT_TOPIC  "esp32/telemetria"

// --- Calibração dos Sensores ---
#define FATOR_CALIBRACAO_CORRENTE 0.00055

#endif