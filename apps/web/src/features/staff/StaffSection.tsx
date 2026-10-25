import React, { useState } from 'react';
import { api, Location } from '../../api';
import { StaffView } from '../../components/Views/StaffView';
import { StaffChecklistModal } from '../../components/Modals/StaffChecklistModal';
import { StaffScheduleModal } from '../../components/Modals/StaffScheduleModal';
import { StaffPastModal } from '../../components/Modals/StaffPastModal';
import { useAuthStore } from '../../stores/authStore';
import { useIncidentsStore } from '../../stores/incidentsStore';
import { useLocationsStore } from '../../stores/locationsStore';
import { useUiStore } from '../../stores/uiStore';

interface StaffSectionProps {
  curLocation?: Location;
  currentTime: string;
}

export const StaffSection: React.FC<StaffSectionProps> = ({
  curLocation,
  currentTime,
}) => {
  const token = useAuthStore((s) => s.token);
  const selectedId = useLocationsStore((s) => s.selectedId);
  const status = useLocationsStore((s) => s.status);
  const supervisorStatus = useLocationsStore((s) => s.supervisorStatus);
  const dashboard = useLocationsStore((s) => s.dashboard);
  const refreshSelectedLocation = useLocationsStore((s) => s.refreshSelectedLocation);
  const refreshDashboard = useLocationsStore((s) => s.refreshDashboard);

  const allIncidents = useIncidentsStore((s) => s.allIncidents);
  const fetchIncidents = useIncidentsStore((s) => s.fetchIncidents);

  const showNotice = useUiStore((s) => s.showNotice);
  const setPhotoPreviewUrl = useUiStore((s) => s.setPhotoPreviewUrl);

  // Local state for modals and forms
  const [task1, setTask1] = useState(true);
  const [task2, setTask2] = useState(true);
  const [task3, setTask3] = useState(true);
  const [task4, setTask4] = useState(true);
  const [staffNote, setStaffNote] = useState('');
  const [staffResolveNote, setStaffResolveNote] = useState('');
  const [staffPhotoBase64, setStaffPhotoBase64] = useState('');
  const [busy, setBusy] = useState(false);

  const [checklistOpen, setChecklistOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setStaffPhotoBase64(dataUrl);
      };
      img.src = readerEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCleaningSubmit = async () => {
    if (!selectedId) return;
    try {
      setBusy(true);
      const res = await api<{ sla: { label: string } }>(
        `/locations/${selectedId}/cleanings`,
        token || undefined,
        {
          method: 'POST',
          body: JSON.stringify({
            tasksConfirmed: task1 && task2 && task3 && task4,
            note: staffNote,
          }),
        },
      );
      showNotice(`✓ Temizlik beyanı başarıyla kaydedildi! SLA: ${res.sla?.label || 'Uygun'}`);
      setStaffNote('');
      setChecklistOpen(false);
      void refreshSelectedLocation(token);
      void refreshDashboard(token);
    } catch (err: any) {
      showNotice(err.message || 'Temizlik beyanı kaydedilemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleStaffResolve = async (incidentId: string) => {
    try {
      setBusy(true);
      await api(`/incidents/${incidentId}/staff-resolve`, token || undefined, {
        method: 'POST',
        body: JSON.stringify({
          note: staffResolveNote.trim() || staffNote.trim() || 'Sorun giderildi, sarf ikmali tamamlandı.',
          photoUrl: staffPhotoBase64 || undefined,
        }),
      });
      showNotice('📸 Müdahale fotoğraflı olarak tamamlandı ve Şef onayına gönderildi!');
      setStaffPhotoBase64('');
      setStaffResolveNote('');
      void fetchIncidents(token);
      void refreshSelectedLocation(token);
      void refreshDashboard(token);
    } catch (err: any) {
      showNotice(err.message || 'Görev kapatılamadı.', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <StaffView
        curLocation={curLocation}
        currentTime={currentTime}
        allIncidents={allIncidents}
        dashboard={dashboard}
        supervisorStatus={supervisorStatus}
        selectedId={selectedId}
        staffPhotoBase64={staffPhotoBase64}
        setStaffPhotoBase64={setStaffPhotoBase64}
        staffResolveNote={staffResolveNote}
        setStaffResolveNote={setStaffResolveNote}
        busy={busy}
        onPhotoSelect={handlePhotoSelect}
        onViewPhoto={(url) => setPhotoPreviewUrl(url)}
        onStaffResolve={handleStaffResolve}
        onLoadIncidents={async () => {
          await fetchIncidents(token);
        }}
        onOpenChecklistModal={() => setChecklistOpen(true)}
        onOpenScheduleModal={() => setScheduleOpen(true)}
        onOpenPastModal={() => setPastOpen(true)}
      />

      {/* Personel Rutin Temizlik Checklist Modalı */}
      <StaffChecklistModal
        isOpen={checklistOpen}
        onClose={() => setChecklistOpen(false)}
        curLocation={curLocation}
        task1={task1}
        setTask1={setTask1}
        task2={task2}
        setTask2={setTask2}
        task3={task3}
        setTask3={setTask3}
        task4={task4}
        setTask4={setTask4}
        staffNote={staffNote}
        setStaffNote={setStaffNote}
        busy={busy}
        onSubmit={handleCleaningSubmit}
      />

      {/* Günlük Temizlik Saatleri */}
      <StaffScheduleModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        curLocation={curLocation}
        status={status}
      />

      {/* Geçmiş Temizlik Kayıtları Modalı */}
      <StaffPastModal
        isOpen={pastOpen}
        onClose={() => setPastOpen(false)}
        curLocation={curLocation}
        supervisorStatus={supervisorStatus}
      />
    </>
  );
};
