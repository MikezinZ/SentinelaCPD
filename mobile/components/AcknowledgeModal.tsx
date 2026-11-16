import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ClipboardCheck, X } from 'lucide-react-native';
import { api } from '../services/api';
import type { Alert, AlertType } from '../types';
import { FailureBanner, TouchButton } from './ui';

export const alertTypeLabels: Record<AlertType, string> = {
  temperature_high: 'Temperatura alta',
  temperature_low: 'Temperatura baixa',
  humidity_high: 'Umidade alta',
  humidity_low: 'Umidade baixa',
  current_high: 'Corrente RMS alta',
  telemetry_stale: 'Telemetria desatualizada',
  sensor_invalid: 'Sensor inválido',
};

export function AcknowledgeModal({
  alert,
  visible,
  onClose,
  onSuccess,
}: {
  alert: Alert | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  function handleDismiss() {
    if (busy) return;
    setNote('');
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!alert || busy) return;
    if (note.length > 500) {
      setError(new Error('A nota de auditoria pode ter no máximo 500 caracteres.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.acknowledge(alert.id, note.trim() || undefined);
      setNote('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Não foi possível reconhecer o alerta.')
      );
    } finally {
      setBusy(false);
    }
  }

  if (!alert) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-slate-950/60 justify-end"
      >
        <View className="bg-white rounded-t-3xl border-t border-slate-200 max-h-[85%]">
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-slate-200">
            <View className="flex-row items-center gap-2.5 flex-1">
              <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
                <ClipboardCheck size={20} color="#2563eb" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-extrabold text-slate-900">
                  Reconhecer Alerta (ACK)
                </Text>
                <Text className="text-xs text-slate-500">
                  {alertTypeLabels[alert.type]} · {alert.device_id}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleDismiss}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Fechar modal de reconhecimento"
              style={{ minHeight: 44, minWidth: 44 }}
              className="items-center justify-center rounded-xl bg-slate-100"
            >
              <X size={20} color="#334155" />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
          >
            <View className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4">
              <Text className="text-xs font-semibold text-slate-800">
                {alert.message}
              </Text>
              <Text className="text-[11px] text-slate-500 mt-1">
                O reconhecimento registra ciência operacional na trilha de auditoria. O alerta permanece aberto até a condição física normalizar.
              </Text>
            </View>

            <Text className="text-xs font-bold text-slate-800 mb-1.5">
              Nota de auditoria (opcional, máx. 500 caracteres)
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={500}
              multiline
              numberOfLines={4}
              editable={!busy}
              placeholder="Descreva a inspeção realizada no rack ou ação corretiva em andamento…"
              placeholderTextColor="#94a3b8"
              textAlignVertical="top"
              accessibilityLabel="Nota de auditoria opcional"
              className="border border-slate-300 rounded-xl bg-white p-3.5 text-sm text-slate-900 min-h-[110px]"
            />
            <Text
              className={`text-xs text-right mt-1 font-medium ${
                note.length >= 480 ? 'text-amber-700' : 'text-slate-500'
              }`}
            >
              {note.length}/500 caracteres
            </Text>

            {error ? (
              <View className="mt-3">
                <FailureBanner error={error} />
              </View>
            ) : null}

            <View className="flex-row gap-3 mt-5">
              <View className="flex-1">
                <TouchButton
                  label="Cancelar"
                  variant="secondary"
                  disabled={busy}
                  onPress={handleDismiss}
                  fullWidth
                />
              </View>
              <View className="flex-1">
                <TouchButton
                  label={busy ? 'Registrando…' : 'Confirmar ACK'}
                  variant="primary"
                  disabled={busy}
                  onPress={() => void handleConfirm()}
                  fullWidth
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

