import React, { useEffect, useState } from 'react';
import { api, fetchActiveChecklistApi, Incident, Location } from '../../api';
import { SupervisorView } from '../../components/Views/SupervisorView';
import { SupervisorAuditModal } from '../../components/Modals/SupervisorAuditModal';
import { PlannerModal } from '../../components/Modals/PlannerModal';
import { StaffScheduleModal } from '../../components/Modals/StaffScheduleModal';
import { StaffPastModal } from '../../components/Modals/StaffPastModal';
import { useAuthStore } from '../../stores/authStore';
import { useIncidentsStore } from '../../stores/incidentsStore';
import { useLocationsStore } from '../../stores/locationsStore';
import { useUiStore } from '../../stores/uiStore';

const DEFAULT_CHECKLIST_ITEMS = [
  'Ayna ve lavabolar lekesiz',
  'Klozet ve pisuvarlar hijyenik',
  'Zemin kuru ve temiz',
  'Sabun / kağıt havlu dolu',
  'Koku durumu ferah',
  'Çöp kovası boş ve poşetli',
] as const;

interface SupervisorSectionProps {
  curLocation?: Location;
}

export const SupervisorSection: React.FC<SupervisorSectionProps> = ({ curLocation }) => {
  const token = useAuthStore((s) => s.token);
  const locations = useLocationsStore((s) => s.locations);
  const selectedId = useLocationsStore((s) => s.selectedId);
  const setSelectedId = useLocationsStore((s) => s.setSelectedId);
  const status = useLocationsStore((s) => s.status);
  const supervisorStatus = useLocationsStore((s) => s.supervisorStatus);
  const dashboard = useLocationsStore((s) => s.dashboard);
  const refreshSelectedLocation = useLocationsStore((s) => s.refreshSelectedLocation);
  const refreshDashboard = useLocationsStore((s) => s.refreshDashboard);
  const fetchLocations = useLocationsStore((s) => s.fetchLocations);

  const allIncidents = useIncidentsStore((s) => s.allIncidents);
  const staffUsers = useIncidentsStore((s) => s.staffUsers);
  const assigneeMap = useIncidentsStore((s) => s.assigneeMap);
  const setAssigneeMap = useIncidentsStore((s) => s.setAssigneeMap);
  const fetchIncidents = useIncidentsStore((s) => s.fetchIncidents);
  const fetchStaffUsers = useIncidentsStore((s) => s.fetchStaffUsers);
  const dispatchIncident = useIncidentsStore((s) => s.dispatchIncident);
  const verifyIncident = useIncidentsStore((s) => s.verifyIncident);

  const showNotice = useUiStore((s) => s.showNotice);
  const setNotice = useUiStore((s) => s.setNotice);
  const setPhotoPreviewUrl = useUiStore((s) => s.setPhotoPreviewUrl);

  // Filter states
  const [incidentFilterLoc, setIncidentFilterLoc] = useState('');
  const [incidentFilterStatus, setIncidentFilterStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // Modals state
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<string[]>([...DEFAULT_CHECKLIST_ITEMS]);
  const [checklistVersion, setChecklistVersion] = useState<string>('v1.2');
  const [checklistAnswers, setChecklistAnswers] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
  });
  const [auditNote, setAuditNote] = useState('');

  // Planner state
  const [workingSchedule, setWorkingSchedule] = useState<string[]>([]);
  const [workingTolerance, setWorkingTolerance] = useState(15);
  const [newTimeInput, setNewTimeInput] = useState('');

  useEffect(() => {
    if (token) {
      void fetchIncidents(token);
      void fetchStaffUsers(token);
    }
  }, [token, fetchIncidents, fetchStaffUsers]);

  // Load active checklist template
  useEffect(() => {
    void fetchActiveChecklistApi()
      .then((res) => {
        if (res?.items && res.items.length > 0) {
          const stringItems = res.items.map((it) => (typeof it === 'string' ? it : it.label));
          setChecklistItems(stringItems);
          const ver = res.versionTag || res.template?.version || 'v1.2';
          setChecklistVersion(ver);
          const initialMap: Record<number, boolean> = {};
          stringItems.forEach((_, idx) => {
            initialMap[idx] = true;
          });
          setChecklistAnswers(initialMap);
        }
      })
      .catch(() => {});
  }, []);

  const handleOpenPlanner = (loc?: Location) => {
    const target = loc || curLocation || locations[0];
    if (!target) return;
    setSelectedId(target.id);
    setWorkingSchedule([...(target.schedule || ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'])]);
    setWorkingTolerance(target.toleranceMinutes || 15);
    setPlannerOpen(true);
  };

  const handleSavePlanner = async () => {
    if (!token || !selectedId) return;
    try {
      setBusy(true);
      await api(`/locations/${selectedId}/schedule`, token, {
        method: 'PUT',
        body: JSON.stringify({
          schedule: workingSchedule,
          toleranceMinutes: workingTolerance,
        }),
      });
      showNotice('✓ Saat planı ve tolerans başarıyla kaydedildi!');
      setPlannerOpen(false);
      void refreshSelectedLocation(token);
      void fetchLocations();
    } catch (err: any) {
      showNotice(err.message || 'Plan kaydedilemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleDispatch = async (incidentId: string) => {
    if (!token) return;
    const defaultStaff = staffUsers.find((u) => u.role === 'employee');
    const assignedVal = assigneeMap[incidentId];
    const selectedUser =
      staffUsers.find(
        (u) =>
          u.id === assignedVal ||
          (u.fullName && u.fullName === assignedVal) ||
          u.username === assignedVal,
      ) || defaultStaff;

    const staffId = selectedUser?.id || undefined;
    const staffName = selectedUser?.fullName || selectedUser?.username || assignedVal || 'Ahmet Temizlik';

    try {
      setBusy(true);
      await dispatchIncident(incidentId, staffName, staffId, token);
      showNotice(`✓ Görev ${staffName} personeline başarıyla atandı!`);
      void refreshSelectedLocation(token);
      void refreshDashboard(token);
    } catch (err: any) {
      showNotice(err.message || 'Görev atanamadı.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyClose = async (incidentId: string) => {
    if (!token) return;
    try {
      setBusy(true);
      await verifyIncident(incidentId, token);
      showNotice('✓ Görev şef tarafından yerinde doğrulandı ve arşivlendi!');
      void refreshSelectedLocation(token);
      void refreshDashboard(token);
    } catch (err: any) {
      showNotice(err.message || 'Doğrulama yapılamadı.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleAuditSubmit = async (isApproved: boolean) => {
    if (!token || !selectedId) return;
    try {
      setBusy(true);
      const formattedChecklist = checklistItems.map((label, idx) => ({
        id: idx + 1,
        label,
        isOk: checklistAnswers[idx] ?? true,
      }));
      const failedItems = formattedChecklist.filter((c) => !c.isOk).map((c) => c.label);
      const effectiveIsApproved = isApproved && failedItems.length === 0;

      const res = await api<{ correctiveIncident?: Incident }>(
        `/locations/${selectedId}/audits`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            isApproved: effectiveIsApproved,
            checklist: formattedChecklist,
            note: auditNote,
            templateVersion: checklistVersion,
          }),
        },
      );

      if (!effectiveIsApproved) {
        const issuesSummary = failedItems.length > 0 ? failedItems.join(', ') : 'Denetim Uygunsuzluğu';
        showNotice(
          `⚠️ Uygunsuzluk kaydedildi! Tespit edilen maddeler (${issuesSummary}) personele otomatik iletildi (${res.correctiveIncident?.id || 'Aktif Görev'})!`,
          true,
        );
      } else {
        showNotice('✓ Denetim eksiksiz olarak onaylandı!');
      }

      setAuditNote('');
      setAuditModalOpen(false);
      void refreshSelectedLocation(token);
      void refreshDashboard(token);
      void fetchIncidents(token);
    } catch (err: any) {
      showNotice(err.message || 'Denetim gönderilemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SupervisorView
        locations={locations}
        curLocation={curLocation}
        allIncidents={allIncidents}
        dashboard={dashboard}
        supervisorStatus={supervisorStatus}
        staffList={staffUsers}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        incidentFilterLoc={incidentFilterLoc}
        setIncidentFilterLoc={setIncidentFilterLoc}
        incidentFilterStatus={incidentFilterStatus}
        setIncidentFilterStatus={setIncidentFilterStatus}
        assigneeMap={assigneeMap}
        setAssigneeMap={setAssigneeMap}
        onSetNotice={setNotice}
        onViewPhoto={(url) => setPhotoPreviewUrl(url)}
        onDispatch={handleDispatch}
        onVerifyClose={handleVerifyClose}
        onLoadIncidents={async () => {
          await fetchIncidents(token);
        }}
        onOpenAuditModal={() => setAuditModalOpen(true)}
        onOpenScheduleModal={() => setScheduleOpen(true)}
        onOpenPastModal={() => setPastOpen(true)}
        onOpenPlannerModal={() => handleOpenPlanner(curLocation)}
      />

      {/* Şef Kalite Denetim Modalı */}
      <SupervisorAuditModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        curLocation={curLocation}
        items={checklistItems}
        checklistAnswers={checklistAnswers}
        setChecklistAnswers={setChecklistAnswers}
        auditNote={auditNote}
        setAuditNote={setAuditNote}
        busy={busy}
        onSubmit={handleAuditSubmit}
      />

      {/* Şef Planlayıcı Modalı */}
      <PlannerModal
        isOpen={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        curLocation={curLocation}
        workingTolerance={workingTolerance}
        setWorkingTolerance={setWorkingTolerance}
        workingSchedule={workingSchedule}
        setWorkingSchedule={setWorkingSchedule}
        newTimeInput={newTimeInput}
        setNewTimeInput={setNewTimeInput}
        onSave={handleSavePlanner}
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
