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
import {
  assignIncidentApi,
  createAuditApi,
  fetchActiveChecklistApi,
  fetchAllIncidentsApi,
  fetchLocationsApi,
  fetchStaffUsersApi,
  fetchSupervisorStatusApi,
  formatTime,
  resolveQrTokenApi,
  showAlert,
  verifyAndCloseIncidentApi,
} from '../api';
import { AppUser, Incident, Location, SupervisorLocationStatus } from '../types';
import { QrScannerModal } from '../components/QrScannerModal';

const DEFAULT_CHECKLIST_CRITERIA = [
  'Ayna ve lavabolar lekesiz',
  'Klozet ve pisuvarlar hijyenik',
  'Zemin kuru ve temiz',
  'Sabun / kağıt havlu dolu',
  'Koku durumu ferah',
  'Çöp kovası boş ve poşetli',
];

const DEFAULT_STAFF_USERS: AppUser[] = [
  { id: 'usr-ahmet', fullName: 'Ahmet Temizlik', username: 'ahmet', role: 'employee' },
  { id: 'usr-mehmet', fullName: 'Mehmet Hijyen', username: 'mehmet', role: 'employee' },
  { id: 'usr-personel', fullName: 'Saha Temizlik Personeli', username: 'personel', role: 'employee' },
];

interface Props {
  user: AppUser;
  token: string;
  onLogout: () => void;
}

export function SupervisorScreen({ user, token, onLogout }: Props) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [supStatus, setSupStatus] = useState<SupervisorLocationStatus | null>(null);
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [staffUsers, setStaffUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter state for incidents
  const [incidentFilterStatus, setIncidentFilterStatus] = useState<
    'ALL' | 'OPEN' | 'DISPATCHED' | 'RESOLVED_BY_STAFF'
  >('ALL');
  const [incidentLocationFilter, setIncidentLocationFilter] = useState<string>('ALL');

  // Assignment modal state
  const [assigningIncident, setAssigningIncident] = useState<Incident | null>(null);
  const [selectedStaffToAssign, setSelectedStaffToAssign] = useState<string>('Ahmet Temizlik');
  const [assigning, setAssigning] = useState(false);

  // 3 Primary Action Modals & QR presence state
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [verifiedAuditLocationToken, setVerifiedAuditLocationToken] = useState<string | null>(null);
  const [verifiedAuditLocationName, setVerifiedAuditLocationName] = useState<string | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [currentCleaningsModalOpen, setCurrentCleaningsModalOpen] = useState(false);

  // In-screen notice banner
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);

  // Dynamic checklist criteria from database
  const [checklistCriteria, setChecklistCriteria] = useState<string[]>(DEFAULT_CHECKLIST_CRITERIA);
  const [checklistVersion, setChecklistVersion] = useState<string>('v1.2');

  // Audit state
  const [auditAnswers, setAuditAnswers] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    DEFAULT_CHECKLIST_CRITERIA.forEach((_, idx) => (init[idx] = true));
    return init;
  });
  const [auditNote, setAuditNote] = useState('');
  const [submittingAudit, setSubmittingAudit] = useState(false);

  // Photo viewer modal state
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    void loadAllData();
  }, []);

  useEffect(() => {
    // Kurumsal Mobil Optimizasyonu: Batarya ve 4G kotasını korumak için 25s aralıkla arka plan senkronizasyonu
    const interval = setInterval(() => {
      Promise.all([
        fetchAllIncidentsApi(token),
        selectedLocation ? fetchSupervisorStatusApi(selectedLocation.id, token).catch(() => null) : null,
      ]).then(([incs, status]) => {
        if (incs) setAllIncidents(incs);
        if (status) setSupStatus(status);
      }).catch(() => {});
    }, 25000);
    return () => clearInterval(interval);
  }, [selectedLocation?.id, token]);

  async function loadAllData() {
    try {
      setLoading(true);
      const [locs, incs, users, clData] = await Promise.all([
        fetchLocationsApi(),
        fetchAllIncidentsApi(token),
        fetchStaffUsersApi(token).catch(() => []),
        fetchActiveChecklistApi().catch(() => null),
      ]);
      setLocations(locs);
      setAllIncidents(incs);
      if (clData?.items && clData.items.length > 0) {
        setChecklistCriteria(clData.items);
        if (clData.versionTag) setChecklistVersion(clData.versionTag);
        const initAns: Record<number, boolean> = {};
        clData.items.forEach((_, idx) => (initAns[idx] = true));
        setAuditAnswers(initAns);
      }
      const combinedStaff = users.length > 0 ? users : DEFAULT_STAFF_USERS;
      setStaffUsers(combinedStaff);
      if (combinedStaff.length > 0) {
        setSelectedStaffToAssign(combinedStaff[0].fullName || combinedStaff[0].username);
      }
      if (locs.length > 0 && !selectedLocation) {
        const first = locs[0];
        setSelectedLocation(first);
        const status = await fetchSupervisorStatusApi(first.id, token).catch(() => null);
        if (status) setSupStatus(status);
      }
    } catch (err: any) {
      const msg = err?.message || 'Veriler yüklenemedi.';
      setNotice({ text: msg, bad: true });
      showAlert('Hata', msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectLocation(loc: Location) {
    setSelectedLocation(loc);
    try {
      const status = await fetchSupervisorStatusApi(loc.id, token);
      setSupStatus(status);
    } catch {
      // non-blocking
    }
  }

  function openAssignModal(inc: Incident) {
    const list = staffUsers.length > 0 ? staffUsers : DEFAULT_STAFF_USERS;
    const defaultStaff = selectedStaffToAssign || list[0].fullName || list[0].username;
    setSelectedStaffToAssign(defaultStaff);
    setAssigningIncident(inc);
  }

  async function handleAssignStaff() {
    if (!assigningIncident) return;
    const list = staffUsers.length > 0 ? staffUsers : DEFAULT_STAFF_USERS;
    const staffToUse =
      selectedStaffToAssign ||
      (list[0]?.fullName || list[0]?.username || 'Ahmet Temizlik');

    const matchedStaff = list.find(
      (u) => (u.fullName || u.username) === staffToUse || u.id === staffToUse,
    );
    const staffId = matchedStaff?.id;

    try {
      setAssigning(true);
      await assignIncidentApi(assigningIncident.id, staffToUse, token, staffId);
      const successMsg = `Görev başarıyla ${staffToUse} personeline iletildi.`;
      setNotice({ text: `✓ ${successMsg}` });
      showAlert('Atandı', successMsg);
      setAssigningIncident(null);
      // Refresh incidents
      const incs = await fetchAllIncidentsApi(token);
      setAllIncidents(incs);
    } catch (err: any) {
      const errMsg = err?.message || 'Personele atama yapılamadı.';
      setNotice({ text: errMsg, bad: true });
      showAlert('Hata', errMsg);
    } finally {
      setAssigning(false);
    }
  }

  async function handleVerifyClose(inc: Incident) {
    try {
      await verifyAndCloseIncidentApi(inc.id, undefined, token);
      const msg = `Olay (${inc.locationCode || 'Mahal'}) başarıyla doğrulanıp kapatıldı.`;
      setNotice({ text: `✓ ${msg}` });
      showAlert('Kapatıldı', msg);
      const incs = await fetchAllIncidentsApi(token);
      setAllIncidents(incs);
    } catch (err: any) {
      const errMsg = err?.message || 'Olay kapatılamadı.';
      setNotice({ text: errMsg, bad: true });
      showAlert('Hata', errMsg);
    }
  }

  // 3. Kural: Şefin denetim listesini açması için QR okutması zorunludur
  function handleOpenAuditChecklist() {
    if (!verifiedAuditLocationToken) {
      setQrScannerOpen(true);
      return;
    }
    setAuditModalOpen(true);
  }

  async function handleAuditQrScanned(scannedToken: string) {
    setQrScannerOpen(false);
    try {
      const res = await resolveQrTokenApi(scannedToken);
      if (res?.location) {
        const matched =
          locations.find((l) => l.id === res.location.id) ||
          (res.location as unknown as Location);
        setSelectedLocation(matched);
        setVerifiedAuditLocationToken(scannedToken);
        setVerifiedAuditLocationName(res.location.name);
        setNotice({ text: `✓ Şef Denetimi İçin QR Doğrulandı: ${res.location.name}` });
        setAuditModalOpen(true);
        return;
      }
    } catch {
      const matched = locations.find(
        (l) => l.token === scannedToken || `token-${l.code.toLowerCase()}` === scannedToken,
      );
      if (matched) {
        setSelectedLocation(matched);
        setVerifiedAuditLocationToken(scannedToken);
        setVerifiedAuditLocationName(matched.name);
        setNotice({ text: `✓ Şef Denetimi İçin QR Doğrulandı: ${matched.name}` });
        setAuditModalOpen(true);
        return;
      }
    }
    showAlert('Geçersiz QR', 'Okutulan QR kodu sistemdeki herhangi bir mahal ile eşleşmedi.');
  }

  async function handleSubmitAudit() {
    if (!selectedLocation) return;
    try {
      setSubmittingAudit(true);
      const formattedChecklist = checklistCriteria.map((criterion, idx) => ({
        id: idx + 1,
        label: criterion,
        isOk: auditAnswers[idx] ?? true,
      }));
      const nonCompliantItems = formattedChecklist.filter((c) => !c.isOk);
      const isApproved = nonCompliantItems.length === 0;

      await createAuditApi(
        {
          locationId: selectedLocation.id,
          locationToken: verifiedAuditLocationToken || undefined,
          isApproved,
          checklist: formattedChecklist,
          note: auditNote.trim() || undefined,
          templateVersion: checklistVersion,
        },
        token,
      );

      if (nonCompliantItems.length > 0) {
        const msg = `${nonCompliantItems.length} adet uygunsuzluk tespit edildi ve sahada müdahale edilmesi için personele otomatik görev olarak atandı!`;
        setNotice({ text: `⚠️ ${msg}`, bad: true });
        showAlert('Denetim Tamamlandı', msg);
      } else {
        const msg = 'Tüm kriterler uygun olarak denetim onaylandı.';
        setNotice({ text: `✓ ${msg}` });
        showAlert('Mükemmel', msg);
      }

      setAuditModalOpen(false);
      setAuditNote('');
      setVerifiedAuditLocationToken(null);
      setVerifiedAuditLocationName(null);
      // Reset answers to all true
      const resetAnswers: Record<number, boolean> = {};
      checklistCriteria.forEach((_, idx) => (resetAnswers[idx] = true));
      setAuditAnswers(resetAnswers);

      // Refresh data
      await loadAllData();
    } catch (err: any) {
      const errMsg = err?.message || 'Denetim kaydedilemedi.';
      setNotice({ text: errMsg, bad: true });
      showAlert('Hata', errMsg);
    } finally {
      setSubmittingAudit(false);
    }
  }

  // Filtered incidents
  const filteredIncidents = allIncidents.filter((inc) => {
    const matchesStatus =
      incidentFilterStatus === 'ALL'
        ? true
        : incidentFilterStatus === 'OPEN'
          ? inc.status === 'OPEN' || inc.status === 'ESCALATED'
          : inc.status === incidentFilterStatus;

    const matchesLocation =
      incidentLocationFilter === 'ALL'
        ? true
        : inc.locationId === incidentLocationFilter;

    return matchesStatus && matchesLocation;
  });

  const openIncidentCount = allIncidents.filter(
    (i) => i.status === 'OPEN' || i.status === 'ESCALATED',
  ).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.roleBadgeRow}>
            <Text style={styles.headerRole}>Nöbetçi Denetim Şefi</Text>
            {openIncidentCount > 0 && (
              <View style={styles.counterBadge}>
                <Text style={styles.counterBadgeText}>{openIncidentCount} Yeni</Text>
              </View>
            )}
          </View>
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
        {/* TOP SECTION: Multi-WC Incident Notification Hub */}
        <View style={styles.hubCard}>
          <View style={styles.hubHeader}>
            <Text style={styles.hubTitle}>🚨 Anket & Olay Bildirim Merkezi</Text>
            <TouchableOpacity onPress={loadAllData} style={styles.refreshBtn}>
              <Text style={styles.refreshBtnText}>Yenile ↻</Text>
            </TouchableOpacity>
          </View>

          {/* Incident Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            <TouchableOpacity
              style={[
                styles.chip,
                incidentFilterStatus === 'ALL' && styles.chipActive,
              ]}
              onPress={() => setIncidentFilterStatus('ALL')}
            >
              <Text
                style={[
                  styles.chipText,
                  incidentFilterStatus === 'ALL' && styles.chipTextActive,
                ]}
              >
                Tümü ({allIncidents.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.chip,
                incidentFilterStatus === 'OPEN' && styles.chipActiveRed,
              ]}
              onPress={() => setIncidentFilterStatus('OPEN')}
            >
              <Text
                style={[
                  styles.chipText,
                  incidentFilterStatus === 'OPEN' && styles.chipTextActive,
                ]}
              >
                🔴 Bekleyen ({openIncidentCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.chip,
                incidentFilterStatus === 'DISPATCHED' && styles.chipActiveYellow,
              ]}
              onPress={() => setIncidentFilterStatus('DISPATCHED')}
            >
              <Text
                style={[
                  styles.chipText,
                  incidentFilterStatus === 'DISPATCHED' && styles.chipTextActive,
                ]}
              >
                🟡 Görevde (
                {allIncidents.filter((i) => i.status === 'DISPATCHED').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.chip,
                incidentFilterStatus === 'RESOLVED_BY_STAFF' && styles.chipActiveGreen,
              ]}
              onPress={() => setIncidentFilterStatus('RESOLVED_BY_STAFF')}
            >
              <Text
                style={[
                  styles.chipText,
                  incidentFilterStatus === 'RESOLVED_BY_STAFF' && styles.chipTextActive,
                ]}
              >
                🟢 Çözüldü (
                {allIncidents.filter((i) => i.status === 'RESOLVED_BY_STAFF').length})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Area Selector for Incidents */}
          <View style={styles.locFilterRow}>
            <Text style={styles.filterPrompt}>Alan Filtresi:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  styles.subLocChip,
                  incidentLocationFilter === 'ALL' && styles.subLocChipActive,
                ]}
                onPress={() => setIncidentLocationFilter('ALL')}
              >
                <Text
                  style={[
                    styles.subLocChipText,
                    incidentLocationFilter === 'ALL' && styles.subLocChipTextActive,
                  ]}
                >
                  Tüm Alanlar
                </Text>
              </TouchableOpacity>
              {locations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    styles.subLocChip,
                    incidentLocationFilter === loc.id && styles.subLocChipActive,
                  ]}
                  onPress={() => setIncidentLocationFilter(loc.id)}
                >
                  <Text
                    style={[
                      styles.subLocChipText,
                      incidentLocationFilter === loc.id && styles.subLocChipTextActive,
                    ]}
                  >
                    {loc.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Incidents List */}
          {filteredIncidents.length === 0 ? (
            <View style={styles.hubEmpty}>
              <Text style={styles.hubEmptyText}>Seçili filtrede herhangi bir olay kaydı yok.</Text>
            </View>
          ) : (
            filteredIncidents.slice(0, 5).map((inc) => {
              const isAuditNonConformity =
                Array.isArray(inc.issuesJson) &&
                inc.issuesJson.some((i) => i.includes('Denetim'));
              const isResolved = inc.status === 'RESOLVED_BY_STAFF';

              return (
                <View
                  key={inc.id}
                  style={[
                    styles.incItem,
                    inc.status === 'OPEN' && styles.incItemOpen,
                    isResolved && styles.incItemResolved,
                  ]}
                >
                  <View style={styles.incItemHeader}>
                    <View style={styles.incBadgeArea}>
                      <Text style={styles.incLocationCode}>
                        {inc.locationCode || 'WC'}
                      </Text>
                      <Text style={styles.incLocationName}>
                        {inc.locationName || 'Alan'}
                      </Text>
                    </View>
                    <Text style={styles.incTime}>{formatTime(inc.time)}</Text>
                  </View>

                  <View style={styles.incTypeTag}>
                    <Text style={styles.incTypeTagText}>
                      {isAuditNonConformity
                        ? '⚠️ ŞEF DENETİM UYGUNSUZLUĞU'
                        : '🚨 KÖTÜ ANKET BİLDİRİMİ'}
                    </Text>
                  </View>

                  <Text style={styles.incIssues}>
                    {Array.isArray(inc.issuesJson) && inc.issuesJson.length > 0
                      ? inc.issuesJson.join(' • ')
                      : 'Genel hijyen veya temizlik problemi'}
                  </Text>

                  {/* Status & Assignment Footer */}
                  <View style={styles.incFooter}>
                    {isResolved ? (
                      <View style={styles.resolvedInfoBox}>
                        <Text style={styles.resolvedText}>
                          ✅ Personel tarafından tamamlandı
                        </Text>
                        {inc.resolutionNote && (
                          <Text style={styles.resolvedNote}>"{inc.resolutionNote}"</Text>
                        )}
                        {inc.photoUrl && (
                          <TouchableOpacity
                            style={styles.photoThumbBtn}
                            onPress={() => setPreviewPhotoUrl(inc.photoUrl || null)}
                          >
                            <Text style={styles.photoThumbBtnText}>📸 Çözüm Fotoğrafını Gör</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.verifyCloseBtn}
                          onPress={() => handleVerifyClose(inc)}
                        >
                          <Text style={styles.verifyCloseBtnText}>✔️ Sahada Doğrula & Olayı Kapat</Text>
                        </TouchableOpacity>
                      </View>
                    ) : inc.status === 'DISPATCHED' ? (
                      <View style={styles.assignedBox}>
                        <Text style={styles.assignedText}>
                          🟡 Görevde: <Text style={styles.bold}>{inc.assignedStaffName || 'Personel'}</Text>
                        </Text>
                        <TouchableOpacity
                          style={styles.reassignBtn}
                          onPress={() => openAssignModal(inc)}
                        >
                          <Text style={styles.reassignBtnText}>Değiştir</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.assignActionBtn}
                        onPress={() => openAssignModal(inc)}
                      >
                        <Text style={styles.assignActionBtnText}>👉 Personele Görev Olarak Ata</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* MIDDLE SECTION: WC Seçme Kutusu */}
        <View style={styles.wcSelectorCard}>
          <Text style={styles.wcSelectorLabel}>DENETLENECEK ALAN / WC SEÇİNİZ:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wcScroll}>
            {locations.map((loc) => {
              const isSelected = selectedLocation?.id === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.wcPill, isSelected && styles.wcPillActive]}
                  onPress={() => handleSelectLocation(loc)}
                >
                  <Text style={[styles.wcPillCode, isSelected && styles.wcPillCodeActive]}>
                    {loc.code}
                  </Text>
                  <Text style={[styles.wcPillName, isSelected && styles.wcPillNameActive]}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedLocation && (
            <View style={styles.currentWcInfo}>
              <Text style={styles.currentWcTitle}>
                {selectedLocation.code} - {selectedLocation.name}
              </Text>
              <Text style={styles.currentWcSub}>
                Bina: {selectedLocation.building || 'Ana Bina'} • Son Temizlik:{' '}
                {supStatus?.lastCleaning?.actualTime
                  ? formatTime(supStatus.lastCleaning.actualTime)
                  : 'Yok'}
              </Text>
            </View>
          )}
        </View>

        {/* BOTTOM SECTION: SADECE 3 TEMEL BUTON */}
        <View style={styles.primaryActionsContainer}>
          {/* BUTON 1: QR İLE DENETİM YAP */}
          <TouchableOpacity
            style={styles.bigButtonAudit}
            onPress={handleOpenAuditChecklist}
          >
            <View style={styles.bigBtnIconWrap}>
              <Text style={styles.bigBtnIcon}>📷</Text>
            </View>
            <View style={styles.bigBtnTexts}>
              <Text style={styles.bigBtnTitle}>
                {verifiedAuditLocationToken
                  ? '✓ QR Doğrulandı - Denetimi Aç'
                  : 'QR Kod Okut ve Denetime Başla'}
              </Text>
              <Text style={styles.bigBtnDesc}>
                {verifiedAuditLocationToken
                  ? `${verifiedAuditLocationName || selectedLocation?.name} için denetim formu hazır`
                  : 'Şefin denetim listesini açması için mahal kapısındaki QR kodu okutması zorunludur'}
              </Text>
            </View>
            <Text style={styles.bigBtnArrow}>➔</Text>
          </TouchableOpacity>

          {/* BUTON 2: PLANLANAN TEMİZLİK SAATLERİ */}
          <TouchableOpacity
            style={styles.bigButtonSchedule}
            onPress={() => setScheduleModalOpen(true)}
          >
            <View style={styles.bigBtnIconWrap}>
              <Text style={styles.bigBtnIcon}>📅</Text>
            </View>
            <View style={styles.bigBtnTexts}>
              <Text style={styles.bigBtnTitle}>Planlanan Temizlik Saatleri</Text>
              <Text style={styles.bigBtnDesc}>
                Vardiya planı ve hedeflenen periyodik temizlik saatleri
              </Text>
            </View>
            <Text style={styles.bigBtnArrow}>➔</Text>
          </TouchableOpacity>

          {/* BUTON 3: MEVCUT TEMİZLİK SAATLERİ */}
          <TouchableOpacity
            style={styles.bigButtonCurrent}
            onPress={() => setCurrentCleaningsModalOpen(true)}
          >
            <View style={styles.bigBtnIconWrap}>
              <Text style={styles.bigBtnIcon}>🕒</Text>
            </View>
            <View style={styles.bigBtnTexts}>
              <Text style={styles.bigBtnTitle}>Mevcut Temizlik Saatleri</Text>
              <Text style={styles.bigBtnDesc}>
                Bugün tamamlanan temizlik kayıtları ve zamanında yapılma durumu
              </Text>
            </View>
            <Text style={styles.bigBtnArrow}>➔</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL 1: DENETİM FORMU (CHECKLIST V1.2) */}
      <Modal visible={auditModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Standart Şef Denetimi</Text>
            <Text style={styles.modalSubheading}>
              {verifiedAuditLocationName || selectedLocation?.name} ({selectedLocation?.code})
            </Text>

            <View style={styles.verifiedBadgeRow}>
              <Text style={styles.verifiedBadgeText}>
                ✓ Fiziki QR Okutuldu &amp; Doğrulandı
              </Text>
            </View>

            <ScrollView style={styles.modalScroll}>
              {checklistCriteria.map((criterion, idx) => {
                const isCompliant = auditAnswers[idx];
                return (
                  <View key={idx} style={styles.auditItemRow}>
                    <Text style={styles.criterionText}>
                      {idx + 1}. {criterion}
                    </Text>
                    <View style={styles.toggleRow}>
                      <TouchableOpacity
                        style={[
                          styles.toggleBtn,
                          isCompliant && styles.toggleBtnCompliant,
                        ]}
                        onPress={() => setAuditAnswers({ ...auditAnswers, [idx]: true })}
                      >
                        <Text
                          style={[
                            styles.toggleBtnText,
                            isCompliant && styles.toggleBtnTextActive,
                          ]}
                        >
                          Uygun
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.toggleBtn,
                          !isCompliant && styles.toggleBtnNonCompliant,
                        ]}
                        onPress={() => setAuditAnswers({ ...auditAnswers, [idx]: false })}
                      >
                        <Text
                          style={[
                            styles.toggleBtnText,
                            !isCompliant && styles.toggleBtnTextActive,
                          ]}
                        >
                          Uygun Değil
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              <Text style={styles.inputLabel}>Denetim Notu / Açıklama:</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Örn: Sabunluk yenilenmeli, zemin paspası yenilendi..."
                placeholderTextColor="#64748b"
                value={auditNote}
                onChangeText={setAuditNote}
                multiline
                numberOfLines={2}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setAuditModalOpen(false);
                  setVerifiedAuditLocationToken(null);
                  setVerifiedAuditLocationName(null);
                }}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSubmitAudit}
                disabled={submittingAudit}
              >
                {submittingAudit ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Denetimi Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: PLANLANAN TEMİZLİK SAATLERİ */}
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
                    <Text style={styles.slotCardSub}>{cleaned ? 'Temizlendi ✓' : 'Planlandı'}</Text>
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

      {/* MODAL 3: MEVCUT TEMİZLİK SAATLERİ */}
      <Modal visible={currentCleaningsModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Mevcut Temizlik Saatleri</Text>
            <Text style={styles.modalSubheading}>{selectedLocation?.name}</Text>

            <ScrollView style={{ maxHeight: 300 }}>
              {!supStatus?.recentCleanings || supStatus.recentCleanings.length === 0 ? (
                <Text style={styles.emptyCleanText}>Bugün henüz tamamlanan temizlik yok.</Text>
              ) : (
                supStatus.recentCleanings.map((c, i) => (
                  <View key={i} style={styles.cleanRow}>
                    <View>
                      <Text style={styles.cleanStaff}>{c.staffName || 'Saha Personeli'}</Text>
                      <Text style={styles.cleanTime}>{formatTime(c.actualTime)}</Text>
                    </View>
                    <View
                      style={[
                        styles.cleanBadge,
                        c.slaStatus !== 'ON_TIME' && styles.cleanBadgeLate,
                      ]}
                    >
                      <Text
                        style={[
                          styles.cleanBadgeText,
                          c.slaStatus !== 'ON_TIME' && styles.cleanBadgeTextLate,
                        ]}
                      >
                        {c.slaStatus === 'ON_TIME' ? 'Zamanında ✓' : 'Gecikmeli'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.fullCloseBtn}
              onPress={() => setCurrentCleaningsModalOpen(false)}
            >
              <Text style={styles.fullCloseBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: ASSIGN STAFF TO INCIDENT */}
      <Modal visible={!!assigningIncident} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Personele Görev Ata</Text>
            <Text style={styles.modalSubheading}>
              {assigningIncident?.locationCode} - {assigningIncident?.issuesJson?.join(', ')}
            </Text>

            <Text style={styles.inputLabel}>Görevlendirilecek Saha Personeli:</Text>
            <View style={styles.staffSelectCol}>
              {(staffUsers.length > 0 ? staffUsers : DEFAULT_STAFF_USERS).map((u) => {
                const name = u.fullName || u.username;
                const isChosen = selectedStaffToAssign === name;
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.staffSelectPill, isChosen && styles.staffSelectPillActive]}
                    onPress={() => setSelectedStaffToAssign(name)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.staffSelectPillLeft}>
                      <View style={[styles.radioCircle, isChosen && styles.radioCircleActive]}>
                        {isChosen && <View style={styles.radioDot} />}
                      </View>
                      <View style={{ marginLeft: 10 }}>
                        <Text
                          style={[
                            styles.staffSelectPillText,
                            isChosen && styles.staffSelectPillTextActive,
                          ]}
                        >
                          👤 {name}
                        </Text>
                        <Text style={styles.staffSelectRoleText}>
                          Saha Görevlisi (@{u.username})
                        </Text>
                      </View>
                    </View>
                    {isChosen && (
                      <View style={styles.chosenBadge}>
                        <Text style={styles.chosenBadgeText}>✓ Seçildi</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setAssigningIncident(null)}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleAssignStaff}
                disabled={assigning}
              >
                {assigning ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Görevi İlet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: PHOTO PREVIEW */}
      <Modal visible={!!previewPhotoUrl} transparent animationType="fade">
        <View style={styles.photoOverlay}>
          <View style={styles.photoBox}>
            <Text style={styles.photoBoxTitle}>Personel Çözüm Kanıtı</Text>
            {previewPhotoUrl && (
              <Image source={{ uri: previewPhotoUrl }} style={styles.fullImage} />
            )}
            <TouchableOpacity
              style={styles.photoCloseBtn}
              onPress={() => setPreviewPhotoUrl(null)}
            >
              <Text style={styles.photoCloseBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal for Supervisor Audit Presence Verification */}
      <QrScannerModal
        open={qrScannerOpen}
        title="Şef Denetimi QR Doğrulaması"
        subtitle="Şefin denetim listesini açması için mahal kapısındaki QR kodu okutması zorunludur."
        expectedLocation={selectedLocation}
        locations={locations}
        onClose={() => setQrScannerOpen(false)}
        onScan={handleAuditQrScanned}
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
  roleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRole: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  counterBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  counterBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
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
  hubCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  hubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  hubTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f8fafc',
  },
  refreshBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#0f172a',
    borderRadius: 6,
  },
  refreshBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  chipsScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  chip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  chipActiveRed: {
    backgroundColor: '#b91c1c',
    borderColor: '#ef4444',
  },
  chipActiveYellow: {
    backgroundColor: '#b45309',
    borderColor: '#f59e0b',
  },
  chipActiveGreen: {
    backgroundColor: '#15803d',
    borderColor: '#22c55e',
  },
  chipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  locFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  filterPrompt: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  subLocChip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  subLocChipActive: {
    backgroundColor: '#334155',
  },
  subLocChipText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  subLocChipTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  hubEmpty: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  hubEmptyText: {
    color: '#64748b',
    fontSize: 12,
  },
  incItem: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  incItemOpen: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  incItemResolved: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  incItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  incBadgeArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  incLocationCode: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  incLocationName: {
    color: '#94a3b8',
    fontSize: 11,
  },
  incTime: {
    color: '#64748b',
    fontSize: 11,
  },
  incTypeTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  incTypeTagText: {
    color: '#f87171',
    fontSize: 9,
    fontWeight: '800',
  },
  incIssues: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  incFooter: {
    marginTop: 4,
  },
  assignActionBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  assignActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  assignedBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 8,
  },
  assignedText: {
    color: '#fbbf24',
    fontSize: 11,
  },
  bold: {
    fontWeight: '700',
    color: '#f8fafc',
  },
  reassignBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  reassignBtnText: {
    color: '#38bdf8',
    fontSize: 11,
  },
  resolvedInfoBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    padding: 8,
    borderRadius: 8,
    gap: 4,
  },
  resolvedText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
  },
  resolvedNote: {
    color: '#cbd5e1',
    fontSize: 11,
    fontStyle: 'italic',
  },
  photoThumbBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  photoThumbBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  wcSelectorCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  wcSelectorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  wcScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  wcPill: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  wcPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  wcPillCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  wcPillCodeActive: {
    color: '#ffffff',
  },
  wcPillName: {
    fontSize: 10,
    color: '#64748b',
  },
  wcPillNameActive: {
    color: '#e0f2fe',
  },
  currentWcInfo: {
    backgroundColor: '#0f172a',
    padding: 10,
    borderRadius: 10,
  },
  currentWcTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  currentWcSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  primaryActionsContainer: {
    gap: 12,
  },
  bigButtonAudit: {
    backgroundColor: '#0284c7',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  bigButtonSchedule: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  bigButtonCurrent: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  bigBtnIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  bigBtnIcon: {
    fontSize: 22,
  },
  bigBtnTexts: {
    flex: 1,
  },
  bigBtnTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  bigBtnDesc: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 2,
  },
  bigBtnArrow: {
    fontSize: 18,
    color: '#ffffff',
    marginLeft: 8,
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
  modalScroll: {
    maxHeight: 340,
  },
  auditItemRow: {
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  criterionText: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  toggleBtnCompliant: {
    backgroundColor: '#15803d',
    borderColor: '#22c55e',
  },
  toggleBtnNonCompliant: {
    backgroundColor: '#b91c1c',
    borderColor: '#ef4444',
  },
  toggleBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
    fontWeight: '800',
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
  cleanBadgeLate: {
    backgroundColor: '#78350f',
  },
  cleanBadgeText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  cleanBadgeTextLate: {
    color: '#fbbf24',
  },
  staffSelectCol: {
    gap: 8,
    marginBottom: 10,
  },
  staffSelectPill: {
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  staffSelectPillActive: {
    borderColor: '#0284c7',
    backgroundColor: 'rgba(2, 132, 199, 0.18)',
  },
  staffSelectPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#38bdf8',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#38bdf8',
  },
  staffSelectPillText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  staffSelectPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  staffSelectRoleText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  chosenBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chosenBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  photoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  photoBox: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  photoBoxTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  fullImage: {
    width: '100%',
    height: 280,
    borderRadius: 10,
    marginBottom: 16,
  },
  photoCloseBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  photoCloseBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  verifyCloseBtn: {
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  verifyCloseBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
});
