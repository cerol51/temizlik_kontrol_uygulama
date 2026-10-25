import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  createCleaningApi,
  fetchAllIncidentsApi,
  fetchLocationsApi,
  fetchSupervisorStatusApi,
  formatTime,
  resolveIncidentApi,
  resolveQrTokenApi,
  showAlert,
} from '../api';
import { AppUser, Incident, Location, SupervisorLocationStatus } from '../types';
import { QrScannerModal } from '../components/QrScannerModal';

const CLEANING_CHECKLIST_ITEMS = [
  'Ayna, lavabo ve bataryaların dezenfeksiyonu yapıldı',
  'Klozet, pisuvar ve rezervuarlar ovularak temizlendi',
  'Çöp kovaları boşaltıldı ve yeni çöp torbası takıldı',
  'Sıvı sabun, kağıt havlu ve tuvalet kağıdı ikmali yapıldı',
];

interface Props {
  user: AppUser;
  token: string;
  onLogout: () => void;
}

export function StaffScreen({ user, token, onLogout }: Props) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [supStatus, setSupStatus] = useState<SupervisorLocationStatus | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskTab, setTaskTab] = useState<'ALL' | 'MINE' | 'LOCATION'>('ALL');

  // Routine cleaning modal & QR presence state
  const [cleaningModalOpen, setCleaningModalOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [verifiedLocationToken, setVerifiedLocationToken] = useState<string | null>(null);
  const [verifiedLocationName, setVerifiedLocationName] = useState<string | null>(null);
  const [checklistValues, setChecklistValues] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
    3: true,
  });
  const [cleaningNote, setCleaningNote] = useState('');
  const [submittingCleaning, setSubmittingCleaning] = useState(false);

  // Incident resolution modal state
  const [activeIncidentToResolve, setActiveIncidentToResolve] = useState<Incident | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Info modals
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [pastCleaningsModalOpen, setPastCleaningsModalOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshLocationData();
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedLocation?.id, token]);

  async function loadInitialData() {
    try {
      setLoading(true);
      const locs = await fetchLocationsApi();
      setLocations(locs);
      if (locs.length > 0 && !selectedLocation) {
        const first = locs[0];
        setSelectedLocation(first);
        await refreshLocationData(first.id);
      }
    } catch (err: any) {
      const msg = err?.message || 'Veriler yüklenemedi.';
      setNotice({ text: msg, bad: true });
      showAlert('Hata', msg);
    } finally {
      setLoading(false);
    }
  }

  async function refreshLocationData(locId?: string) {
    try {
      const activeLocId = locId || selectedLocation?.id;
      const [status, allIncs] = await Promise.all([
        activeLocId ? fetchSupervisorStatusApi(activeLocId, token).catch(() => null) : null,
        fetchAllIncidentsApi(token),
      ]);
      if (status) setSupStatus(status);
      setIncidents(allIncs || []);
    } catch (err) {
      // non-blocking
    }
  }

  // 4. Kural: Galeriden yükleme kaldırıldı, yalnızca anlık kamera çekimi yapılabilir
  async function handleTakePhoto() {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('İzin Gerekli', 'Fotoğraf çekebilmek için kamera izni vermelisiniz.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.35,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0].base64) {
        setPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (err: any) {
      showAlert('Kamera Hatası', err?.message || 'Kamera açılamadı.');
    }
  }

  // 2. Kural: Personelin rutin temizlik listesini açması için QR kodu okutması zorunludur
  function handleOpenCleaningChecklist() {
    if (!verifiedLocationToken) {
      setQrScannerOpen(true);
      return;
    }
    setCleaningModalOpen(true);
  }

  async function handleCleaningQrScanned(scannedToken: string) {
    setQrScannerOpen(false);
    try {
      const res = await resolveQrTokenApi(scannedToken);
      if (res?.location) {
        const matched =
          locations.find((l) => l.id === res.location.id) ||
          (res.location as unknown as Location);
        setSelectedLocation(matched);
        setVerifiedLocationToken(scannedToken);
        setVerifiedLocationName(res.location.name);
        setNotice({ text: `✓ Fiziki QR Doğrulandı: ${res.location.name}` });
        setCleaningModalOpen(true);
        return;
      }
    } catch {
      const matched = locations.find(
        (l) => l.token === scannedToken || `token-${l.code.toLowerCase()}` === scannedToken,
      );
      if (matched) {
        setSelectedLocation(matched);
        setVerifiedLocationToken(scannedToken);
        setVerifiedLocationName(matched.name);
        setNotice({ text: `✓ Fiziki QR Doğrulandı: ${matched.name}` });
        setCleaningModalOpen(true);
        return;
      }
    }
    showAlert('Geçersiz QR', 'Okutulan QR kodu sistemdeki herhangi bir mahal ile eşleşmedi.');
  }

  async function handleSubmitCleaning() {
    if (!selectedLocation) return;
    const allChecked = Object.values(checklistValues).every(Boolean);
    if (!allChecked) {
      const msg = 'Lütfen rutin temizlik adımlarının tamamını onaylayınız.';
      setNotice({ text: msg, bad: true });
      showAlert('Eksik Madde', msg);
      return;
    }

    try {
      setSubmittingCleaning(true);
      await createCleaningApi(
        {
          locationId: selectedLocation.id,
          locationToken: verifiedLocationToken || selectedLocation.token,
          staffName: user.fullName || user.username,
          items: CLEANING_CHECKLIST_ITEMS,
          note: cleaningNote.trim() || undefined,
        },
        token,
      );

      const successMsg = `Rutin temizlik başarıyla kaydedildi (${selectedLocation.name}).`;
      setNotice({ text: `✓ ${successMsg}` });
      showAlert('Başarılı', successMsg);
      setCleaningModalOpen(false);
      setCleaningNote('');
      setVerifiedLocationToken(null);
      setVerifiedLocationName(null);
      if (selectedLocation) {
        await refreshLocationData(selectedLocation.id);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Temizlik kaydedilemedi.';
      setNotice({ text: errMsg, bad: true });
      showAlert('Hata', errMsg);
    } finally {
      setSubmittingCleaning(false);
    }
  }

  async function handleResolveIncident() {
    if (!activeIncidentToResolve) return;
    try {
      setResolving(true);
      await resolveIncidentApi(
        activeIncidentToResolve.id,
        resolutionNote || 'Görev saha personeli tarafından giderildi ve kapatıldı.',
        photoBase64 || undefined,
        token,
      );

      const msg = 'Müdahale başarıyla tamamlandı ve nöbetçi şefe iletildi.';
      setNotice({ text: `✓ ${msg}` });
      showAlert('Tamamlandı', msg);
      setActiveIncidentToResolve(null);
      setResolutionNote('');
      setPhotoBase64(null);
      if (selectedLocation) {
        await refreshLocationData(selectedLocation.id);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Görev kapatılamadı.';
      setNotice({ text: errMsg, bad: true });
      showAlert('Hata', errMsg);
    } finally {
      setResolving(false);
    }
  }

  // Pending task filters
  const myName = (user.fullName || user.username || '').toLowerCase();

  const allPendingTasks = incidents.filter(
    (inc) => inc.status === 'OPEN' || inc.status === 'DISPATCHED' || inc.status === 'ESCALATED',
  );

  const myPendingTasks = allPendingTasks.filter((inc) => {
    if (inc.assignedStaffId && user.id && inc.assignedStaffId === user.id) {
      return true;
    }
    const assigned = (inc.assignedStaffName || '').toLowerCase();
    return assigned && (assigned.includes(myName) || myName.includes(assigned));
  });

  const locationPendingTasks = allPendingTasks.filter(
    (inc) => selectedLocation && inc.locationId === selectedLocation.id,
  );

  const displayedTasks =
    taskTab === 'MINE'
      ? myPendingTasks
      : taskTab === 'LOCATION'
        ? locationPendingTasks
        : allPendingTasks;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerRole}>Saha Temizlik Personeli</Text>
          <Text style={styles.headerName}>{user.fullName || user.username}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutBtnText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>

      {/* Visual in-screen status banner */}
      {notice && (
        <View style={[styles.noticeBox, notice.bad ? styles.noticeBoxBad : styles.noticeBoxGood]}>
          <Text style={styles.noticeText}>{notice.text}</Text>
          <TouchableOpacity onPress={() => setNotice(null)}>
            <Text style={styles.noticeClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Selected Restroom info bar */}
        <View style={styles.wcCard}>
          <Text style={styles.wcCardLabel}>GÖREVLİ OLUNAN LAVABO:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locRow}>
            {locations.map((loc) => {
              const isSelected = selectedLocation?.id === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.locPill, isSelected && styles.locPillActive]}
                  onPress={() => {
                    setSelectedLocation(loc);
                    refreshLocationData(loc.id);
                  }}
                >
                  <Text style={[styles.locPillCode, isSelected && styles.locPillCodeActive]}>
                    {loc.code}
                  </Text>
                  <Text style={[styles.locPillName, isSelected && styles.locPillNameActive]}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedLocation && (
            <View style={styles.locDetailsBox}>
              <View style={styles.locDetailRow}>
                <Text style={styles.locDetailKey}>Bina / Kat:</Text>
                <Text style={styles.locDetailVal}>{selectedLocation.building || 'Ana Bina'}</Text>
              </View>
              <View style={styles.locDetailRow}>
                <Text style={styles.locDetailKey}>Nöbetçi Şef:</Text>
                <Text style={styles.locDetailVal}>
                  {selectedLocation.currentSupervisorName || 'Atanmamış'}
                </Text>
              </View>
              <View style={styles.locDetailRow}>
                <Text style={styles.locDetailKey}>Son Temizlik:</Text>
                <Text style={styles.locDetailValHighlight}>
                  {supStatus?.lastCleaning?.actualTime
                    ? formatTime(supStatus.lastCleaning.actualTime)
                    : 'Henüz temizlik yok'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* PRIMARY ACTION BUTTON: Routine Cleaning Checklist */}
        <TouchableOpacity
          style={styles.mainActionBtn}
          onPress={handleOpenCleaningChecklist}
        >
          <Text style={styles.mainActionIcon}>📷</Text>
          <View style={styles.mainActionTexts}>
            <Text style={styles.mainActionTitle}>
              {verifiedLocationToken
                ? '✓ QR Doğrulandı - Temizlik Formunu Aç'
                : 'QR Kod Okut ve Temizliği Başlat'}
            </Text>
            <Text style={styles.mainActionSub}>
              {verifiedLocationToken
                ? `${verifiedLocationName || selectedLocation?.name} için temizlik onayı verilebilir`
                : 'Personelin temizlik listesini açması için mahal QR kodu okutması zorunludur'}
            </Text>
          </View>
          <Text style={styles.mainActionArrow}>➔</Text>
        </TouchableOpacity>

        {/* Real-time incident / non-conformity tasks */}
        <View style={styles.sectionHeaderWrap}>
          <Text style={styles.sectionTitle}>
            🚨 Şeften & Sistemden Gelen Müdahale Görevleri ({allPendingTasks.length})
          </Text>
        </View>

        {/* Task Filter Chips */}
        <View style={styles.taskTabRow}>
          <TouchableOpacity
            style={[styles.taskTabChip, taskTab === 'ALL' && styles.taskTabChipActive]}
            onPress={() => setTaskTab('ALL')}
          >
            <Text
              style={[styles.taskTabChipText, taskTab === 'ALL' && styles.taskTabChipTextActive]}
            >
              ⚡ Tüm Görevler ({allPendingTasks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.taskTabChip, taskTab === 'MINE' && styles.taskTabChipActive]}
            onPress={() => setTaskTab('MINE')}
          >
            <Text
              style={[styles.taskTabChipText, taskTab === 'MINE' && styles.taskTabChipTextActive]}
            >
              👤 Bana Atananlar ({myPendingTasks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.taskTabChip, taskTab === 'LOCATION' && styles.taskTabChipActive]}
            onPress={() => setTaskTab('LOCATION')}
          >
            <Text
              style={[
                styles.taskTabChipText,
                taskTab === 'LOCATION' && styles.taskTabChipTextActive,
              ]}
            >
              📍 Seçili WC ({locationPendingTasks.length})
            </Text>
          </TouchableOpacity>
        </View>

        {displayedTasks.length === 0 ? (
          <View style={styles.emptyTaskCard}>
            <Text style={styles.emptyTaskIcon}>✨</Text>
            <Text style={styles.emptyTaskTitle}>Bekleyen Görev Yok</Text>
            <Text style={styles.emptyTaskSub}>
              {taskTab === 'MINE'
                ? 'Şu anda doğrudan size atanmış açık bir görev bulunmuyor.'
                : taskTab === 'LOCATION'
                  ? 'Bu lavaboda açık bir uygunsuzluk bildirimi bulunmuyor.'
                  : 'Sistemde saha müdahalesi bekleyen herhangi bir açık görev bulunmuyor.'}
            </Text>
          </View>
        ) : (
          displayedTasks.map((task) => {
            const assigned = (task.assignedStaffName || '').toLowerCase();
            const isAssignedToMe = assigned && (assigned.includes(myName) || myName.includes(assigned));

            return (
              <View key={task.id} style={styles.taskCard}>
                <View style={styles.taskHeader}>
                  <View style={styles.taskBadge}>
                    <Text style={styles.taskBadgeText}>
                      {task.issuesJson && task.issuesJson.some((i) => i.includes('Denetim'))
                        ? '⚠️ ŞEF DENETİM UYGUNSUZLUĞU'
                        : '🚨 KÖTÜ ANKET BİLDİRİMİ'}
                    </Text>
                  </View>
                  <Text style={styles.taskTime}>{formatTime(task.time)}</Text>
                </View>

                <Text style={styles.taskLocTag}>
                  📍 {task.locationName || locations.find((l) => l.id === task.locationId)?.name || 'WC Mahali'} ({task.locationCode || ''})
                </Text>

                <Text style={styles.taskIssues}>
                  {Array.isArray(task.issuesJson) && task.issuesJson.length > 0
                    ? task.issuesJson.join(' • ')
                    : 'Acil temizlik ve düzenleme müdahalesi gerekli'}
                </Text>

                {task.assignedStaffName ? (
                  <View style={styles.assignedBadgeRow}>
                    <Text style={styles.taskAssigned}>
                      👤 Atanan Personel: <Text style={styles.boldText}>{task.assignedStaffName}</Text>
                    </Text>
                    {isAssignedToMe && (
                      <View style={styles.myAssignmentTag}>
                        <Text style={styles.myAssignmentTagText}>⭐ SİZE ATANDI</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.taskUnassigned}>⏳ Şef Görevlendirmesi Bekleniyor</Text>
                )}

                <TouchableOpacity
                  style={styles.taskActionBtn}
                  onPress={() => {
                    setActiveIncidentToResolve(task);
                    setPhotoBase64(null);
                    setResolutionNote('');
                  }}
                >
                  <Text style={styles.taskActionBtnText}>📸 Müdahale Et & Fotoğrafla Kapat</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Secondary Buttons: Planlanan Saatler & Mevcut Saatler */}
        <View style={styles.secondaryBtnRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setScheduleModalOpen(true)}
          >
            <Text style={styles.secondaryBtnIcon}>📅</Text>
            <Text style={styles.secondaryBtnText}>Planlanan Saatler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setPastCleaningsModalOpen(true)}
          >
            <Text style={styles.secondaryBtnIcon}>🕒</Text>
            <Text style={styles.secondaryBtnText}>Mevcut Temizlikler</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL: Routine Cleaning Checklist */}
      <Modal visible={cleaningModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Rutin Temizlik Checklist'i</Text>
            <Text style={styles.modalSubheading}>
              {verifiedLocationName || selectedLocation?.name} ({selectedLocation?.code})
            </Text>

            <View style={styles.verifiedBadgeRow}>
              <Text style={styles.verifiedBadgeText}>
                ✓ Fiziki QR Okutuldu &amp; Doğrulandı
              </Text>
            </View>

            <ScrollView style={styles.checklistScroll}>
              {CLEANING_CHECKLIST_ITEMS.map((item, idx) => {
                const checked = checklistValues[idx];
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.checkItem, checked && styles.checkItemActive]}
                    onPress={() =>
                      setChecklistValues({ ...checklistValues, [idx]: !checked })
                    }
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxActive]}>
                      {checked && <Text style={styles.checkboxTick}>✓</Text>}
                    </View>
                    <Text style={[styles.checkItemText, checked && styles.checkItemTextActive]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.inputLabel}>İsteğe Bağlı Temizlik Notu:</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: Sabun haznesi dolduruldu, paspas yapıldı..."
                placeholderTextColor="#64748b"
                value={cleaningNote}
                onChangeText={setCleaningNote}
                multiline
                numberOfLines={2}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setCleaningModalOpen(false);
                  setVerifiedLocationToken(null);
                  setVerifiedLocationName(null);
                }}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSubmitCleaning}
                disabled={submittingCleaning}
              >
                {submittingCleaning ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Kaydı Tamamla</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: Incident Resolution with Photo */}
      <Modal visible={!!activeIncidentToResolve} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Müdahale Tamamlama</Text>
            <Text style={styles.modalSubheading}>
              Görevi kapatmak için yapılan işlemi ve fotoğraf kanıtını ekleyin.
            </Text>

            <ScrollView style={styles.checklistScroll}>
              <Text style={styles.inputLabel}>Yapılan Müdahale Açıklaması:</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: Zemin kurutuldu, eksik sabun tamamlandı..."
                placeholderTextColor="#64748b"
                value={resolutionNote}
                onChangeText={setResolutionNote}
                multiline
                numberOfLines={2}
              />

              <Text style={styles.inputLabel}>Müdahale Kanıt Fotoğrafı (Anlık Çekim Zorunlu):</Text>
              <TouchableOpacity
                style={[styles.photoBtn, { width: '100%', paddingVertical: 12, backgroundColor: '#0284c7' }]}
                onPress={handleTakePhoto}
              >
                <Text style={styles.photoBtnText}>📷 Anlık Fotoğraf Çek</Text>
                <Text style={{ color: '#bae6fd', fontSize: 10, marginTop: 3 }}>
                  * Güvenlik kuralı gereği galeriden seçim yapılamaz, anlık kamera ile çekilmelidir.
                </Text>
              </TouchableOpacity>

              {photoBase64 && (
                <View style={styles.previewBox}>
                  <Image source={{ uri: photoBase64 }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => setPhotoBase64(null)}
                  >
                    <Text style={styles.removePhotoText}>Fotoğrafı Kaldır ✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setActiveIncidentToResolve(null)}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: '#16a34a' }]}
                onPress={handleResolveIncident}
                disabled={resolving}
              >
                {resolving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Görevi Kapat</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: Scheduled slots */}
      <Modal visible={scheduleModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Planlanan Temizlik Saatleri</Text>
            <Text style={styles.modalSubheading}>{selectedLocation?.name}</Text>

            <View style={styles.slotsGrid}>
              {selectedLocation?.schedule.map((slot) => {
                const cleaned = supStatus?.recentCleanings.some(
                  (c) => c.plannedSlot === slot,
                );
                return (
                  <View key={slot} style={[styles.slotCard, cleaned && styles.slotCardCleaned]}>
                    <Text style={[styles.slotCardText, cleaned && styles.slotCardTextCleaned]}>
                      {slot}
                    </Text>
                    <Text style={styles.slotCardSub}>{cleaned ? 'Tamamlandı ✓' : 'Bekliyor'}</Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.fullCloseBtn}
              onPress={() => setScheduleModalOpen(false)}
            >
              <Text style={styles.fullCloseBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: Past Cleanings */}
      <Modal visible={pastCleaningsModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Mevcut Temizlik Kayıtları</Text>
            <Text style={styles.modalSubheading}>{selectedLocation?.name}</Text>

            <ScrollView style={{ maxHeight: 280 }}>
              {!supStatus?.recentCleanings || supStatus.recentCleanings.length === 0 ? (
                <Text style={styles.emptyCleanText}>Bugün henüz tamamlanan temizlik yok.</Text>
              ) : (
                supStatus.recentCleanings.map((c, i) => (
                  <View key={i} style={styles.cleanRow}>
                    <View>
                      <Text style={styles.cleanStaff}>{c.staffName || 'Personel'}</Text>
                      <Text style={styles.cleanTime}>{formatTime(c.actualTime)}</Text>
                    </View>
                    <View style={styles.cleanBadge}>
                      <Text style={styles.cleanBadgeText}>
                        {c.slaStatus === 'ON_TIME' ? 'Zamanında' : 'Gecikmeli'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.fullCloseBtn}
              onPress={() => setPastCleaningsModalOpen(false)}
            >
              <Text style={styles.fullCloseBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal for Routine Cleaning Presence Verification */}
      <QrScannerModal
        open={qrScannerOpen}
        title="Rutin Temizlik QR Doğrulaması"
        subtitle="Personelin temizlik listesini açması için mahal kapısındaki QR kodu okutması zorunludur."
        expectedLocation={selectedLocation}
        locations={locations}
        onClose={() => setQrScannerOpen(false)}
        onScan={handleCleaningQrScanned}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  verifiedBadgeRow: {
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  verifiedBadgeText: {
    color: '#6ee7b7',
    fontSize: 12,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRole: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  logoutBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: '#f87171',
    fontWeight: '600',
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  wcCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  wcCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  locRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  locPill: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  locPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  locPillCode: {
    fontSize: 13,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  locPillCodeActive: {
    color: '#ffffff',
  },
  locPillName: {
    fontSize: 10,
    color: '#64748b',
  },
  locPillNameActive: {
    color: '#e0f2fe',
  },
  locDetailsBox: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  locDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  locDetailKey: {
    color: '#94a3b8',
    fontSize: 12,
  },
  locDetailVal: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  locDetailValHighlight: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  mainActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  mainActionIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  mainActionTexts: {
    flex: 1,
  },
  mainActionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  mainActionSub: {
    fontSize: 11,
    color: '#bae6fd',
    marginTop: 2,
  },
  mainActionArrow: {
    fontSize: 20,
    color: '#ffffff',
    marginLeft: 8,
  },
  sectionHeaderWrap: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  emptyTaskCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 18,
  },
  emptyTaskIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyTaskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#34d399',
    marginBottom: 4,
  },
  emptyTaskSub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  taskCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
    marginBottom: 12,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  taskBadgeText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '800',
  },
  taskTime: {
    color: '#94a3b8',
    fontSize: 11,
  },
  taskIssues: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
    lineHeight: 18,
  },
  taskLocTag: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  taskAssigned: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 12,
  },
  boldText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  taskActionBtn: {
    backgroundColor: '#b91c1c',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  taskActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  secondaryBtnIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  secondaryBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  noticeBox: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  noticeBoxGood: {
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
  },
  noticeBoxBad: {
    backgroundColor: '#7f1d1d',
    borderColor: '#ef4444',
  },
  noticeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  noticeClose: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
      },
    }),
  },
  modalCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    ...Platform.select({
      web: {
        maxHeight: '90vh' as any,
      },
    }),
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  modalSubheading: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 16,
  },
  checklistScroll: {
    maxHeight: 320,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  checkItemActive: {
    borderColor: '#0284c7',
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxActive: {
    borderColor: '#0284c7',
    backgroundColor: '#0284c7',
  },
  checkboxTick: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  checkItemText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 13,
  },
  checkItemTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  photoBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  photoBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  previewBox: {
    marginTop: 12,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
  },
  removePhotoBtn: {
    marginTop: 6,
    paddingVertical: 4,
  },
  removePhotoText: {
    color: '#f87171',
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  slotCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    borderRadius: 10,
    width: '30%',
    alignItems: 'center',
  },
  slotCardCleaned: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  slotCardText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  slotCardTextCleaned: {
    color: '#34d399',
  },
  slotCardSub: {
    color: '#64748b',
    fontSize: 9,
    marginTop: 2,
  },
  fullCloseBtn: {
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  fullCloseBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyCleanText: {
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 13,
  },
  cleanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  cleanStaff: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 13,
  },
  cleanTime: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  cleanBadge: {
    backgroundColor: '#064e3b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cleanBadgeText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  taskTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  taskTabChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  taskTabChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  taskTabChipText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  taskTabChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  assignedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  myAssignmentTag: {
    backgroundColor: '#065f46',
    borderColor: '#10b981',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  myAssignmentTagText: {
    color: '#6ee7b7',
    fontSize: 11,
    fontWeight: '800',
  },
  taskUnassigned: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
});
