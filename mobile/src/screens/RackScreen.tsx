import { useCallback } from "react";
import { Text, useWindowDimensions } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LineChart } from "react-native-gifted-charts";
import type { RootStackParams } from "../types/domain";
import { useCpdStatus } from "../hooks/useCpdStatus";
import { useApiQuery } from "../hooks/useApiQuery";
import { getTelemetria } from "../services/cpdService";
import { Card, Label, Page, QueryFeedback, Title } from "../components/UI";
import { RackCard } from "../components/RackCard";
import { dateTime, isStale } from "../utils/format";
export function RackScreen({
  route,
}: NativeStackScreenProps<RootStackParams, "Rack">) {
  const focused = useIsFocused();
  const status = useCpdStatus(focused);
  const loader = useCallback(
    (signal: AbortSignal) =>
      getTelemetria({ dispositivo: route.params.id, limite: 60 }, signal),
    [route.params.id],
  );
  const history = useApiQuery(loader, focused);
  const rack = status.data?.dispositivos.find((d) => d.id === route.params.id);
  const { width } = useWindowDimensions();
  const points = [...(history.data ?? [])].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  return (
    <Page
      refresh={() => {
        status.refetch();
        history.refetch();
      }}
      refreshing={status.isRefetching || history.isRefetching}
    >
      <Title>{rack?.nome ?? "Telemetria"}</Title>
      <QueryFeedback state={status} />
      {rack && isStale(rack) && (
        <Text accessibilityRole="alert" className="mb-3 text-amber-300">
          Dados armazenados — conexão indisponível
        </Text>
      )}
      {rack && <RackCard rack={rack} onPress={history.refetch} />}
      <QueryFeedback state={history} />
      {points.length > 0 ? (
        <Card>
          <Text className="mb-3 text-lg font-bold text-white">
            Temperatura • °C
          </Text>
          <Label>
            {dateTime(points[0]?.timestamp ?? "")} até{" "}
            {dateTime(points[points.length - 1]?.timestamp ?? "")}
          </Label>
          <LineChart
            data={points.map((p) => ({ value: p.temperatura }))}
            width={Math.max(160, width - 120)}
            height={180}
            adjustToWidth
            color="#2dd4bf"
            thickness={3}
            hideDataPoints
            areaChart
            startFillColor="#0d9488"
            endFillColor="#0f172a"
            startOpacity={0.3}
            endOpacity={0.05}
            yAxisTextStyle={{ color: "#94a3b8" }}
            xAxisColor="#334155"
            yAxisColor="#334155"
            rulesColor="#1e293b"
          />
        </Card>
      ) : (
        history.data && <Label>Sem telemetria no período.</Label>
      )}
    </Page>
  );
}
