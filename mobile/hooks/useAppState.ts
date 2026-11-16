import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export function useAppState(): AppStateStatus {
  const [appState, setAppState] = useState<AppStateStatus>(
    (AppState.currentState ?? 'active') as AppStateStatus
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return appState;
}

