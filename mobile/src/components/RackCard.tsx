import { Pressable, Text, View } from "react-native";
import { Server } from "lucide-react-native";
import type { DispositivoStatus, StatusGeral } from "../types/api";
import { dateTime, isStale, nullableNumber, number } from "../utils/format";
import { Badge, Card, Label } from "./UI";
export function deviceStatus(device: DispositivoStatus): StatusGeral {
  return !device.online || isStale(device)
    ? "OFFLINE"
    : device.incidentes_abertos > 0
      ? "EM_INCIDENTE"
      : device.alerta_temperatura
        ? "ALERTA_TEMPERATURA"
        : "NORMAL";
}
export function RackCard({
  rack,
  onPress,
}: {
  rack: DispositivoStatus;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${rack.nome}`}
      onPress={onPress}
      style={{ minHeight: 44 }}
    >
      <Card>
        <View className="mb-3 flex-row items-center gap-3">
          <Server color="#5eead4" size={24} />
          <Text className="flex-1 text-lg font-bold text-white">
            {rack.nome}
          </Text>
        </View>
        <Badge status={deviceStatus(rack)} />
        <Text className="my-3 text-sm text-slate-400">{rack.local}</Text>
        <Text className="mb-3 text-2xl font-semibold text-white">
          {number(rack.temperatura)} °C
        </Text>
        <Label>
          Umidade: {number(rack.umidade)}% • Corrente:{" "}
          {nullableNumber(rack.corrente, "A")}
        </Label>
        <Label>Bateria: {nullableNumber(rack.bateria, "%")}</Label>
        <Label>Último contato: {dateTime(rack.ultimo_contato)}</Label>
      </Card>
    </Pressable>
  );
}
