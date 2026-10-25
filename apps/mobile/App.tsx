import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { secureStorage } from './src/secureStorage';
import { initApiBaseUrl } from './src/api';
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
  const [scannedGuestToken, setScannedGuestToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    try {
      await initApiBaseUrl();

      // Deep linking / QR URL kontrolü (Web ve Mobil)
      if (typeof window !== 'undefined' && window.location) {
        const params = new URLSearchParams(window.location.search);
        const qToken =
          params.get('q') ||
          (window.location.pathname.startsWith('/q/')
            ? window.location.pathname.split('/q/')[1]?.split('?')[0]
            : null);
        if (qToken) {
          setScannedGuestToken(qToken);
          setIsGuestMode(true);
        }
      }

      const [savedUser, savedToken] = await Promise.all([
        secureStorage.getItem(STORAGE_AUTH_USER),
        secureStorage.getItem(STORAGE_AUTH_TOKEN),
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
    setScannedGuestToken(null);
    await Promise.all([
      secureStorage.setItem(STORAGE_AUTH_USER, JSON.stringify(authUser)),
      secureStorage.setItem(STORAGE_AUTH_TOKEN, authToken),
    ]);
  }

  async function handleLogout() {
    setUser(null);
    setToken(null);
    setIsGuestMode(false);
    setScannedGuestToken(null);
    await Promise.all([
      secureStorage.removeItem(STORAGE_AUTH_USER),
      secureStorage.removeItem(STORAGE_AUTH_TOKEN),
    ]);
  }

  function handleOpenGuestQr(scannedToken: string) {
    setScannedGuestToken(scannedToken);
    setIsGuestMode(true);
  }

  if (!ready) {
    return <View style={styles.container} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {isGuestMode ? (
        <GuestSurveyScreen
          scannedToken={scannedGuestToken || undefined}
          onBackToRoles={() => {
            setIsGuestMode(false);
            setScannedGuestToken(null);
          }}
        />
      ) : !user || !token ? (
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          onScanGuestQr={handleOpenGuestQr}
        />
      ) : user.role === 'supervisor' || user.role === 'admin' ? (
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
