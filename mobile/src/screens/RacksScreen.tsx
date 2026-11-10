import { useState } from "react";
import { TextInput } from "react-native";
import {
  useIsFocused,
  useNavigation,
  type NavigationProp,
} from "@react-navigation/native";
import type { RootStackParams } from "../types/domain";
import { useCpdStatus } from "../hooks/useCpdStatus";
import { Label, Page, QueryFeedback, Title } from "../components/UI";
import { RackCard } from "../components/RackCard";
export function RacksScreen() {
  const [query, setQuery] = useState("");
  const state = useCpdStatus(useIsFocused());
  const navigation = useNavigation<NavigationProp<RootStackParams>>();
  const devices =
    state.data?.dispositivos.filter((d) =>
      `${d.nome} ${d.local}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <Page refresh={state.refetch} refreshing={state.isRefetching}>
      <Title>Dispositivos</Title>
      <TextInput
        accessibilityLabel="Buscar dispositivo"
        placeholder="Buscar nome ou local"
        placeholderTextColor="#94a3b8"
        value={query}
        onChangeText={setQuery}
        className="mb-5 min-h-12 rounded-xl border border-slate-700 bg-slate-900 p-4 text-white"
      />
      <QueryFeedback state={state} />
      {devices.map((d) => (
        <RackCard
          key={d.id}
          rack={d}
          onPress={() => navigation.navigate("Rack", { id: d.id })}
        />
      ))}
      {state.data && !devices.length && (
        <Label>Nenhum dispositivo encontrado.</Label>
      )}
    </Page>
  );
}
