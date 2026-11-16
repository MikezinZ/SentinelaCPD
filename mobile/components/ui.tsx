import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type ViewProps,
} from 'react-native';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleMinus,
  Clock3,
  Droplets,
  HelpCircle,
  Server,
  Thermometer,
  Zap,
} from 'lucide-react-native';
import { ApiError, metrics, reading } from '../types';
import type { Device, Freshness, Metric, Quality, Role } from '../types';

export const roleLabels: Record<Role, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Visualizador',
};

/**
 * Formata números decimais estritamente no padrão brasileiro (vírgula como separador decimal),
 * com fallback explícito caso o runtime Hermes não possua tabela ICU pt-BR completa.
 */
export function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return 'Indisponível';
  try {
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
    if (digits > 0 && !formatted.includes(',')) {
      return value.toFixed(digits).replace('.', ',');
    }
    return formatted;
  } catch {
    return value.toFixed(digits).replace('.', ',');
  }
}

export function dateTime(value?: string | null): string {
  if (!value) return '--';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '--';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(parsed));
  } catch {
    const d = new Date(parsed);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

export function shortTime(value?: string | null): string {
  if (!value) return '--';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '--';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeStyle: 'medium',
    }).format(new Date(parsed));
  } catch {
    const d = new Date(parsed);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

export const metricDigits = (metric: Metric): number => (metric === 'current' ? 2 : 1);

export const metricIcons = {
  temperature: Thermometer,
  humidity: Droplets,
  current: Zap,
} as const;

const statusConfig: Record<
  Freshness,
  {
    label: string;
    Icon: typeof CheckCircle2;
    bgClass: string;
    borderClass: string;
    textClass: string;
    iconColor: string;
  }
> = {
  fresh: {
    label: 'Recente',
    Icon: CheckCircle2,
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-800',
    iconColor: '#047857',
  },
  stale: {
    label: 'Desatualizado',
    Icon: Clock3,
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-300',
    textClass: 'text-amber-900',
    iconColor: '#b45309',
  },
  unknown: {
    label: 'Sem leitura',
    Icon: HelpCircle,
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-300',
    textClass: 'text-slate-700',
    iconColor: '#475569',
  },
  inactive: {
    label: 'Inativo',
    Icon: CircleMinus,
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-300',
    textClass: 'text-slate-600',
    iconColor: '#64748b',
  },
};

/**
 * Badge acessível combinando cor, ícone vetorial e rótulo textual explícito.
 */
export function StatusBadge({ value }: { value: Freshness }) {
  const cfg = statusConfig[value];
  const Icon = cfg.Icon;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Status de atualização: ${cfg.label}`}
      className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border ${cfg.bgClass} ${cfg.borderClass}`}
    >
      <Icon size={13} color={cfg.iconColor} />
      <Text className={`text-xs font-bold ${cfg.textClass}`}>{cfg.label}</Text>
    </View>
  );
}

export function SensorQualityBadge({
  quality,
  hasValidValue,
}: {
  quality?: Quality;
  hasValidValue: boolean;
}) {
  if (quality === 'invalid') {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel="Qualidade do sensor: Sensor inválido"
        className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border bg-rose-50 border-rose-200 self-start"
      >
        <AlertCircle size={13} color="#be123c" />
        <Text className="text-xs font-bold text-rose-800">Sensor inválido (invalid)</Text>
      </View>
    );
  }
  if (!hasValidValue) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel="Qualidade do sensor: Sem leitura válida"
        className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border bg-slate-100 border-slate-300 self-start"
      >
        <HelpCircle size={13} color="#475569" />
        <Text className="text-xs font-bold text-slate-700">Sem leitura (--)</Text>
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Qualidade do sensor: Sensor operacional OK"
      className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border bg-emerald-50 border-emerald-200 self-start"
    >
      <CheckCircle2 size={13} color="#047857" />
      <Text className="text-xs font-bold text-emerald-800">Sensor OK</Text>
    </View>
  );
}

/**
 * Exibição de valor de métrica respeitando estritamente:
 * - Nulos ou `quality: "invalid"` -> "Indisponível" (nunca zero).
 * - Corrente RMS -> estritamente valor em Amperes (A), sem inferir queda de energia ou kWh.
 */
export function MetricValueText({
  device,
  metric,
  size = 'md',
}: {
  device: Device;
  metric: Metric;
  size?: 'sm' | 'md' | 'lg';
}) {
  const value = reading(device.latest, metric);
  const textSize =
    size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-base' : 'text-sm';

  if (value === null) {
    return (
      <Text
        accessibilityLabel={`${metrics[metric].label}: Indisponível`}
        className={`${textSize} font-semibold text-slate-400 italic`}
      >
        Indisponível
      </Text>
    );
  }

  const formatted = fmt(value, metricDigits(metric));
  const unit = metrics[metric].unit;

  return (
    <Text
      accessibilityLabel={`${metrics[metric].label}: ${formatted} ${unit}`}
      className={`${textSize} font-extrabold text-slate-900`}
    >
      {formatted}{' '}
      <Text className="text-xs font-semibold text-slate-500">{unit}</Text>
    </Text>
  );
}

export function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-10 h-10 rounded-xl bg-blue-600 items-center justify-center shadow-sm">
        <Activity size={22} color="#ffffff" strokeWidth={2.4} />
      </View>
      <View>
        <Text
          className={`${compact ? 'text-lg' : 'text-xl'} font-extrabold tracking-tight text-slate-900`}
        >
          Sentinela<Text className="text-blue-600">CPD</Text>
        </Text>
        <Text className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
          TELEMETRIA DE BORDA & AUDITORIA
        </Text>
      </View>
    </View>
  );
}

export function Banner({
  title,
  children,
  tone = 'amber',
  actionLabel,
  onAction,
}: {
  title: string;
  children?: React.ReactNode;
  tone?: 'amber' | 'red' | 'green' | 'blue';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const toneStyles = {
    amber: {
      container: 'bg-amber-50 border-amber-300',
      title: 'text-amber-950',
      body: 'text-amber-900',
      iconColor: '#b45309',
      Icon: AlertTriangle,
    },
    red: {
      container: 'bg-rose-50 border-rose-300',
      title: 'text-rose-950',
      body: 'text-rose-900',
      iconColor: '#be123c',
      Icon: AlertCircle,
    },
    green: {
      container: 'bg-emerald-50 border-emerald-300',
      title: 'text-emerald-950',
      body: 'text-emerald-900',
      iconColor: '#047857',
      Icon: CheckCircle2,
    },
    blue: {
      container: 'bg-blue-50 border-blue-200',
      title: 'text-blue-950',
      body: 'text-blue-900',
      iconColor: '#1d4ed8',
      Icon: HelpCircle,
    },
  }[tone];

  const Icon = toneStyles.Icon;

  return (
    <View
      accessible
      accessibilityRole="alert"
      className={`flex-row items-start gap-3 p-3.5 rounded-xl border mb-3 ${toneStyles.container}`}
    >
      <View className="mt-0.5">
        <Icon size={20} color={toneStyles.iconColor} />
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-bold ${toneStyles.title}`}>{title}</Text>
        {children ? (
          <Text className={`text-xs mt-1 leading-relaxed ${toneStyles.body}`}>
            {children}
          </Text>
        ) : null}
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            style={{ minHeight: 44 }}
            className="mt-2.5 self-start px-3.5 py-2 rounded-lg bg-white border border-slate-300 justify-center"
          >
            <Text className="text-xs font-bold text-slate-800">{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Banner mandatório quando `stale` (> 15s sem leitura) ou quando há erro de rede com dados em cache.
 */
export function StaleBanner({ lastTimestamp }: { lastTimestamp?: string | null }) {
  return (
    <Banner title="Dados armazenados — conexão indisponível" tone="amber">
      {lastTimestamp
        ? `Exibindo última leitura recebida em ${dateTime(lastTimestamp)}. Leituras antigas nunca são apresentadas como atuais.`
        : 'Os nós marcados como desatualizados há mais de 15 segundos exibem a última amostra registrada com seu horário original.'}
    </Banner>
  );
}

export function FailureBanner({
  error,
  cached = false,
  onRetry,
}: {
  error: Error;
  cached?: boolean;
  onRetry?: () => void;
}) {
  const statusSuffix =
    error instanceof ApiError
      ? ` (HTTP ${error.status}${error.requestId ? ` · Req ${error.requestId}` : ''})`
      : '';
  return (
    <Banner
      title={cached ? 'Dados armazenados — conexão indisponível' : error.message}
      tone={cached ? 'amber' : 'red'}
      actionLabel={onRetry ? 'Tentar novamente' : undefined}
      onAction={onRetry}
    >
      {cached ? `${error.message}${statusSuffix}` : statusSuffix ? `Detalhe técnico:${statusSuffix}` : undefined}
    </Banner>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center justify-center p-8 my-4 rounded-2xl bg-white border border-slate-200">
      <View className="w-12 h-12 rounded-2xl bg-slate-100 items-center justify-center mb-3">
        <Server size={24} color="#475569" />
      </View>
      <Text className="text-base font-bold text-slate-900 text-center">{title}</Text>
      {description ? (
        <Text className="text-xs text-slate-500 text-center mt-1.5 leading-relaxed">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={{ minHeight: 44, minWidth: 44 }}
          className="mt-4 px-4 py-2.5 rounded-xl bg-blue-600 items-center justify-center"
        >
          <Text className="text-xs font-bold text-white">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Carregando telemetria…' }: { label?: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className="items-center justify-center p-10 my-4 rounded-2xl bg-white border border-slate-200"
    >
      <ActivityIndicator size="large" color="#2563eb" />
      <Text className="text-xs font-semibold text-slate-600 mt-3">{label}</Text>
    </View>
  );
}

export function TouchButton({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  icon,
  fullWidth = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = {
    primary: 'bg-blue-600 border-blue-600',
    secondary: 'bg-white border-slate-300',
    danger: 'bg-rose-600 border-rose-600',
  }[variant];

  const textStyles = {
    primary: 'text-white',
    secondary: 'text-slate-800',
    danger: 'text-white',
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={{ minHeight: 44, minWidth: 44 }}
      className={`flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-xl border ${styles} ${
        fullWidth ? 'w-full' : ''
      } ${disabled ? 'opacity-50' : 'active:opacity-80'}`}
    >
      {icon}
      <Text className={`text-sm font-bold ${textStyles}`}>{label}</Text>
    </Pressable>
  );
}

export function FilterChip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Filtro ${label}${selected ? ', selecionado' : ''}`}
      style={{ minHeight: 44, minWidth: 44 }}
      className={`flex-row items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border mr-2 ${
        selected
          ? 'bg-blue-600 border-blue-600'
          : 'bg-white border-slate-300'
      }`}
    >
      {icon}
      <Text
        className={`text-xs font-bold ${
          selected ? 'text-white' : 'text-slate-700'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, className = '', ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}

