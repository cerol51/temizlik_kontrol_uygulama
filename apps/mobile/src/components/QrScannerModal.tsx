import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
  const [scanned, setScanned] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [showManualInput, setShowManualInput] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (open) {
      setScanned(false);
      setManualToken('');
      if (!permission?.granted) {
        requestPermission();
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
    if (loc.token) {
      setScanned(true);
      onScan(loc.token);
    } else {
      // In case token is masked in public list, use code as fallback
      setScanned(true);
      onScan(`token-${loc.code.toLowerCase()}`);
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
          <View style={{ width: 60 }} />
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
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            >
              {/* Target viewfinder box */}
              <View style={styles.overlay}>
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
            </CameraView>
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>
                Kamera erişim izni bekleniyor veya kamera bulunamadı.
              </Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                <Text style={styles.permissionBtnText}>Kamera İzni Ver</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Web / Emülatör / Manuel Doğrulama Desteği */}
        <View style={styles.fallbackSection}>
          <TouchableOpacity
            style={styles.toggleManualBtn}
            onPress={() => setShowManualInput(!showManualInput)}
          >
            <Text style={styles.toggleManualText}>
              {showManualInput ? '▼ Manuel / Simülasyon Girişini Gizle' : '⚙️ Test / Manuel QR Kodu Girişi'}
            </Text>
          </TouchableOpacity>

          {showManualInput && (
            <View style={styles.manualCard}>
              <Text style={styles.manualLabel}>QR Kodu veya Bağlantısı Yapıştırınız:</Text>
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
                  <Text style={styles.quickLocsTitle}>Test İçin Mahal Seçiniz (Simülasyon):</Text>
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
    maxHeight: 400,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#334155',
    backgroundColor: '#020617',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
  },
  permissionText: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  fallbackSection: {
    padding: 16,
  },
  toggleManualBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
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
    marginTop: 8,
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
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
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
