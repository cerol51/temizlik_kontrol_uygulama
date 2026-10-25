import React, { useState } from 'react';
import { api, Location, PublicLocationStatus } from '../../api';
import { GuestView } from '../../components/Views/GuestView';
import { StaffScheduleModal } from '../../components/Modals/StaffScheduleModal';
import { useUiStore } from '../../stores/uiStore';

export const ROOT_CAUSES = [
  { id: 'soap', label: '🧼 Sıvı Sabun Bitti', short: 'Sabun Yok' },
  { id: 'paper', label: '🧻 Tuvalet Kağıdı Yok', short: 'Kağıt Yok' },
  { id: 'floor', label: '💧 Zemin Islak / Kirli', short: 'Zemin Islak' },
  { id: 'odor', label: '👃 Kötü Koku Var', short: 'Kötü Koku' },
  { id: 'trash', label: '🗑️ Çöp Kovası Dolu', short: 'Çöp Dolu' },
  { id: 'toilet', label: '🚽 Klozet / Pisuvar Kirli', short: 'Klozet Kirli' },
  { id: 'sink', label: '🪞 Ayna / Lavabo Lekeli', short: 'Lavabo Kirli' },
  { id: 'hardware', label: '🔧 Musluk / Ekipman Arızalı', short: 'Arıza Var' },
] as const;

interface GuestSectionProps {
  curLocation?: Location;
  status: PublicLocationStatus | null;
  busy?: boolean;
}

export const GuestSection: React.FC<GuestSectionProps> = ({
  curLocation,
  status,
  busy = false,
}) => {
  const [selectedRating, setSelectedRating] = useState<'good' | 'fair' | 'bad' | ''>('');
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [surveySent, setSurveySent] = useState(false);
  const [guestScheduleOpen, setGuestScheduleOpen] = useState(false);
  const [previewGuestMode, setPreviewGuestMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const showNotice = useUiStore((s) => s.showNotice);
  const setAuthModalOpen = useUiStore((s) => s.setAuthModalOpen);

  const isDirectQrVisit = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/q/') ||
    window.location.search.includes('q=') ||
    window.location.search.includes('wc=')
  );

  const handleRatingClick = async (rating: 'good' | 'fair' | 'bad') => {
    if (!curLocation) return;
    setSelectedRating(rating);
    if (rating === 'good') {
      try {
        setSubmitting(true);
        await api(`/locations/${curLocation.id}/feedback`, undefined, {
          method: 'POST',
          body: JSON.stringify({ rating: 'good' }),
        });
        setSurveySent(true);
        showNotice('Geri bildiriminiz için teşekkür ederiz! İyi günler dileriz.');
      } catch (err: any) {
        showNotice(err.message || 'Geri bildirim kaydedilemedi.', true);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleNegativeFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!curLocation) return;
    if (selectedIssues.length === 0) {
      showNotice('Lütfen en az bir olumsuzluk nedeni seçiniz.', true);
      return;
    }
    try {
      setSubmitting(true);
      await api(`/locations/${curLocation.id}/feedback`, undefined, {
        method: 'POST',
        body: JSON.stringify({
          rating: selectedRating || 'bad',
          issues: selectedIssues,
        }),
      });
      setSurveySent(true);
      showNotice('Bildiriminiz nöbetçi personele iletildi. En kısa sürede müdahale edilecektir.');
    } catch (err: any) {
      showNotice(err.message || 'Bildirim kaydedilemedi.', true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <GuestView
        isDirectQrVisit={isDirectQrVisit}
        previewGuestMode={previewGuestMode}
        setPreviewGuestMode={setPreviewGuestMode}
        curLocation={curLocation}
        status={status}
        busy={busy || submitting}
        selectedRating={selectedRating}
        selectedIssues={selectedIssues}
        setSelectedIssues={setSelectedIssues}
        surveySent={surveySent}
        rootCauses={ROOT_CAUSES}
        onQuickAdminLogin={() => setAuthModalOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onOpenGuestSchedule={() => setGuestScheduleOpen(true)}
        onRatingClick={handleRatingClick}
        onNegativeFeedbackSubmit={handleNegativeFeedbackSubmit}
      />

      <StaffScheduleModal
        isOpen={guestScheduleOpen}
        onClose={() => setGuestScheduleOpen(false)}
        curLocation={curLocation}
        status={status}
      />
    </>
  );
};
