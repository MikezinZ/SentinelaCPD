import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeviceHistoryScreen } from '../../../screens/DeviceHistoryScreen';

export default function DeviceHistoryRoute() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <DeviceHistoryScreen />
    </SafeAreaView>
  );
}

