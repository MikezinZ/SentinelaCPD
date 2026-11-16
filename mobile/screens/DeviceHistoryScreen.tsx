import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
} from 'lucide-react-native';
import {
  buildChartPoints,
  metricKeys,
  metrics,
  type Bucket,
  type Metric,
  type Stats,
} from '../types';
import { api } from '../services/api';
import { useResource } from '../hooks/useResource';
import { RangeAreaChart } from '../components/RangeAreaChart';
import {
  Card,
  EmptyState,
  FailureBanner,
  FilterChip,
  LoadingState,
  TouchButton,
  fmt,
  metricDigits,
  metricIcons,
} from '../components/ui';

const PERIOD_RANGES: readonly {
  label: string;
  subtitle: string;
  bucket: Bucket;
  duration: number;
  step: number;
}[] = [
  {
    label: '1 h (raw)',
    subtitle: 'Amostras brutas a cada 5s',
    bucket: 'raw',
    duration: 3_600_000,
    step: 5_000,
  },
  {
    label: '24 h (1m)',
    subtitle: 'Agregação por 1 minuto',
    bucket: '1m',
    duration: 86_400_000,
    step: 60_000,
  },
  {
    label: '7 dias (15m)',
    subtitle: 'Agregação por 15 minutos',
    bucket: '15m',
    duration: 604_800_000,
    step: 900_000,
  },
];

export function DeviceHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deviceId = Array.isArray(id) ? id[0] : id ?? '';
  const router = useRouter();

  const [periodIndex, setPeriodIndex] = useState(0);
  const [metric, setMetric] = useState<Metric>('temperature');
  const [toTime, setToTime] = useState(() => Date.now());
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  const activeRange = PERIOD_RANGES[periodIndex];
  const currentCursor = cursors[cursors.length - 1];
  const fromTime = toTime - activeRange.duration;

  const historyResult = useResource(
    `history:${deviceId}:${periodIndex}:${toTime}:${currentCursor ?? 'first'}`,
    (signal) =>
      api.readings(
        deviceId,
        {
          from: new Date(fromTime).toISOString(),
          to: new Date(toTime).toISOString(),
          bucket: activeRange.bucket,
          cursor: currentCursor,
        },
        signal
      )
  );

  const deviceResult = useResource(`history-device:${deviceId}`, (signal) =>
    api.device(deviceId, signal)
  );

  const points = historyResult.data?.points ?? [];
  const chartRows = useMemo(
    () => buildChartPoints(points, metric, activeRange.step),
    [points, metric, activeRange.step]
  );

  const summaryStats = useMemo(() => {
    const valid: Stats[] = [];
    for (const p of points) {
      const s = p[metric];
      if (s) valid.push(s);
    }
    const sampleCount = valid.reduce((acc, item) => acc + item.count, 0);
    if (sampleCount === 0) return null;

    const minVal = Math.min(...valid.map((item) => item.min));
    const maxVal = Math.max(...valid.map((item) => item.max));
    const weightedAvg =
      valid.reduce((acc, item) => acc + item.avg * item.count, 0) /
      sampleCount;
    const gapCount = chartRows.filter((r) => r.isGap).length;

    return {
      min: minVal,
      avg: weightedAvg,
      max: maxVal,
      sampleCount,
      gapCount,
    };
  }, [points, metric, chartRows]);

  const digits = metricDigits(metric);
  const metricInfo = metrics[metric];

  function handleRefreshWindow() {
    setToTime(Date.now());
    setCursors([undefined]);
    historyResult.reload();
  }

  return (
    <View className="flex-1 bg-slate-100">
      {/* Cabeçalho */}
      <View className="bg-white border-b border-slate-200 px-4 py-3 flex-row items-center justify-between">
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace(`/devices/${encodeURIComponent(deviceId)}`);
          }}
          accessibilityRole="button"
          accessibilityLabel="Voltar aos detalhes do dispositivo"
          style={{ minHeight: 44, minWidth: 44 }}
          className="flex-row items-center gap-2 pr-3"
        >
          <ArrowLeft size={20} color="#1e293b" />
          <Text className="text-sm font-bold text-slate-800">
            Voltar ao Rack
          </Text>
        </Pressable>

        <Pressable
          onPress={handleRefreshWindow}
          accessibilityRole="button"
          accessibilityLabel="Atualizar período do histórico"
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
            refreshing={historyResult.refreshing}
            onRefresh={handleRefreshWindow}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
      >
        <View className="mb-3">
          <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Histórico e Análise
          </Text>
          <Text className="text-xs text-slate-500 mt-0.5">
            {deviceResult.data?.name ?? deviceId} · {activeRange.subtitle}
          </Text>
        </View>

        {/* Segmented Control / Seletor Horizontal de Períodos */}
        <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Janela Temporal
        </Text>
        <View className="flex-row bg-slate-200/80 p-1 rounded-2xl mb-4 border border-slate-300">
          {PERIOD_RANGES.map((range, idx) => {
            const active = periodIndex === idx;
            return (
              <Pressable
                key={range.bucket}
                onPress={() => {
                  setPeriodIndex(idx);
                  setCursors([undefined]);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Período ${range.label}`}
                style={{ minHeight: 44 }}
                className={`flex-1 items-center justify-center rounded-xl py-2 ${
                  active ? 'bg-white shadow-sm' : ''
                }`}
              >
                <Text
                  className={`text-xs font-extrabold ${
                    active ? 'text-blue-700' : 'text-slate-600'
                  }`}
                >
                  {range.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Seletor de Métrica */}
        <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Variável Monitorada
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4"
        >
          {metricKeys.map((key) => {
            const Icon = metricIcons[key];
            const selected = metric === key;
            return (
              <FilterChip
                key={key}
                label={`${metrics[key].label} (${metrics[key].unit})`}
                selected={selected}
                onPress={() => setMetric(key)}
                icon={
                  <Icon
                    size={14}
                    color={selected ? '#ffffff' : '#334155'}
                  />
                }
              />
            );
          })}
        </ScrollView>

        {historyResult.error ? (
          <FailureBanner
            error={historyResult.error}
            cached={!!historyResult.data}
            onRetry={historyResult.reload}
          />
        ) : null}

        {historyResult.busy && !historyResult.data ? (
          <LoadingState label="Processando série temporal e faixa Mín/Máx…" />
        ) : !summaryStats ? (
          <EmptyState
            title="Sem leituras válidas no período"
            description="A métrica selecionada não possui amostras registradas nesta janela ou o sensor reportou falha."
            actionLabel="Atualizar janela"
            onAction={handleRefreshWindow}
          />
        ) : (
          <>
            {/* Painel do Gráfico Mín/Máx + Média */}
            <Card className="mb-4">
              <View className="flex-row flex-wrap items-center justify-between gap-2 mb-3">
                <View>
                  <Text className="text-base font-extrabold text-slate-900">
                    {metricInfo.label} ({metricInfo.unit})
                  </Text>
                  <Text className="text-xs text-slate-500">
                    Deslize horizontalmente ou toque no gráfico para inspecionar
                  </Text>
                </View>

                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-1 bg-blue-700 rounded-full" />
                    <Text className="text-xs font-bold text-slate-700">
                      Média
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-3 h-3 rounded bg-blue-300/60 border border-blue-400" />
                    <Text className="text-xs font-bold text-slate-700">
                      Faixa Mín–Máx
                    </Text>
                  </View>
                </View>
              </View>

              <RangeAreaChart
                rows={chartRows}
                metric={metric}
                periodIndex={periodIndex}
              />

              <View className="flex-row items-start gap-2 mt-3 pt-3 border-t border-slate-100">
                <Clock3 size={15} color="#b45309" />
                <Text className="flex-1 text-xs text-slate-600 leading-relaxed">
                  As quebras na linha e faixas tracejadas em âmbar indicam lacunas reais de pacotes. O gráfico nunca interpola intervalos sem dados válidos.
                </Text>
              </View>
            </Card>

            {/* Cartão com Resumo Textual Numérico (Acessibilidade TalkBack / VoiceOver) */}
            <Card
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`Resumo numérico de ${metricInfo.label}: Mínima de ${fmt(
                summaryStats.min,
                digits
              )} ${metricInfo.unit}, Média ponderada de ${fmt(
                summaryStats.avg,
                digits
              )} ${metricInfo.unit}, Máxima de ${fmt(
                summaryStats.max,
                digits
              )} ${metricInfo.unit}, totalizando ${summaryStats.sampleCount.toLocaleString(
                'pt-BR'
              )} amostras válidas nesta página.`}
              className="mb-4"
            >
              <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Resumo Numérico Auditável (TalkBack / VoiceOver)
              </Text>

              <View className="flex-row flex-wrap -mx-1.5">
                <View className="w-1/2 px-1.5 mb-3">
                  <View className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <Text className="text-xs font-semibold text-slate-500">
                      Mínima Absoluta
                    </Text>
                    <Text className="text-lg font-extrabold text-slate-900 mt-1">
                      {fmt(summaryStats.min, digits)}{' '}
                      <Text className="text-xs font-semibold text-slate-500">
                        {metricInfo.unit}
                      </Text>
                    </Text>
                  </View>
                </View>

                <View className="w-1/2 px-1.5 mb-3">
                  <View className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
                    <Text className="text-xs font-semibold text-blue-800">
                      Média Ponderada
                    </Text>
                    <Text className="text-lg font-extrabold text-blue-950 mt-1">
                      {fmt(summaryStats.avg, digits)}{' '}
                      <Text className="text-xs font-semibold text-blue-700">
                        {metricInfo.unit}
                      </Text>
                    </Text>
                  </View>
                </View>

                <View className="w-1/2 px-1.5">
                  <View className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <Text className="text-xs font-semibold text-slate-500">
                      Pico Máximo
                    </Text>
                    <Text className="text-lg font-extrabold text-slate-900 mt-1">
                      {fmt(summaryStats.max, digits)}{' '}
                      <Text className="text-xs font-semibold text-slate-500">
                        {metricInfo.unit}
                      </Text>
                    </Text>
                  </View>
                </View>

                <View className="w-1/2 px-1.5">
                  <View className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <Text className="text-xs font-semibold text-slate-500">
                      Amostras Válidas
                    </Text>
                    <Text className="text-lg font-extrabold text-slate-900 mt-1">
                      {summaryStats.sampleCount.toLocaleString('pt-BR')}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>
          </>
        )}

        {/* Paginação por Cursor (máx. 500 pontos/página) */}
        <Card className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs font-extrabold text-slate-800">
              Página {cursors.length}
            </Text>
            <Text className="text-[11px] text-slate-500">
              {points.length} de máx. 500 pontos/página
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <TouchButton
              label="Anterior"
              variant="secondary"
              disabled={cursors.length <= 1 || historyResult.busy}
              icon={<ChevronLeft size={16} color="#1e293b" />}
              onPress={() => setCursors((prev) => prev.slice(0, -1))}
            />
            <TouchButton
              label="Próxima"
              variant="secondary"
              disabled={!historyResult.data?.next_cursor || historyResult.busy}
              icon={<ChevronRight size={16} color="#1e293b" />}
              onPress={() => {
                const next = historyResult.data?.next_cursor;
                if (next) setCursors((prev) => [...prev, next]);
              }}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

