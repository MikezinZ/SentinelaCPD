import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

export default function IndexRoute() {
  const { user } = useAuth();
  if (!user) {
    return <Redirect href="/login" />;
  }
  return <Redirect href="/(tabs)/devices" />;
}

