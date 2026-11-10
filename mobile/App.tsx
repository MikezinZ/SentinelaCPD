import "./global.css";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Activity, Server, TriangleAlert, Settings } from "lucide-react-native";
import type { RootStackParams, TabParams } from "./src/types/domain";
import { restorePreferences } from "./src/services/preferences";
import { Button } from "./src/components/UI";
import { DevDrawer } from "./src/components/DevDrawer";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { RacksScreen } from "./src/screens/RacksScreen";
import { RackScreen } from "./src/screens/RackScreen";
import { IncidentesScreen } from "./src/screens/IncidentesScreen";
import { IncidentScreen } from "./src/screens/IncidentScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
const Tabs = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootStackParams>();
const icons = {
  Overview: Activity,
  Racks: Server,
  Incidents: TriangleAlert,
  Settings,
};
function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#5eead4",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: {
          backgroundColor: "#0f172a",
          borderTopColor: "#334155",
          minHeight: 56,
        },
        tabBarIcon: ({ color, size }) => {
          const Icon = icons[route.name];
          return <Icon color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen
        name="Overview"
        component={DashboardScreen}
        options={{ title: "Visão geral" }}
      />
      <Tabs.Screen
        name="Racks"
        component={RacksScreen}
        options={{ title: "Dispositivos" }}
      />
      <Tabs.Screen
        name="Incidents"
        component={IncidentesScreen}
        options={{ title: "Incidentes" }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Ajustes" }}
      />
    </Tabs.Navigator>
  );
}
function Root() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    void restorePreferences()
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (!ready)
    return (
      <View className="flex-1 justify-center bg-slate-950 px-6">
        {failed ? (
          <>
            <Text className="mb-4 text-red-300">
              Não foi possível carregar as preferências seguras.
            </Text>
            <Button
              title="Tentar novamente"
              onPress={() => setAttempt((n) => n + 1)}
            />
          </>
        ) : (
          <ActivityIndicator color="#2dd4bf" />
        )}
      </View>
    );
  return (
    <View className="flex-1">
      <NavigationContainer theme={DarkTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: "#020617" },
            headerTintColor: "#e2e8f0",
            contentStyle: { backgroundColor: "#020617" },
          }}
        >
          <Stack.Screen
            name="Main"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Rack"
            component={RackScreen}
            options={{ title: "Telemetria" }}
          />
          <Stack.Screen
            name="Incident"
            component={IncidentScreen}
            options={{ title: "Detalhes do incidente" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <DevDrawer />
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Root />
    </SafeAreaProvider>
  );
}
