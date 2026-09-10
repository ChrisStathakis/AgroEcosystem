import React, { useCallback, useState } from 'react';
import { Alert, Button, Text, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDb } from '../db/client';
import { SINGLE_PROFILE_ID } from '../db/types';
import { Screen } from './Screen';

export function SettingsScreen() {
  const [name, setName] = useState('');
  const refresh = useCallback(async () => {
    const row = await getDb().getFirstAsync<{ display_name: string }>('SELECT display_name FROM profiles WHERE id = ?', [SINGLE_PROFILE_ID]);
    setName(row?.display_name ?? '');
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  return (
    <Screen title="Workspace settings" subtitle="YOUR WORKSPACE">
      <Text>Display name for this offline workspace (replaces Django user profile).</Text>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. My farm" style={{ borderWidth: 1, padding: 8, marginVertical: 8 }} />
      <Button
        title="Save"
        onPress={async () => {
          try {
            await getDb().runAsync("UPDATE profiles SET display_name = ?, updated_at = datetime('now') WHERE id = ?", [name.trim(), SINGLE_PROFILE_ID]);
            Alert.alert('Saved', 'Your workspace name has been updated.');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }}
      />
    </Screen>
  );
}
