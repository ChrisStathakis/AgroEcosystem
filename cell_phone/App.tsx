import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { migrate } from './src/db/client';
import { seedDefaults } from './src/db/seed';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await migrate();
        await seedDefaults();
        setReady(true);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>Failed to open local database: {error}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Preparing your offline workspace…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}
