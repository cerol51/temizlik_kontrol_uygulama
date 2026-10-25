import React, { useEffect, useState } from 'react';
import {
  api,
  AppUser,
  createUserApi,
  deleteUserApi,
  downloadAuditCsvApi,
  fetchUsersApi,
  Location,
} from '../../api';
import { AdminHeader } from '../../components/Admin/AdminHeader';
import { AdminOverview } from '../../components/Admin/AdminOverview';
import { LocationManagement } from '../../components/Admin/LocationManagement';
import { UserManagement } from '../../components/Admin/UserManagement';
import { RoleMatrixTable } from '../../components/Admin/RoleMatrixTable';
import { AuditTrailTable } from '../../components/Admin/AuditTrailTable';
import { CreateLocationModal } from '../../components/Modals/CreateLocationModal';
import { CreateUserModal } from '../../components/Modals/CreateUserModal';
import { QrModal } from '../../components/Modals/QrModal';
import { PlannerModal } from '../../components/Modals/PlannerModal';
import { useAuthStore } from '../../stores/authStore';
import { useLocationsStore } from '../../stores/locationsStore';
import { useUiStore } from '../../stores/uiStore';

export const AdminSection: React.FC = () => {
  const currentUser = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const locations = useLocationsStore((s) => s.locations);
  const selectedId = useLocationsStore((s) => s.selectedId);
  const setSelectedId = useLocationsStore((s) => s.setSelectedId);
  const dashboard = useLocationsStore((s) => s.dashboard);
  const fetchLocations = useLocationsStore((s) => s.fetchLocations);
  const refreshDashboard = useLocationsStore((s) => s.refreshDashboard);
  const createLocation = useLocationsStore((s) => s.createLocation);
  const deleteLocation = useLocationsStore((s) => s.deleteLocation);
  const regenerateToken = useLocationsStore((s) => s.regenerateToken);

  const showNotice = useUiStore((s) => s.showNotice);

  const [adminSubTab, setAdminSubTab] = useState<'overview' | 'locations' | 'users' | 'matrix' | 'audit'>('overview');
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [busy, setBusy] = useState(false);

  // Modals
  const [createLocOpen, setCreateLocOpen] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [qrModalLoc, setQrModalLoc] = useState<Location | null>(null);

  // Planner modal
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerLoc, setPlannerLoc] = useState<Location | null>(null);
  const [workingSchedule, setWorkingSchedule] = useState<string[]>([]);
  const [workingTolerance, setWorkingTolerance] = useState(15);
  const [newTimeInput, setNewTimeInput] = useState('');

  const loadUsers = async () => {
    if (!token) return;
    try {
      const list = await fetchUsersApi(token);
      setUsersList(list || []);
    } catch (err: any) {
      console.warn('Kullanıcı listesi alınamadı:', err?.message);
    }
  };

  useEffect(() => {
    if (token) {
      void loadUsers();
      void refreshDashboard(token);
    }
  }, [token]);

  const handleDownloadCsv = async () => {
    if (!token) return;
    try {
      setBusy(true);
      await downloadAuditCsvApi(token);
      showNotice('✓ Denetim izi CSV raporu başarıyla indirildi.');
    } catch (err: any) {
      showNotice(err.message || 'Rapor indirilemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUserSubmit = async (userData: {
    fullName: string;
    username: string;
    password: string;
    role: 'employee' | 'supervisor' | 'admin';
  }) => {
    if (!token) return;
    try {
      setBusy(true);
      const created = await createUserApi(userData, token);
      showNotice(`✓ Yeni kullanıcı (${created.fullName}) başarıyla sisteme eklendi!`);
      setCreateUserOpen(false);
      void loadUsers();
    } catch (err: any) {
      showNotice(err.message || 'Kullanıcı eklenemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async (userToDelete: AppUser) => {
    if (!token) return;
    if (currentUser?.id === userToDelete.id) {
      alert('Şu anda oturumu açık olan kendi hesabınızı silemezsiniz.');
      return;
    }
    if (!window.confirm(`"${userToDelete.fullName}" (@${userToDelete.username}) kullanıcısını silmek istediğinize emin misiniz?`)) {
      return;
    }
    try {
      setBusy(true);
      await deleteUserApi(userToDelete.id, token);
      showNotice(`✓ "${userToDelete.fullName}" kullanıcısı başarıyla silindi.`);
      void loadUsers();
    } catch (err: any) {
      showNotice(err.message || 'Kullanıcı silinemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateLocationSubmit = async (locData: {
    name: string;
    code?: string;
    building?: string;
    toleranceMinutes?: number;
    schedule?: string[];
    schedulePreset?: string;
    currentSupervisorName?: string;
    backupSupervisorName?: string;
  }) => {
    if (!token) return;
    let schedule =
      locData.schedule && locData.schedule.length > 0
        ? locData.schedule
        : ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
    if (!locData.schedule && locData.schedulePreset === '1hour') {
      schedule = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    } else if (!locData.schedule && locData.schedulePreset === '3shift') {
      schedule = ['09:00', '14:00', '19:00'];
    }

    try {
      setBusy(true);
      const created = await createLocation(
        {
          name: locData.name,
          code: locData.code || '',
          building: locData.building || '',
          toleranceMinutes: locData.toleranceMinutes || 15,
          schedule,
          currentSupervisorName: locData.currentSupervisorName,
          backupSupervisorName: locData.backupSupervisorName,
        },
        token,
      );

      showNotice(`✓ Yeni WC mahali (${created.name}) başarıyla oluşturuldu!`);
      setCreateLocOpen(false);
      setQrModalLoc(created);
      void refreshDashboard(token);
    } catch (err: any) {
      showNotice(err.message || 'Mahal oluşturulamadı.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLocation = async (loc: Location) => {
    if (!token) return;
    if (!window.confirm(`"${loc.name || 'Bu mahali'}" sistemden silmek istediğinize emin misiniz?`)) {
      return;
    }
    try {
      setBusy(true);
      await deleteLocation(loc.id, token);
      showNotice(`✓ Mahal silindi.`);
      void refreshDashboard(token);
    } catch (err: any) {
      showNotice(err.message || 'Mahal silinemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateToken = async (loc: Location) => {
    if (!token) return;
    if (!window.confirm(`"${loc.name}" için mevcut QR tokenı iptal edilsin ve yeni bir güvenli token oluşturulsun mu?\n\nDikkat: Sahada asılı olan eski QR etiketi geçersiz olacaktır!`)) {
      return;
    }
    try {
      setBusy(true);
      const updated = await regenerateToken(loc.id, token);
      showNotice(`✓ "${loc.name}" için yeni QR tokenı üretildi.`);
      setQrModalLoc(updated);
    } catch (err: any) {
      showNotice(err.message || 'Token yenilenemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenPlanner = (loc: Location) => {
    setPlannerLoc(loc);
    setSelectedId(loc.id);
    setWorkingSchedule([...(loc.schedule || ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'])]);
    setWorkingTolerance(loc.toleranceMinutes || 15);
    setPlannerOpen(true);
  };

  const handleSavePlanner = async () => {
    if (!token || !plannerLoc) return;
    try {
      setBusy(true);
      await api(`/locations/${plannerLoc.id}/schedule`, token, {
        method: 'PUT',
        body: JSON.stringify({
          schedule: workingSchedule,
          toleranceMinutes: workingTolerance,
        }),
      });
      showNotice('✓ Saat planı ve tolerans başarıyla kaydedildi!');
      setPlannerOpen(false);
      void fetchLocations();
      void refreshDashboard(token);
    } catch (err: any) {
      showNotice(err.message || 'Plan kaydedilemedi.', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-5xl space-y-4">
      <AdminHeader
        currentUser={currentUser}
        adminSubTab={adminSubTab}
        setAdminSubTab={setAdminSubTab}
        onOpenCreateLocation={() => setCreateLocOpen(true)}
        onOpenCreateUser={() => setCreateUserOpen(true)}
        onDownloadCsv={handleDownloadCsv}
      />

      {adminSubTab === 'overview' && (
        <AdminOverview
          locations={locations}
          usersList={usersList}
          dashboard={dashboard}
        />
      )}

      {adminSubTab === 'locations' && (
        <LocationManagement
          locations={locations}
          busy={busy}
          onOpenCreateLocation={() => setCreateLocOpen(true)}
          onOpenSticker={(loc) => setQrModalLoc(loc)}
          onOpenPlanner={(loc) => handleOpenPlanner(loc)}
          onRegenerateToken={handleRegenerateToken}
          onDeleteLocation={handleDeleteLocation}
        />
      )}

      {adminSubTab === 'users' && (
        <UserManagement
          usersList={usersList}
          currentUser={currentUser}
          busy={busy}
          onOpenCreateUser={() => setCreateUserOpen(true)}
          onDeleteUser={handleDeleteUser}
        />
      )}

      {adminSubTab === 'matrix' && (
        <RoleMatrixTable dashboard={dashboard} />
      )}

      {adminSubTab === 'audit' && (
        <AuditTrailTable
          dashboard={dashboard}
          onDownloadCsv={handleDownloadCsv}
        />
      )}

      {/* Admin Modalları */}
      <CreateLocationModal
        open={createLocOpen}
        onClose={() => setCreateLocOpen(false)}
        onSubmit={handleCreateLocationSubmit}
        busy={busy}
      />

      <CreateUserModal
        isOpen={createUserOpen}
        onClose={() => setCreateUserOpen(false)}
        onSubmit={handleCreateUserSubmit}
        busy={busy}
      />

      <QrModal
        open={Boolean(qrModalLoc)}
        onClose={() => setQrModalLoc(null)}
        location={qrModalLoc}
      />

      <PlannerModal
        isOpen={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        curLocation={plannerLoc || undefined}
        workingTolerance={workingTolerance}
        setWorkingTolerance={setWorkingTolerance}
        workingSchedule={workingSchedule}
        setWorkingSchedule={setWorkingSchedule}
        newTimeInput={newTimeInput}
        setNewTimeInput={setNewTimeInput}
        onSave={handleSavePlanner}
      />
    </div>
  );
};
