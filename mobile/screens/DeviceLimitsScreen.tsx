import React, { useState } from 'react';
import {
  Alert as NativeAlert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Droplets,
  RefreshCw,
  Save,
  ShieldAlert,
  Thermometer,
  Zap,
} from 'lucide-react-native';
import {
  ApiError,
  validateLimits,
  type Limits,
} from '../types';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useResource } from '../hooks/useResource';
import {
  Banner,
  Card,
  FailureBanner,
  LoadingState,
  TouchButton,
} from '../components/ui';

type LimitFieldKey = Exclude<keyof Limits, 'version'>;

const FIELD_GROUPS: readonly {
  title: string;
  subtitle: string;
  Icon: typeof Thermometer;
  iconColor: string;
  bgClass: string;
  fields: readonly [LimitFieldKey, string, string][];
}[] = [
  {
    title: 'Temperatura (ASHRAE TC 9.9)',
    subtitle: 'Limites térmicos em °C e histerese de rearme',
    Icon: Thermometer,
    iconColor: '#b45309',
    bgClass: 'bg-amber-50',
    fields: [
      ['temperature_min', 'Temperatura Mínima (°C)', '18,0'],
      ['temperature_max', 'Temperatura Máxima (°C)', '27,0'],
      ['temperature_hysteresis', 'Histerese Térmica (°C)', '1,0'],
    ],
  },
  {
    title: 'Umidade Relativa',
    subtitle: 'Limites higrométricos em % UR',
    Icon: Droplets,
    iconColor: '#1d4ed8',
    bgClass: 'bg-blue-50',
    fields: [
      ['humidity_min', 'Umidade Mínima (% UR)', '40,0'],
      ['humidity_max', 'Umidade Máxima (% UR)', '60,0'],
      ['humidity_hysteresis', 'Histerese de Umidade (p.p.)', '3,0'],
    ],
  },
  {
    title: 'Corrente Elétrica RMS',
    subtitle: 'Limite máximo em Amperes (A) e histerese',
    Icon: Zap,
    iconColor: '#047857',
    bgClass: 'bg-emerald-50',
    fields: [
      ['current_max', 'Corrente RMS Máxima (A)', '12,00'],
      ['current_hysteresis', 'Histerese de Corrente (A)', '0,50'],
    ],
  },
];

function LimitsForm({
  deviceId,
  initialLimits,
  onForceReload,
}: {
  deviceId: string;
  initialLimits: Limits;
  onForceReload: () => void;
}) {
  const [record, setRecord] = useState<Limits>(initialLimits);
  const [inputs, setInputs] = useState<Partial<Record<LimitFieldKey, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const isConflict = error instanceof ApiError && error.status === 409;

  function getFieldText(name: LimitFieldKey): string {
    if (inputs[name] !== undefined) return inputs[name]!;
    const val = record[name];
    if (val === null || val === undefined) return '';
    return String(val).replace('.', ',');
  }

  function handleChange(name: LimitFieldKey, text: string) {
    setSaved(false);
    setInputs((prev) => ({ ...prev, [name]: text }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSave() {
    if (busy || isConflict) return;
    setError(null);
    setSaved(false);

    const payload: Limits = { ...record };
    for (const [rawKey, rawVal] of Object.entries(inputs)) {
      const key = rawKey as LimitFieldKey;
      const trimmed = (rawVal ?? '').trim();
      const parsed = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed)
        ? Number(trimmed.replace(',', '.'))
        : NaN;

      if (key === 'consecutive_samples') {
        payload.consecutive_samples = parsed;
      } else {
        payload[key] = trimmed ? parsed : null;
      }
    }

    const validationErrors = validateLimits(payload);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setBusy(true);
    try {
      const updated = await api.saveLimits(deviceId, payload);
      setRecord(updated);
      setInputs({});
      setSaved(true);
    } catch (err) {
      const caught =
        err instanceof Error
          ? err
          : new Error('Falha ao salvar limites operacionais.');
      setError(caught);
      if (caught instanceof ApiError && caught.fields) {
        setFieldErrors(caught.fields);
      }
      // Regra mandatória: Tratamento de erro HTTP 409 exibindo Alert nativo informando concorrência e forçando recarregamento
      if (caught instanceof ApiError && caught.status === 409) {
        NativeAlert.alert(
          'Conflito de Versão (HTTP 409)',
          'Os limites deste nó foram modificados concorrentemente por outro administrador. É necessário recarregar os dados mais recentes antes de aplicar novas alterações.',
          [
            {
              text: 'Recarregar Dados Agora',
              style: 'default',
              onPress: () => onForceReload(),
            },
          ],
          { cancelable: false }
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      {isConflict ? (
        <Banner
          title="Conflito de versão detectado · HTTP 409"
          tone="red"
          actionLabel="Recarregar limites atualizados"
          onAction={onForceReload}
        >
          Outra sessão alterou a parametrização deste rack. Para evitar sobrescrita acidental (Optimistic Locking), recarregue a versão atual do servidor.
        </Banner>
      ) : error ? (
        <FailureBanner error={error} />
      ) : null}

      {saved ? (
        <Banner title="Limites operacionais salvos com sucesso" tone="green">
          Nova versão sincronizada: v{record.version}. Os alertas serão avaliados segundo estas faixas.
        </Banner>
      ) : null}

      {FIELD_GROUPS.map(({ title, subtitle, Icon, iconColor, bgClass, fields }) => (
        <Card key={title} className="mb-3.5">
          <View className="flex-row items-center gap-2.5 mb-3 pb-2.5 border-b border-slate-100">
            <View className={`w-9 h-9 rounded-xl items-center justify-center ${bgClass}`}>
              <Icon size={18} color={iconColor} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-extrabold text-slate-900">
                {title}
              </Text>
              <Text className="text-[11px] text-slate-500">{subtitle}</Text>
            </View>
          </View>

          {fields.map(([fieldKey, label, placeholder]) => {
            const errText = fieldErrors[fieldKey];
            return (
              <View key={fieldKey} className="mb-3">
                <Text className="text-xs font-bold text-slate-700 mb-1">
                  {label}
                </Text>
                <TextInput
                  value={getFieldText(fieldKey)}
                  onChangeText={(t) => handleChange(fieldKey, t)}
                  keyboardType="decimal-pad"
                  editable={!busy && !isConflict}
                  placeholder={`Ex.: ${placeholder} (vazio desativa)`}
                  placeholderTextColor="#94a3b8"
                  accessibilityLabel={label}
                  style={{ minHeight: 44 }}
                  className={`border rounded-xl px-3.5 py-2 text-sm text-slate-900 ${
                    errText
                      ? 'border-rose-400 bg-rose-50/40'
                      : 'border-slate-300 bg-slate-50'
                  }`}
                />
                {errText ? (
                  <Text className="text-xs font-semibold text-rose-700 mt-1">
                    {errText}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </Card>
      ))}

      {/* Regra de Avaliação (Amostras Consecutivas) */}
      <Card className="mb-4">
        <Text className="text-sm font-extrabold text-slate-900 mb-1">
          Janela de Confirmação (Debounce)
        </Text>
        <Text className="text-xs text-slate-500 mb-3">
          Quantidade de amostras consecutivas fora da faixa antes de abrir um alerta:
        </Text>

        <Text className="text-xs font-bold text-slate-700 mb-1">
          Amostras Consecutivas
        </Text>
        <TextInput
          value={getFieldText('consecutive_samples')}
          onChangeText={(t) => handleChange('consecutive_samples', t)}
          keyboardType="number-pad"
          editable={!busy && !isConflict}
          placeholder="3"
          placeholderTextColor="#94a3b8"
          accessibilityLabel="Amostras consecutivas"
          style={{ minHeight: 44 }}
          className={`border rounded-xl px-3.5 py-2 text-sm text-slate-900 ${
            fieldErrors.consecutive_samples
              ? 'border-rose-400 bg-rose-50/40'
              : 'border-slate-300 bg-slate-50'
          }`}
        />
        {fieldErrors.consecutive_samples ? (
          <Text className="text-xs font-semibold text-rose-700 mt-1">
            {fieldErrors.consecutive_samples}
          </Text>
        ) : null}
      </Card>

      <Card className="mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xs font-bold text-slate-700">
            Controle Otimista de Versão
          </Text>
          <View className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200">
            <Text className="text-xs font-extrabold text-blue-800">
              Versão {record.version}
            </Text>
          </View>
        </View>
        <Text className="text-xs text-slate-500 mb-3">
          Campos opcionais deixados em branco desativam aquele limite específico. Use vírgula para casas decimais.
        </Text>

        <TouchButton
          label={busy ? 'Salvando limites…' : 'Salvar Limites Operacionais'}
          variant="primary"
          disabled={busy || isConflict}
          icon={<Save size={17} color="#ffffff" />}
          onPress={() => void handleSave()}
          fullWidth
        />
      </Card>
    </View>
  );
}

export function DeviceLimitsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deviceId = Array.isArray(id) ? id[0] : id ?? '';
  const router = useRouter();
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);

  const limitsResult = useResource(
    `limits:${deviceId}:${revision}`,
    (signal) => api.limits(deviceId, signal)
  );

  const deviceResult = useResource(`limits-device:${deviceId}`, (signal) =>
    api.device(deviceId, signal)
  );

  function forceReload() {
    setRevision((r) => r + 1);
  }

  return (
    <View className="flex-1 bg-slate-100">
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
          onPress={forceReload}
          accessibilityRole="button"
          accessibilityLabel="Recarregar limites do servidor"
          style={{ minHeight: 44, minWidth: 44 }}
          className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200"
        >
          <RefreshCw size={15} color="#1e293b" />
          <Text className="text-xs font-bold text-slate-800">Recarregar</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        >
          <View className="mb-4">
            <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Configuração de Limites
            </Text>
            <Text className="text-xs text-slate-500 mt-0.5">
              {deviceResult.data?.name ?? deviceId} · Parametrização exclusiva Admin
            </Text>
          </View>

          <Banner title="Avaliação no Servidor" tone="blue">
            Os limites são aplicados pelo servidor para gerar alertas. Não são enviados ao ESP32 nesta versão.
          </Banner>

          {user?.role !== 'admin' ? (
            <Banner title="Acesso Restrito (RBAC)" tone="red">
              A configuração de limites operacionais exige o perfil Administrador (admin). Seu perfil atual não possui permissão de escrita neste recurso.
            </Banner>
          ) : (
            <>
              {limitsResult.error ? (
                <FailureBanner
                  error={limitsResult.error}
                  onRetry={forceReload}
                />
              ) : null}

              {limitsResult.busy && !limitsResult.data ? (
                <LoadingState label="Carregando versão atual dos limites…" />
              ) : null}

              {limitsResult.data ? (
                <LimitsForm
                  key={`${deviceId}:${revision}:${limitsResult.data.version}`}
                  deviceId={deviceId}
                  initialLimits={limitsResult.data}
                  onForceReload={forceReload}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

