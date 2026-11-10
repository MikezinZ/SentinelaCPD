import { useSyncExternalStore, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ApiState } from "../types/domain";
import type { StatusGeral } from "../types/api";
import { getRuntime, subscribeRuntime, usingMocks } from "../mocks/runtime";
import { statusLabel } from "../utils/format";
import { ApiError } from "../services/errors";
export function Card({ children }: PropsWithChildren) {
  return (
    <View className="mb-3 rounded-2xl border border-slate-700 bg-slate-900 p-4">
      {children}
    </View>
  );
}
export function Label({ children }: PropsWithChildren) {
  return (
    <Text className="mb-2 text-sm leading-5 text-slate-400">{children}</Text>
  );
}
export function Title({ children }: PropsWithChildren) {
  return (
    <Text
      accessibilityRole="header"
      className="mb-4 text-2xl font-bold text-white"
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`mb-3 min-h-12 items-center justify-center rounded-xl px-4 py-3 ${disabled ? "bg-slate-700" : secondary ? "bg-slate-800" : "bg-teal-400"}`}
    >
      <Text
        className={`text-base font-bold ${secondary || disabled ? "text-slate-200" : "text-slate-950"}`}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Badge({
  status,
  label,
}: {
  status: StatusGeral;
  label?: string;
}) {
  const color =
    status === "NORMAL"
      ? "text-teal-300"
      : status === "EM_INCIDENTE"
        ? "text-red-300"
        : status === "ALERTA_TEMPERATURA"
          ? "text-amber-300"
          : "text-slate-300";
  return (
    <View className="self-start rounded-full bg-slate-800 px-3 py-2">
      <Text className={color}>{label ?? statusLabel[status]}</Text>
    </View>
  );
}
export function Page({
  children,
  refresh,
  refreshing = false,
}: PropsWithChildren<{ refresh?(): void; refreshing?: boolean }>) {
  useSyncExternalStore(subscribeRuntime, getRuntime, getRuntime);
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-slate-950"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
        refreshControl={
          refresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor="#2dd4bf"
            />
          ) : undefined
        }
      >
        <Text className="mb-4 text-xs font-bold tracking-widest text-teal-300">
          SENTINELA / CPD • {usingMocks() ? "DEMONSTRAÇÃO" : "API CLOUD"}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function QueryFeedback<T>({ state }: { state: ApiState<T> }) {
  const unavailable =
    state.error instanceof ApiError &&
    (state.error.status === 503 ||
      state.error.kind === "network" ||
      state.error.kind === "timeout");
  return (
    <>
      {state.loading && (
        <ActivityIndicator
          accessibilityLabel="Carregando dados"
          color="#2dd4bf"
        />
      )}
      {state.error && (
        <Card>
          {unavailable && <Badge status="OFFLINE" />}
          <Text accessibilityRole="alert" className="my-3 text-red-300">
            {state.error.message}
          </Text>
          <Button title="Tentar novamente" onPress={state.refetch} secondary />
        </Card>
      )}
    </>
  );
}
