import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  LogOut,
  RefreshCw,
  Server,
  X,
} from 'lucide-react-native';
import {
  stateOf,
  type Alert,
  type AlertState,
  type Severity,
} from '../types';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useResource } from '../hooks/useResource';
import {
  AcknowledgeModal,
  alertTypeLabels,
} from '../components/AcknowledgeModal';
import {
  Banner,
  BrandHeader,
  Card,
  EmptyState,
  FailureBanner,
  FilterChip,
  LoadingState,
  TouchButton,
  dateTime,
  roleLabels,
} from '../components/ui';

const STATE_OPTIONS: readonly { id: AlertState | ''; label: string }[] = [
  { id: '', label: 'Todos estados' },
  { id: 'active', label: 'Ativo' },
  { id: 'acknowledged', label: 'Reconhecido' },
  { id: 'resolved', label: 'Resolvido' },
];

const SEVERITY_OPTIONS: readonly { id: Severity | ''; label: string }[] = [
  { id: '', label: 'Todas severidades' },
  { id: 'critical', label: 'Crítico' },
  { id: 'warning', label: 'Atenção' },
];

const stateLabels: Record<AlertState, string> = {
  active: 'Ativo',
  acknowledged: 'Reconhecido',
  resolved: 'Resolvido',
};

const severityLabels: Record<Severity, string> = {
  critical: 'Crítico',
  warning: 'Atenção',
};

export function AlertsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ device_id?: string }>();
  const initialDeviceId = Array.isArray(params.device_id)
    ? params.device_id[0]
    : params.device_id;

  const { user, logout } = useAuth();
  const [stateFilter, setStateFilter] = useState<AlertState | ''>('');
  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('');
  const [deviceFilter, setDeviceFilter] = useState<string | undefined>(
    initialDeviceId || undefined
  );
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [ackTarget, setAckTarget] = useState<Alert | null>(null);
  const [justAcknowledged, setJustAcknowledged] = useState(false);

  // Sincroniza quando recebe parâmetro via rota
  React.useEffect(() => {
    setDeviceFilter(initialDeviceId || undefined);
    setCursors([undefined]);
  }, [initialDeviceId]);

  const currentCursor = cursors[cursors.length - 1];

  const alertsResult = useResource(
    `alerts:${stateFilter}:${deviceFilter ?? 'all'}:${currentCursor ?? 'first'}`,
    (signal) =>
      api.alerts(
        {
          state: stateFilter || undefined,
          device_id: deviceFilter,
          cursor: currentCursor,
        },
        signal
      ),
    true
  );

  const devicesResult = useResource('alerts-devices-lookup', (signal) =>
    api.devices(undefined, signal)
  );

  const deviceMap = useMemo(() => {
    const map = new Map<string, string>();
    devicesResult.data?.items.forEach((d) => map.set(d.id, d.name));
    return map;
  }, [devicesResult.data]);

  const filteredItems = useMemo(() => {
    const raw = alertsResult.data?.items ?? [];
    if (!severityFilter) return raw;
    return raw.filter((item) => item.severity === severityFilter);
  }, [alertsResult.data, severityFilter]);

  return (
    <View className="flex-1 bg-slate-100">
      {/* Barra superior */}
      <View className="bg-white border-b border-slate-200 px-4 py-3 flex-row items-center justify-between">
        <BrandHeader compact />
        {user ? (
          <View className="flex-row items-center gap-2">
            <View className="items-end">
              <Text className="text-xs font-bold text-slate-900">
                {user.name}
              </Text>
              <Text className="text-[10px] font-semibold text-blue-700">
                {roleLabels[user.role]}
              </Text>
            </View>
            <Pressable
              onPress={() => void logout()}
              accessibilityRole="button"
              accessibilityLabel="Sair da sessão"
              style={{ minHeight: 44, minWidth: 44 }}
              className="items-center justify-center rounded-xl bg-slate-100 border border-slate-200"
            >
              <LogOut size={18} color="#334155" />
            </Pressable>
          </View>
        ) : null}
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={alertsResult.refreshing}
            onRefresh={alertsResult.reload}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
        ListHeaderComponent={
          <View className="mb-3">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 pr-2">
                <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Central de Alertas
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5">
                  Auditoria de incidentes e reconhecimento na ponta
                </Text>
              </View>
              <Pressable
                onPress={alertsResult.reload}
                accessibilityRole="button"
                accessibilityLabel="Atualizar central de alertas"
                style={{ minHeight: 44, minWidth: 44 }}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300"
              >
                <RefreshCw size={15} color="#1e293b" />
                <Text className="text-xs font-bold text-slate-800">
                  Atualizar
                </Text>
              </Pressable>
            </View>

            {/* Chips Horizontais: Estado */}
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Estado do Alerta
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
            >
              {STATE_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.id || 'all'}
                  label={opt.label}
                  selected={stateFilter === opt.id}
                  onPress={() => {
                    setStateFilter(opt.id);
                    setCursors([undefined]);
                  }}
                />
              ))}
            </ScrollView>

            {/* Chips Horizontais: Severidade */}
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Severidade
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.id || 'all-sev'}
                  label={opt.label}
                  selected={severityFilter === opt.id}
                  onPress={() => {
                    setSeverityFilter(opt.id);
                  }}
                />
              ))}
            </ScrollView>

            {/* Filtro ativo de dispositivo */}
            {deviceFilter ? (
              <View className="flex-row items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2 mb-3">
                <View className="flex-row items-center gap-2">
                  <Server size={15} color="#1d4ed8" />
                  <Text className="text-xs font-bold text-blue-900">
                    Filtrado por: {deviceMap.get(deviceFilter) ?? deviceFilter}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setDeviceFilter(undefined);
                    setCursors([undefined]);
                    router.setParams({ device_id: undefined });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Remover filtro de dispositivo"
                  style={{ minHeight: 44, minWidth: 44 }}
                  className="items-center justify-center"
                >
                  <X size={16} color="#1d4ed8" />
                </Pressable>
              </View>
            ) : null}

            {justAcknowledged ? (
              <Banner title="Reconhecimento (ACK) registrado" tone="green">
                A nota de auditoria foi gravada. O alerta permanece listado como Reconhecido até que a condição física normalize.
              </Banner>
            ) : null}

            {alertsResult.error ? (
              <FailureBanner
                error={alertsResult.error}
                cached={!!alertsResult.data}
                onRetry={alertsResult.reload}
              />
            ) : null}
          </View>
        }
        renderItem={({ item: alert }) => {
          const status = stateOf(alert);
          const isCritical = alert.severity === 'critical';
          const StateIcon =
            status === 'resolved'
              ? CircleCheck
              : status === 'acknowledged'
                ? ClipboardCheck
                : BellRing;

          const deviceName = deviceMap.get(alert.device_id) ?? alert.device_id;

          return (
            <Card className="mb-3.5">
              {/* Badges acessíveis (Cor + Ícone + Rótulo Textual Explícito) */}
              <View className="flex-row flex-wrap items-center justify-between gap-2 mb-2.5">
                <View className="flex-row items-center gap-2">
                  <View
                    accessible
                    accessibilityLabel={`Severidade: ${severityLabels[alert.severity]}`}
                    className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                      isCritical
                        ? 'bg-rose-50 border-rose-300'
                        : 'bg-amber-50 border-amber-300'
                    }`}
                  >
                    <AlertTriangle
                      size={13}
                      color={isCritical ? '#be123c' : '#b45309'}
                    />
                    <Text
                      className={`text-xs font-bold ${
                        isCritical ? 'text-rose-900' : 'text-amber-900'
                      }`}
                    >
                      {severityLabels[alert.severity]}
                    </Text>
                  </View>

                  <View
                    accessible
                    accessibilityLabel={`Estado: ${stateLabels[status]}`}
                    className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                      status === 'resolved'
                        ? 'bg-emerald-50 border-emerald-200'
                        : status === 'acknowledged'
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-slate-100 border-slate-300'
                    }`}
                  >
                    <StateIcon
                      size={13}
                      color={
                        status === 'resolved'
                          ? '#047857'
                          : status === 'acknowledged'
                            ? '#1d4ed8'
                            : '#334155'
                      }
                    />
                    <Text
                      className={`text-xs font-bold ${
                        status === 'resolved'
                          ? 'text-emerald-800'
                          : status === 'acknowledged'
                            ? 'text-blue-900'
                            : 'text-slate-800'
                      }`}
                    >
                      {stateLabels[status]}
                    </Text>
                  </View>
                </View>

                <Text className="text-[11px] font-semibold text-slate-400">
                  Limites v{alert.rule_version}
                </Text>
              </View>

              <Text className="text-base font-extrabold text-slate-900">
                {alertTypeLabels[alert.type]}
              </Text>
              <Text className="text-xs text-slate-700 mt-1 leading-relaxed">
                {alert.message}
              </Text>

              <View className="mt-3 pt-2.5 border-t border-slate-100">
                <Pressable
                  onPress={() =>
                    router.push(
                      `/devices/${encodeURIComponent(alert.device_id)}`
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Ir para o dispositivo ${deviceName}`}
                  style={{ minHeight: 44 }}
                  className="flex-row items-center justify-between py-1"
                >
                  <Text className="text-xs font-bold text-blue-700">
                    {deviceName} ({alert.device_id})
                  </Text>
                  <Text className="text-xs text-slate-500">
                    Aberto: {dateTime(alert.opened_at)}
                  </Text>
                </Pressable>

                {alert.acknowledged_at ? (
                  <View className="flex-row items-start gap-1.5 mt-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <CheckCircle2 size={14} color="#047857" />
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-slate-700">
                        Reconhecido por {alert.acknowledged_by ?? '--'} em{' '}
                        {dateTime(alert.acknowledged_at)}
                      </Text>
                      {alert.note ? (
                        <Text className="text-xs text-slate-600 italic mt-0.5">
                          Nota: “{alert.note}”
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {alert.resolved_at ? (
                  <Text className="text-xs font-medium text-emerald-700 mt-1.5">
                    Resolvido em {dateTime(alert.resolved_at)}
                  </Text>
                ) : null}
              </View>

              {/* Ação de Reconhecimento (apenas Operator e Admin em alertas ativos) */}
              {status === 'active' && user && user.role !== 'viewer' ? (
                <View className="mt-3 pt-2 border-t border-slate-100">
                  <TouchButton
                    label="Reconhecer Alerta (ACK)"
                    variant="primary"
                    icon={<ClipboardCheck size={16} color="#ffffff" />}
                    onPress={() => {
                      setJustAcknowledged(false);
                      setAckTarget(alert);
                    }}
                    fullWidth
                  />
                </View>
              ) : null}
            </Card>
          );
        }}
        ListEmptyComponent={
          alertsResult.busy && !alertsResult.data ? (
            <LoadingState label="Consultando ocorrências na central de alertas…" />
          ) : (
            <EmptyState
              title="Nenhum alerta encontrado para os filtros"
              description="Altere os chips de estado ou severidade para visualizar outras ocorrências."
              actionLabel="Limpar filtros"
              onAction={() => {
                setStateFilter('');
                setSeverityFilter('');
                setDeviceFilter(undefined);
                setCursors([undefined]);
              }}
            />
          )
        }
        ListFooterComponent={
          cursors.length > 1 || alertsResult.data?.next_cursor ? (
            <Card className="flex-row items-center justify-between mt-2">
              <Text className="text-xs font-bold text-slate-700">
                Página {cursors.length}
              </Text>
              <View className="flex-row items-center gap-2">
                <TouchButton
                  label="Anterior"
                  variant="secondary"
                  disabled={cursors.length <= 1}
                  icon={<ChevronLeft size={16} color="#1e293b" />}
                  onPress={() => setCursors((prev) => prev.slice(0, -1))}
                />
                <TouchButton
                  label="Próxima"
                  variant="secondary"
                  disabled={!alertsResult.data?.next_cursor}
                  icon={<ChevronRight size={16} color="#1e293b" />}
                  onPress={() => {
                    const next = alertsResult.data?.next_cursor;
                    if (next) setCursors((prev) => [...prev, next]);
                  }}
                />
              </View>
            </Card>
          ) : null
        }
      />

      <AcknowledgeModal
        alert={ackTarget}
        visible={ackTarget !== null}
        onClose={() => setAckTarget(null)}
        onSuccess={() => {
          setJustAcknowledged(true);
          alertsResult.reload();
        }}
      />
    </View>
  );
}

