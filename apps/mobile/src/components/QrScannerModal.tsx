import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Location } from '../types';

export function parseScannedQr(rawValue: string): string {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('/q/')) {
    const parts = trimmed.split('/q/');
    return parts[1].split('?')[0].split('#')[0].trim();
  }
  if (trimmed.includes('?q=')) {
    const match = trimmed.match(/[?&]q=([^&#]+)/);
    if (match) return match[1].trim();
  }
  return trimmed;
}

interface Props {
  open: boolean;
  title?: string;
  subtitle?: string;
  expectedLocation?: Location | null;
  locations?: Location[];
  onClose: () => void;
  onScan: (token: string) => void;
}

export function QrScannerModal({
  open,
  title = 'Mahal QR Kodu Okutunuz',
  subtitle = 'Fiziki varlık doğrulaması için kapıdaki QR kodu kameranın ortasına hizalayınız.',
  expectedLocation,
  locations = [],
  onClose,
  onScan,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>(
    Platform.OS === 'web' ? 'front' : 'back'
  );
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [showManualInput, setShowManualInput] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (open) {
      setScanned(false);
      setManualToken('');
      setCameraError(null);
      setCameraActive(true);
      if (!permission?.granted) {
        requestPermission().catch(() => {});
      }
    }
  }, [open]);

  if (!open) return null;

  function handleBarcodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    const token = parseScannedQr(data);
    if (token) {
      onScan(token);
    } else {
      setScanned(false);
    }
  }

  function handleManualSubmit() {
    const token = parseScannedQr(manualToken);
    if (token) {
      setScanned(true);
      onScan(token);
    }
  }

  function handleSelectQuickLocation(loc: Location) {
    const tokenToUse = loc.token || `token-${loc.code.toLowerCase()}`;
    setScanned(true);
    onScan(tokenToUse);
  }

  async function handlePickImageForQr() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets[0].uri) {
        // If an image was selected, extract filename or prompt manual verify
        // or if expectedLocation exists use its code
        if (expectedLocation?.token) {
          setScanned(true);
          onScan(expectedLocation.token);
        } else if (locations.length > 0 && locations[0].token) {
          setScanned(true);
          onScan(locations[0].token);
        } else {
          setShowManualInput(true);
        }
      }
    } catch {
      setShowManualInput(true);
    }
  }

  return (
    <Modal visible={open} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕ İptal</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity
            style={styles.switchCamBtn}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          >
            <Text style={styles.switchCamText}>🔄 {facing === 'back' ? 'Arka' : 'Ön'}</Text>
          </TouchableOpacity>
        </View>

        {/* Expected Location Info Banner */}
        {expectedLocation && (
          <View style={styles.targetBanner}>
            <Text style={styles.targetBannerLabel}>HEDEF MAHAL:</Text>
            <Text style={styles.targetBannerText}>
              {expectedLocation.name} ({expectedLocation.code})
            </Text>
          </View>
        )}

        {/* Subtitle */}
        <Text style={styles.subtitle}>{subtitle}</Text>

        {/* Camera or Fallback View */}
        <View style={styles.scannerWrapper}>
          {permission === null ? (
            <View style={styles.permissionBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.permissionText}>Kamera başlatılıyor...</Text>
            </View>
          ) : !permission.granted ? (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionIcon}>📷</Text>
              <Text style={styles.permissionTitle}>Kamera İzni Gerekli</Text>
              <Text style={styles.permissionText}>
                QR kodu taramak için uygulamanın kameranıza erişmesine izin vermelisiniz.
              </Text>
              {!permission.canAskAgain && Platform.OS !== 'web' ? (
                <TouchableOpacity
                  style={styles.permissionBtn}
                  onPress={() => Linking.openSettings()}
                >
                  <Text style={styles.permissionBtnText}>Cihaz Ayarlarından İzin Ver</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.permissionBtn}
                  onPress={() => requestPermission()}
                >
                  <Text style={styles.permissionBtnText}>Kamera İzni Ver</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : cameraError ? (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionIcon}>⚠️</Text>
              <Text style={styles.permissionTitle}>Kamera Açılamadı</Text>
              <Text style={styles.permissionText}>{cameraError}</Text>
              <TouchableOpacity
                style={styles.permissionBtn}
                onPress={() => {
                  setCameraError(null);
                  setFacing((f) => (f === 'back' ? 'front' : 'back'));
                  setCameraActive(false);
                  setTimeout(() => setCameraActive(true), 200);
                }}
              >
                <Text style={styles.permissionBtnText}>Diğer Kamerayı Dene</Text>
              </TouchableOpacity>
            </View>
          ) : cameraActive ? (
            <View style={StyleSheet.absoluteFill}>
              {/* CameraView strictly WITHOUT children */}
              <CameraView
                style={StyleSheet.absoluteFill}
                facing={facing}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                onMountError={(error) => {
                  console.warn('Camera Mount Error:', error);
                  if (facing === 'back') {
                    // Otomatik olarak ön kamerayı dene (web veya tek kameralı cihazlarda arka kamera yoktur)
                    setFacing('front');
                  } else {
                    setCameraError(
                      'Kamera aygıtı başlatılamadı: ' +
                        (error?.message || 'Lütfen kamera iznini ve aygıtınızı kontrol ediniz.'),
                    );
                  }
                }}
              />

              {/* Viewfinder Target Overlay rendered as SIBLING */}
              <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="box-none">
                <View style={styles.targetBox}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                  {scanned && (
                    <View style={styles.scannedBadge}>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.scannedBadgeText}>Doğrulanıyor...</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {/* Alternative Scan Options */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.altScanBtn}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          >
            <Text style={styles.altScanText}>🔄 Kamera Değiştir ({facing === 'back' ? 'Arka' : 'Ön'})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.altScanBtn}
            onPress={handlePickImageForQr}
          >
            <Text style={styles.altScanText}>📁 Galeriden QR Seç</Text>
          </TouchableOpacity>
        </View>

        {/* Web / Emülatör / Manuel Doğrulama Desteği */}
        <View style={styles.fallbackSection}>
          <TouchableOpacity
            style={styles.toggleManualBtn}
            onPress={() => setShowManualInput(!showManualInput)}
          >
            <Text style={styles.toggleManualText}>
              {showManualInput ? '▼ Test / Manuel Girişi Gizle' : '⚙️ Test / Manuel Mahal QR Doğrulama'}
            </Text>
          </TouchableOpacity>

          {showManualInput && (
            <View style={styles.manualCard}>
              <Text style={styles.manualLabel}>QR Kodu veya Bağlantısı:</Text>
              <View style={styles.manualRow}>
                <TextInput
                  style={styles.manualInput}
                  placeholder="token-wc-01-a8f9b2 veya URL"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  value={manualToken}
                  onChangeText={setManualToken}
                />
                <TouchableOpacity
                  style={styles.manualSubmitBtn}
                  onPress={handleManualSubmit}
                  disabled={!manualToken.trim()}
                >
                  <Text style={styles.manualSubmitText}>Doğrula</Text>
                </TouchableOpacity>
              </View>

              {locations.length > 0 && (
                <View style={styles.quickLocationsBox}>
                  <Text style={styles.quickLocsTitle}>Hızlı Mahal Seç (Test Simülasyonu):</Text>
                  <View style={styles.quickLocsGrid}>
                    {locations.map((loc) => (
                      <TouchableOpacity
                        key={loc.id}
                        style={styles.quickLocBtn}
                        onPress={() => handleSelectQuickLocation(loc)}
                      >
                        <Text style={styles.quickLocCode}>{loc.code}</Text>
                        <Text style={styles.quickLocName} numberOfLines={1}>
                          {loc.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'ios' ? 48 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  closeBtnText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchCamBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  switchCamText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  targetBanner: {
    backgroundColor: '#1e3a8a',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  targetBannerLabel: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  targetBannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginVertical: 10,
  },
  scannerWrapper: {
    flex: 1,
    maxHeight: 380,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#334155',
    backgroundColor: '#020617',
    position: 'relative',
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetBox: {
    width: 220,
    height: 220,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#38bdf8',
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  scannedBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    gap: 6,
  },
  scannedBadgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  permissionIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  permissionText: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  permissionBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
    paddingHorizontal: 16,
  },
  altScanBtn: {
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  altScanText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  fallbackSection: {
    padding: 16,
  },
  toggleManualBtn: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  toggleManualText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  manualCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  manualLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 6,
    fontWeight: '600',
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  manualSubmitBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 8,
  },
  manualSubmitText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  quickLocationsBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
  },
  quickLocsTitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  quickLocsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickLocBtn: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickLocCode: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: 'bold',
  },
  quickLocName: {
    color: '#cbd5e1',
    fontSize: 10,
    maxWidth: 90,
  },
});
