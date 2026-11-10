import { useState, useSyncExternalStore } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  getRuntime,
  subscribeRuntime,
  scenarios,
  devMenuEnabled,
  mocksForced,
  usingMocks,
} from "../mocks/runtime";
import { updatePreferences } from "../services/preferences";
import { Button, Title, Label } from "./UI";
export function DevDrawer() {
  const state = useSyncExternalStore(subscribeRuntime, getRuntime, getRuntime);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  if (!devMenuEnabled) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir cenários de desenvolvimento"
        onPress={() => setOpen(true)}
        style={{
          position: "absolute",
          right: 16,
          bottom: 80 + insets.bottom,
          minWidth: 48,
          minHeight: 48,
          backgroundColor: "#2dd4bf",
          borderRadius: 24,
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
        }}
      >
        <Text style={{ fontWeight: "700", color: "#020617" }}>DEV</Text>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-slate-950">
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Title>Cenários de demonstração</Title>
            <Label>
              Selecionar um cenário ativa o Mock Engine e limpa os dados da
              fonte anterior.
            </Label>
            {scenarios.map((s) => (
              <Button
                key={s.id}
                disabled={busy}
                secondary={state.scenario !== s.id || !usingMocks()}
                title={`${state.scenario === s.id && usingMocks() ? "✓ " : ""}${s.label}`}
                onPress={() => {
                  setBusy(true);
                  setError(null);
                  void updatePreferences(true, s.id)
                    .catch(() => setError("Falha ao salvar o cenário."))
                    .finally(() => setBusy(false));
                }}
              />
            ))}
            <Button
              title={
                mocksForced
                  ? "Mock obrigatório pela configuração"
                  : "Conectar à API Cloud"
              }
              disabled={busy || mocksForced}
              secondary
              onPress={() => {
                setBusy(true);
                void updatePreferences(false, state.scenario)
                  .catch(() => setError("Falha ao alterar o modo."))
                  .finally(() => setBusy(false));
              }}
            />
            {error && (
              <Text accessibilityRole="alert" className="mb-3 text-red-300">
                {error}
              </Text>
            )}
            <Button title="Fechar menu" onPress={() => setOpen(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
