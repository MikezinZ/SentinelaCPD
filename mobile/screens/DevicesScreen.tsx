import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  BellRing,
  Clock3,
  LogOut,
  Radio,
  RefreshCw,
  Search,
  Server,
  X,
} from 'lucide-react-native';
import { freshness } from '../types';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useClock, useResource } from '../hooks/useResource';
import { RackCard } from '../components/RackCard';
import {
  BrandHeader,
  EmptyState,
  FailureBanner,
  LoadingState,
  StaleBanner,
  roleLabels,
} from '../components/ui';

export function DevicesScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [search, setSearch] = useState('');
  const now = useClock();

  // Polling automático a cada 5s (pausado automaticamente quando AppState !== 'active')
  const result = useResource(
    'devices-list',
    async (signal) => {
      const first = await api.devices(undefined, signal);
      const items = [...first.items];
      let cursor = first.next_cursor;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const page = await api.devices(cursor, signal);
        items.push(...page.items);
        cursor = page.next_cursor;
      }
      return { ...first, items };
    },
    true
  );

  const devices = useMemo(() => {
    if (!result.data) return [];
    const elapsed = Math.max(0, now - result.at);
    return result.data.items.map((device) => ({
      ...device,
      freshness: freshness(
        device,
        elapsed,
        device.server_time ?? result.data?.server_time
      ),
    }));
  }, [result.data, result.at, now]);

  const filteredDevices = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return devices;
    return devices.filter((device) =>
      `${device.name} ${device.location} ${device.id}`
        .toLowerCase()
        .includes(term)
    );
  }, [devices, search]);

  const summary = useMemo(() => {
    const total = devices.length;
    const freshCount = devices.filter((d) => d.freshness === 'fresh').length;
    const staleCount = devices.filter((d) => d.freshness === 'stale').length;
    const openAlerts = devices.reduce((acc, d) => acc + d.active_alerts, 0);
    return { total, freshCount, staleCount, openAlerts };
  }, [devices]);

  const hasStale = devices.some((d) => d.freshness === 'stale');
  const staleSampleTime = devices.find((d) => d.freshness === 'stale')?.latest
    ?.received_at;

  return (
    <View className="flex-1 bg-slate-100">
      {/* Barra superior do aplicativo */}
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
        data={filteredDevices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={result.refreshing}
            onRefresh={result.reload}
            tintColor="#2563eb"
            colors={['#2563eb']}
          />
        }
        ListHeaderComponent={
          <View className="mb-3">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 pr-2">
                <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Visão Geral do CPD
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5">
                  Atualização contínua a cada 5s · Puxe para atualizar
                </Text>
              </View>
              <Pressable
                onPress={result.reload}
                accessibilityRole="button"
                accessibilityLabel="Atualizar telemetria agora"
                style={{ minHeight: 44, minWidth: 44 }}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300"
              >
                <RefreshCw size={15} color="#1e293b" />
                <Text className="text-xs font-bold text-slate-800">
                  Atualizar
                </Text>
              </Pressable>
            </View>

            {/* Tratamento de Erro HTTP 503 ou falha de rede */}
            {result.error ? (
              <FailureBanner
                error={result.error}
                cached={!!result.data}
                onRetry={result.reload}
              />
            ) : null}

            {/* Banner mandatório quando há telemetria antiga (> 15s) */}
            {!result.error && hasStale ? (
              <StaleBanner lastTimestamp={staleSampleTime} />
            ) : null}

            {/* Cards de Resumo Rápido (2x2 em telas móveis) */}
            <View className="flex-row flex-wrap -mx-1 mb-3">
              <View className="w-1/2 px-1 mb-2">
                <View className="bg-white rounded-2xl border border-slate-200 p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-slate-600">
                      Racks / Nós
                    </Text>
                    <View className="w-7 h-7 rounded-lg bg-blue-50 items-center justify-center">
                      <Server size={15} color="#1d4ed8" />
                    </View>
                  </View>
                  <Text className="text-2xl font-extrabold text-slate-900 mt-1">
                    {result.data ? summary.total : '--'}
                  </Text>
                  <Text className="text-[10px] text-slate-500">
                    Cadastrados no CPD
                  </Text>
                </View>
              </View>

              <View className="w-1/2 px-1 mb-2">
                <View className="bg-white rounded-2xl border border-slate-200 p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-slate-600">
                      Recentes
                    </Text>
                    <View className="w-7 h-7 rounded-lg bg-emerald-50 items-center justify-center">
                      <Radio size={15} color="#047857" />
                    </View>
                  </View>
                  <Text className="text-2xl font-extrabold text-slate-900 mt-1">
                    {result.data ? summary.freshCount : '--'}
                  </Text>
                  <Text className="text-[10px] text-slate-500">
                    Amostra &le; 15 s
                  </Text>
                </View>
              </View>

              <View className="w-1/2 px-1 mb-2">
                <View className="bg-white rounded-2xl border border-slate-200 p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-slate-600">
                      Desatualizados
                    </Text>
                    <View className="w-7 h-7 rounded-lg bg-amber-50 items-center justify-center">
                      <Clock3 size={15} color="#b45309" />
                    </View>
                  </View>
                  <Text className="text-2xl font-extrabold text-slate-900 mt-1">
                    {result.data ? summary.staleCount : '--'}
                  </Text>
                  <Text className="text-[10px] text-slate-500">
                    Sem pacote &gt; 15 s
                  </Text>
                </View>
              </View>

              <View className="w-1/2 px-1 mb-2">
                <View className="bg-white rounded-2xl border border-slate-200 p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-slate-600">
                      Alertas Abertos
                    </Text>
                    <View className="w-7 h-7 rounded-lg bg-rose-50 items-center justify-center">
                      <BellRing size={15} color="#be123c" />
                    </View>
                  </View>
                  <Text className="text-2xl font-extrabold text-slate-900 mt-1">
                    {result.data ? summary.openAlerts : '--'}
                  </Text>
                  <Text className="text-[10px] text-slate-500">
                    Ativos e reconhecidos
                  </Text>
                </View>
              </View>
            </View>

            {/* Barra de Busca */}
            <View className="flex-row items-center bg-white border border-slate-300 rounded-xl px-3.5 mb-2">
              <Search size={17} color="#64748b" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar rack por nome, setor ou ID…"
                placeholderTextColor="#94a3b8"
                accessibilityLabel="Buscar dispositivo"
                style={{ minHeight: 44 }}
                className="flex-1 ml-2 text-sm text-slate-900"
              />
              {search.length > 0 ? (
                <Pressable
                  onPress={() => setSearch('')}
                  accessibilityRole="button"
                  accessibilityLabel="Limpar busca"
                  style={{ minHeight: 44, minWidth: 44 }}
                  className="items-center justify-center"
                >
                  <X size={16} color="#64748b" />
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <RackCard
            device={item}
            onPress={() =>
              router.push(`/devices/${encodeURIComponent(item.id)}`)
            }
          />
        )}
        ListEmptyComponent={
          result.busy && !result.data ? (
            <LoadingState label="Consultando nós ESP32 do CPD…" />
          ) : (
            <EmptyState
              title={
                search
                  ? 'Nenhum rack encontrado para a busca'
                  : 'Nenhum dispositivo disponível'
              }
              description={
                search
                  ? 'Tente outro termo de pesquisa ou limpe o filtro.'
                  : 'Os nós de telemetria cadastrados no CPD aparecerão listados aqui.'
              }
              actionLabel={search ? 'Limpar filtro' : 'Recarregar'}
              onAction={() => {
                if (search) setSearch('');
                else result.reload();
              }}
            />
          )
        }
      />
    </View>
  );
}

