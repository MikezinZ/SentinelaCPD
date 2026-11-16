import { powerLabel } from '../types';
import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Activity,
  ArrowLeft,
  BellRing,
  ChevronRight,
  Clock3,
  Cpu,
  MapPin,
  Radio,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react-native';
import {
  freshness,
  metricKeys,
  metrics,
  reading,
} from '../types';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useClock, useResource } from '../hooks/useResource';
import {
  Banner,
  Card,
  FailureBanner,
  LoadingState,
  MetricValueText,
  SensorQualityBadge,
  StaleBanner,
  StatusBadge,
  TouchButton,
  dateTime,
  metricIcons,
} from '../components/ui';

export function DeviceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deviceId = Array.isArray(id) ? id[0] : id ?? '';
  const router = useRouter();
  const { user } = useAuth();
  const now = useClock();

  const result = useResource(
    `device:${deviceId}`,
    (signal) => api.device(deviceId, signal),
    true
  );

  const device = result.data;
  const currentFreshness = device
    ? freshness(device, Math.max(0, now - result.at))
    : 'unknown';

  const latestTimestamp =
    device?.latest?.sampled_at ?? device?.latest?.received_at ?? null;

  return (
    <View className="flex-1 bg-slate-100">
      {/* Cabeçalho com navegação de retorno */}
      <View className="bg-white border-b border-slate-200 px-4 py-3 flex-row items-center justify-between">
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/devices');
          }}
          accessibilityRole="button"
          accessibilityLabel="Voltar para lista de dispositivos"
          style={{ minHeight: 44, minWidth: 44 }}
          className="flex-row items-center gap-2 pr-3"
        >
          <ArrowLeft size={20} color="#1e293b" />
          <Text className="text-sm font-bold text-slate-800">Dispositivos</Text>
        </Pressable>

        <Pressable
          onPress={result.reload}
          accessibilityRole="button"
          accessibilityLabel="Atualizar leituras do dispositivo"
          style={{ minHeight: 44, minWidth: 44 }}
          className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200"
        >
          <RefreshCw size={15} color="#1e293b" />
          <Text className="text-xs font-bold text-slate-800">Atualizar</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={result.refreshing}
            onRefresh={result.reload}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
      >
        <View className="mb-4">
          <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {device?.name ?? `Dispositivo ${deviceId}`}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            <MapPin size={14} color="#64748b" />
            <Text className="text-xs font-medium text-slate-500">
              {device?.location ?? deviceId}
            </Text>
          </View>
        </View>

        {result.error ? (
          <FailureBanner
            error={result.error}
            cached={!!device}
            onRetry={result.reload}
          />
        ) : null}

        {result.busy && !device ? (
          <LoadingState label="Carregando detalhes do nó ESP32…" />
        ) : null}

        {device ? (
          <>
            {/* Banner fixo mandatório quando stale (> 15s sem pacote) */}
            {!result.error && currentFreshness === 'stale' ? (
              <StaleBanner lastTimestamp={latestTimestamp} />
            ) : null}

            {currentFreshness === 'unknown' ? (
              <Banner title="Aguardando primeira leitura" tone="blue">
                Este nó está cadastrado no CPD, porém ainda não enviou pacotes MQTT. Todos os sensores exibem estado Indisponível (--).
              </Banner>
            ) : null}

            {currentFreshness === 'inactive' ? (
              <Banner title="Dispositivo desativado no cadastro" tone="amber">
                Este nó está marcado como inativo para monitoramento operacional.
              </Banner>
            ) : null}

            <Text className="font-bold text-amber-800 bg-amber-50 p-3">{powerLabel(device)}</Text>
<EnergyIncidents id={deviceId}/>
{/* Metadados do Nó: Status, Timestamp Exato e Firmware */}
            <Card className="mb-4">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-100">
                <View className="flex-row items-center gap-2">
                  <Radio size={18} color="#2563eb" />
                  <Text className="text-xs font-bold text-slate-600">
                    Status de Conexão
                  </Text>
                </View>
                <StatusBadge value={currentFreshness} />
              </View>

              <View className="flex-row items-center justify-between py-3 border-b border-slate-100">
                <View className="flex-row items-center gap-2">
                  <Clock3 size={18} color="#475569" />
                  <Text className="text-xs font-bold text-slate-600">
                    Última Amostra
                  </Text>
                </View>
                <Text className="text-xs font-extrabold text-slate-900">
                  {dateTime(latestTimestamp)}
                </Text>
              </View>

              <View className="flex-row items-center justify-between pt-3">
                <View className="flex-row items-center gap-2">
                  <Cpu size={18} color="#475569" />
                  <Text className="text-xs font-bold text-slate-600">
                    Versão do Firmware
                  </Text>
                </View>
                <Text className="text-xs font-extrabold text-slate-900">
                  {device.firmware_version || '--'}
                </Text>
              </View>
            </Card>

            {/* Blocos de Leitura Rápida por Sensor */}
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 px-1">
              Telemetria dos Sensores na Ponta
            </Text>

            {metricKeys.map((metric) => {
              const Icon = metricIcons[metric];
              const val = reading({ ...device.latest!, ...(device.latest ?? {}) }, metric);
              const quality = device.latest?.quality[metric];
              const toneBg =
                metric === 'temperature'
                  ? 'bg-amber-50'
                  : metric === 'humidity'
                    ? 'bg-blue-50'
                    : 'bg-emerald-50';
              const iconColor =
                metric === 'temperature'
                  ? '#b45309'
                  : metric === 'humidity'
                    ? '#1d4ed8'
                    : '#047857';

              return (
                <Card key={metric} className="mb-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2.5">
                      <View
                        className={`w-10 h-10 rounded-xl items-center justify-center ${toneBg}`}
                      >
                        <Icon size={20} color={iconColor} />
                      </View>
                      <View>
                        <Text className="text-sm font-extrabold text-slate-900">
                          {metrics[metric].label}
                        </Text>
                        <Text className="text-[11px] text-slate-500">
                          {metric === 'current'
                            ? 'Sensor indutivo ZMCT103C · Valor estrito em Amperes (A)'
                            : 'Sensor digital DHT22 (AM2302)'}
                        </Text>
                      </View>
                    </View>
                    <SensorQualityBadge
                      quality={quality}
                      hasValidValue={val !== null}
                    />
                  </View>

                  <View className="mt-2 pt-2.5 border-t border-slate-100 flex-row items-baseline justify-between">
                    <Text className="text-xs font-semibold text-slate-500">
                      Leitura registrada:
                    </Text>
                    <MetricValueText
                      device={device}
                      metric={metric}
                      size="lg"
                    />
                  </View>
                </Card>
              );
            })}

            {/* Ações e Navegação do Dispositivo */}
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-2 mb-2.5 px-1">
              Análise e Operação
            </Text>

            <View className="gap-2.5">
              <TouchButton
                label="Histórico e Análise (Mín/Máx/Média)"
                variant="primary"
                icon={<Activity size={18} color="#ffffff" />}
                onPress={() =>
                  router.push(
                    `/devices/${encodeURIComponent(device.id)}/history`
                  )
                }
                fullWidth
              />

              <TouchButton
                label={`Alertas deste Rack (${device.active_alerts} em aberto)`}
                variant="secondary"
                icon={<BellRing size={18} color="#1e293b" />}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/alerts',
                    params: { device_id: device.id },
                  })
                }
                fullWidth
              />

              {user?.role === 'admin' ? (
                <TouchButton
                  label="Configurar Limites Operacionais (Admin)"
                  variant="secondary"
                  icon={<ShieldAlert size={18} color="#1d4ed8" />}
                  onPress={() =>
                    router.push(
                      `/devices/${encodeURIComponent(device.id)}/limits`
                    )
                  }
                  fullWidth
                />
              ) : (
                <View className="flex-row items-center justify-between px-4 py-3 rounded-xl bg-slate-200/70 border border-slate-300">
                  <View className="flex-row items-center gap-2 flex-1">
                    <ShieldAlert size={16} color="#64748b" />
                    <Text className="text-xs font-semibold text-slate-600">
                      Parametrização de limites restrita ao perfil Administrador
                    </Text>
                  </View>
                  <ChevronRight size={15} color="#94a3b8" />
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}


function EnergyIncidents({ id }: { id: string }) {
  const result = useResource('incidents:' + id, signal => api.incidents(id, signal), true);
  return <Card className="mb-4">
    <Text className="font-bold text-lg">Histórico de quedas de energia</Text>
    {result.error && <FailureBanner error={result.error} cached={!!result.data} onRetry={result.reload}/>}
    {result.busy && !result.data && <LoadingState label="Carregando incidentes…"/>}
    {result.data?.length === 0 && <Text>Nenhuma queda registrada.</Text>}
    {result.data?.map(item => <View key={item.id} className="py-3">
      <Text>{item.status === 'open' ? 'Em andamento' : 'Encerrada'}</Text>
      <Text>Início {dateTime(item.started_at)}</Text>
      <Text>Fim {item.ended_at ? dateTime(item.ended_at) : '—'}</Text>
      <Text>Duração {item.duration_s == null ? 'Em andamento' : item.duration_s + ' s'}</Text>
    </View>)}
  </Card>;
}
