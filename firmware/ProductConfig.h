#pragma once
// Defaults mantêm o config.h anterior compilável. Configure no arquivo privado.
#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.3.0"
#endif
#ifndef FIRMWARE_SEQUENCE
#define FIRMWARE_SEQUENCE 3
#endif
#ifndef OTA_ENABLED
#define OTA_ENABLED 0
#endif
#ifndef OTA_MANIFEST_URL
#define OTA_MANIFEST_URL ""
#endif
#ifndef OTA_RELEASE_PREFIX
#define OTA_RELEASE_PREFIX ""
#endif
#ifndef OTA_CA_PEM
#define OTA_CA_PEM ""
#endif
#ifndef OTA_PUBLIC_KEY_PEM
#define OTA_PUBLIC_KEY_PEM ""
#endif
#ifndef POWER_PRESENT_PIN
#define POWER_PRESENT_PIN -1
#endif
#ifndef POWER_PRESENT_LEVEL
#define POWER_PRESENT_LEVEL 1
#endif
#ifndef BATTERY_ADC_PIN
#define BATTERY_ADC_PIN -1
#endif
#ifndef BATTERY_DIVIDER_RATIO
#define BATTERY_DIVIDER_RATIO 0.0f
#endif
#ifndef BATTERY_CALIBRATION
#define BATTERY_CALIBRATION 1.0f
#endif

#ifndef MQTT_TLS_ENABLED
#define MQTT_TLS_ENABLED 0
#endif
#ifndef MQTT_CA_PEM
#define MQTT_CA_PEM ""
#endif
