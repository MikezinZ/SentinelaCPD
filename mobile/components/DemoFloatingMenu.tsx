import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  CheckCircle2,
  FlaskConical,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import {
  demoEmail,
  demoPassword,
  roles,
  scenarioDescriptions,
  scenarios,
  type Scenario,
} from '../mocks/server';
import { useMocks } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { roleLabels } from './ui';
import type { Role } from '../types';

export function DemoFloatingMenu() {
  const { scenario, changeScenario, user, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState<Role | null>(null);

  if (!useMocks) return null;

  const scenarioEntries = Object.entries(scenarios) as [Scenario, string][];

  async function handleQuickSwitchRole(role: Role) {
    if (switchingRole) return;
    setSwitchingRole(role);
    try {
      await login(demoEmail(role), demoPassword);
    } catch {
      // ignora erro
    } finally {
      setSwitchingRole(null);
    }
  }

  return (
    <>
      <View
        pointerEvents="box-none"
        className="absolute bottom-24 right-4 z-50"
      >
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Abrir Modo Demonstração. Cenário atual: ${scenarios[scenario]}`}
          style={{ minHeight: 48, minWidth: 48 }}
          className="flex-row items-center gap-2 px-4 py-3 rounded-full bg-slate-900 border border-blue-400/40 shadow-lg active:opacity-90"
        >
          <FlaskConical size={18} color="#60a5fa" />
          <View>
            <Text className="text-[10px] font-bold uppercase tracking-wider text-blue-300">
              Modo Demo
            </Text>
            <Text
              numberOfLines={1}
              className="text-xs font-bold text-white max-w-[150px]"
            >
              {scenarios[scenario].replace(/^\d+\.\s*/, '')}
            </Text>
          </View>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-slate-950/60 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[88%] border-t border-slate-200">
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-slate-200">
              <View className="flex-row items-center gap-2.5 flex-1">
                <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
                  <FlaskConical size={20} color="#2563eb" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-extrabold text-slate-900">
                    Modo Demonstração (Mocks)
                  </Text>
                  <Text className="text-xs text-slate-500">
                    Alterne em tempo real entre os 7 cenários obrigatórios e perfis RBAC
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Fechar menu de demonstração"
                style={{ minHeight: 44, minWidth: 44 }}
                className="items-center justify-center rounded-xl bg-slate-100"
              >
                <X size={20} color="#334155" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
              showsVerticalScrollIndicator={false}
            >
              {user ? (
                <View className="mb-5">
                  <View className="flex-row items-center gap-1.5 mb-2">
                    <ShieldCheck size={15} color="#2563eb" />
                    <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Troca Rápida de Perfil RBAC (Atual: {roleLabels[user.role]})
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    {roles.map((r) => {
                      const active = user.role === r;
                      return (
                        <Pressable
                          key={r}
                          disabled={switchingRole !== null}
                          onPress={() => void handleQuickSwitchRole(r)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={{ minHeight: 44 }}
                          className={`flex-1 items-center justify-center px-3 py-2.5 rounded-xl border ${
                            active
                              ? 'bg-blue-600 border-blue-600'
                              : 'bg-slate-50 border-slate-300'
                          }`}
                        >
                          <Text
                            className={`text-xs font-bold ${
                              active ? 'text-white' : 'text-slate-700'
                            }`}
                          >
                            {roleLabels[r]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Cenários de Simulação de Campo
              </Text>

              {scenarioEntries.map(([key, title]) => {
                const isSelected = scenario === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      changeScenario(key);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Selecionar cenário ${title}`}
                    style={{ minHeight: 56 }}
                    className={`flex-row items-start gap-3 p-3.5 rounded-2xl border mb-2.5 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <View className="mt-0.5">
                      <CheckCircle2
                        size={18}
                        color={isSelected ? '#2563eb' : '#cbd5e1'}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`text-sm font-bold ${
                          isSelected ? 'text-blue-950' : 'text-slate-900'
                        }`}
                      >
                        {title}
                      </Text>
                      <Text className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        {scenarioDescriptions[key]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

