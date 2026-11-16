import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getScenario, setScenario, subscribeScenario, type Scenario } from '../mocks/server';
import { api } from '../services/api';
import { DEMO_SCENARIO_KEY, defaultSecureStorage } from '../services/storage';
import type { User } from '../types';

type AuthContextValue = {
  user: User | null;
  restoring: boolean;
  scenario: Scenario;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  changeScenario: (value: Scenario) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [scenario, setScenarioState] = useState<Scenario>(() => getScenario());

  useEffect(() => {
    const unsub = subscribeScenario((next) => {
      setScenarioState(next);
    });
    return unsub;
  }, []);

  useEffect(() => {
    api.onExpired(() => {
      setUser(null);
      setScenario('normal');
    });
    return () => {
      api.onExpired(() => {});
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedScenario = await defaultSecureStorage.getItemAsync(DEMO_SCENARIO_KEY);
        if (savedScenario && savedScenario !== 'expired') {
          setScenario(savedScenario as Scenario);
        }
        const restoredUser = await api.restore();
        if (mounted) {
          setUser(restoredUser);
        }
      } catch {
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setRestoring(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loggedUser = await api.login(email, password);
    setUser(loggedUser);
    return loggedUser;
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setScenario('normal');
    await defaultSecureStorage.deleteItemAsync(DEMO_SCENARIO_KEY).catch(() => {});
    await api.logout().catch(() => {});
  }, []);

  const changeScenario = useCallback((value: Scenario) => {
    setScenario(value);
    void defaultSecureStorage.setItemAsync(DEMO_SCENARIO_KEY, value).catch(() => {});
    if (value === 'expired') {
      void api.me().catch(() => {});
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        restoring,
        scenario,
        login,
        logout,
        changeScenario,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return ctx;
}

