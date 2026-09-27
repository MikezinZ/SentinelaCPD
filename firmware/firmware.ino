#include <WiFi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>
#include "DHT.h"

// --- Gerenciador Multi-WiFi ---
WiFiMulti wifiMulti;

// --- Configurações do Broker EMQX ---
const char* mqtt_broker = "192.168.18.118"; // Confirme se o IP continua este
const int mqtt_port = 1883;
const char* mqtt_user = "esp32_cpd";
const char* mqtt_pass = "cpd123";
const char* topic_telemetria = "esp32/telemetria";

// --- Configurações do DHT22 ---
#define DHTPIN 27
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// --- Configurações do ZMCT103C ---
#define CURRENT_PIN 34
// Fator de calibração inicial (ajustável após teste com carga conhecida)
const float FATOR_CALIBRACAO = 0.00055; 

WiFiClient espClient;
PubSubClient client(espClient);

// Controle de tempo não bloqueante
unsigned long lastSend = 0;
const long interval = 5000; // Envio a cada 5 segundos

// Função para amostragem e cálculo de corrente eficaz (RMS)
float calcularCorrenteRMS() {
  unsigned long tempoInicio = millis();
  double soma = 0;
  double somaQuadrados = 0;
  long totalAmostras = 0;

  // Amostra durante 200 ms (12 ciclos completos de 60Hz)
  while (millis() - tempoInicio < 200) {
    int leitura = analogRead(CURRENT_PIN);
    soma += leitura;
    somaQuadrados += (double)leitura * leitura;
    totalAmostras++;
    delayMicroseconds(200);
  }

  if (totalAmostras == 0) return 0.0;

  // Cálculo da variância / RMS da componente AC
  double media = soma / totalAmostras;
  double variancia = (somaQuadrados / totalAmostras) - (media * media);
  if (variancia < 0) variancia = 0;
  double rmsADC = sqrt(variancia);

  // Filtro de ruído: valores baixos de oscilação natural do ADC são tratados como zero
  if (rmsADC < 18.0) {
    return 0.00;
  }

  float correnteCalculada = rmsADC * FATOR_CALIBRACAO;
  return correnteCalculada;
}

void setup_wifi() {
  delay(10);
  Serial.println("\nProcurando redes cadastradas...");

  wifiMulti.addAP("PRINCIPE", "19592005");
  wifiMulti.addAP("iPhone de Diogo", "dgzin111");

  while (wifiMulti.run() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[Wi-Fi] Conectado!");
  Serial.print("[Wi-Fi] SSID ativo: ");
  Serial.println(WiFi.SSID());
  Serial.print("[Wi-Fi] IP do ESP32: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  if (wifiMulti.run() != WL_CONNECTED) {
    return;
  }

  while (!client.connected()) {
    Serial.print("Tentando conexao MQTT com ");
    Serial.print(mqtt_broker);
    Serial.print("... ");
    
    String clientId = "ESP32_CPD_" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("SUCESSO!");
    } else {
      Serial.print("Falha (Cod: ");
      Serial.print(client.state());
      Serial.println("). Nova tentativa em 3s...");
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(CURRENT_PIN, INPUT);
  dht.begin();
  setup_wifi();
  
  client.setServer(mqtt_broker, mqtt_port);
  client.setSocketTimeout(3);
}

void loop() {
  if (wifiMulti.run() != WL_CONNECTED) {
    delay(100);
    return;
  }

  if (!client.connected()) {
    reconnect();
  }
  
  client.loop();

  unsigned long now = millis();
  if (now - lastSend >= interval) {
    lastSend = now;

    float t = dht.readTemperature();
    float h = dht.readHumidity();
    float c = calcularCorrenteRMS();

    if (isnan(t) || isnan(h)) {
      Serial.println("[DHT22] Alerta: Falha na leitura física do sensor!");
    } else {
      char payload[128];
      snprintf(payload, sizeof(payload), 
               "{\"temperatura\": %.1f, \"umidade\": %.1f, \"corrente\": %.2f}", 
               t, h, c);

      Serial.print("[MQTT] Publicando: ");
      Serial.println(payload);

      client.publish(topic_telemetria, payload);
    }
  }
}