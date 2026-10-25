import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getApiBaseUrl,
  getBundleServerUrl,
  loginApi,
  setApiBaseUrl,
  showAlert,
  testConnectionApi,
} from '../api';
import { AppUser } from '../types';
import { QrScannerModal } from '../components/QrScannerModal';

interface Props {
  onLoginSuccess: (user: AppUser, token: string) => void;
  onScanGuestQr?: (token: string) => void;
}

export function LoginScreen({ onLoginSuccess, onScanGuestQr }: Props) {
  const isDemo = __DEV__ || process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
  const [username, setUsername] = useState(isDemo ? 'ahmet' : '');
  const [password, setPassword] = useState(isDemo ? 'ahmet123' : '');
  const [loading, setLoading] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Server settings modal & connection diagnostics
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setCustomServerUrl(getApiBaseUrl());
  }, []);

  async function handleTestConnection(targetUrl?: string) {
    const urlToTest = targetUrl || customServerUrl || getApiBaseUrl();
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await testConnectionApi(urlToTest);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || 'Bağlantı kurulamadı.' });
    } finally {
      setTestingConnection(false);
    }
  }

  function handleOpenSettings() {
    const current = getApiBaseUrl();
    setCustomServerUrl(current);
    setSettingsModalOpen(true);
    handleTestConnection(current);
  }

  async function handleLogin(userParam?: string, passParam?: string) {
    const u = userParam || username;
    const p = passParam || password;
    if (!u.trim() || !p.trim()) {
      showAlert('Eksik Bilgi', 'Kullanıcı adı ve şifre gereklidir.');
      return;
    }

    try {
      setLoading(true);
      const res = await loginApi(u.trim(), p.trim());
      onLoginSuccess(res.user, res.token);
    } catch (err: any) {
      showAlert(
        'Giriş Başarısız',
        err?.message || 'Sunucuya bağlanılamadı. Lütfen sunucu adresini kontrol edin.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveServerUrl() {
    if (!customServerUrl.trim()) return;
    try {
      await setApiBaseUrl(customServerUrl.trim());
      showAlert('Kaydedildi', `Sunucu adresi güncellendi: ${customServerUrl.trim()}`);
      setSettingsModalOpen(false);
    } catch (err: any) {
      showAlert('Hata', err?.message || 'Sunucu adresi kaydedilemedi.');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <Text style={styles.logoIcon}>📱</Text>
          <Text style={styles.appTitle}>Akıllı WC Saha Uygulaması</Text>
          <Text style={styles.appSubtitle}>
            Saha Personeli, Nöbetçi Şef & Kiosk Terminali
          </Text>
        </View>

        {/* Quick Role Selectors (Yalnızca Geliştirme / Demo Ortamında) */}
        {isDemo && (
          <>
            <Text style={styles.quickLabel}>HIZLI SAHA GİRİŞİ (DEMO):</Text>
            <View style={styles.quickGrid}>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => {
                  setUsername('ahmet');
                  setPassword('ahmet123');
                  handleLogin('ahmet', 'ahmet123');
                }}
              >
                <Text style={styles.quickBtnIcon}>🧹</Text>
                <Text style={styles.quickBtnTitle}>Personel Girişi</Text>
                <Text style={styles.quickBtnSub}>Ahmet Yılmaz</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickBtn, styles.quickBtnSupervisor]}
                onPress={() => {
                  setUsername('kemal');
                  setPassword('kemal123');
                  handleLogin('kemal', 'kemal123');
                }}
              >
                <Text style={styles.quickBtnIcon}>👮</Text>
                <Text style={styles.quickBtnTitle}>Şef Girişi</Text>
                <Text style={styles.quickBtnSub}>Kemal Demir</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Ziyaretçi QR Okutma Butonu - Yalnızca QR Okutulduğunda Açılır */}
        {onScanGuestQr && (
          <TouchableOpacity
            style={styles.guestKioskBtn}
            onPress={() => setQrModalOpen(true)}
          >
            <Text style={styles.guestKioskIcon}>📷</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.guestKioskTitle}>Ziyaretçi Anketi (QR Okutunuz)</Text>
              <Text style={styles.guestKioskSub}>
                Geri bildirim anketi yalnızca kapıdaki QR kod okutulduğunda açılır
              </Text>
            </View>
            <Text style={styles.guestKioskArrow}>➔</Text>
          </TouchableOpacity>
        )}

        {/* Custom Login Form */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>VEYA DİĞER KULLANICI</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
        <TextInput
          style={styles.input}
          placeholder="ahmet, kemal vb."
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />

        <Text style={styles.inputLabel}>Şifre</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••"
          placeholderTextColor="#64748b"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={() => handleLogin()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Sisteme Giriş Yap</Text>
          )}
        </TouchableOpacity>

        {/* Server Config Settings Link */}
        <TouchableOpacity
          style={styles.settingsLink}
          onPress={handleOpenSettings}
        >
          <Text style={styles.settingsLinkText}>
            ⚙️ Sunucu: {customServerUrl || getApiBaseUrl()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* MODAL: Server URL Config */}
      <Modal visible={settingsModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Sunucu Bağlantı Ayarı</Text>
            <Text style={styles.modalSub}>
              Fiziksel telefonda veya emülatörde API sunucunuzun IP adresini giriniz:
            </Text>

            <TextInput
              style={styles.serverInput}
              value={customServerUrl}
              onChangeText={(text) => {
                setCustomServerUrl(text);
                setTestResult(null);
              }}
              placeholder="http://192.168.1.106:3000/api"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />

            {/* Live Connection Diagnostics Badge */}
            <View style={styles.testStatusRow}>
              {testingConnection ? (
                <View style={[styles.testBadge, styles.testBadgeTesting]}>
                  <ActivityIndicator size="small" color="#38bdf8" />
                  <Text style={styles.testBadgeText}>Test ediliyor...</Text>
                </View>
              ) : testResult ? (
                <View
                  style={[
                    styles.testBadge,
                    testResult.ok ? styles.testBadgeOk : styles.testBadgeErr,
                  ]}
                >
                  <Text style={styles.testBadgeIcon}>{testResult.ok ? '✓' : '⚠️'}</Text>
                  <Text
                    style={[
                      styles.testBadgeText,
                      testResult.ok ? styles.textOk : styles.textErr,
                    ]}
                    numberOfLines={1}
                  >
                    {testResult.message}
                  </Text>
                </View>
              ) : (
                <View style={styles.testBadgeEmpty} />
              )}

              <TouchableOpacity
                style={styles.testActionBtn}
                onPress={() => handleTestConnection()}
                disabled={testingConnection}
              >
                <Text style={styles.testActionText}>⚡ Test Et</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.presetHeading}>HIZLI BAĞLANTI SEÇENEKLERİ:</Text>
            <View style={styles.presetWrap}>
              {getBundleServerUrl() && (
                <TouchableOpacity
                  style={[styles.presetBtn, styles.presetBtnHighlight]}
                  onPress={() => {
                    const u = `${getBundleServerUrl()}/api`;
                    setCustomServerUrl(u);
                    handleTestConnection(u);
                  }}
                >
                  <Text style={styles.presetBtnHighlightText}>🔄 Cihaz Hostu</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  const u = 'https://hgaxaio-anonymous-8081.exp.direct/api';
                  setCustomServerUrl(u);
                  handleTestConnection(u);
                }}
              >
                <Text style={styles.presetBtnText}>🌐 Ngrok Tunnel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  const u = 'http://192.168.1.106:3000/api';
                  setCustomServerUrl(u);
                  handleTestConnection(u);
                }}
              >
                <Text style={styles.presetBtnText}>📶 Wi-Fi (3000)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  const u = 'http://192.168.1.106:8081/api';
                  setCustomServerUrl(u);
                  handleTestConnection(u);
                }}
              >
                <Text style={styles.presetBtnText}>🔀 Metro (8081)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  const u = '/api';
                  setCustomServerUrl(u);
                  handleTestConnection(u);
                }}
              >
                <Text style={styles.presetBtnText}>💻 Web (/api)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  const u = 'http://10.0.2.2:3000/api';
                  setCustomServerUrl(u);
                  handleTestConnection(u);
                }}
              >
                <Text style={styles.presetBtnText}>🤖 Android</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  const u = 'http://localhost:3000/api';
                  setCustomServerUrl(u);
                  handleTestConnection(u);
                }}
              >
                <Text style={styles.presetBtnText}>🏠 Localhost</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setSettingsModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>Kapat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveServerUrl}>
                <Text style={styles.modalSaveText}>Kaydet ve Kullan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <QrScannerModal
        open={qrModalOpen}
        title="Ziyaretçi Anketi QR Doğrulama"
        subtitle="Ziyaretçi anketini açmak için mahal kapısındaki QR kodu kameranın ortasına hizalayınız."
        onClose={() => setQrModalOpen(false)}
        onScan={(token) => {
          setQrModalOpen(false);
          onScanGuestQr?.(token);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  quickBtnSupervisor: {
    borderColor: '#38bdf8',
  },
  quickBtnIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  quickBtnTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  quickBtnSub: {
    color: '#38bdf8',
    fontSize: 11,
    marginTop: 2,
  },
  guestKioskBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10b981',
    marginBottom: 16,
  },
  guestKioskIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  guestKioskTitle: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '700',
  },
  guestKioskSub: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  guestKioskArrow: {
    color: '#34d399',
    fontSize: 16,
    marginLeft: 6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    marginHorizontal: 8,
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  settingsLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  settingsLinkText: {
    color: '#64748b',
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f8fafc',
  },
  modalSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    marginBottom: 14,
  },
  serverInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    color: '#f8fafc',
    fontSize: 13,
  },
  testStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  testBadgeEmpty: {
    flex: 1,
  },
  testBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
  },
  testBadgeTesting: {
    backgroundColor: '#0c4a6e',
  },
  testBadgeOk: {
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#059669',
  },
  testBadgeErr: {
    backgroundColor: '#450a0a',
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  testBadgeIcon: {
    fontSize: 12,
  },
  testBadgeText: {
    fontSize: 11,
    color: '#cbd5e1',
    flex: 1,
  },
  textOk: {
    color: '#34d399',
    fontWeight: '600',
  },
  textErr: {
    color: '#f87171',
  },
  testActionBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  testActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  presetHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    marginTop: 2,
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  presetBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  presetBtnHighlight: {
    backgroundColor: '#0369a1',
    borderColor: '#38bdf8',
    borderWidth: 1,
  },
  presetBtnHighlightText: {
    color: '#e0f2fe',
    fontSize: 11,
    fontWeight: '700',
  },
  presetBtnText: {
    color: '#cbd5e1',
    fontSize: 11,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#cbd5e1',
    fontWeight: '600',
  },
  modalSave: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
