#include <WiFi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>
#include "DHT.h"
#include "config.h" // Carrega as credenciais e configurações

// --- Gerenciador Multi-WiFi ---
WiFiMulti wifiMulti;

// --- Configurações do DHT22 ---
#define DHTPIN 27
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// --- Configurações do ZMCT103C ---
#define CURRENT_PIN 34
const float FATOR_CALIBRACAO = FATOR_CALIBRACAO_CORRENTE; 

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastSend = 0;
const long interval = 5000;

float calcularCorrenteRMS() {
  unsigned long tempoInicio = millis();
  double soma = 0;
  double somaQuadrados = 0;
  long totalAmostras = 0;

  while (millis() - tempoInicio < 200) {
    int leitura = analogRead(CURRENT_PIN);
    soma += leitura;
    somaQuadrados += (double)leitura * leitura;
    totalAmostras++;
    delayMicroseconds(200);
  }

  if (totalAmostras == 0) return 0.00;

  double media = soma / totalAmostras;
  double variancia = (somaQuadrados / totalAmostras) - (media * media);
  if (variancia < 0) variancia = 0;
  double rmsADC = sqrt(variancia);

  if (rmsADC < 18.0) {
    return 0.00;
  }

  return (float)(rmsADC * FATOR_CALIBRACAO);
}

void setup_wifi() {
  delay(10);
  Serial.println("\n[Wi-Fi] Inicializando...");

  wifiMulti.addAP(WIFI_SSID_1, WIFI_PASS_1);
  wifiMulti.addAP(WIFI_SSID_2, WIFI_PASS_2);

  while (wifiMulti.run() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[Wi-Fi] Conectado!");
  Serial.print("[Wi-Fi] SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("[Wi-Fi] IP: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  if (wifiMulti.run() != WL_CONNECTED) {
    return;
  }

  while (!client.connected()) {
    Serial.print("[MQTT] Conectando... ");
    String clientId = "ESP32_CPD_" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println("Conectado com sucesso!");
    } else {
      Serial.print("Falha. Cod: ");
      Serial.print(client.state());
      Serial.println(" - Nova tentativa em 3s...");
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(CURRENT_PIN, INPUT);
  dht.begin();
  setup_wifi();
  
  client.setServer(MQTT_BROKER, MQTT_PORT);
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
      Serial.println("[DHT22] Erro de leitura!");
    } else {
      char payload[128];
      snprintf(payload, sizeof(payload), 
               "{\"temperatura\": %.1f, \"umidade\": %.1f, \"corrente\": %.2f}", 
               t, h, c);

      Serial.print("[MQTT] Publicando: ");
      Serial.println(payload);

      client.publish(MQTT_TOPIC, payload);
    }
  }
}