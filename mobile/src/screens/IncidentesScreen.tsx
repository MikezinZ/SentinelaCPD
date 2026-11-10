import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  useIsFocused,
  useNavigation,
  type NavigationProp,
} from "@react-navigation/native";
import type { RootStackParams } from "../types/domain";
import { getIncidentes } from "../services/cpdService";
import { useApiQuery } from "../hooks/useApiQuery";
import {
  Badge,
  Button,
  Card,
  Label,
  Page,
  QueryFeedback,
  Title,
} from "../components/UI";
import { dateTime, incidentDuration } from "../utils/format";
export function IncidentesScreen() {
  const [filter, setFilter] = useState<"ABERTO" | "FECHADO">("ABERTO");
  const loader = useCallback(
    (signal: AbortSignal) => getIncidentes(filter, signal),
    [filter],
  );
  const state = useApiQuery(loader, useIsFocused());
  const navigation = useNavigation<NavigationProp<RootStackParams>>();
  return (
    <Page refresh={state.refetch} refreshing={state.isRefetching}>
      <Title>Incidentes</Title>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            title="Abertos"
            secondary={filter !== "ABERTO"}
            onPress={() => setFilter("ABERTO")}
          />
        </View>
        <View className="flex-1">
          <Button
            title="Fechados"
            secondary={filter !== "FECHADO"}
            onPress={() => setFilter("FECHADO")}
          />
        </View>
      </View>
      <QueryFeedback state={state} />
      {state.data?.map((i) => (
        <Pressable
          key={i.id}
          accessibilityRole="button"
          accessibilityLabel={`Abrir incidente ${i.id}`}
          onPress={() => navigation.navigate("Incident", { id: i.id })}
          style={{ minHeight: 44 }}
        >
          <Card>
            <Badge
              status={i.status === "ABERTO" ? "EM_INCIDENTE" : "NORMAL"}
              label={i.status === "ABERTO" ? "Aberto" : "Fechado"}
            />
            <Text className="my-3 text-lg font-bold text-white">
              {i.tipo.replace(/_/g, " ")}
            </Text>
            <Label>
              #{i.id} • {i.dispositivo_id}
            </Label>
            <Label>Início: {dateTime(i.inicio)}</Label>
            <Text className="text-teal-300">{incidentDuration(i)}</Text>
          </Card>
        </Pressable>
      ))}
      {state.data?.length === 0 && (
        <Card>
          <Label>
            Nenhum incidente {filter === "ABERTO" ? "aberto" : "fechado"}.
          </Label>
        </Card>
      )}
    </Page>
  );
}
