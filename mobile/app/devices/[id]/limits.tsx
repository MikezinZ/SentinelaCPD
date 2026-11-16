import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeviceLimitsScreen } from '../../../screens/DeviceLimitsScreen';

export default function DeviceLimitsRoute() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <DeviceLimitsScreen />
    </SafeAreaView>
  );
}

