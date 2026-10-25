import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Enterprise Secure Storage Adapter
 * - iOS: Apple Keychain (Hardware-backed Secure Enclave when available)
 * - Android: Android Keystore (EncryptedSharedPreferences / AES-GCM-256)
 * - Web: AsyncStorage / LocalStorage with silent fallback
 */
export const secureStorage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS !== 'web' && (await SecureStore.isAvailableAsync())) {
        await SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });
        return;
      }
    } catch {
      // Fallback below
    }
    await AsyncStorage.setItem(key, value);
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS !== 'web' && (await SecureStore.isAvailableAsync())) {
        const val = await SecureStore.getItemAsync(key);
        if (val !== null) return val;
      }
    } catch {
      // Fallback below
    }
    return await AsyncStorage.getItem(key);
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS !== 'web' && (await SecureStore.isAvailableAsync())) {
        await SecureStore.deleteItemAsync(key);
      }
    } catch {
      // Fallback below
    }
    await AsyncStorage.removeItem(key);
  },
};
