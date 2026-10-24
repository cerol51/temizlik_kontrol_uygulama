import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUser } from './src/types';
import { LoginScreen } from './src/screens/LoginScreen';
import { GuestSurveyScreen } from './src/screens/GuestSurveyScreen';
import { StaffScreen } from './src/screens/StaffScreen';
import { SupervisorScreen } from './src/screens/SupervisorScreen';

const STORAGE_AUTH_USER = 'wc_mobile_user';
const STORAGE_AUTH_TOKEN = 'wc_mobile_token';

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    try {
      const [savedUser, savedToken] = await Promise.all([
        AsyncStorage.getItem(STORAGE_AUTH_USER),
        AsyncStorage.getItem(STORAGE_AUTH_TOKEN),
      ]);
      if (savedUser && savedToken) {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      }
    } catch {
      // ignore
    } finally {
      setReady(true);
    }
  }

  async function handleLoginSuccess(authUser: AppUser, authToken: string) {
    setUser(authUser);
    setToken(authToken);
    setIsGuestMode(false);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_AUTH_USER, JSON.stringify(authUser)),
      AsyncStorage.setItem(STORAGE_AUTH_TOKEN, authToken),
    ]);
  }

  async function handleLogout() {
    setUser(null);
    setToken(null);
    setIsGuestMode(false);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_AUTH_USER),
      AsyncStorage.removeItem(STORAGE_AUTH_TOKEN),
    ]);
  }

  if (!ready) {
    return <View style={styles.container} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {isGuestMode ? (
        <GuestSurveyScreen onBackToRoles={() => setIsGuestMode(false)} />
      ) : !user || !token ? (
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          onOpenGuestMode={() => setIsGuestMode(true)}
        />
      ) : user.role === 'supervisor' ? (
        <SupervisorScreen user={user} token={token} onLogout={handleLogout} />
      ) : (
        <StaffScreen user={user} token={token} onLogout={handleLogout} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});
