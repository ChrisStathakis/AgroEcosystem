import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { migrate } from './src/db/client';
import { seedDefaults } from './src/db/seed';
import { loadLang } from './src/lib/i18n';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await loadLang();
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F6F7F2' }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F9E2DC', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Ionicons name="warning-outline" size={26} color="#B3402E" />
        </View>
        <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 6 }}>Cannot open workspace</Text>
        <Text style={{ color: '#6B7A75', textAlign: 'center' }}>{error}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={['#1E4D3A', '#2E6B4F']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="leaf" size={30} color="#A8C686" />
          </View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>Agro</Text>
          <Text style={{ color: '#A8C686', fontSize: 11, letterSpacing: 1.6, fontWeight: '700' }}>PREPARING OFFLINE WORKSPACE</Text>
          <ActivityIndicator color="#A8C686" />
          <StatusBar style="light" />
        </LinearGradient>
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
