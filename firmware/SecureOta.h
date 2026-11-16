#pragma once
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <esp_ota_ops.h>
#include <esp_task_wdt.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>
#include <atomic>
#include <algorithm>
#include <time.h>
#include "ProductConfig.h"
#include "ReleasePolicy.h"

namespace sentinela {
namespace secureOta {
static std::atomic<bool> externalPower{false}, healthy{false};
static std::atomic<uint32_t> powerObservedAt{0};
static bool safePower(){return externalPower.load() && uint32_t(millis()-powerObservedAt.load())<12000;}
static Preferences bootStore;
static bool pendingBoot=false, storeOpen=false, watchdogReady=false;
static uint32_t bootAt=0, firstSeq=0;
static const esp_partition_t* running=nullptr;
static constexpr bool rollbackCompiled() {
#if defined(CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE) && CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE
  return true;
#else
  return false;
#endif
}
static bool signatureValid(const Release& r) {
  unsigned char digest[32];
  if(mbedtls_sha256((const unsigned char*)r.signedText.data(),r.signedText.size(),digest,0)!=0)return false;
  std::vector<unsigned char> sig(r.signature.size()/2);
  for(size_t i=0;i<sig.size();++i)sig[i]=strtoul(r.signature.substr(2*i,2).c_str(),nullptr,16);
  mbedtls_pk_context pk;mbedtls_pk_init(&pk);
  bool ok=mbedtls_pk_parse_public_key(&pk,(const unsigned char*)OTA_PUBLIC_KEY_PEM,strlen(OTA_PUBLIC_KEY_PEM)+1)==0;
  ok=ok && mbedtls_pk_can_do(&pk,MBEDTLS_PK_RSA) && mbedtls_pk_get_bitlen(&pk)>=2048 &&
    mbedtls_pk_get_bitlen(&pk)<=4096 && mbedtls_pk_verify(&pk,MBEDTLS_MD_SHA256,digest,sizeof(digest),sig.data(),sig.size())==0;
  mbedtls_pk_free(&pk);return ok;
}
static void setTls(WiFiClientSecure& tls) {tls.setCACert(OTA_CA_PEM);tls.setHandshakeTimeout(15);tls.setTimeout(10000);}
static bool fetchManifest(String& text) {
  WiFiClientSecure tls;setTls(tls);HTTPClient http;
  http.setConnectTimeout(10000);http.setTimeout(10000);http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if(!http.begin(tls,OTA_MANIFEST_URL))return false;
  int code=http.GET(), size=http.getSize();
  bool ok=code==200 && size>0 && size<=4096;
  if(ok){text=http.getString();ok=text.length()==size;}
  http.end();return ok;
}
static bool install(const Release& r,Preferences& db) {
  if(!safePower()||!healthy.load())return false;
  const esp_partition_t* slot=esp_ota_get_next_update_partition(nullptr);
  if(!slot||r.size>slot->size)return false;
  WiFiClientSecure tls;setTls(tls);HTTPClient http;
  http.setConnectTimeout(10000);http.setTimeout(10000);http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if(!http.begin(tls,r.url.c_str()))return false;
  int code=http.GET();
  if(code!=200 || http.getSize()!=int(r.size)){http.end();return false;}
  esp_ota_handle_t handle=0;
  if(esp_ota_begin(slot,r.size,&handle)!=ESP_OK){http.end();return false;}
  mbedtls_sha256_context hash;mbedtls_sha256_init(&hash);
  bool ok=mbedtls_sha256_starts(&hash,0)==0;
  unsigned char buffer[1024],digest[32]={};uint32_t total=0,start=millis(),progress=millis();
  auto* stream=http.getStreamPtr();
  while(ok && total<r.size) {
    esp_task_wdt_reset();
    if(!safePower()||!healthy.load()||uint32_t(millis()-start)>300000 || uint32_t(millis()-progress)>15000){ok=false;break;}
    int available=stream->available();
    if(!available){if(!http.connected()){ok=false;break;}delay(10);continue;}
    size_t want=std::min(size_t(available),std::min(sizeof(buffer),size_t(r.size-total)));
    int got=stream->read(buffer,want);
    if(got<=0){ok=false;break;}
    ok=mbedtls_sha256_update(&hash,buffer,got)==0 && esp_ota_write(handle,buffer,got)==ESP_OK;
    total+=got;progress=millis();delay(1);
  }
  ok=ok && mbedtls_sha256_finish(&hash,digest)==0;
  mbedtls_sha256_free(&hash);http.end();
  char hex[65];for(int i=0;i<32;++i)snprintf(hex+2*i,3,"%02x",digest[i]);
  ok=ok && r.sha==hex && total==r.size && safePower() && healthy.load();
  if(!ok){esp_ota_abort(handle);return false;}
  if(esp_ota_end(handle)!=ESP_OK)return false;
  // Registrar tentativa antes de selecionar novo slot. Nunca apagar a aplicação atual.
  if(db.putUInt("pending",r.sequence)!=sizeof(uint32_t))return false;
  if(esp_ota_set_boot_partition(slot)!=ESP_OK){db.remove("pending");return false;}
  Serial.println("[OTA] Imagem verificada; reiniciando para teste de saude.");
  delay(200);ESP.restart();return true;
}
static void worker(void*) {
  esp_task_wdt_add(nullptr);
  Preferences db;
  if(!db.begin("sentinela-ota",false)){esp_task_wdt_delete(nullptr);vTaskDelete(nullptr);return;}
  uint32_t last=millis()-900000;
  for(;;) {
    esp_task_wdt_reset();
    if(healthy.load() && safePower() && WiFi.status()==WL_CONNECTED &&
       time(nullptr)>1767225600 && uint32_t(millis()-last)>=900000) {
      last=millis();String body;Release release;
      const esp_partition_t* slot=esp_ota_get_next_update_partition(nullptr);
      if(slot && fetchManifest(body) && releasePolicy(body.c_str(),OTA_RELEASE_PREFIX,FIRMWARE_SEQUENCE,
          db.getUInt("floor",0),db.getUInt("rejected",0),slot->size,release) && signatureValid(release)) {
        if(!install(release,db))Serial.println("[OTA] Atualizacao abortada; aplicacao atual preservada.");
      } else Serial.println("[OTA] Sem release elegivel/verificavel.");
    }
    delay(1000);
  }
}
inline void begin() {
  bootAt=millis();running=esp_ota_get_running_partition();
  storeOpen=bootStore.begin("sentinela-ota",false);
  esp_ota_img_states_t state;
  pendingBoot=running && esp_ota_get_state_partition(running,&state)==ESP_OK && state==ESP_OTA_IMG_PENDING_VERIFY;
  if(storeOpen) {
    uint32_t attempted=bootStore.getUInt("pending",0);
    if(pendingBoot && attempted!=FIRMWARE_SEQUENCE) {
      esp_ota_mark_app_invalid_rollback_and_reboot();
      return;
    }
    if(attempted && !pendingBoot) {
      bootStore.putUInt("rejected",attempted);bootStore.remove("pending");
      Serial.println("[OTA] Release anterior nao confirmado; bloqueado para novas tentativas automaticas.");
    }
  }
  // Recuperar travamento de loop/coleta. Configuração vale para a tarefa OTA também.
  esp_task_wdt_config_t config={};config.timeout_ms=60000;config.trigger_panic=true;
  esp_err_t wd=esp_task_wdt_reconfigure(&config);
  if(wd==ESP_ERR_INVALID_STATE)wd=esp_task_wdt_init(&config);
  if(wd==ESP_OK){
    if(esp_task_wdt_status(nullptr)!=ESP_OK)esp_task_wdt_add(nullptr);
    watchdogReady=esp_task_wdt_status(nullptr)==ESP_OK;
  }
  if(!watchdogReady)Serial.println("[OTA] Bloqueado: watchdog indisponivel.");
  if(!rollbackCompiled())Serial.println("[OTA] Bloqueado: compilacao/bootloader sem rollback; usar perfil ESP-IDF.");
  if(OTA_ENABLED && rollbackCompiled() && watchdogReady && storeOpen && strlen(OTA_MANIFEST_URL)>8 &&
      String(OTA_MANIFEST_URL).startsWith("https://") && strlen(OTA_CA_PEM)>50 && strlen(OTA_PUBLIC_KEY_PEM)>50) {
    configTime(0,0,"pool.ntp.org","time.google.com");
    if(xTaskCreate(worker,"secure-ota",12288,nullptr,1,nullptr)!=pdPASS)Serial.println("[OTA] Memoria insuficiente.");
  }
}
inline void observe(uint32_t seq,uint32_t age,bool nvsOk,int power,bool portal) {
  if(watchdogReady)esp_task_wdt_reset();
  powerObservedAt.store(millis()-age);
  externalPower.store(power==1 && !portal && age<12000);
  if(!firstSeq && seq)firstSeq=seq;
  bool ok=watchdogReady && nvsOk && firstSeq && uint32_t(seq-firstSeq)>=3 && age<12000;
  if(!healthy.load() && ok && uint32_t(millis()-bootAt)>=30000) {
    bool accepted=!pendingBoot || esp_ota_mark_app_valid_cancel_rollback()==ESP_OK;
    if(accepted && storeOpen) {
      uint32_t floor=bootStore.getUInt("floor",0);
      if(FIRMWARE_SEQUENCE>floor)bootStore.putUInt("floor",FIRMWARE_SEQUENCE);
      bootStore.remove("pending");pendingBoot=false;healthy.store(true);
      Serial.println("[OTA] Saude local confirmada.");
    }
  }
  if(healthy.load() && !ok)healthy.store(false);
  if(pendingBoot && !healthy.load() && uint32_t(millis()-bootAt)>90000)esp_ota_mark_app_invalid_rollback_and_reboot();
}
}
}
