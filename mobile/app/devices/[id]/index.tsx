import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeviceDetailScreen } from '../../screens/DeviceDetailScreen';

export default function DeviceDetailRoute() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <DeviceDetailScreen />
    </SafeAreaView>
  );
}

