import { powerLabel } from '../types';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ArrowRight,
  BellRing,
  Clock3,
  MapPin,
  Server,
} from 'lucide-react-native';
import { metricKeys, metrics, type Device } from '../types';
import {
  MetricValueText,
  StatusBadge,
  metricIcons,
  shortTime,
} from './ui';

export function RackCard({
  device,
  onPress,
}: {
  device: Device;
  onPress: () => void;
}) {
  const { name, location, latest, active_alerts } = device;
  const timestamp = latest
    ? shortTime(latest.sampled_at ?? latest.received_at)
    : 'Sem amostra';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Rack ${name}, localizado em ${location}. Toque para ver detalhes.`}
      className="bg-white rounded-2xl border border-slate-200 p-4 mb-3.5 shadow-sm active:opacity-90"
    >
      <View className="flex-row items-center justify-between gap-2 mb-2.5">
        <View className="flex-row items-center gap-2.5 flex-1">
          <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
            <Server size={20} color="#1d4ed8" />
          </View>
          <View className="flex-1">
            <Text
              numberOfLines={1}
              className="text-base font-extrabold text-slate-900"
            >
              {name}
            </Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <MapPin size={13} color="#64748b" />
              <Text
                numberOfLines={1}
                className="text-xs font-medium text-slate-500"
              >
                {location}
              </Text>
            </View>
          </View>
        </View>
        <StatusBadge value={device.freshness} />
      </View>

      <Text className="font-bold text-amber-800 bg-amber-50 p-3">{powerLabel(device)}</Text>
<View className="flex-row bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 my-1">
        {metricKeys.map((metric, idx) => {
          const Icon = metricIcons[metric];
          const iconColor =
            metric === 'temperature'
              ? '#b45309'
              : metric === 'humidity'
                ? '#1d4ed8'
                : '#047857';
          return (
            <View
              key={metric}
              className={`flex-1 px-2 ${
                idx > 0 ? 'border-l border-slate-200' : ''
              }`}
            >
              <View className="flex-row items-center gap-1 mb-1">
                <Icon size={13} color={iconColor} />
                <Text
                  numberOfLines={1}
                  className="text-[11px] font-semibold text-slate-600"
                >
                  {metric === 'current' ? 'Corrente' : metrics[metric].label}
                </Text>
              </View>
              <MetricValueText device={device} metric={metric} size="sm" />
            </View>
          );
        })}
      </View>

      <View className="flex-row items-center justify-between pt-3 mt-1 border-t border-slate-100">
        <View className="flex-row items-center gap-1.5">
          <Clock3 size={14} color="#64748b" />
          <Text className="text-xs font-medium text-slate-500">
            {device.freshness === 'stale' ? `Última: ${timestamp}` : timestamp}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {active_alerts > 0 ? (
            <View
              accessible
              accessibilityLabel={`${active_alerts} ${
                active_alerts === 1 ? 'alerta ativo' : 'alertas ativos'
              }`}
              className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200"
            >
              <BellRing size={12} color="#be123c" />
              <Text className="text-xs font-bold text-rose-800">
                {active_alerts} {active_alerts === 1 ? 'alerta' : 'alertas'}
              </Text>
            </View>
          ) : null}

          <View
            style={{ minHeight: 36 }}
            className="flex-row items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50"
          >
            <Text className="text-xs font-bold text-blue-700">Detalhes</Text>
            <ArrowRight size={14} color="#1d4ed8" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

