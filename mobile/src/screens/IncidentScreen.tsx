import { useCallback } from "react";
import { Text } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParams } from "../types/domain";
import { getIncidenteDetalhe } from "../services/cpdService";
import { useApiQuery } from "../hooks/useApiQuery";
import {
  Badge,
  Card,
  Label,
  Page,
  QueryFeedback,
  Title,
} from "../components/UI";
import {
  dateTime,
  incidentDuration,
  nullableNumber,
  number,
} from "../utils/format";
export function IncidentScreen({
  route,
}: NativeStackScreenProps<RootStackParams, "Incident">) {
  const loader = useCallback(
    (signal: AbortSignal) => getIncidenteDetalhe(route.params.id, signal),
    [route.params.id],
  );
  const state = useApiQuery(loader, useIsFocused());
  const incident = state.data;
  return (
    <Page refresh={state.refetch} refreshing={state.isRefetching}>
      <Title>Incidente #{route.params.id}</Title>
      <QueryFeedback state={state} />
      {incident && (
        <>
          <Card>
            <Badge
              status={incident.status === "ABERTO" ? "EM_INCIDENTE" : "NORMAL"}
              label={incident.status}
            />
            <Text className="my-3 text-xl font-bold text-white">
              {incident.tipo.replace(/_/g, " ")}
            </Text>
            <Label>Dispositivo: {incident.dispositivo_id}</Label>
            <Label>Início: {dateTime(incident.inicio)}</Label>
            <Label>
              Fim: {incident.fim ? dateTime(incident.fim) : "Em andamento"}
            </Label>
            <Text className="text-teal-300">
              Duração: {incidentDuration(incident)}
            </Text>
          </Card>
          <Title>Leituras associadas</Title>
          {incident.telemetria.map((p, index) => (
            <Card key={`${p.dispositivo_id}-${p.timestamp}-${index}`}>
              <Label>{dateTime(p.timestamp)}</Label>
              <Text className="text-white">
                {number(p.temperatura)} °C • {number(p.umidade)}% UR
              </Text>
              <Label>
                Corrente: {nullableNumber(p.corrente, "A")} • Bateria:{" "}
                {nullableNumber(p.bateria, "%")}
              </Label>
            </Card>
          ))}
          {!incident.telemetria.length && (
            <Label>Nenhuma leitura associada a este intervalo.</Label>
          )}
        </>
      )}
    </Page>
  );
}
