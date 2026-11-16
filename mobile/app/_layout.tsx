import '../global.css';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { DemoFloatingMenu } from '../components/DemoFloatingMenu';
import { LoadingState } from '../components/ui';

function NavigationGuard() {
  const { user, restoring } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (restoring) return;
    const inLogin = segments[0] === 'login';
    if (!user && !inLogin) {
      router.replace('/login');
    } else if (user && inLogin) {
      router.replace('/(tabs)/devices');
    }
  }, [user, restoring, segments, router]);

  if (restoring) {
    return (
      <View className="flex-1 bg-slate-100 items-center justify-center p-6">
        <LoadingState label="Restaurando sessão segura (SecureStore)…" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="devices/[id]/index" />
        <Stack.Screen name="devices/[id]/history" />
        <Stack.Screen name="devices/[id]/limits" />
      </Stack>
      {user ? <DemoFloatingMenu /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <NavigationGuard />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

