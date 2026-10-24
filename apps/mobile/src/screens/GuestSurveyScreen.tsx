import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchLocationsApi, fetchPublicStatusApi, formatTime, getApiBaseUrl, showAlert, submitSurveyApi } from '../api';
import { Location, PublicLocationStatus } from '../types';

const ROOT_CAUSES = [
  { id: 'soap', label: '🧼 Sıvı Sabun Bitti' },
  { id: 'paper', label: '🧻 Tuvalet Kağıdı Yok' },
  { id: 'floor', label: '💧 Zemin Islak / Kirli' },
  { id: 'odor', label: '👃 Kötü Koku Var' },
  { id: 'trash', label: '🗑️ Çöp Kovası Dolu' },
  { id: 'toilet', label: '🚽 Klozet / Pisuvar Kirli' },
  { id: 'sink', label: '🪞 Ayna / Lavabo Lekeli' },
  { id: 'hardware', label: '🔧 Musluk / Ekipman Arızalı' },
];

interface Props {
  onBackToRoles?: () => void;
}

export function GuestSurveyScreen({ onBackToRoles }: Props) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [publicStatus, setPublicStatus] = useState<PublicLocationStatus | null>(null);

  // Survey state
  const [rating, setRating] = useState<'good' | 'fair' | 'bad' | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    try {
      setLoading(true);
      const locs = await fetchLocationsApi();
      setLocations(locs);
      if (locs.length > 0 && !selectedLocation) {
        let initialLoc = locs[0];
        if (typeof window !== 'undefined' && window.location) {
          const params = new URLSearchParams(window.location.search);
          const qToken =
            params.get('q') ||
            (window.location.pathname.startsWith('/q/')
              ? window.location.pathname.split('/q/')[1]?.split('?')[0]
              : null);
          const wcId = params.get('wc');
          if (qToken) {
            const matched = locs.find((l) => l.token === qToken);
            if (matched) initialLoc = matched;
          } else if (wcId) {
            const matched = locs.find((l) => l.id === wcId);
            if (matched) initialLoc = matched;
          }
        }
        setSelectedLocation(initialLoc);
      }
    } catch (err: any) {
      showAlert('Bağlantı Hatası', err?.message || 'Lokasyonlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPublicStatus(loc: Location) {
    try {
      const data = await fetchPublicStatusApi(loc.id);
      setPublicStatus(data);
      setStatusModalOpen(true);
    } catch (err: any) {
      showAlert('Hata', err?.message || 'Durum bilgisi alınamadı.');
    }
  }

  function toggleIssue(id: string) {
    if (selectedIssues.includes(id)) {
      setSelectedIssues(selectedIssues.filter((i) => i !== id));
    } else {
      setSelectedIssues([...selectedIssues, id]);
    }
  }

  async function handleSubmit() {
    if (!selectedLocation) {
      showAlert('Uyarı', 'Lütfen önce yukarıdan bir lavabo seçiniz.');
      return;
    }
    if (!rating) {
      showAlert('Uyarı', 'Lütfen memnuniyet durumunuzu seçiniz.');
      return;
    }
    if ((rating === 'bad' || rating === 'fair') && selectedIssues.length === 0 && !note.trim()) {
      showAlert('Bilgi', 'Hızlı müdahale edebilmemiz için lütfen en az bir sebep seçiniz.');
      return;
    }

    try {
      setSubmitting(true);
      const issueLabels = selectedIssues.map(
        (id) => ROOT_CAUSES.find((rc) => rc.id === id)?.label || id,
      );

      await submitSurveyApi({
        locationId: selectedLocation.id,
        rating,
        issues: issueLabels,
        note: note.trim() || undefined,
      });

      setSubmitted(true);
      setTimeout(() => {
        resetForm();
      }, 4000);
    } catch (err: any) {
      showAlert('Gönderim Hatası', err?.message || 'Anket iletilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setRating(null);
    setSelectedIssues([]);
    setNote('');
    setSubmitted(false);
  }

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Ziyaretçi Memnuniyet Anketi</Text>
          <Text style={styles.headerSubtitle}>Akıllı Hijyen & Geri Bildirim Terminali</Text>
        </View>
        {onBackToRoles && (
          <TouchableOpacity style={styles.roleSwitchBtn} onPress={onBackToRoles}>
            <Text style={styles.roleSwitchBtnText}>Menü</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Error retry banner if locations empty */}
        {locations.length === 0 && !loading && (
          <View style={{ backgroundColor: '#1e293b', padding: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#ef4444', alignItems: 'center' }}>
            <Text style={{ color: '#f87171', fontSize: 13, fontWeight: '700', marginBottom: 4 }}>
              Lavabo listesi alınamadı
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
              Sunucu adresi: {getApiBaseUrl()}
            </Text>
            <TouchableOpacity
              onPress={loadLocations}
              style={{ backgroundColor: '#0284c7', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 12 }}>Tekrar Bağlan ↻</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Location selector pills */}
        <View style={styles.locSection}>
          <Text style={styles.sectionLabel}>LAVABO / ALAN SEÇİMİ:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locScroll}>
            {locations.map((loc) => {
              const isSelected = selectedLocation?.id === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.locChip, isSelected && styles.locChipActive]}
                  onPress={() => {
                    setSelectedLocation(loc);
                    resetForm();
                  }}
                >
                  <Text style={[styles.locChipCode, isSelected && styles.locChipCodeActive]}>
                    {loc.code}
                  </Text>
                  <Text style={[styles.locChipName, isSelected && styles.locChipNameActive]}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {submitted ? (
          /* Confirmation Screen */
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>Teşekkür Ederiz!</Text>
            <Text style={styles.successMessage}>
              Geri bildiriminiz ilgili yöneticiye iletilmiştir.
            </Text>
            <Text style={styles.successSub}>
              Hijyen standartlarımızı korumamıza yardımcı olduğunuz için teşekkür ederiz.
            </Text>
            <TouchableOpacity style={styles.newSurveyBtn} onPress={resetForm}>
              <Text style={styles.newSurveyBtnText}>Yeni Değerlendirme</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Survey Form */
          <View style={styles.formCard}>
            <Text style={styles.questionText}>
              Bu lavabonun genel hijyen durumunu nasıl buldunuz?
            </Text>

            {/* Big Emoji Options */}
            <View style={styles.ratingRow}>
              <TouchableOpacity
                style={[styles.emojiBtn, rating === 'good' && styles.emojiBtnGood]}
                onPress={() => {
                  setRating('good');
                  setSelectedIssues([]);
                }}
              >
                <Text style={styles.emojiIcon}>😃</Text>
                <Text style={[styles.emojiLabel, rating === 'good' && styles.emojiLabelActive]}>
                  Temiz & İyi
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.emojiBtn, rating === 'fair' && styles.emojiBtnFair]}
                onPress={() => setRating('fair')}
              >
                <Text style={styles.emojiIcon}>😐</Text>
                <Text style={[styles.emojiLabel, rating === 'fair' && styles.emojiLabelActive]}>
                  Orta
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.emojiBtn, rating === 'bad' && styles.emojiBtnBad]}
                onPress={() => setRating('bad')}
              >
                <Text style={styles.emojiIcon}>😞</Text>
                <Text style={[styles.emojiLabel, rating === 'bad' && styles.emojiLabelActive]}>
                  Kirli / Kötü
                </Text>
              </TouchableOpacity>
            </View>

            {/* Root Causes Section if Fair or Bad */}
            {(rating === 'bad' || rating === 'fair') && (
              <View style={styles.issuesContainer}>
                <Text style={styles.issuesHeader}>
                  ⚠️ Hızlı müdahale edebilmemiz için sorunu seçiniz:
                </Text>
                <View style={styles.issuesGrid}>
                  {ROOT_CAUSES.map((cause) => {
                    const isChecked = selectedIssues.includes(cause.id);
                    return (
                      <TouchableOpacity
                        key={cause.id}
                        style={[styles.issueChip, isChecked && styles.issueChipActive]}
                        onPress={() => toggleIssue(cause.id)}
                      >
                        <Text style={[styles.issueText, isChecked && styles.issueTextActive]}>
                          {cause.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.noteInput}
                  placeholder="Eklemek istediğiniz bir detay var mı? (İsteğe bağlı)"
                  placeholderTextColor="#94a3b8"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  numberOfLines={2}
                />
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                !rating && styles.submitBtnDisabled,
                rating === 'good' && styles.submitBtnGood,
                rating === 'bad' && styles.submitBtnBadBg,
              ]}
              disabled={!rating || submitting}
              onPress={handleSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {rating === 'bad'
                    ? '🚨 Bildirimi Şefe İlet'
                    : 'Geri Bildirimi Gönder'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Info / Status Button */}
            {selectedLocation && (
              <TouchableOpacity
                style={styles.statusLinkBtn}
                onPress={() => loadPublicStatus(selectedLocation)}
              >
                <Text style={styles.statusLinkText}>
                  🕒 Bu Alanın Son Temizlik & Vardiya Saatlerini Gör
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Public Status Modal */}
      <Modal visible={statusModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {selectedLocation?.name} ({selectedLocation?.code})
            </Text>
            <Text style={styles.modalSub}>Genel Temizlik Bilgileri</Text>

            <View style={styles.modalInfoCard}>
              <Text style={styles.modalInfoLabel}>Son Temizlik:</Text>
              <Text style={styles.modalInfoVal}>
                {publicStatus?.lastCleaningTime
                  ? formatTime(publicStatus.lastCleaningTime)
                  : 'Bugün henüz kayıt yok'}
              </Text>
            </View>

            <Text style={styles.modalPlanTitle}>Planlanan Günlük Saatler:</Text>
            <View style={styles.slotsRow}>
              {publicStatus?.location.schedule.map((slot) => {
                const isCleaned = publicStatus?.todayCleanings?.some(
                  (c) => c.targetSlot === slot,
                );
                return (
                  <View
                    key={slot}
                    style={[styles.slotBadge, isCleaned && styles.slotBadgeDone]}
                  >
                    <Text style={[styles.slotText, isCleaned && styles.slotTextDone]}>
                      {slot} {isCleaned ? '✓' : ''}
                    </Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setStatusModalOpen(false)}
            >
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  roleSwitchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  roleSwitchBtnText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  locSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  locScroll: {
    flexDirection: 'row',
  },
  locChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  locChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  locChipCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  locChipCodeActive: {
    color: '#ffffff',
  },
  locChipName: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  locChipNameActive: {
    color: '#e0f2fe',
  },
  formCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  emojiBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 6,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: '#334155',
  },
  emojiBtnGood: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  emojiBtnFair: {
    borderColor: '#eab308',
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
  },
  emojiBtnBad: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  emojiIcon: {
    fontSize: 38,
    marginBottom: 8,
  },
  emojiLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
  },
  emojiLabelActive: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  issuesContainer: {
    marginTop: 6,
    marginBottom: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  issuesHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f87171',
    marginBottom: 12,
  },
  issuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  issueChip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  issueChipActive: {
    backgroundColor: '#b91c1c',
    borderColor: '#ef4444',
  },
  issueText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '500',
  },
  issueTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  noteInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    color: '#f8fafc',
    fontSize: 13,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  submitBtnGood: {
    backgroundColor: '#16a34a',
  },
  submitBtnBadBg: {
    backgroundColor: '#dc2626',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  statusLinkBtn: {
    marginTop: 18,
    alignItems: 'center',
  },
  statusLinkText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  successCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#16a34a',
    marginTop: 20,
  },
  successIcon: {
    fontSize: 56,
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4ade80',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 22,
  },
  successSub: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  newSurveyBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
  },
  newSurveyBtnText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  modalSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 16,
  },
  modalInfoCard: {
    backgroundColor: '#0f172a',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalInfoLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  modalInfoVal: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '700',
  },
  modalPlanTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  slotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  slotBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  slotBadgeDone: {
    backgroundColor: '#064e3b',
    borderColor: '#059669',
  },
  slotText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  slotTextDone: {
    color: '#34d399',
  },
  modalCloseBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
});
