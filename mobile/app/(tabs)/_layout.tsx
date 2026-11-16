import React from 'react';
import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Server } from 'lucide-react-native';

export default function TabsLayout() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#1d4ed8',
          tabBarInactiveTintColor: '#64748b',
          tabBarStyle: {
            height: 64,
            paddingTop: 6,
            paddingBottom: 8,
            backgroundColor: '#ffffff',
            borderTopColor: '#e2e8f0',
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '700',
          },
        }}
      >
        <Tabs.Screen
          name="devices"
          options={{
            title: 'Dispositivos',
            tabBarAccessibilityLabel: 'Aba Dispositivos e Racks',
            tabBarIcon: ({ color, size }) => (
              <Server size={size || 20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="alerts"
          options={{
            title: 'Alertas',
            tabBarAccessibilityLabel: 'Aba Central de Alertas',
            tabBarIcon: ({ color, size }) => (
              <BellRing size={size || 20} color={color} />
            ),
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}

