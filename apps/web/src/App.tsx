import Keycloak from 'keycloak-js';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { QRCodeSVG } from 'qrcode.react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  AppUser,
  createLocation,
  createUserApi,
  DashboardData,
  deleteLocation,
  deleteUserApi,
  fetchUsersApi,
  formatTime,
  Incident,
  Location,
  loginApi,
  PublicLocationStatus,
  regenerateLocationToken,
  registerApi,
  SupervisorLocationStatus,
} from './api';

const CHECKLIST_ITEMS_V12 = [
  'Ayna ve lavabolar lekesiz',
  'Klozet ve pisuvarlar hijyenik',
  'Zemin kuru ve temiz',
  'Sabun / kağıt havlu dolu',
  'Koku durumu ferah',
  'Çöp kovası boş ve poşetli',
] as const;

const ROOT_CAUSES = [
  { id: 'soap', label: '🧼 Sıvı Sabun Bitti', short: 'Sabun Yok' },
  { id: 'paper', label: '🧻 Tuvalet Kağıdı Yok', short: 'Kağıt Yok' },
  { id: 'floor', label: '💧 Zemin Islak / Kirli', short: 'Zemin Islak' },
  { id: 'odor', label: '👃 Kötü Koku Var', short: 'Kötü Koku' },
  { id: 'trash', label: '🗑️ Çöp Kovası Dolu', short: 'Çöp Dolu' },
  { id: 'toilet', label: '🚽 Klozet / Pisuvar Kirli', short: 'Klozet Kirli' },
  { id: 'sink', label: '🪞 Ayna / Lavabo Lekeli', short: 'Lavabo Kirli' },
  { id: 'hardware', label: '🔧 Musluk / Ekipman Arızalı', short: 'Arıza Var' },
] as const;

export default function App() {
  const keycloak = useMemo(
    () =>
      new Keycloak({
        url: import.meta.env.VITE_OIDC_URL ?? 'http://localhost:8080',
        realm: import.meta.env.VITE_OIDC_REALM ?? 'wc-cleaning',
        clientId: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'wc-web',
      }),
    [],
  );

  const [ready, setReady] = useState(false);
  const [appError, setAppError] = useState('');
  const [role, setRole] = useState<'admin' | 'supervisor' | 'employee' | ''>(() => {
    try {
      const saved = localStorage.getItem('wc_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.username === 'admin' || u.role === 'admin') return 'admin';
        if (u.role === 'supervisor') return 'supervisor';
        if (u.role === 'employee') return 'employee';
      }
      return '';
    } catch {
      return '';
    }
  });

  // Ana Ekran Sekmesi: 'guest' | 'employee' | 'supervisor' | 'admin'
  const [activeTab, setActiveTab] = useState<'guest' | 'employee' | 'supervisor' | 'admin'>(() => {
    try {
      const saved = localStorage.getItem('wc_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.username === 'admin' || u.role === 'admin') return 'admin';
        if (u.role === 'supervisor') return 'supervisor';
        if (u.role === 'employee') return 'employee';
      }
      return 'guest';
    } catch {
      return 'guest';
    }
  });

  // Admin Alt Sekmeleri: 'overview' | 'locations' | 'users' | 'matrix' | 'audit'
  const [adminSubTab, setAdminSubTab] = useState<'overview' | 'locations' | 'users' | 'matrix' | 'audit'>('overview');

  // Şef Alt Sekmeleri: 'audit' | 'kpi' | 'matrix' | 'stickers'
  const [supervisorSubTab, setSupervisorSubTab] = useState<'audit' | 'kpi' | 'matrix' | 'stickers'>('audit');

  // Personel Alt Sekmeleri: 'tasks' | 'schedule' | 'history'
  const [staffSubTab, setStaffSubTab] = useState<'tasks' | 'schedule' | 'history'>('tasks');
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState<PublicLocationStatus | null>(null);
  const [supervisorStatus, setSupervisorStatus] = useState<SupervisorLocationStatus | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  // Ziyaretçi state
  const [selectedRating, setSelectedRating] = useState<'good' | 'fair' | 'bad' | ''>('');
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [surveySent, setSurveySent] = useState(false);
  const [guestScheduleOpen, setGuestScheduleOpen] = useState(false);

  // Personel state
  const [task1, setTask1] = useState(true);
  const [task2, setTask2] = useState(true);
  const [task3, setTask3] = useState(true);
  const [task4, setTask4] = useState(true);
  const [staffNote, setStaffNote] = useState('');
  const [staffScheduleOpen, setStaffScheduleOpen] = useState(false);
  const [staffPastOpen, setStaffPastOpen] = useState(false);

  // Şef state
  const [checklistAnswers, setChecklistAnswers] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
  });
  const [auditNote, setAuditNote] = useState('');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [workingSchedule, setWorkingSchedule] = useState<string[]>([]);
  const [workingTolerance, setWorkingTolerance] = useState<number>(15);
  const [newTimeInput, setNewTimeInput] = useState('09:00');
  const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});

  // Admin Mahal & QR Yönetimi
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocBuilding, setNewLocBuilding] = useState('Ana Bina');
  const [newLocTolerance, setNewLocTolerance] = useState(15);
  const [newLocPreset, setNewLocPreset] = useState('2hour');
  const [newLocSup, setNewLocSup] = useState('Kemal Şef');
  const [newLocBackupSup, setNewLocBackupSup] = useState('Ayşe Şef');

  const [printStickerModalOpen, setPrintStickerModalOpen] = useState(false);
  const [stickerLoc, setStickerLoc] = useState<Location | null>(null);

  // Kullanıcı Giriş & Kayıt & Oturum Durumu
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const saved = localStorage.getItem('wc_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('wc_token'));
  const [usersList, setUsersList] = useState<AppUser[]>([]);

  // Auth Modalı State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'employee' | 'supervisor'>('employee');

  // Admin Kullanıcı Yönetimi State
  const [adminUserModalOpen, setAdminUserModalOpen] = useState(false);
  const [adminUserFullName, setAdminUserFullName] = useState('');
  const [adminUserUsername, setAdminUserUsername] = useState('');
  const [adminUserPassword, setAdminUserPassword] = useState('');
  const [adminUserRole, setAdminUserRole] = useState<'employee' | 'supervisor' | 'admin'>('employee');

  // UI / Kamera / Bildirim
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date().toTimeString().substring(0, 8));

  const scannerRef = useRef<IScannerControls | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Saat sayacı
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toTimeString().substring(0, 8));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keycloak Başlatma
  useEffect(() => {
    let mounted = true;
    keycloak
      .init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      .then((authenticated) => {
        if (!mounted) return;
        if (authenticated) {
          const roles = keycloak.tokenParsed?.realm_access?.roles ?? [];
          setRole(roles.includes('supervisor') ? 'supervisor' : roles.includes('employee') ? 'employee' : '');
        }
        setReady(true);
      })
      .catch((error: unknown) => {
        if (mounted) {
          setAppError(error instanceof Error ? error.message : 'Kimlik doğrulama servisine bağlanılamadı.');
          setReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, [keycloak]);

  const accessToken = useCallback(async () => {
    if (authToken) {
      return authToken;
    }
    if (keycloak.authenticated) {
      await keycloak.updateToken(30).catch(() => {});
      if (keycloak.token) return keycloak.token;
    }
    throw new Error('Önce kullanıcı hesabıyla giriş yapın.');
  }, [authToken, keycloak]);

  // Mahallerin Yüklenmesi
  const loadLocations = useCallback(async () => {
    try {
      const items = await api<Location[]>('/locations');
      setLocations(items);

      // URL'deki opaque token veya wc parametresini incele
      const params = new URLSearchParams(window.location.search);
      const tokenParam = params.get('q');
      const wcParam = params.get('wc');

      if (tokenParam) {
        const found = items.find((l) => l.token === tokenParam);
        if (found) setSelectedId(found.id);
        else setSelectedId(items[0]?.id || '');
      } else if (wcParam) {
        const found = items.find((l) => l.id === wcParam);
        if (found) setSelectedId(found.id);
        else setSelectedId(items[0]?.id || '');
      } else {
        setSelectedId((curr) => curr || items[0]?.id || '');
      }
    } catch {
      setAppError('Mahal listesi yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void loadLocations();
  }, [ready, loadLocations]);

  // Seçili Mahalin Durumunu Yükleme
  const loadStatus = useCallback(async () => {
    if (!selectedId) return;
    try {
      const pub = await api<PublicLocationStatus>(`/locations/${selectedId}/public`);
      setStatus(pub);

      if ((currentUser || keycloak.authenticated) && (role === 'supervisor' || role === 'employee' || role === 'admin')) {
        const token = await accessToken();
        const sup = await api<SupervisorLocationStatus>(`/locations/${selectedId}/supervisor`, token);
        setSupervisorStatus(sup);
      }
    } catch (e) {
      console.warn('Status load error:', e);
    }
  }, [accessToken, currentUser, keycloak.authenticated, role, selectedId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Yönetim Paneli Yükleme
  const loadDashboard = useCallback(async () => {
    try {
      const token = await accessToken();
      const data = await api<DashboardData>('/reports/dashboard', token);
      setDashboard(data);
    } catch (e) {
      console.warn('Dashboard load error:', e);
    }
  }, [accessToken]);

  useEffect(() => {
    if (activeTab === 'supervisor' || activeTab === 'admin' || role === 'supervisor' || role === 'admin') {
      void loadDashboard();
      const interval = setInterval(loadDashboard, 15000);
      return () => clearInterval(interval);
    }
  }, [activeTab, role, loadDashboard]);

  // Web Audio Acil Durum Sireni
  const playSiren = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.2);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.4);
      osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // Audio izni
    }
  }, []);

  // SSE Canlı Bildirim Dinleyicisi
  useEffect(() => {
    if (role !== 'supervisor') return;
    const sse = new EventSource('/api/notifications/stream');
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INCIDENT_ALERT' || data.type === 'ESCALATION_ALERT') {
          playSiren();
          setNotice({
            text: `${data.title}: ${data.message}`,
            bad: true,
          });
          void loadStatus();
          void loadDashboard();
        }
      } catch {
        // Parse error
      }
    };
    return () => sse.close();
  }, [role, playSiren, loadStatus, loadDashboard]);

  // QR Tarama Başlatma / Durdurma
  useEffect(() => {
    if (!scannerOpen || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let active = true;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!active || !result) return;
        const text = result.getText();
        let targetId = '';

        if (text.includes('/q/')) {
          const token = text.split('/q/')[1]?.split('?')[0];
          const found = locations.find((l) => l.token === token);
          if (found) targetId = found.id;
        } else if (text.includes('wc=')) {
          const id = new URL(text, window.location.origin).searchParams.get('wc');
          if (id) targetId = id;
        }

        if (targetId) {
          setSelectedId(targetId);
          setScannerOpen(false);
          setNotice({ text: 'Mahal QR kodu başarıyla algılandı.' });
        }
      })
      .then((controls) => {
        scannerRef.current = controls;
      })
      .catch((err) => {
        setNotice({ text: 'Kamera açılamadı: ' + String(err), bad: true });
        setScannerOpen(false);
      });

    return () => {
      active = false;
      scannerRef.current?.stop();
      scannerRef.current = null;
    };
  }, [scannerOpen, locations]);

  // 1. Ziyaretçi Anket Gönderimi
  const handleRatingClick = async (r: 'good' | 'fair' | 'bad') => {
    setSelectedRating(r);
    if (r !== 'bad') {
      try {
        setBusy(true);
        await api('/surveys', undefined, {
          method: 'POST',
          body: JSON.stringify({
            locationId: selectedId,
            rating: r,
            issues: [],
          }),
        });
        setSurveySent(true);
        setTimeout(() => setSurveySent(false), 4000);
      } catch (err: any) {
        setNotice({ text: err.message, bad: true });
      } finally {
        setBusy(false);
      }
    }
  };

  const handleNegativeFeedbackSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedIssues.length === 0) {
      alert('Lütfen en az bir şikayet nedeni seçiniz.');
      return;
    }
    try {
      setBusy(true);
      await api('/surveys', undefined, {
        method: 'POST',
        body: JSON.stringify({
          locationId: selectedId,
          rating: 'bad',
          issues: selectedIssues,
        }),
      });
      setSurveySent(true);
      setSelectedRating('');
      setSelectedIssues([]);
      setTimeout(() => setSurveySent(false), 4500);
      void loadStatus();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 2. Personel Temizlik Beyanı Gönderme
  const handleCleaningSubmit = async () => {
    try {
      setBusy(true);
      const token = await accessToken();
      const curLoc = locations.find((l) => l.id === selectedId);
      const res = await api<{ sla: { label: string } }>(
        `/locations/${selectedId}/cleanings`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            tasksConfirmed: task1 && task2 && task3 && task4,
            note: staffNote,
            locationToken: curLoc?.token,
          }),
        },
      );
      setNotice({ text: `Temizlik beyanı alındı! SLA: ${res.sla.label}` });
      setStaffNote('');
      void loadStatus();
      void loadDashboard();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 3. Personel Acil Bilet Müdahalesini Tamamlama
  const handleStaffResolve = async (incidentId: string) => {
    try {
      setBusy(true);
      const token = await accessToken();
      await api(`/incidents/${incidentId}/staff-resolve`, token, {
        method: 'POST',
        body: JSON.stringify({ note: staffNote || 'Sorun giderildi, sarf ikmali yapıldı.' }),
      });
      setNotice({ text: 'Müdahale tamamlandı ve Şef onayına gönderildi!' });
      void loadStatus();
      void loadDashboard();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 4. Şef Olay Görevlendirme (Dispatch)
  const handleDispatch = async (incidentId: string) => {
    const staffName = assigneeMap[incidentId] || 'Ahmet Yılmaz';
    try {
      setBusy(true);
      const token = await accessToken();
      await api(`/incidents/${incidentId}/dispatch`, token, {
        method: 'POST',
        body: JSON.stringify({ assignedStaffName: staffName }),
      });
      setNotice({ text: `Görev ${staffName} personeline başarıyla atandı!` });
      void loadStatus();
      void loadDashboard();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 5. Şef Doğrulama ve Kapatma (Verify & Close)
  const handleVerifyClose = async (incidentId: string) => {
    try {
      setBusy(true);
      const token = await accessToken();
      await api(`/incidents/${incidentId}/verify-close`, token, {
        method: 'POST',
        body: JSON.stringify({ note: 'Şef tarafından yerinde incelendi ve kapatıldı.' }),
      });
      setNotice({ text: 'Olay şef tarafından başarıyla doğrulandı ve arşivlendi!' });
      void loadStatus();
      void loadDashboard();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 6. Şef Checklist v1.2 Denetim Gönderme
  const handleAuditSubmit = async (isApproved: boolean) => {
    try {
      setBusy(true);
      const token = await accessToken();
      const res = await api<{ correctiveIncident?: Incident }>(
        `/locations/${selectedId}/audits`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            isApproved,
            checklist: checklistAnswers,
            note: auditNote,
            templateVersion: 'v1.2',
          }),
        },
      );
      if (!isApproved) {
        setNotice({
          text: `Uygunsuzluk kaydedildi ve otomatik düzeltici iş emri (${res.correctiveIncident?.id}) açıldı!`,
          bad: true,
        });
      } else {
        setNotice({ text: 'Denetim eksiksiz olarak onaylandı!' });
      }
      setAuditNote('');
      void loadStatus();
      void loadDashboard();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 7. Şef Planlayıcı Kaydetme
  const handleSavePlanner = async () => {
    try {
      setBusy(true);
      const token = await accessToken();
      await api(`/locations/${selectedId}/schedule`, token, {
        method: 'PUT',
        body: JSON.stringify({
          schedule: workingSchedule,
          toleranceMinutes: workingTolerance,
        }),
      });
      setNotice({ text: 'Saat planı ve tolerans başarıyla kaydedildi!' });
      setPlannerOpen(false);
      void loadStatus();
      void loadLocations();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 8. Admin Yeni WC Ekleme
  const handleCreateLocation = async (e: FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim()) {
      alert('Lütfen mahal adını giriniz.');
      return;
    }
    let schedule = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
    if (newLocPreset === '1hour') schedule = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    else if (newLocPreset === '3shift') schedule = ['09:00', '14:00', '19:00'];

    try {
      setBusy(true);
      const token = await accessToken();
      const created = await createLocation({
        name: newLocName.trim(),
        code: newLocCode.trim() || undefined,
        building: newLocBuilding.trim(),
        toleranceMinutes: newLocTolerance,
        schedule,
        currentSupervisorName: newLocSup,
        backupSupervisorName: newLocBackupSup,
      }, token);

      setNotice({ text: `Yeni WC mahali (${created.name}) başarıyla oluşturuldu!` });
      setAdminModalOpen(false);
      setNewLocName('');
      setNewLocCode('');
      await loadLocations();
      void loadDashboard();

      setStickerLoc(created);
      setPrintStickerModalOpen(true);
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 9. Admin QR Token Yenileme
  const handleRegenerateToken = async (loc: Location) => {
    if (!window.confirm(`"${loc.name}" için mevcut QR tokenı iptal edilsin ve yeni bir güvenli token oluşturulsun mu?\n\nDikkat: Sahada asılı olan eski QR etiketi geçersiz olacaktır!`)) {
      return;
    }
    try {
      setBusy(true);
      const token = await accessToken();
      const res = await regenerateLocationToken(loc.id, token);
      setNotice({ text: `"${loc.name}" için yeni QR token üretildi!` });
      await loadLocations();
      setStickerLoc(res.location);
      setPrintStickerModalOpen(true);
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 10. Admin Mahal Silme
  const handleDeleteLocation = async (loc: Location) => {
    if (!window.confirm(`"${loc.name}" (${loc.code}) WC mahali silinsin mi?`)) {
      return;
    }
    try {
      setBusy(true);
      const token = await accessToken();
      await deleteLocation(loc.id, token);
      setNotice({ text: `"${loc.name}" mahali silindi.` });
      await loadLocations();
      void loadDashboard();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 11. Kullanıcı Girişi
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) {
      alert('Lütfen kullanıcı adı ve şifrenizi giriniz.');
      return;
    }
    try {
      setBusy(true);
      const res = await loginApi(loginUsername.trim(), loginPassword.trim());
      setCurrentUser(res.user);
      setAuthToken(res.token);
      localStorage.setItem('wc_user', JSON.stringify(res.user));
      localStorage.setItem('wc_token', res.token);
      const userRole: 'admin' | 'supervisor' | 'employee' =
        res.user.role === 'admin' || res.user.username === 'admin'
          ? 'admin'
          : res.user.role === 'supervisor'
          ? 'supervisor'
          : 'employee';
      setRole(userRole);
      setActiveTab(userRole);
      setAuthModalOpen(false);
      setLoginPassword('');
      const roleLabel = userRole === 'admin' ? '👑 Sistem Yöneticisi' : userRole === 'supervisor' ? '👔 Şef' : '🧹 Personel';
      setNotice({ text: `Hoş geldiniz, ${res.user.fullName}! (${roleLabel})` });
      void loadStatus();
      if (userRole === 'admin' || userRole === 'supervisor') {
        void loadDashboard();
        void loadUsers();
      }
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 12. Yeni Kullanıcı Kaydı (Register)
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!regFullName.trim() || !regUsername.trim() || !regPassword.trim()) {
      alert('Lütfen ad soyad, kullanıcı adı ve şifreyi eksiksiz doldurunuz.');
      return;
    }
    try {
      setBusy(true);
      const res = await registerApi(regFullName.trim(), regUsername.trim(), regPassword.trim(), regRole);
      setCurrentUser(res.user);
      setAuthToken(res.token);
      localStorage.setItem('wc_user', JSON.stringify(res.user));
      localStorage.setItem('wc_token', res.token);
      const userRole: 'admin' | 'supervisor' | 'employee' =
        res.user.role === 'admin' || res.user.username === 'admin'
          ? 'admin'
          : res.user.role === 'supervisor'
          ? 'supervisor'
          : 'employee';
      setRole(userRole);
      setActiveTab(userRole);
      setAuthModalOpen(false);
      setRegFullName('');
      setRegUsername('');
      setRegPassword('');
      setNotice({ text: `Hesabınız başarıyla oluşturuldu! Hoş geldiniz, ${res.user.fullName}.` });
      void loadStatus();
      if (userRole === 'admin' || userRole === 'supervisor') {
        void loadDashboard();
        void loadUsers();
      }
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 13. Çıkış Yap
  const handleLogout = () => {
    setCurrentUser(null);
    setAuthToken(null);
    localStorage.removeItem('wc_user');
    localStorage.removeItem('wc_token');
    setRole('');
    setActiveTab('guest');
    setUsersList([]);
    if (keycloak.authenticated) {
      void keycloak.logout();
    }
    setNotice({ text: 'Oturum kapatıldı. Ziyaretçi moduna dönüldü.' });
  };

  // 14. Admin Kullanıcı Listesi Yükleme
  const loadUsers = useCallback(async () => {
    try {
      const token = await accessToken();
      const list = await fetchUsersApi(token);
      setUsersList(list);
    } catch (err) {
      console.warn('Kullanıcı listesi yüklenemedi:', err);
    }
  }, [accessToken]);

  useEffect(() => {
    if (activeTab === 'admin' || activeTab === 'supervisor' || role === 'admin' || role === 'supervisor') {
      void loadUsers();
    }
  }, [activeTab, role, loadUsers]);

  // 15. Admin Sayfasından Yeni Kullanıcı Ekleme
  const handleAdminCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminUserFullName.trim() || !adminUserUsername.trim() || !adminUserPassword.trim()) {
      alert('Lütfen ad soyad, kullanıcı adı ve şifreyi doldurunuz.');
      return;
    }
    try {
      setBusy(true);
      const token = await accessToken();
      const created = await createUserApi({
        fullName: adminUserFullName.trim(),
        username: adminUserUsername.trim(),
        password: adminUserPassword.trim(),
        role: adminUserRole,
      }, token);
      setNotice({ text: `Yeni kullanıcı (${created.fullName}) başarıyla sisteme eklendi!` });
      setAdminUserModalOpen(false);
      setAdminUserFullName('');
      setAdminUserUsername('');
      setAdminUserPassword('');
      void loadUsers();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  // 16. Admin Sayfasından Kullanıcı Silme
  const handleAdminDeleteUser = async (user: AppUser) => {
    if (currentUser?.id === user.id) {
      alert('Şu anda oturum açık olan kendi hesabınızı silemezsiniz.');
      return;
    }
    if (!window.confirm(`"${user.fullName}" (@${user.username}) kullanıcısını sistemden silmek istediğinize emin misiniz?`)) {
      return;
    }
    try {
      setBusy(true);
      const token = await accessToken();
      await deleteUserApi(user.id, token);
      setNotice({ text: `"${user.fullName}" kullanıcısı başarıyla silindi.` });
      void loadUsers();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };



  const activeIncidentForStaff = supervisorStatus?.activeIncidents?.find(
    (i) => i.status === 'DISPATCHED' || i.status === 'OPEN',
  );

  const curLocation = locations.find((l) => l.id === selectedId) || locations[0];
  const qrUrl = curLocation
    ? `${window.location.origin}/q/${curLocation.token}`
    : window.location.href;

  return (
    <div className="bg-slate-100 text-slate-800 font-sans min-h-screen flex flex-col antialiased">
      {/* ÜST ÇUBUK / NAVİGASYON */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <i className="fa-solid fa-qrcode"></i> Mahal:
            </span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="bg-slate-800 text-amber-400 font-semibold px-2 py-1 rounded border border-slate-700 text-xs focus:ring-1 focus:ring-amber-400 outline-none"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
            <button
              onClick={() => setScannerOpen(!scannerOpen)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700"
              title="Kamera ile QR Tara"
            >
              <i className="fa-solid fa-camera"></i> QR Tara
            </button>
            <button
              onClick={() => setShowQr(true)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700"
              title="Yazdırılabilir QR Etiketi"
            >
              <i className="fa-solid fa-print"></i> QR Etiketi
            </button>
            {role === 'admin' && (
              <button
                onClick={() => setAdminModalOpen(true)}
                className="bg-purple-700 hover:bg-purple-600 text-white font-bold px-2.5 py-1 rounded border border-purple-500 shadow-sm flex items-center gap-1.5"
                title="Yeni WC Noktası Ekle & QR Kod Üret"
              >
                <i className="fa-solid fa-plus-circle"></i> WC Ekle
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {currentTime}
            </span>
            <button
              onClick={playSiren}
              title="Siren Sesini Test Et"
              className="bg-rose-900/60 hover:bg-rose-800 text-rose-300 px-2 py-1 rounded border border-rose-700 flex items-center gap-1"
            >
              <i className="fa-solid fa-bell"></i> Siren
            </button>

            {currentUser || keycloak.authenticated ? (
              <div className="flex items-center gap-2">
                <span className="bg-slate-800 px-2.5 py-1 rounded text-slate-300 text-xs flex items-center gap-1.5 border border-slate-700">
                  <i
                    className={`fa-solid ${
                      role === 'admin'
                        ? 'fa-crown text-purple-400'
                        : role === 'supervisor'
                        ? 'fa-user-tie text-emerald-400'
                        : 'fa-broom text-blue-400'
                    }`}
                  ></i>
                  <span className="font-bold text-white">
                    {currentUser?.fullName || keycloak.tokenParsed?.preferred_username || 'Kullanıcı'}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-bold border ${
                      role === 'admin'
                        ? 'bg-purple-950 text-purple-300 border-purple-800'
                        : role === 'supervisor'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        : 'bg-blue-950 text-blue-300 border-blue-800'
                    }`}
                  >
                    {role === 'admin' ? '👑 Admin' : role === 'supervisor' ? '👔 Şef' : '🧹 Personel'}
                  </span>
                </span>
                <button
                  onClick={handleLogout}
                  className="bg-red-800/80 hover:bg-red-700 text-white px-2.5 py-1 rounded text-xs transition flex items-center gap-1 font-semibold"
                  title="Oturumu Kapat"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket"></i> Çıkış
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setAuthTab('login');
                    setAuthModalOpen(true);
                  }}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-2.5 py-1 rounded text-xs shadow flex items-center gap-1 transition"
                  title="Kullanıcı Girişi Yap"
                >
                  <i className="fa-solid fa-right-to-bracket"></i> Giriş Yap
                </button>
                <button
                  onClick={() => {
                    setAuthTab('register');
                    setAuthModalOpen(true);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-2.5 py-1 rounded text-xs border border-slate-700 shadow flex items-center gap-1 transition"
                  title="Yeni Hesap Oluştur"
                >
                  <i className="fa-solid fa-user-plus"></i> Kayıt Ol
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ANA EKRAN SEKMELERİ (ROL SEKMELERİ) */}
      <nav className="bg-slate-800/95 backdrop-blur border-b border-slate-700/80 sticky top-[53px] z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('guest')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'guest'
                  ? 'bg-teal-600 text-white shadow-md ring-2 ring-teal-400/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <i className="fa-solid fa-restroom"></i> 🚻 Ziyaretçi / Misafir
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('employee')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'employee'
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <i className="fa-solid fa-broom"></i> 🧹 Personel Ekranı
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('supervisor')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'supervisor'
                  ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-400/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <i className="fa-solid fa-user-tie"></i> 👔 Şef Modülü
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'admin'
                  ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-400/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <i className="fa-solid fa-crown"></i> 👑 Yönetim (Admin)
            </button>
          </div>

          <div className="text-[11px] font-semibold text-slate-400 hidden sm:flex items-center gap-2">
            <span>Aktif Sekme:</span>
            <span className="font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
              {activeTab === 'admin'
                ? '👑 Admin Portalı'
                : activeTab === 'supervisor'
                ? '👔 Şef Denetim'
                : activeTab === 'employee'
                ? '🧹 Personel'
                : '🚻 Misafir Ekranı'}
            </span>
          </div>
        </div>
      </nav>

      {/* KAMERA SCANNER ALANI */}
      {scannerOpen && (
        <div className="max-w-md mx-auto my-3 p-4 bg-slate-900 rounded-2xl shadow-2xl text-center text-white">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-sm">QR Kod Tarayıcı</span>
            <button onClick={() => setScannerOpen(false)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
          <video ref={videoRef} className="w-full rounded-lg bg-black aspect-video object-cover" />
          <p className="text-xs text-slate-400 mt-2">WC etiketindeki QR kodu kameraya gösteriniz.</p>
        </div>
      )}

      {/* BİLDİRİM BANNER */}
      {notice && (
        <div
          className={`max-w-6xl mx-auto w-full my-2 px-4 py-2 rounded-lg text-xs font-semibold flex justify-between items-center ${
            notice.bad ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-2 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* ANA İÇERİK ALANI */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 flex flex-col items-center justify-start gap-6">
        {/* ROL GÖRÜNÜMÜ: MİSAFİR EKRANI */}
        {activeTab === 'guest' && (
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-700 text-white p-5 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 rounded-full mb-2">
                <i className="fa-solid fa-restroom text-2xl"></i>
              </div>
              <h2 className="text-xl font-bold">{curLocation?.name || 'Mahal Seçiniz'}</h2>
              <p className="text-xs text-teal-100 mt-0.5">{curLocation?.code || '-'}</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                  Bu Alan En Son Temizlendi
                </p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <i className="fa-regular fa-clock text-emerald-600 text-xl"></i>
                  <span className="text-3xl font-black text-emerald-700">
                    {status?.lastCleaningTime || '--:--'}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-600 mt-1">
                  Periyodik dezenfeksiyon standartlarına tabidir.
                </p>
                <button
                  onClick={() => setGuestScheduleOpen(true)}
                  className="mt-3 w-full bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <i className="fa-solid fa-list-check text-emerald-600"></i>
                  🕒 Bugünkü Temizlik Saatlerini Gör
                </button>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-bold text-slate-800 text-center mb-1">
                  Tuvalet Temizliğini Nasıl Buldunuz?
                </h3>
                <p className="text-xs text-slate-500 text-center mb-3">Lütfen deneyiminizi 1 tıkla seçiniz:</p>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    disabled={busy}
                    onClick={() => handleRatingClick('good')}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 active:scale-95 transition-all group"
                  >
                    <span className="text-4xl group-hover:scale-110 transition-transform">😊</span>
                    <span className="text-xs font-bold text-emerald-800 mt-1">İyi / Temiz</span>
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleRatingClick('fair')}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-amber-200 bg-amber-50/50 hover:bg-amber-100 active:scale-95 transition-all group"
                  >
                    <span className="text-4xl group-hover:scale-110 transition-transform">😐</span>
                    <span className="text-xs font-bold text-amber-800 mt-1">Orta</span>
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleRatingClick('bad')}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-rose-200 bg-rose-50/50 hover:bg-rose-100 active:scale-95 transition-all group"
                  >
                    <span className="text-4xl group-hover:scale-110 transition-transform">😡</span>
                    <span className="text-xs font-bold text-rose-800 mt-1">Kötü</span>
                  </button>
                </div>

                {selectedRating === 'bad' && (
                  <form onSubmit={handleNegativeFeedbackSubmit} className="mt-4 pt-3 border-t border-rose-200 bg-rose-50/50 p-3 rounded-xl">
                    <div className="flex items-center gap-1.5 text-rose-800 font-bold text-xs mb-1">
                      <i className="fa-solid fa-circle-exclamation"></i>
                      <span>Lütfen Karşılaştığınız Sorunları Seçiniz:</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">En az bir neden işaretlenmelidir:</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {ROOT_CAUSES.map((item) => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-rose-400 select-none"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIssues.includes(item.label)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedIssues([...selectedIssues, item.label]);
                              else setSelectedIssues(selectedIssues.filter((i) => i !== item.label));
                            }}
                            className="rounded text-rose-600"
                          />
                          <span className="font-medium text-slate-700">{item.short}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="mt-3 w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md transition flex items-center justify-center gap-2 text-xs"
                    >
                      <i className="fa-solid fa-paper-plane"></i>
                      Şikayeti İlet & İlgili Şefe Bildir
                    </button>
                  </form>
                )}

                {surveySent && (
                  <div className="mt-4 p-4 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-center">
                    <i className="fa-solid fa-circle-check text-2xl text-emerald-600 mb-1"></i>
                    <p className="font-bold text-sm">Geri Bildiriminiz Alındı!</p>
                    <p className="text-xs text-emerald-700">Geri bildiriminiz nöbetçi şefimize iletilmiştir.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. ROL GÖRÜNÜMÜ: PERSONEL EKRANI                         */}
        {/* ======================================================== */}
        {activeTab === 'employee' && (
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider bg-blue-500/40 px-2 py-0.5 rounded">
                    Saha Operasyon
                  </span>
                  <h2 className="text-lg font-bold mt-1">{curLocation?.name}</h2>
                  <p className="text-xs text-blue-100 font-mono">{curLocation?.code}</p>
                </div>
                <i className="fa-solid fa-broom text-2xl opacity-80"></i>
              </div>
            </div>

            {/* Personel Alt Sekmeleri (Sub-tabs) */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold">
              <button
                type="button"
                onClick={() => setStaffSubTab('tasks')}
                className={`flex-1 py-2.5 text-center transition border-b-2 ${
                  staffSubTab === 'tasks'
                    ? 'border-blue-600 text-blue-700 bg-white shadow-sm'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <i className="fa-solid fa-circle-check"></i> Temizlik Formu
              </button>
              <button
                type="button"
                onClick={() => setStaffSubTab('schedule')}
                className={`flex-1 py-2.5 text-center transition border-b-2 ${
                  staffSubTab === 'schedule'
                    ? 'border-blue-600 text-blue-700 bg-white shadow-sm'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <i className="fa-solid fa-calendar-days"></i> Saatler
              </button>
              <button
                type="button"
                onClick={() => setStaffSubTab('history')}
                className={`flex-1 py-2.5 text-center transition border-b-2 ${
                  staffSubTab === 'history'
                    ? 'border-blue-600 text-blue-700 bg-white shadow-sm'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <i className="fa-solid fa-clock-rotate-left"></i> Geçmiş
              </button>
            </div>

            <div className="p-5 space-y-4">
              {staffSubTab === 'tasks' && (
                <>
                  {activeIncidentForStaff && (
                    <div className="p-3 bg-amber-50 border-2 border-amber-400 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-amber-900 font-bold text-xs">
                        <span className="flex items-center gap-1.5">
                          <i className="fa-solid fa-bell text-rose-600 animate-bounce"></i> ŞEF TARAFINDAN ACİL GÖREV ATANDI!
                        </span>
                        <span className="bg-amber-200 px-2 py-0.5 rounded text-[10px]">
                          {activeIncidentForStaff.status}
                        </span>
                      </div>
                      <p className="text-xs text-amber-800">
                        Sorunlar: {activeIncidentForStaff.issuesJson?.join(', ')} ({activeIncidentForStaff.time})
                      </p>
                      <button
                        onClick={() => handleStaffResolve(activeIncidentForStaff.id)}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg text-xs shadow flex items-center justify-center gap-1.5"
                      >
                        <i className="fa-solid fa-check"></i> Müdahaleyi Tamamla ve Şefe Bildir
                      </button>
                    </div>
                  )}

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Görevli Personel:</span>
                      <span className="font-semibold text-slate-900">
                        {currentUser?.fullName || keycloak.tokenParsed?.preferred_username || 'Personel'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                      <span className="font-medium text-slate-600">Sistem İşlem Saati:</span>
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {currentTime.substring(0, 5)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">Yapılan İşlemleri Onaylayınız:</label>
                    <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-lg text-xs cursor-pointer hover:bg-slate-100 transition">
                      <input type="checkbox" checked={task1} onChange={(e) => setTask1(e.target.checked)} className="rounded text-blue-600" />
                      <span>Klozet, pisuvar ve lavabolar dezenfekte edildi</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-lg text-xs cursor-pointer hover:bg-slate-100 transition">
                      <input type="checkbox" checked={task2} onChange={(e) => setTask2(e.target.checked)} className="rounded text-blue-600" />
                      <span>Sıvı sabun, kağıt havlu ve tuvalet kağıdı ikmali yapıldı</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-lg text-xs cursor-pointer hover:bg-slate-100 transition">
                      <input type="checkbox" checked={task3} onChange={(e) => setTask3(e.target.checked)} className="rounded text-blue-600" />
                      <span>Çöp kovaları boşaltıldı ve yeni poşet takıldı</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-slate-50 border rounded-lg text-xs cursor-pointer hover:bg-slate-100 transition">
                      <input type="checkbox" checked={task4} onChange={(e) => setTask4(e.target.checked)} className="rounded text-blue-600" />
                      <span>Zemin mop ile silindi ve kurulandı</span>
                    </label>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={staffNote}
                      onChange={(e) => setStaffNote(e.target.value)}
                      placeholder="Varsa arıza/sarf ikmal notu..."
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    disabled={busy}
                    onClick={handleCleaningSubmit}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3 rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm"
                  >
                    <i className="fa-solid fa-circle-check text-lg"></i>
                    Temizliği Tamamla ve Dijital Beyan Oluştur
                  </button>
                </>
              )}

              {staffSubTab === 'schedule' && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-900">
                    <strong>Planlanan Temizlik Slotları:</strong> Bu mahal için tanımlı plan ±{curLocation?.toleranceMinutes || 15} dakika toleransla denetlenmektedir.
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {curLocation?.schedule?.map((time, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center font-mono font-bold text-slate-800 text-xs">
                        {time}
                      </div>
                    )) || <p className="text-xs text-slate-400">Plan bulunamadı.</p>}
                  </div>
                </div>
              )}

              {staffSubTab === 'history' && (
                <div className="space-y-3">
                  <button
                    onClick={() => setStaffPastOpen(true)}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <i className="fa-solid fa-clock-rotate-left text-blue-400"></i> Tam Temizlik Geçmişini Aç
                  </button>
                  <div className="text-xs text-slate-500">
                    {supervisorStatus?.lastCleaning ? (
                      <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
                        <span className="font-bold text-slate-700 block">En Son Temizlik Beyanı:</span>
                        <div>Personel: <strong>{supervisorStatus.lastCleaning.staffName}</strong></div>
                        <div>Saat: <strong>{supervisorStatus.lastCleaning.actualTime}</strong></div>
                        <div>SLA Durumu: <span className="font-bold text-blue-700">{supervisorStatus.lastCleaning.slaStatus}</span></div>
                      </div>
                    ) : (
                      <p className="italic text-slate-400">Henüz kayıtlı temizlik geçmişi bulunmuyor.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. ROL GÖRÜNÜMÜ: ŞEF MODÜLÜ (DENETİM & OPERASYON)        */}
        {/* ======================================================== */}
        {activeTab === 'supervisor' && (
          <div className="w-full max-w-5xl space-y-4">
            {/* Şef Karşılama Başlığı */}
            <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-800 text-white p-5 rounded-2xl shadow-xl border border-purple-800/60 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-purple-600/30 flex items-center justify-center text-2xl border border-purple-500/40">
                  <i className="fa-solid fa-user-tie text-purple-300"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-500/40 px-2 py-0.5 rounded">
                      Vardiya &amp; Kalite Denetim Portalı
                    </span>
                    <span className="bg-purple-900 text-purple-200 text-[10px] font-mono px-2 py-0.5 rounded border border-purple-700">
                      Nöbetçi Şef: {curLocation?.currentSupervisorName || currentUser?.fullName || 'Şef'}
                    </span>
                  </div>
                  <h2 className="text-xl font-black mt-1">👔 Şef Denetim &amp; Saha Operasyon Merkezi</h2>
                  <p className="text-xs text-purple-200/80 mt-0.5">
                    Aktif Mahal: <strong>{curLocation?.name}</strong> ({curLocation?.code})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/api/reports/export-csv"
                  target="_blank"
                  rel="noreferrer"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow"
                >
                  <i className="fa-solid fa-file-csv"></i> CSV Rapor İndir
                </a>
              </div>
            </div>

            {/* Şef Alt Sekmeleri (Sub-tabs) */}
            <div className="flex items-center gap-1.5 bg-slate-200/90 p-1.5 rounded-2xl border border-slate-300 overflow-x-auto shadow-inner">
              <button
                type="button"
                onClick={() => setSupervisorSubTab('audit')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  supervisorSubTab === 'audit'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-clipboard-check"></i> Denetim Formu &amp; Acil Olaylar
              </button>
              <button
                type="button"
                onClick={() => setSupervisorSubTab('kpi')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  supervisorSubTab === 'kpi'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-chart-pie"></i> Performans &amp; Pareto
              </button>
              <button
                type="button"
                onClick={() => setSupervisorSubTab('matrix')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  supervisorSubTab === 'matrix'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-table-cells"></i> Mahal Operasyon Matrisi
              </button>
              <button
                type="button"
                onClick={() => setSupervisorSubTab('stickers')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  supervisorSubTab === 'stickers'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-print"></i> QR Etiket Baskı
              </button>
            </div>

            {/* ŞEF SEKME 1: DENETİM FORMU & ACİL OLAYLAR */}
            {supervisorSubTab === 'audit' && (
              <div className="max-w-xl mx-auto w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col p-5 space-y-4">
                {/* Olay Yönetim Hub'ı */}
                <div className="space-y-2">
                  {supervisorStatus?.activeIncidents && supervisorStatus.activeIncidents.length > 0 ? (
                    supervisorStatus.activeIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        className={`p-3 rounded-xl space-y-2 text-xs border-2 ${
                          inc.status === 'OPEN'
                            ? 'bg-rose-50 border-rose-400'
                            : inc.status === 'DISPATCHED'
                              ? 'bg-amber-50 border-amber-300'
                              : 'bg-emerald-50 border-emerald-400'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span>
                            {inc.status === 'OPEN' && '🚨 YENİ ŞİKAYET'}
                            {inc.status === 'DISPATCHED' && '🏃 MÜDAHALE SÜRÜYOR'}
                            {inc.status === 'RESOLVED_BY_STAFF' && '✓ MÜDAHALE TAMAMLANDI - ONAY BEKLİYOR'}
                            {' '}({inc.id})
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-white border">
                            {inc.signalCount} Bildirim
                          </span>
                        </div>
                        <p className="text-slate-700">
                          Sorunlar: <strong>{inc.issuesJson?.join(', ')}</strong> ({inc.time})
                        </p>

                        {inc.status === 'OPEN' && (
                          <div className="flex items-center gap-2 pt-1">
                            <select
                              value={assigneeMap[inc.id] || 'Ahmet Yılmaz'}
                              onChange={(e) => setAssigneeMap({ ...assigneeMap, [inc.id]: e.target.value })}
                              className="flex-1 bg-white border border-slate-300 rounded p-1.5 text-xs font-semibold"
                            >
                              <option value="Ahmet Yılmaz">Ahmet Yılmaz (Görevli)</option>
                              <option value="Mehmet Demir">Mehmet Demir</option>
                              <option value="Ayşe Kaya">Ayşe Kaya</option>
                              <option value="Fatma Çelik">Fatma Çelik</option>
                            </select>
                            <button
                              onClick={() => handleDispatch(inc.id)}
                              className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 px-3 rounded shadow"
                            >
                              📢 Personele Ata
                            </button>
                          </div>
                        )}

                        {inc.status === 'DISPATCHED' && (
                          <p className="text-[11px] text-amber-900 font-semibold">
                            Atandı: {inc.assignedStaffName || 'Personel sahada müdahale ediyor.'}
                          </p>
                        )}

                        {inc.status === 'RESOLVED_BY_STAFF' && (
                          <div>
                            <p className="text-xs text-emerald-800">
                              <strong>{inc.assignedStaffName}</strong> müdahaleyi tamamladı. Not: <em>{inc.resolutionNote || 'Sorun giderildi'}</em>
                            </p>
                            <button
                              onClick={() => handleVerifyClose(inc.id)}
                              className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded shadow flex items-center justify-center gap-1.5"
                            >
                              <i className="fa-solid fa-stamp"></i> Doğrula ve Olayı Kapat (Verify &amp; Close)
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                      <span className="flex items-center gap-1.5 font-bold">
                        <i className="fa-solid fa-circle-check text-emerald-600"></i> Bu Mahalde Bekleyen Açık Şikayet Yok
                      </span>
                      <span className="text-[10px] text-emerald-600">Standart Operasyon</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setStaffPastOpen(true)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold py-2 px-2 rounded-lg text-xs flex items-center justify-center gap-1 shadow-sm transition"
                  >
                    <i className="fa-solid fa-clock-rotate-left text-purple-600"></i> Önceki Temizlikler
                  </button>
                  <button
                    onClick={() => setStaffScheduleOpen(true)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold py-2 px-2 rounded-lg text-xs flex items-center justify-center gap-1 shadow-sm transition"
                  >
                    <i className="fa-solid fa-calendar-days text-indigo-600"></i> Planlanan Saatler
                  </button>
                </div>

                <button
                  onClick={() => {
                    setWorkingSchedule(curLocation?.schedule ? [...curLocation.schedule] : []);
                    setWorkingTolerance(curLocation?.toleranceMinutes || 15);
                    setPlannerOpen(true);
                  }}
                  className="w-full bg-purple-50 hover:bg-purple-100 text-purple-800 border-2 border-purple-300 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <i className="fa-solid fa-sliders text-purple-700"></i>
                  ⚙️ Günlük Planı ve Süre Sapma Toleransını Güncelle
                </button>

                <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-3 text-xs">
                  <span className="text-purple-800 font-bold block mb-1">Denetlenen Son Temizlik Beyanı:</span>
                  <div className="grid grid-cols-2 gap-2 text-slate-700">
                    <div>
                      Personel: <strong className="text-purple-900">{supervisorStatus?.lastCleaning?.staffName || '-'}</strong>
                    </div>
                    <div>
                      İşlem Saati: <strong className="text-purple-900">{supervisorStatus?.lastCleaning?.actualTime || '-'}</strong>
                    </div>
                    <div className="col-span-2">
                      SLA Durumu:{' '}
                      <span className="font-bold text-purple-900">
                        {supervisorStatus?.lastCleaning?.slaStatus || 'Henüz Yapılmadı'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sürümlü Checklist v1.2 */}
                <div className="border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Denetim Maddeleri (Checklist):
                    </h3>
                    <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-mono font-bold">
                      Şablon Sürümü: v1.2
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {CHECKLIST_ITEMS_V12.map((item, idx) => {
                      const isOk = checklistAnswers[idx] ?? true;
                      return (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border rounded-lg">
                          <span className="font-medium text-slate-700">
                            {idx + 1}. {item}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setChecklistAnswers({ ...checklistAnswers, [idx]: true })}
                              className={`px-2.5 py-1 rounded font-bold ${
                                isOk ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              ✓ Uygun
                            </button>
                            <button
                              type="button"
                              onClick={() => setChecklistAnswers({ ...checklistAnswers, [idx]: false })}
                              className={`px-2.5 py-1 rounded font-bold ${
                                !isOk ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              ✗ Uygun Değil
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={auditNote}
                    onChange={(e) => setAuditNote(e.target.value)}
                    placeholder="Varsa şef denetim notu..."
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    disabled={busy}
                    onClick={() => handleAuditSubmit(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <i className="fa-solid fa-check-double"></i> Denetimi Onayla
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleAuditSubmit(false)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <i className="fa-solid fa-triangle-exclamation"></i> Uygunsuzluk / Düzeltme Aç
                  </button>
                </div>
              </div>
            )}

            {/* ŞEF SEKME 2: KALİTE & SLA PANELİ */}
            {supervisorSubTab === 'kpi' && dashboard && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Toplam Temizlik</span>
                    <span className="text-2xl font-black text-blue-600">{dashboard.kpis.totalCleans}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Tamamlanan işlem</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Zamanında Uyum %</span>
                    <span className="text-2xl font-black text-emerald-600">{dashboard.kpis.onTimeRate}%</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Tam vaktinde</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Plan Dışı (±Tol.)</span>
                    <span className="text-2xl font-black text-amber-600">{dashboard.kpis.outOfTimeCount}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Tolerans dahilinde</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Yapılmadı (&gt;Tol.)</span>
                    <span className="text-2xl font-black text-rose-600">{dashboard.kpis.notDoneCount}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Toleransı aşan</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center col-span-2 sm:col-span-1">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Memnuniyet (CSAT)</span>
                    <span className="text-2xl font-black text-purple-600">{dashboard.kpis.csatRate}%</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Olumlu Anket Yanıtı</span>
                  </div>
                </div>

                {/* Pareto Kök Neden Dağılımı */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Kötü Anket Kök Neden Dağılımı (Pareto Analizi)
                  </h3>
                  <div className="space-y-2">
                    {dashboard.paretoData.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Henüz olumsuz anket kaydı oluşmadı.</p>
                    ) : (
                      dashboard.paretoData.map((item, idx) => {
                        const max = dashboard.paretoData[0]?.count || 1;
                        const pct = Math.round((item.count / max) * 100);
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-700">
                              <span>{item.issue}</span>
                              <span>{item.count} Şikayet</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ŞEF SEKME 3: MAHAL OPERASYON MATRİSİ */}
            {supervisorSubTab === 'matrix' && dashboard && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Tüm Mahal Operasyon ve Vardiya Durumları
                </h3>
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Mahal Kodu / Adı</th>
                      <th className="py-2 px-3">Nöbetçi / Yedek Şef</th>
                      <th className="py-2 px-3">Plan / Tolerans</th>
                      <th className="py-2 px-3">Son Temizlik</th>
                      <th className="py-2 px-3">Son Şef Denetimi</th>
                      <th className="py-2 px-3">Olay Durumu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboard.locationMatrix.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          {row.name} <br />
                          <span className="text-[10px] text-slate-400 font-mono">{row.code}</span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {row.currentSupervisor} <br />
                          <span className="text-[10px] text-slate-400">Yedek: {row.backupSupervisor}</span>
                        </td>
                        <td className="py-2 px-3 font-mono text-purple-700 font-bold">
                          {row.slotCount} Slot (±{row.toleranceMinutes} dk)
                        </td>
                        <td className="py-2 px-3 text-slate-600">{row.lastClean || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{row.lastAudit || '-'}</td>
                        <td className="py-2 px-3">
                          {row.incidentStatus === 'NORMAL' && (
                            <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">Normal</span>
                          )}
                          {row.incidentStatus === 'DISPATCHED' && (
                            <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 animate-pulse">
                              Müdahale Bekliyor
                            </span>
                          )}
                          {row.incidentStatus === 'ESCALATED' && (
                            <span className="px-2 py-0.5 rounded font-bold bg-rose-200 text-rose-900 animate-pulse">
                              Eskalasyonda!
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ŞEF SEKME 4: QR BASKI */}
            {supervisorSubTab === 'stickers' && (
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <i className="fa-solid fa-print text-purple-600"></i> Sahadaki QR Etiketlerini İnceleme &amp; Yazdırma
                    </h3>
                    <p className="text-xs text-slate-500">
                      Fiziksel sticker yıprandığında veya yenilenmesi gerektiğinde baskı alabilirsiniz.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Mahal Adı &amp; Kodu</th>
                        <th className="py-2 px-3">Bina</th>
                        <th className="py-2 px-3">Sorumlu Şef</th>
                        <th className="py-2 px-3 text-right">QR Baskı</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {locations.map((loc) => (
                        <tr key={loc.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-800">{loc.name} ({loc.code})</td>
                          <td className="py-2 px-3 text-slate-600">{loc.building}</td>
                          <td className="py-2 px-3 text-slate-600">{loc.currentSupervisorName || '-'}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => {
                                setStickerLoc(loc);
                                setPrintStickerModalOpen(true);
                              }}
                              className="bg-slate-800 hover:bg-slate-900 text-white font-medium px-2.5 py-1 rounded text-xs inline-flex items-center gap-1 shadow-sm transition"
                            >
                              <i className="fa-solid fa-print text-emerald-400"></i> Etiket Yazdır
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* 4. ROL GÖRÜNÜMÜ: SİSTEM YÖNETİCİSİ (ADMİN) MERKEZİ       */}
        {/* ======================================================== */}
        {activeTab === 'admin' && (
          <div className="w-full max-w-5xl space-y-4">
            {/* Admin Karşılama Başlığı */}
            <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white p-5 rounded-2xl shadow-xl border border-purple-900/50 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-purple-600/30 flex items-center justify-center text-2xl border border-purple-500/40">
                  <i className="fa-solid fa-crown text-purple-300"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-500/40 px-2.5 py-0.5 rounded text-purple-200">
                      Sistem Yönetim Merkezi
                    </span>
                    <span className="bg-purple-900 text-purple-200 text-[10px] font-mono px-2 py-0.5 rounded border border-purple-700">
                      Yetki: Sistem Yöneticisi (Admin)
                    </span>
                  </div>
                  <h2 className="text-xl font-black mt-1">
                    Sistem Yönetici Portalı — {currentUser?.fullName || 'Admin'}
                  </h2>
                  <p className="text-xs text-purple-200/80 mt-0.5">
                    WC mahallerini tanımlayabilir, güvenli QR etiketleri üretebilir, şef ve personelleri yönetebilirsiniz.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAdminModalOpen(true)}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition"
                >
                  <i className="fa-solid fa-plus-circle"></i> Yeni WC Noktası
                </button>
                <button
                  onClick={() => setAdminUserModalOpen(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 shadow transition"
                >
                  <i className="fa-solid fa-user-plus"></i> Yeni Kullanıcı
                </button>
                <a
                  href="/api/reports/export-csv"
                  target="_blank"
                  rel="noreferrer"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition"
                >
                  <i className="fa-solid fa-file-csv"></i> CSV İndir
                </a>
              </div>
            </div>

            {/* Admin Alt Sekmeleri (Sub-tabs) */}
            <div className="flex items-center gap-1.5 bg-slate-200/90 p-1.5 rounded-2xl border border-slate-300 overflow-x-auto shadow-inner">
              <button
                type="button"
                onClick={() => setAdminSubTab('overview')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  adminSubTab === 'overview'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-chart-pie"></i> Performans &amp; KPI
              </button>
              <button
                type="button"
                onClick={() => setAdminSubTab('locations')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  adminSubTab === 'locations'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-qrcode text-purple-600"></i> WC &amp; QR Yönetimi
              </button>
              <button
                type="button"
                onClick={() => setAdminSubTab('users')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  adminSubTab === 'users'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-users-gear text-purple-600"></i> Kullanıcı Yönetimi
              </button>
              <button
                type="button"
                onClick={() => setAdminSubTab('matrix')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  adminSubTab === 'matrix'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-table-cells text-purple-600"></i> Mahal Matrisi
              </button>
              <button
                type="button"
                onClick={() => setAdminSubTab('audit')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  adminSubTab === 'audit'
                    ? 'bg-purple-700 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 shadow-sm border border-slate-200'
                }`}
              >
                <i className="fa-solid fa-shield-halved text-purple-600"></i> Denetim İzi (Audit)
              </button>
            </div>

            {/* ADMİN SEKME 1: PERFORMANS & KPI */}
            {adminSubTab === 'overview' && (
              <div className="space-y-4">
                {/* Admin 4'lü Özet Kartları */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Tanımlı WC Noktaları</span>
                    <span className="text-2xl font-black text-purple-700">{locations.length}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Aktif Mahal</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Kayıtlı Kullanıcılar</span>
                    <span className="text-2xl font-black text-blue-600">{usersList.length}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {usersList.filter(u => u.role === 'supervisor' || (u.role as any) === 'admin').length} Şef / {usersList.filter(u => u.role === 'employee').length} Personel
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Açık Olay / Arıza</span>
                    <span className="text-2xl font-black text-rose-600">
                      {dashboard?.locationMatrix.filter(m => m.incidentStatus !== 'NORMAL').length || 0}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Müdahale bekleyen</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase block">Güvenlik Mimarisi</span>
                    <span className="text-2xl font-black text-emerald-600">Aktif</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Opaque Token &amp; SHA-256</span>
                  </div>
                </div>

                {dashboard && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Toplam Temizlik</span>
                        <span className="text-2xl font-black text-blue-600">{dashboard.kpis.totalCleans}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Tamamlanan işlem</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Zamanında Uyum %</span>
                        <span className="text-2xl font-black text-emerald-600">{dashboard.kpis.onTimeRate}%</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Tam vaktinde</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Plan Dışı (±Tol.)</span>
                        <span className="text-2xl font-black text-amber-600">{dashboard.kpis.outOfTimeCount}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Tolerans dahilinde</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Yapılmadı (&gt;Tol.)</span>
                        <span className="text-2xl font-black text-rose-600">{dashboard.kpis.notDoneCount}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Toleransı aşan</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center col-span-2 sm:col-span-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Memnuniyet (CSAT)</span>
                        <span className="text-2xl font-black text-purple-600">{dashboard.kpis.csatRate}%</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Olumlu Anket Yanıtı</span>
                      </div>
                    </div>

                    {/* Pareto Analizi */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Kötü Anket Kök Neden Dağılımı (Pareto Analizi)
                      </h3>
                      <div className="space-y-2">
                        {dashboard.paretoData.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Henüz olumsuz anket kaydı oluşmadı.</p>
                        ) : (
                          dashboard.paretoData.map((item, idx) => {
                            const max = dashboard.paretoData[0]?.count || 1;
                            const pct = Math.round((item.count / max) * 100);
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-xs font-semibold text-slate-700">
                                  <span>{item.issue}</span>
                                  <span>{item.count} Şikayet</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                  <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ADMİN SEKME 2: WC & QR YÖNETİMİ */}
            {adminSubTab === 'locations' && (
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-purple-100 text-purple-800 rounded-lg text-sm font-bold">
                        <i className="fa-solid fa-qrcode"></i>
                      </span>
                      <h3 className="text-sm font-bold text-slate-800">
                        WC Noktaları ve Güvenli QR Kod Yönetim Merkezi
                      </h3>
                      <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                        {locations.length} Mahal Kayıtlı
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Sistem genelindeki tüm WC mahallerini yönetebilir, yeni mahal ekleyebilir, QR etiketleri yazdırabilir veya token yenileyebilirsiniz.
                    </p>
                  </div>
                  <button
                    onClick={() => setAdminModalOpen(true)}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 shadow transition"
                  >
                    <i className="fa-solid fa-plus-circle"></i> Yeni WC Noktası Ekle
                  </button>
                </div>

                {/* Bilgilendirme Kutusu: Opaque Token Güvenliği */}
                <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-700">
                  <i className="fa-solid fa-shield-halved text-purple-700 mt-0.5 text-sm"></i>
                  <div>
                    <strong className="text-purple-950">Opaque Token Mimarisi:</strong> QR kodlar doğrudan veritabanı ID'si barındırmaz; her mahal kriptografik bir token taşır (<code className="bg-purple-100 text-purple-900 px-1 py-0.5 rounded text-[11px]">/q/:token</code>). Hasar gören etiketlerde "Yenile" butonuna basılarak eski etiket anında geçersiz kılınır.
                  </div>
                </div>

                {/* Lokasyonlar Tablosu */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Mahal Adı &amp; Kodu</th>
                        <th className="py-2.5 px-3">Bina / Bölüm</th>
                        <th className="py-2.5 px-3">Sorumlu Şefler</th>
                        <th className="py-2.5 px-3">Plan / Tolerans</th>
                        <th className="py-2.5 px-3">Güvenli Token</th>
                        <th className="py-2.5 px-3 text-right">Eylemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {locations.map((loc) => (
                        <tr key={loc.id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 block">{loc.name}</span>
                            <span className="font-mono text-[10px] text-slate-400">{loc.code}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            <span className="inline-block bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium">
                              {loc.building || 'Genel'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            <div className="font-medium text-slate-800">{loc.currentSupervisorName || '-'}</div>
                            <div className="text-[10px] text-slate-400">Yedek: {loc.backupSupervisorName || '-'}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-purple-700 font-bold">
                              {loc.schedule?.length || 0} Slot
                            </span>
                            <span className="text-[10px] text-slate-500 block">±{loc.toleranceMinutes} dk tolerans</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px] border border-slate-200">
                              {loc.token ? `/q/${loc.token.slice(0, 14)}...` : '-'}
                            </code>
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => {
                                setStickerLoc(loc);
                                setPrintStickerModalOpen(true);
                              }}
                              className="bg-slate-800 hover:bg-slate-900 text-white font-medium px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 shadow-sm transition"
                              title="Yazdırılabilir QR Etiketi Aç"
                            >
                              <i className="fa-solid fa-print text-emerald-400"></i> Etiket
                            </button>
                            <button
                              onClick={() => handleRegenerateToken(loc)}
                              disabled={busy}
                              className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition"
                              title="Yeni QR token üret (Eski QR geçersiz olur)"
                            >
                              <i className="fa-solid fa-rotate text-amber-700"></i> Yenile
                            </button>
                            <button
                              onClick={() => handleDeleteLocation(loc)}
                              disabled={busy || locations.length <= 1}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition disabled:opacity-40"
                              title="Mahali Sil"
                            >
                              <i className="fa-solid fa-trash"></i> Sil
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ADMİN SEKME 3: KULLANICI YÖNETİMİ */}
            {adminSubTab === 'users' && (
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-purple-100 text-purple-800 rounded-lg text-sm font-bold">
                        <i className="fa-solid fa-users-gear"></i>
                      </span>
                      <h3 className="text-sm font-bold text-slate-800">
                        Sistem Kullanıcıları ve Personel Yönetim Merkezi
                      </h3>
                      <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                        {usersList.length} Kayıtlı Kullanıcı
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Sisteme kayıtlı personelleri ve yöneticileri listeleyebilir, rolleri inceleyebilir, yeni kullanıcı ekleyebilir veya silebilirsiniz.
                    </p>
                  </div>
                  <button
                    onClick={() => setAdminUserModalOpen(true)}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 shadow transition"
                  >
                    <i className="fa-solid fa-user-plus"></i> Yeni Kullanıcı Ekle
                  </button>
                </div>

                {/* Kullanıcılar Tablosu */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Adı Soyadı</th>
                        <th className="py-2.5 px-3">Kullanıcı Adı</th>
                        <th className="py-2.5 px-3">Yetki / Rol</th>
                        <th className="py-2.5 px-3">Kayıt Tarihi</th>
                        <th className="py-2.5 px-3 text-right">Eylemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usersList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400 italic">
                            Kayıtlı kullanıcı bulunamadı veya yükleniyor...
                          </td>
                        </tr>
                      ) : (
                        usersList.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] flex items-center justify-center font-bold">
                                  {u.fullName.charAt(0).toUpperCase()}
                                </span>
                                {u.fullName}
                                {currentUser?.id === u.id && (
                                  <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded font-bold">
                                    Siz
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              @{u.username}
                            </td>
                            <td className="py-2.5 px-3">
                              {u.role === 'admin' || (u.username === 'admin') ? (
                                <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-900 font-bold px-2 py-0.5 rounded text-[11px] border border-purple-200">
                                  <i className="fa-solid fa-crown text-[10px] text-purple-700"></i> Sistem Yöneticisi
                                </span>
                              ) : u.role === 'supervisor' ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                                  <i className="fa-solid fa-user-tie text-[10px] text-emerald-700"></i> Şef (Supervisor)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[11px] border border-blue-200">
                                  <i className="fa-solid fa-broom text-[10px] text-blue-700"></i> Temizlik Personeli
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                              {u.createdAt ? formatTime(u.createdAt) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => handleAdminDeleteUser(u)}
                                disabled={busy || currentUser?.id === u.id || u.username === 'admin'}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium px-2.5 py-1 rounded text-[11px] inline-flex items-center gap-1 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                title={u.username === 'admin' ? 'Ana yönetici silinemez' : currentUser?.id === u.id ? 'Aktif oturumdaki kullanıcı silinemez' : 'Kullanıcıyı Sil'}
                              >
                                <i className="fa-solid fa-trash"></i> Sil
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ADMİN SEKME 4: MAHAL OPERASYON MATRİSİ */}
            {adminSubTab === 'matrix' && dashboard && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Tüm Mahal Operasyon ve Vardiya Durumları
                </h3>
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Mahal Kodu / Adı</th>
                      <th className="py-2 px-3">Nöbetçi / Yedek Şef</th>
                      <th className="py-2 px-3">Plan / Tolerans</th>
                      <th className="py-2 px-3">Son Temizlik</th>
                      <th className="py-2 px-3">Son Şef Denetimi</th>
                      <th className="py-2 px-3">Olay Durumu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboard.locationMatrix.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          {row.name} <br />
                          <span className="text-[10px] text-slate-400 font-mono">{row.code}</span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {row.currentSupervisor} <br />
                          <span className="text-[10px] text-slate-400">Yedek: {row.backupSupervisor}</span>
                        </td>
                        <td className="py-2 px-3 font-mono text-purple-700 font-bold">
                          {row.slotCount} Slot (±{row.toleranceMinutes} dk)
                        </td>
                        <td className="py-2 px-3 text-slate-600">{row.lastClean || '-'}</td>
                        <td className="py-2 px-3 text-slate-600">{row.lastAudit || '-'}</td>
                        <td className="py-2 px-3">
                          {row.incidentStatus === 'NORMAL' && (
                            <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">Normal</span>
                          )}
                          {row.incidentStatus === 'DISPATCHED' && (
                            <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 animate-pulse">
                              Müdahale Bekliyor
                            </span>
                          )}
                          {row.incidentStatus === 'ESCALATED' && (
                            <span className="px-2 py-0.5 rounded font-bold bg-rose-200 text-rose-900 animate-pulse">
                              Eskalasyonda!
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ADMİN SEKME 5: SİSTEM DENETİM İZİ (AUDIT TRAIL) */}
            {adminSubTab === 'audit' && dashboard && (
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm overflow-x-auto space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fa-solid fa-clock-rotate-left text-slate-500"></i> Sistem Güvenlik ve Denetim İzi (Audit Trail)
                  </h3>
                  <a
                    href="/api/reports/export-csv"
                    target="_blank"
                    rel="noreferrer"
                    className="bg-slate-800 hover:bg-slate-900 text-white font-medium px-2.5 py-1 rounded text-[11px] flex items-center gap-1 shadow-sm"
                  >
                    <i className="fa-solid fa-file-csv text-emerald-400"></i> Tüm Logları CSV İndir
                  </a>
                </div>
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Zaman</th>
                      <th className="py-2 px-3">Eylem</th>
                      <th className="py-2 px-3">Kullanıcı Rolü</th>
                      <th className="py-2 px-3">İşlem Özeti / Güvenlik Detayı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboard.auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-slate-600">{log.timestamp}</td>
                        <td className="py-2 px-3 font-bold text-[11px] text-slate-800">{log.action}</td>
                        <td className="py-2 px-3 text-slate-600">{log.userRole}</td>
                        <td className="py-2 px-3 text-slate-600 text-[11px]">{log.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODALLAR */}
      {/* 1. Şef Planlayıcı Modalı */}
      {plannerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-purple-800 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <i className="fa-solid fa-sliders"></i> Plan ve Tolerans Parametreleri
                </h3>
                <p className="text-[11px] text-purple-200">{curLocation?.name}</p>
              </div>
              <button onClick={() => setPlannerOpen(false)} className="text-white hover:text-purple-200 text-lg">
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <i className="fa-solid fa-stopwatch text-amber-700"></i> Süre Sapma Toleransı (Dakika):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={workingTolerance}
                    onChange={(e) => setWorkingTolerance(Number(e.target.value) || 15)}
                    className="w-16 bg-white border border-amber-300 rounded-lg p-1 text-xs text-center font-bold text-amber-900 outline-none"
                  />
                </div>
              </div>

              <div className="bg-purple-50 p-3 rounded-xl border border-purple-200">
                <span className="text-[11px] font-bold text-purple-900 block mb-1.5">⚡ Hızlı Saat Şablonları:</span>
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setWorkingSchedule(['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'])}
                    className="bg-white border border-purple-300 text-purple-800 font-semibold py-1.5 rounded hover:bg-purple-100"
                  >
                    2 Saatte Bir<br />(08 - 20)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkingSchedule(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'])}
                    className="bg-white border border-purple-300 text-purple-800 font-semibold py-1.5 rounded hover:bg-purple-100"
                  >
                    1 Saatte Bir<br />(08 - 18)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkingSchedule(['09:00', '14:00', '19:00'])}
                    className="bg-white border border-purple-300 text-purple-800 font-semibold py-1.5 rounded hover:bg-purple-100"
                  >
                    3 Vardiya<br />(09, 14, 19)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Yeni Saat Ekle:</label>
                  <input
                    type="time"
                    value={newTimeInput}
                    onChange={(e) => setNewTimeInput(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-800"
                  />
                </div>
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (!workingSchedule.includes(newTimeInput)) {
                        setWorkingSchedule([...workingSchedule, newTimeInput].sort());
                      }
                    }}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1 shadow"
                  >
                    <i className="fa-solid fa-plus"></i> Ekle
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">Planlanan Saatler:</span>
                  <span className="text-[11px] text-purple-700 font-bold">{workingSchedule.length} Slot</span>
                </div>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[60px]">
                  {workingSchedule.map((timeStr, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1.5 bg-purple-100 border border-purple-300 text-purple-900 font-bold px-2.5 py-1 rounded-lg text-xs shadow-sm"
                    >
                      <i className="fa-regular fa-clock text-purple-700"></i>
                      <span>{timeStr}</span>
                      <button
                        type="button"
                        onClick={() => setWorkingSchedule(workingSchedule.filter((_, i) => i !== idx))}
                        className="ml-1 text-purple-400 hover:text-rose-600 font-black"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-3 flex items-center justify-between border-t border-slate-200">
              <button onClick={() => setPlannerOpen(false)} className="text-xs text-slate-500 hover:text-slate-700 font-semibold">
                Vazgeç
              </button>
              <button
                onClick={handleSavePlanner}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-5 rounded-lg flex items-center gap-1.5 shadow"
              >
                <i className="fa-solid fa-floppy-disk"></i> Plan ve Toleransı Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Misafir Saat Listesi Modalı */}
      {guestScheduleOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-emerald-600 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Bugünkü Temizlik Saatleri</h3>
                <p className="text-[11px] text-emerald-100">{curLocation?.name}</p>
              </div>
              <button onClick={() => setGuestScheduleOpen(false)} className="text-white hover:text-emerald-200 text-lg">
                ✕
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              <p className="text-xs text-slate-500 mb-3">
                Bu mahalde bugün gerçekleştirilen temizlik saatleri kronolojik olarak aşağıdadır:
              </p>
              <div className="space-y-2">
                {status?.todayCleanings && status.todayCleanings.length > 0 ? (
                  status.todayCleanings.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs"
                    >
                      <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                        <i className="fa-solid fa-check text-emerald-600"></i> Temizlik Yapıldı
                      </span>
                      <span className="font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-300">
                        {c.time}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic">Bugün henüz temizlik beyanı girilmemiştir.</p>
                )}
              </div>
            </div>
            <div className="bg-slate-50 p-3 text-right">
              <button
                onClick={() => setGuestScheduleOpen(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Önceki Temizlikler Modalı (Personel ve Şef için) */}
      {staffPastOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Önceki Temizlik Kayıtları</h3>
                <p className="text-[11px] text-blue-100">{curLocation?.name}</p>
              </div>
              <button onClick={() => setStaffPastOpen(false)} className="text-white hover:text-blue-200 text-lg">
                ✕
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto space-y-2">
              {supervisorStatus?.recentCleanings && supervisorStatus.recentCleanings.length > 0 ? (
                supervisorStatus.recentCleanings.map((l) => (
                  <div key={l.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-800 text-sm font-bold">{l.staffName}</strong>
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {l.actualTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>Hedef Slot: {l.plannedSlot}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          l.slaStatus === 'ON_TIME'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : l.slaStatus === 'LATE' || l.slaStatus === 'NOT_DONE'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {l.slaStatus === 'ON_TIME'
                          ? '✓ Zamanında'
                          : l.slaStatus === 'LATE'
                          ? '⚠️ Gecikmeli'
                          : l.slaStatus === 'EARLY'
                          ? 'ℹ️ Erken'
                          : l.slaStatus}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 italic">Geçmiş temizlik beyanı bulunmuyor.</p>
              )}
            </div>
            <div className="bg-slate-50 p-3 text-right">
              <button
                onClick={() => setStaffPastOpen(false)}
                className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold py-1.5 px-4 rounded-lg"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Planlanan Saatler Modalı */}
      {staffScheduleOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-indigo-700 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Günlük Planlanan Temizlik Saatleri</h3>
                <p className="text-[11px] text-indigo-100">{curLocation?.name}</p>
              </div>
              <button onClick={() => setStaffScheduleOpen(false)} className="text-white hover:text-indigo-200 text-lg">
                ✕
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">Planlanan Saat</th>
                    <th className="py-2 px-2.5">Tolerans</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {curLocation?.schedule?.map((slot, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2.5 font-bold font-mono text-slate-800">{slot}</td>
                      <td className="py-2.5 px-2.5 text-slate-600">±{curLocation.toleranceMinutes} dk</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 p-3 text-right">
              <button
                onClick={() => setStaffScheduleOpen(false)}
                className="bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold py-1.5 px-4 rounded-lg"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Yazdırılabilir Opaque QR Modal */}
      {showQr && curLocation && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl border border-slate-200 p-6 text-center space-y-4">
            <h3 className="font-bold text-sm text-slate-800">{curLocation.name}</h3>
            <p className="text-xs text-slate-500 font-mono">{curLocation.code}</p>
            <div className="p-3 bg-white border-2 border-dashed border-slate-300 rounded-xl inline-block">
              <QRCodeSVG value={qrUrl} size={180} />
            </div>
            <p className="text-[11px] text-slate-500">
              Bu etiketi yazdırıp WC mahali girişine asınız.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.print()}
                className="bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
              >
                Yazdır
              </button>
              <button
                onClick={() => setShowQr(false)}
                className="bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Admin Yeni WC Mahali Tanımlama Modalı */}
      {adminModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-emerald-800 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <i className="fa-solid fa-plus-circle text-emerald-300"></i> Yeni WC Noktası ve QR Kod Tanımla
                </h3>
                <p className="text-[11px] text-emerald-200">
                  Otomatik kriptografik opaque token üretilir ve sahada kullanılabilir QR kod hazırlanır.
                </p>
              </div>
              <button
                onClick={() => setAdminModalOpen(false)}
                className="text-white hover:text-emerald-200 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLocation} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mahal Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="Örn: Terminal 1 - Zemin Kat Erkek WC"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Mahal Kodu (İsteğe Bağlı)
                  </label>
                  <input
                    type="text"
                    value={newLocCode}
                    onChange={(e) => setNewLocCode(e.target.value)}
                    placeholder="Örn: WC-T1-Z-01"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Boş bırakılırsa otomatik üretilir.</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Bina / Bölüm
                  </label>
                  <input
                    type="text"
                    value={newLocBuilding}
                    onChange={(e) => setNewLocBuilding(e.target.value)}
                    placeholder="Örn: Terminal 1 veya Ana Bina"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Süre Sapma Toleransı (Dakika)
                  </label>
                  <select
                    value={newLocTolerance}
                    onChange={(e) => setNewLocTolerance(Number(e.target.value))}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
                  >
                    <option value={10}>±10 Dakika</option>
                    <option value={15}>±15 Dakika (Standart)</option>
                    <option value={20}>±20 Dakika</option>
                    <option value={30}>±30 Dakika</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Temizlik Saat Planı Şablonu
                  </label>
                  <select
                    value={newLocPreset}
                    onChange={(e) => setNewLocPreset(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
                  >
                    <option value="2hour">2 Saatte Bir (7 Slot: 08:00 - 20:00)</option>
                    <option value="1hour">Saat Başı (11 Slot: 08:00 - 18:00)</option>
                    <option value="3shift">Günde 3 Kez (09:00, 14:00, 19:00)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nöbetçi Şef
                  </label>
                  <input
                    type="text"
                    value={newLocSup}
                    onChange={(e) => setNewLocSup(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Yedek Şef (Eskalasyon)
                  </label>
                  <input
                    type="text"
                    value={newLocBackupSup}
                    onChange={(e) => setNewLocBackupSup(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                <i className="fa-solid fa-qrcode text-emerald-600 mr-1.5"></i>
                Kaydet butonuna tıkladığınızda mahal oluşturulacak ve anında yazdırılabilir yüksek çözünürlüklü QR etiket kartı açılacaktır.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdminModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold py-2 px-5 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-check"></i> Kaydet ve QR Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Yüksek Çözünürlüklü Yazdırılabilir QR Etiketi Modalı (Printable Sticker) */}
      {printStickerModalOpen && stickerLoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between no-print">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <i className="fa-solid fa-print text-emerald-400"></i> Saha QR Etiketi
                </h3>
                <p className="text-[11px] text-slate-400">{stickerLoc.name}</p>
              </div>
              <button
                onClick={() => setPrintStickerModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            {/* Fiziksel Yazdırılabilir Etiket Kartı */}
            <div className="p-6 flex flex-col items-center justify-center text-center space-y-4 printable-qr-card bg-white">
              <div className="border-b-2 border-slate-900 pb-2 w-full">
                <div className="text-[11px] uppercase tracking-widest font-black text-slate-700">
                  AKILLI WC HİJYEN &amp; GERİ BİLDİRİM SİSTEMİ
                </div>
                <h2 className="text-base font-black text-slate-900 mt-1">{stickerLoc.name}</h2>
                <div className="text-xs text-slate-600 font-medium">
                  {stickerLoc.building || 'Tesis'} • <span className="font-mono font-bold">{stickerLoc.code}</span>
                </div>
              </div>

              {/* QR Kod SVG */}
              <div className="p-3 bg-white border-4 border-slate-900 rounded-2xl inline-block shadow-sm">
                <QRCodeSVG
                  value={`${window.location.origin}/q/${stickerLoc.token}`}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 w-full text-left space-y-1 text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <i className="fa-solid fa-mobile-screen-button text-emerald-600"></i> Ziyaretçiler:
                </div>
                <p className="text-[11px] text-slate-600">
                  Kameranızla okutarak son temizlik saatini görebilir ve 1 tıkla memnuniyet bildirebilirsiniz.
                </p>
                <div className="font-bold text-slate-800 flex items-center gap-1.5 pt-1 border-t border-slate-200">
                  <i className="fa-solid fa-id-badge text-blue-600"></i> Personel &amp; Şef:
                </div>
                <p className="text-[11px] text-slate-600">
                  Kameranızla okutarak temizlik onayını ve rutin denetim formunu doldurunuz.
                </p>
              </div>

              <div className="w-full text-center">
                <code className="text-[10px] text-slate-500 font-mono block">
                  {window.location.origin}/q/{stickerLoc.token}
                </code>
                <span className="text-[9px] text-slate-400 block mt-1">
                  Güvenli Opaque Token Mimarisi • KVKK Uyumlu
                </span>
              </div>
            </div>

            {/* Butonlar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => setPrintStickerModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-5 rounded-lg shadow flex items-center gap-2"
              >
                <i className="fa-solid fa-print"></i> Etiketi Yazdır (Print)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Kullanıcı Giriş & Kayıt Ol Modalı */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            {/* Modal Başlığı & Sekmeler */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-shield-halved text-emerald-400 text-lg"></i>
                <h3 className="font-bold text-sm">
                  {authTab === 'login' ? 'Kullanıcı Girişi' : 'Yeni Kullanıcı Kaydı'}
                </h3>
              </div>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            {/* Tab Seçimi */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setAuthTab('login')}
                className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition ${
                  authTab === 'login'
                    ? 'border-emerald-600 text-emerald-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <i className="fa-solid fa-right-to-bracket mr-1.5"></i> Giriş Yap
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('register')}
                className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition ${
                  authTab === 'register'
                    ? 'border-emerald-600 text-emerald-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <i className="fa-solid fa-user-plus mr-1.5"></i> Kayıt Ol
              </button>
            </div>

            {/* 1. GİRİŞ YAP FORMU */}
            {authTab === 'login' ? (
              <form onSubmit={handleLogin} className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Kullanıcı Adı
                  </label>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Örn: kemal veya ahmet"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Şifre
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-right-to-bracket"></i> Giriş Yap
                </button>

                {/* Hızlı Demo Giriş Seçenekleri */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2 text-center">
                    Hızlı Demo Giriş Seçenekleri
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginUsername('admin');
                        setLoginPassword('admin123');
                      }}
                      className="p-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-left text-[11px] transition"
                    >
                      <strong className="block text-amber-900 font-bold">👑 Admin</strong>
                      <span className="text-amber-700 font-mono text-[9px]">admin / admin123</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginUsername('kemal');
                        setLoginPassword('kemal123');
                      }}
                      className="p-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-left text-[11px] transition"
                    >
                      <strong className="block text-purple-900 font-bold">👔 Kemal Şef</strong>
                      <span className="text-purple-600 font-mono text-[9px]">kemal / kemal123</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginUsername('ahmet');
                        setLoginPassword('ahmet123');
                      }}
                      className="p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left text-[11px] transition"
                    >
                      <strong className="block text-blue-900 font-bold">🧹 Ahmet</strong>
                      <span className="text-blue-600 font-mono text-[9px]">ahmet / ahmet123</span>
                    </button>
                  </div>
                </div>

                <div className="text-center pt-1">
                  <span className="text-xs text-slate-500">Hesabınız yok mu? </span>
                  <button
                    type="button"
                    onClick={() => setAuthTab('register')}
                    className="text-xs text-emerald-700 hover:underline font-bold"
                  >
                    Kayıt Olun
                  </button>
                </div>
              </form>
            ) : (
              /* 2. KAYIT OL FORMU */
              <form onSubmit={handleRegister} className="p-5 space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Adı Soyadı <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Örn: Ayşe Yılmaz"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Kullanıcı Adı <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="Örn: ayseyilmaz"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Şifre <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="En az 8 karakter"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-0.5">
                    <i className="fa-solid fa-broom text-blue-600"></i>
                    <span>Başlangıç Rolü: Temizlik Personeli</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Açık kayıtlar güvenlik kuralı gereği Personel olarak başlar. Şef veya Admin yetkileri sistem yöneticisi tarafından atanır.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-user-check"></i> Kayıt Ol ve Giriş Yap
                </button>

                <div className="text-center pt-1">
                  <span className="text-xs text-slate-500">Zaten hesabınız var mı? </span>
                  <button
                    type="button"
                    onClick={() => setAuthTab('login')}
                    className="text-xs text-emerald-700 hover:underline font-bold"
                  >
                    Giriş Yapın
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 9. Admin Yeni Kullanıcı Ekleme Modalı */}
      {adminUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-purple-800 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-user-plus text-purple-300"></i>
                <h3 className="font-bold text-sm">Yeni Kullanıcı / Personel Tanımla</h3>
              </div>
              <button
                onClick={() => setAdminUserModalOpen(false)}
                className="text-white hover:text-purple-200 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdminCreateUser} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Adı Soyadı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={adminUserFullName}
                  onChange={(e) => setAdminUserFullName(e.target.value)}
                  placeholder="Örn: Zeynep Demir"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Kullanıcı Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={adminUserUsername}
                  onChange={(e) => setAdminUserUsername(e.target.value)}
                  placeholder="Örn: zeynep"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Giriş Şifresi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={adminUserPassword}
                  onChange={(e) => setAdminUserPassword(e.target.value)}
                  placeholder="En az 4 karakter"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Kullanıcı Rolü & Yetkisi
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label
                    className={`p-2 border rounded-xl cursor-pointer flex flex-col items-center justify-center text-center text-xs transition ${
                      adminUserRole === 'employee'
                        ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adminUserRole"
                      checked={adminUserRole === 'employee'}
                      onChange={() => setAdminUserRole('employee')}
                      className="mb-1"
                    />
                    <span>🧹 Personel</span>
                  </label>

                  <label
                    className={`p-2 border rounded-xl cursor-pointer flex flex-col items-center justify-center text-center text-xs transition ${
                      adminUserRole === 'supervisor'
                        ? 'border-purple-500 bg-purple-50 text-purple-900 font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adminUserRole"
                      checked={adminUserRole === 'supervisor'}
                      onChange={() => setAdminUserRole('supervisor')}
                      className="mb-1"
                    />
                    <span>👔 Şef</span>
                  </label>

                  <label
                    className={`p-2 border rounded-xl cursor-pointer flex flex-col items-center justify-center text-center text-xs transition ${
                      adminUserRole === 'admin'
                        ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adminUserRole"
                      checked={adminUserRole === 'admin'}
                      onChange={() => setAdminUserRole('admin')}
                      className="mb-1"
                    />
                    <span>👑 Admin</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdminUserModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-bold py-2 px-5 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-check"></i> Kullanıcıyı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
