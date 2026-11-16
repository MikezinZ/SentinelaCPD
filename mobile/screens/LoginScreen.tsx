import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  ArrowRight,
  FlaskConical,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react-native';
import { demoEmail, demoPassword, roles } from '../mocks/server';
import { useMocks } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import {
  BrandHeader,
  FailureBanner,
  TouchButton,
  roleLabels,
} from '../components/ui';
import type { Role } from '../types';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function handleSubmit(targetEmail: string, targetPassword: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(targetEmail, targetPassword);
    } catch (err) {
      // Regra mandatória: Em caso de erro, preservar e-mail e limpar o campo de senha
      setPassword('');
      setError(
        err instanceof Error
          ? err
          : new Error('Não foi possível autenticar no SentinelaCPD.')
      );
    } finally {
      setBusy(false);
    }
  }

  function handleDemoLogin(role: Role) {
    const addr = demoEmail(role);
    setEmail(addr);
    setPassword(demoPassword);
    void handleSubmit(addr, demoPassword);
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-900">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
        >
          {/* Cabeçalho institucional escuro */}
          <View className="mb-6 px-1">
            <View className="flex-row items-center gap-2 mb-3">
              <View className="px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 flex-row items-center gap-1.5">
                <Activity size={13} color="#60a5fa" />
                <Text className="text-[10px] font-bold tracking-widest uppercase text-blue-300">
                  TELEMETRIA DE DATA CENTER
                </Text>
              </View>
            </View>
            <Text className="text-3xl font-extrabold text-white tracking-tight">
              O CPD em tempo real na palma da mão.
            </Text>
            <Text className="text-xs text-slate-300 mt-2 leading-relaxed">
              Monitore temperatura, umidade relativa e corrente RMS dos nós ESP32 nos racks com auditoria imediata de alertas.
            </Text>
          </View>

          {/* Card de Autenticação */}
          <View className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200">
            <BrandHeader />

            <View className="mt-5 mb-4">
              <Text className="text-lg font-extrabold text-slate-900">
                Entrar no SentinelaCPD
              </Text>
              <Text className="text-xs text-slate-500 mt-0.5">
                Utilize suas credenciais provisionadas pela equipe de infraestrutura.
              </Text>
            </View>

            <View className="mb-3.5">
              <Text className="text-xs font-bold text-slate-700 mb-1.5">
                E-mail corporativo
              </Text>
              <View className="flex-row items-center border border-slate-300 rounded-xl bg-slate-50 px-3.5">
                <Mail size={17} color="#64748b" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!busy}
                  placeholder="operador@empresa.com.br"
                  placeholderTextColor="#94a3b8"
                  accessibilityLabel="E-mail corporativo"
                  style={{ minHeight: 46 }}
                  className="flex-1 ml-2.5 text-sm text-slate-900"
                />
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-xs font-bold text-slate-700 mb-1.5">
                Senha
              </Text>
              <View className="flex-row items-center border border-slate-300 rounded-xl bg-slate-50 px-3.5">
                <Lock size={17} color="#64748b" />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  editable={!busy}
                  placeholder="Digite sua senha"
                  placeholderTextColor="#94a3b8"
                  accessibilityLabel="Senha de acesso"
                  style={{ minHeight: 46 }}
                  className="flex-1 ml-2.5 text-sm text-slate-900"
                  onSubmitEditing={() => void handleSubmit(email, password)}
                />
              </View>
            </View>

            {error ? <FailureBanner error={error} /> : null}

            <TouchButton
              label={busy ? 'Autenticando…' : 'Entrar no Painel'}
              variant="primary"
              disabled={busy || !email.trim() || !password}
              onPress={() => void handleSubmit(email, password)}
              icon={<ArrowRight size={17} color="#ffffff" />}
              fullWidth
            />

            {/* Modo Demonstração (Mock First) */}
            {useMocks ? (
              <View className="mt-6 pt-5 border-t border-slate-200">
                <View className="flex-row items-center gap-2 mb-1.5">
                  <FlaskConical size={16} color="#2563eb" />
                  <Text className="text-xs font-extrabold uppercase tracking-wider text-blue-700">
                    Modo Demonstração (Acesso Rápido RBAC)
                  </Text>
                </View>
                <Text className="text-xs text-slate-500 mb-3">
                  Toque em um perfil abaixo para entrar e validar suas permissões:
                </Text>
                <View className="flex-row gap-2">
                  {roles.map((role) => (
                    <Pressable
                      key={role}
                      disabled={busy}
                      onPress={() => handleDemoLogin(role)}
                      accessibilityRole="button"
                      accessibilityLabel={`Entrar como ${roleLabels[role]}`}
                      style={{ minHeight: 44 }}
                      className="flex-1 items-center justify-center px-2.5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 active:bg-blue-100"
                    >
                      <Text className="text-xs font-bold text-blue-900">
                        {roleLabels[role]}
                      </Text>
                      <Text className="text-[10px] text-blue-600 mt-0.5">
                        {role}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <View className="flex-row items-center justify-center gap-2 mt-5">
            <ShieldCheck size={16} color="#94a3b8" />
            <Text className="text-xs text-slate-400 font-medium">
              Acesso restrito a contas provisionadas · Sem cadastro público
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

