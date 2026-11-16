#pragma once
#include <Arduino.h>
#include "ProductConfig.h"
#include "ReleasePolicy.h"
namespace sentinela {
struct PowerMonitor {
  PowerFilter filter;
  float volts=NAN;
  bool presenceConfigured() const {return powerPinValid(POWER_PRESENT_PIN) && POWER_PRESENT_PIN!=BATTERY_ADC_PIN;}
  void begin() {
    if(presenceConfigured())pinMode(POWER_PRESENT_PIN,INPUT); // requer circuito externo definido; sem pull-up presumido
    if(batteryPinValid(BATTERY_ADC_PIN) && BATTERY_ADC_PIN!=POWER_PRESENT_PIN)pinMode(BATTERY_ADC_PIN,INPUT);
  }
  void sample() {
    if(presenceConfigured())filter.update(digitalRead(POWER_PRESENT_PIN)==POWER_PRESENT_LEVEL?1:0,millis());
    if(batteryPinValid(BATTERY_ADC_PIN) && BATTERY_ADC_PIN!=POWER_PRESENT_PIN &&
       isfinite(BATTERY_DIVIDER_RATIO) && BATTERY_DIVIDER_RATIO>1 && isfinite(BATTERY_CALIBRATION) && BATTERY_CALIBRATION>0) {
      uint32_t sum=0;for(int i=0;i<16;++i)sum+=analogReadMilliVolts(BATTERY_ADC_PIN);
      volts=float(sum)/16000.0f*BATTERY_DIVIDER_RATIO*BATTERY_CALIBRATION;
      if(volts<2.0f||volts>4.5f)volts=NAN;
    }
  }
};
}
