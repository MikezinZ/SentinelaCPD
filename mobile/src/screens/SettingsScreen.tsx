import { useState, useSyncExternalStore } from "react";
import { Text, TextInput } from "react-native";
import {
  getRuntime,
  subscribeRuntime,
  mocksForced,
  usingMocks,
} from "../mocks/runtime";
import { saveApiKey, updatePreferences } from "../services/preferences";
import { Button, Card, Label, Page, Title } from "../components/UI";
export function SettingsScreen() {
  const runtime = useSyncExternalStore(
    subscribeRuntime,
    getRuntime,
    getRuntime,
  );
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function action(
    work: () => Promise<void>,
    success: string,
  ): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage(success);
    } catch {
      setMessage("Não foi possível salvar a configuração. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <Title>Ajustes</Title>
      <Card>
        <Label>FONTE DOS DADOS</Label>
        <Text className="mb-3 text-lg font-bold text-white">
          {usingMocks() ? "Demonstração" : "API Cloud"}
        </Text>
        <Label>
          {process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000"}
        </Label>
        <Label>
          Atualização a cada 5 segundos em primeiro plano. Requisições têm
          timeout de 10 segundos.
        </Label>
        <Button
          title={
            mocksForced
              ? "Demonstração fixada pelo ambiente"
              : runtime.demo
                ? "Desativar modo demonstração"
                : "Ativar modo demonstração"
          }
          disabled={busy || mocksForced}
          secondary
          onPress={() => {
            void action(
              () => updatePreferences(!runtime.demo, runtime.scenario),
              "Fonte de dados atualizada.",
            );
          }}
        />
      </Card>
      <Card>
        <Label>CHAVE DE ACESSO DA API</Label>
        <TextInput
          accessibilityLabel="Nova chave de API"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={key}
          onChangeText={setKey}
          placeholder="Digite a chave de acesso"
          placeholderTextColor="#64748b"
          className="mb-4 min-h-12 rounded-xl border border-slate-700 p-3 text-white"
        />
        <Button
          title="Salvar chave no dispositivo"
          disabled={busy || !key.trim()}
          onPress={() => {
            void action(async () => {
              await saveApiKey(key);
              setKey("");
            }, "Chave salva com segurança.");
          }}
        />
        <Button
          title="Remover chave do dispositivo"
          secondary
          disabled={busy}
          onPress={() => {
            void action(async () => {
              await saveApiKey("");
              setKey("");
            }, "Chave local removida. Se houver chave no ambiente, ela será utilizada.");
          }}
        />
        <Label>
          A chave local tem prioridade sobre a configuração do ambiente.
        </Label>
      </Card>
      {message && (
        <Text accessibilityLiveRegion="polite" className="mb-3 text-slate-200">
          {message}
        </Text>
      )}
      <Label>
        As datas são exibidas no horário de Recife (UTC−3). Este painel consulta
        os incidentes registrados pelo backend.
      </Label>
    </Page>
  );
}
