import { Text, View } from "react-native";
import {
  useIsFocused,
  useNavigation,
  type NavigationProp,
} from "@react-navigation/native";
import type { RootStackParams } from "../types/domain";
import { useCpdStatus } from "../hooks/useCpdStatus";
import {
  Badge,
  Card,
  Label,
  Page,
  QueryFeedback,
  Title,
} from "../components/UI";
import { RackCard } from "../components/RackCard";
import { isStale, number } from "../utils/format";
export function DashboardScreen() {
  const focused = useIsFocused();
  const state = useCpdStatus(focused);
  const navigation = useNavigation<NavigationProp<RootStackParams>>();
  const data = state.data;
  const racks = data?.dispositivos ?? [];
  const stale = racks.some((d) => isStale(d));
  const average = racks.length
    ? racks.reduce((sum, d) => sum + d.temperatura, 0) / racks.length
    : null;
  return (
    <Page refresh={state.refetch} refreshing={state.isRefetching}>
      <Title>Visão geral</Title>
      <QueryFeedback state={state} />
      {stale && (
        <Text
          accessibilityRole="alert"
          className="mb-4 rounded-xl bg-amber-950 p-4 text-amber-200"
        >
          Dados armazenados — conexão indisponível
        </Text>
      )}
      {data && (
        <>
          <Card>
            <Label>SAÚDE DO AMBIENTE</Label>
            <Badge status={data.status_geral} />
            <Text className="mt-3 text-slate-300">
              Limite de temperatura: {number(data.limite_temperatura)} °C
            </Text>
          </Card>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Card>
                <Label>Online</Label>
                <Text className="text-3xl font-bold text-white">
                  {racks.filter((d) => d.online && !isStale(d)).length}/
                  {racks.length}
                </Text>
              </Card>
            </View>
            <View className="flex-1">
              <Card>
                <Label>Temp. média</Label>
                <Text className="text-3xl font-bold text-white">
                  {average === null ? "--" : `${number(average)}°`}
                </Text>
              </Card>
            </View>
          </View>
          <Text className="mb-4 mt-3 text-lg font-bold text-white">
            Dispositivos monitorados
          </Text>
          {racks.map((rack) => (
            <RackCard
              key={rack.id}
              rack={rack}
              onPress={() => navigation.navigate("Rack", { id: rack.id })}
            />
          ))}
          {!racks.length && (
            <Card>
              <Label>Nenhum dispositivo com dados disponíveis.</Label>
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
