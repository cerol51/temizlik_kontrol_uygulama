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

  // Personel Rutin Temizlik Modalı
  const [staffChecklistModalOpen, setStaffChecklistModalOpen] = useState(false);

  // Şef Çoklu Mahal & Olay Takip Filtreleri
  const [incidentFilterLoc, setIncidentFilterLoc] = useState<string>('all');
  const [incidentFilterStatus, setIncidentFilterStatus] = useState<string>('all');
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);

  // Şef Modalleri & Fotoğraf Büyütme
  const [supervisorAuditModalOpen, setSupervisorAuditModalOpen] = useState(false);
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null);

  // Personel Müdahale Fotoğrafı & Notu
  const [staffPhotoBase64, setStaffPhotoBase64] = useState('');
  const [staffResolveNote, setStaffResolveNote] = useState('');

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

  // Tüm Mahallerden Olay & Kötü Anket Bildirimlerini Yükleme (Çoklu Mahal Takibi)
  const loadIncidents = useCallback(async () => {
    try {
      const token = await accessToken();
      const data = await api<Incident[]>('/incidents', token);
      setAllIncidents(data);
    } catch (e) {
      // fallback to dashboard if endpoint not available
    }
  }, [accessToken]);

  // Yönetim Paneli Yükleme
  const loadDashboard = useCallback(async () => {
    try {
      const token = await accessToken();
      const data = await api<DashboardData>('/reports/dashboard', token);
      setDashboard(data);
      if (data?.allIncidents && data.allIncidents.length > 0) {
        setAllIncidents(data.allIncidents);
      }
    } catch (e) {
      console.warn('Dashboard load error:', e);
    }
  }, [accessToken]);

  useEffect(() => {
    if (activeTab === 'supervisor' || activeTab === 'employee' || activeTab === 'admin' || role === 'supervisor' || role === 'employee' || role === 'admin') {
      void loadDashboard();
      void loadIncidents();
      const interval = setInterval(() => {
        void loadDashboard();
        void loadIncidents();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab, role, loadDashboard, loadIncidents]);

  // Rol İzolasyonu: Misafir -> sadece anket, Personel -> sadece personel, Şef -> sadece şef
  useEffect(() => {
    if (!role) {
      if (activeTab !== 'guest') setActiveTab('guest');
    } else if (role === 'employee') {
      if (activeTab !== 'employee') setActiveTab('employee');
    } else if (role === 'supervisor') {
      if (activeTab !== 'supervisor') setActiveTab('supervisor');
    } else if (role === 'admin') {
      if (activeTab !== 'admin') setActiveTab('admin');
    }
  }, [role, activeTab]);

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

  // Fotoğraf Seçimi & Canvas ile İstemci Tarafı Optimize Edici (Maks 800px, JPEG 0.8)
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

  // 3. Personel Acil Bilet Müdahalesini Fotoğraflı Tamamlama
  const handleStaffResolve = async (incidentId: string) => {
    try {
      setBusy(true);
      const token = await accessToken();
      await api(`/incidents/${incidentId}/staff-resolve`, token, {
        method: 'POST',
        body: JSON.stringify({
          note: staffResolveNote.trim() || staffNote.trim() || 'Sorun giderildi, sarf ikmali yapıldı.',
          photoUrl: staffPhotoBase64 || undefined,
        }),
      });
      setNotice({ text: '📸 Müdahale fotoğraflı olarak tamamlandı ve Şef onayına gönderildi!' });
      setStaffPhotoBase64('');
      setStaffResolveNote('');
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
      const formattedChecklist = CHECKLIST_ITEMS_V12.map((label, idx) => ({
        id: idx + 1,
        label,
        isOk: checklistAnswers[idx] ?? true,
      }));
      const failedItems = formattedChecklist.filter(c => !c.isOk).map(c => c.label);
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
            templateVersion: 'v1.2',
          }),
        },
      );
      if (!effectiveIsApproved) {
        const issuesSummary = failedItems.length > 0 ? failedItems.join(', ') : 'Denetim Uygunsuzluğu';
        setNotice({
          text: `Uygunsuzluk kaydedildi! Tespit edilen maddeler (${issuesSummary}) personele müdahale etmesi için otomatik olarak iletildi (${res.correctiveIncident?.id || 'Aktif Görev'})!`,
          bad: true,
        });
      } else {
        setNotice({ text: 'Denetim eksiksiz olarak onaylandı!' });
      }
      setAuditNote('');
      void loadStatus();
      void loadDashboard();
      void loadIncidents();
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
          {/* 1. MİSAFİR MODUNDA HEADER */}
          {!role && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-teal-400 font-black text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-restroom"></i> Akıllı WC Memnuniyet Anketi
                </span>
                <span className="text-slate-500 hidden sm:inline">|</span>
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <i className="fa-solid fa-location-dot"></i> Mahal:
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
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 text-xs"
                  title="Kamera ile QR Tara"
                >
                  <i className="fa-solid fa-camera"></i> QR Tara
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-xs">
                  {currentTime}
                </span>
                <button
                  onClick={() => {
                    setAuthTab('login');
                    setAuthModalOpen(true);
                  }}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow flex items-center gap-1.5 transition"
                  title="Personel veya Şef Girişi Yap"
                >
                  <i className="fa-solid fa-right-to-bracket"></i> Personel / Şef Girişi
                </button>
              </div>
            </>
          )}

          {/* 2. PERSONEL MODUNDA HEADER */}
          {role === 'employee' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-blue-400 font-black text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-broom"></i> Personel Saha Görev Ekranı
                </span>
                <span className="text-slate-500 hidden sm:inline">|</span>
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <i className="fa-solid fa-location-dot"></i> Mahal:
                </span>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="bg-slate-800 text-blue-300 font-semibold px-2 py-1 rounded border border-slate-700 text-xs focus:ring-1 focus:ring-blue-400 outline-none"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-xs hidden sm:inline">
                  {currentTime}
                </span>
                <span className="bg-blue-950 text-blue-300 px-2.5 py-1 rounded text-xs flex items-center gap-1.5 border border-blue-800 font-bold">
                  <i className="fa-solid fa-user"></i> {currentUser?.fullName || 'Personel'} (🧹 Görevli)
                </span>
                <button
                  onClick={handleLogout}
                  className="bg-rose-800/80 hover:bg-rose-700 text-white px-2.5 py-1 rounded text-xs transition flex items-center gap-1 font-semibold"
                  title="Oturumu Kapat"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket"></i> Çıkış
                </button>
              </div>
            </>
          )}

          {/* 3. ŞEF MODUNDA HEADER */}
          {role === 'supervisor' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-purple-400 font-black text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-user-tie"></i> Şef Denetim &amp; Operasyon Portalı
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-xs hidden sm:inline">
                  {currentTime}
                </span>
                <span className="bg-purple-950 text-purple-300 px-2.5 py-1 rounded text-xs flex items-center gap-1.5 border border-purple-800 font-bold">
                  <i className="fa-solid fa-user-tie"></i> {currentUser?.fullName || 'Şef'} (👔 Nöbetçi Şef)
                </span>
                <button
                  onClick={handleLogout}
                  className="bg-rose-800/80 hover:bg-rose-700 text-white px-2.5 py-1 rounded text-xs transition flex items-center gap-1 font-semibold"
                  title="Oturumu Kapat"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket"></i> Çıkış
                </button>
              </div>
            </>
          )}

          {/* 4. ADMİN MODUNDA HEADER */}
          {role === 'admin' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-black text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-crown"></i> Yönetim Portalı (Admin)
                </span>
                <button
                  onClick={() => setAdminModalOpen(true)}
                  className="bg-purple-700 hover:bg-purple-600 text-white font-bold px-2.5 py-1 rounded border border-purple-500 shadow-sm flex items-center gap-1.5"
                  title="Yeni WC Noktası Ekle & QR Kod Üret"
                >
                  <i className="fa-solid fa-plus-circle"></i> WC Ekle
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="bg-amber-950 text-amber-300 px-2.5 py-1 rounded text-xs flex items-center gap-1.5 border border-amber-800 font-bold">
                  👑 {currentUser?.fullName || 'Admin'}
                </span>
                <button
                  onClick={handleLogout}
                  className="bg-rose-800/80 hover:bg-rose-700 text-white px-2.5 py-1 rounded text-xs transition flex items-center gap-1 font-semibold"
                  title="Oturumu Kapat"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket"></i> Çıkış
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* SADECE ADMİN İÇİN ALT YÖNETİM SEKMELERİ */}
      {role === 'admin' && (
        <nav className="bg-slate-800/95 backdrop-blur border-b border-slate-700/80 sticky top-[53px] z-40 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setAdminSubTab('overview')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  adminSubTab === 'overview'
                    ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <i className="fa-solid fa-chart-line"></i> Genel Bakış &amp; SLA
              </button>
              <button
                type="button"
                onClick={() => setAdminSubTab('locations')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  adminSubTab === 'locations'
                    ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <i className="fa-solid fa-map-location-dot"></i> Mahal Yönetimi
              </button>
              <button
                type="button"
                onClick={() => setAdminSubTab('users')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  adminSubTab === 'users'
                    ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <i className="fa-solid fa-users-gear"></i> Kullanıcılar &amp; Roller
              </button>
              <button
                type="button"
                onClick={() => setAdminSubTab('matrix')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  adminSubTab === 'matrix'
                    ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <i className="fa-solid fa-table-cells"></i> Operasyon Matrisi
              </button>
            </div>
          </div>
        </nav>
      )}

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
                    <p className="text-xs text-emerald-700">Geri bildiriminiz ilgili yöneticiye iletilmiştir.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. ROL GÖRÜNÜMÜ: PERSONEL MODÜLÜ (SADE & CHECKLIST BUTONLU) */}
        {/* ======================================================== */}
        {activeTab === 'employee' && (() => {
          const effectiveIncidents = allIncidents.length > 0 ? allIncidents : (dashboard?.allIncidents || supervisorStatus?.activeIncidents || []);
          const staffAssignedTasks = effectiveIncidents.filter(
            (inc) => inc.locationId === selectedId && (inc.status === 'DISPATCHED' || inc.status === 'OPEN')
          );

          return (
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
              {/* Personel Başlığı */}
              <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl border border-white/20">
                      <i className="fa-solid fa-broom text-blue-200"></i>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-blue-500/40 px-2 py-0.5 rounded">
                        Saha Operasyon
                      </span>
                      <h2 className="text-xl font-black mt-0.5">{curLocation?.name}</h2>
                      <p className="text-xs text-blue-100 font-mono">
                        {curLocation?.code} — {curLocation?.building}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-xs bg-black/25 px-2.5 py-1 rounded border border-white/20">
                    {currentTime.substring(0, 5)}
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* 1. ŞEFTEN GELEN GÖREVLER & UYGUNSUZLUKLAR (DOĞRU & MERKEZİ TAKİP) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <i className="fa-solid fa-bell text-rose-600 animate-bounce"></i>
                      Şef Tarafından Atanan Görevler &amp; Bildirimler
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      staffAssignedTasks.length > 0
                        ? 'bg-rose-100 text-rose-800 animate-pulse'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {staffAssignedTasks.length > 0 ? `${staffAssignedTasks.length} Aktif Görev` : 'Görev Yok'}
                    </span>
                  </div>

                  {staffAssignedTasks.length > 0 ? (
                    staffAssignedTasks.map((task) => {
                      const isNonConformity = task.issuesJson?.some((iss) => iss.startsWith('❌') || iss.includes('Denetim'));
                      return (
                        <div
                          key={task.id}
                          className="p-4 bg-amber-50/90 border-2 border-amber-400 rounded-2xl space-y-3 shadow-md"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className={`px-2 py-0.5 rounded font-black text-[10px] flex items-center gap-1 ${
                              isNonConformity ? 'bg-purple-200 text-purple-900' : 'bg-rose-200 text-rose-900'
                            }`}>
                              <i className={`fa-solid ${isNonConformity ? 'fa-clipboard-question' : 'fa-triangle-exclamation'}`}></i>
                              {isNonConformity ? 'ŞEF DENETİM UYGUNSUZLUĞU' : 'ZİYARETÇİ KÖTÜ ANKETİ'}
                            </span>
                            <span className="font-mono text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">
                              {task.id} • {task.time}
                            </span>
                          </div>

                          <div className="bg-white p-3 rounded-xl border border-amber-200 space-y-1 text-xs">
                            <span className="text-slate-500 block text-[11px] font-bold">Müdahale Edilecek Konular:</span>
                            <div className="font-bold text-rose-900 text-xs">
                              {task.issuesJson?.join(', ') || 'Genel Temizlik İhtiyacı'}
                            </div>
                            {task.resolutionNote && (
                              <p className="text-[11px] text-purple-800 italic pt-1 border-t border-slate-100">
                                {task.resolutionNote}
                              </p>
                            )}
                          </div>

                          {/* Fotoğraf Ekleme Alanı */}
                          <div className="space-y-2 pt-1 border-t border-amber-200">
                            <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                              <i className="fa-solid fa-camera text-blue-600"></i>
                              Müdahale Kanıt Fotoğrafı Ekleyiniz:
                            </label>

                            <div className="flex items-center gap-2">
                              <label className="flex-1 bg-white hover:bg-slate-50 border-2 border-dashed border-amber-400 rounded-xl p-2.5 text-center cursor-pointer transition flex items-center justify-center gap-2 text-xs font-bold text-amber-900 shadow-sm">
                                <i className="fa-solid fa-camera text-base text-amber-600"></i>
                                <span>{staffPhotoBase64 ? '✓ Fotoğraf Yüklendi (Değiştir)' : 'Fotoğraf Çek / Dosya Seç'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={handlePhotoSelect}
                                  className="hidden"
                                />
                              </label>
                              {staffPhotoBase64 && (
                                <div className="relative">
                                  <img
                                    src={staffPhotoBase64}
                                    alt="Önizleme"
                                    onClick={() => setViewPhotoUrl(staffPhotoBase64)}
                                    className="w-12 h-12 object-cover rounded-xl border-2 border-amber-500 cursor-pointer shadow"
                                    title="Büyütmek için tıklayınız"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setStaffPhotoBase64('')}
                                    className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center shadow font-bold"
                                    title="Fotoğrafı Kaldır"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>

                            <div>
                              <input
                                type="text"
                                value={staffResolveNote}
                                onChange={(e) => setStaffResolveNote(e.target.value)}
                                placeholder="Yapılan müdahale notu (örn: Sabun takviye edildi, zemin kurulandı)..."
                                className="w-full text-xs p-2.5 bg-white border border-amber-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                              />
                            </div>

                            <button
                              disabled={busy}
                              onClick={async () => {
                                await handleStaffResolve(task.id);
                                void loadIncidents();
                              }}
                              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md flex items-center justify-center gap-2 transition"
                            >
                              <i className="fa-solid fa-camera"></i>
                              Fotoğrafla Müdahaleyi Tamamla ve Görevi Kapat
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                      <span className="flex items-center gap-2 font-bold">
                        <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
                        Şu anda şeften atanmış acil görev veya denetim uygunsuzluğu yok
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">
                        Rutin Mod
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. SADE EYLEM BUTONLARI (ŞEF EKRANI GİBİ SADE) */}
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  {/* Buton 1: Rutin Temizlik Checklist'i Yap */}
                  <button
                    type="button"
                    onClick={() => setStaffChecklistModalOpen(true)}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black py-4 px-5 rounded-2xl shadow-lg transition flex items-center justify-between text-sm group"
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                        <i className="fa-solid fa-list-check"></i>
                      </span>
                      <span className="text-left">
                        <span className="block font-black text-sm">📋 Rutin Temizlik Checklist'i Yap</span>
                        <span className="block text-[11px] text-blue-200 font-normal">
                          4 maddelik temizlik checklistini doldur ve beyan oluştur
                        </span>
                      </span>
                    </span>
                    <i className="fa-solid fa-chevron-right text-blue-200 group-hover:translate-x-1 transition"></i>
                  </button>

                  {/* Buton 2 & 3: Planlanan & Geçmiş Saatler */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setStaffScheduleOpen(true)}
                      className="py-3 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition shadow-sm"
                    >
                      <i className="fa-solid fa-calendar-days text-indigo-600"></i> Planlanan Saatler
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaffPastOpen(true)}
                      className="py-3 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition shadow-sm"
                    >
                      <i className="fa-solid fa-clock-rotate-left text-blue-600"></i> Geçmiş Temizlikler
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ======================================================== */}
        {/* 3. ROL GÖRÜNÜMÜ: ŞEF MODÜLÜ (ÇOKLU MAHAL ANKET TAKİPLİ)    */}
        {/* ======================================================== */}
        {activeTab === 'supervisor' && (() => {
          const effectiveIncidents = allIncidents.length > 0 ? allIncidents : (dashboard?.allIncidents || supervisorStatus?.activeIncidents || []);
          const activeAll = effectiveIncidents.filter((i) => i.status !== 'VERIFIED_CLOSED');
          const filteredIncidents = activeAll.filter((inc) => {
            if (incidentFilterLoc !== 'all' && inc.locationId !== incidentFilterLoc) return false;
            if (incidentFilterStatus !== 'all' && inc.status !== incidentFilterStatus) return false;
            return true;
          });

          const openCount = activeAll.filter((i) => i.status === 'OPEN').length;
          const dispatchedCount = activeAll.filter((i) => i.status === 'DISPATCHED').length;
          const resolvedCount = activeAll.filter((i) => i.status === 'RESOLVED_BY_STAFF').length;

          return (
            <div className="w-full max-w-2xl space-y-4">
              {/* 1. EN ÜSTTE: ÇOKLU MAHAL ANKET & UYGUNSUZLUK BİLDİRİM MERKEZİ */}
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-800 text-white p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <i className="fa-solid fa-bell text-rose-400 text-lg animate-pulse"></i>
                    <div>
                      <h3 className="text-sm font-black tracking-wide">🚨 ANKET &amp; UYGUNSUZLUK BİLDİRİM EKRANI</h3>
                      <p className="text-[11px] text-purple-200">Tüm mahallerden gelen canlı şikayet ve olay masası</p>
                    </div>
                  </div>
                  <span className="bg-rose-600 text-white font-black px-2.5 py-1 rounded-full text-xs shadow">
                    {activeAll.length} Canlı Bildirim
                  </span>
                </div>

                {/* Filtreleme ve Özet Çubuğu */}
                <div className="p-4 space-y-3 border-b border-slate-100 bg-slate-50/70">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setIncidentFilterStatus('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        incidentFilterStatus === 'all'
                          ? 'bg-purple-700 text-white shadow'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Tümü ({activeAll.length})
                    </button>
                    <button
                      onClick={() => setIncidentFilterStatus('OPEN')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        incidentFilterStatus === 'OPEN'
                          ? 'bg-rose-600 text-white shadow'
                          : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                      }`}
                    >
                      🚨 Bekleyen ({openCount})
                    </button>
                    <button
                      onClick={() => setIncidentFilterStatus('DISPATCHED')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        incidentFilterStatus === 'DISPATCHED'
                          ? 'bg-amber-600 text-white shadow'
                          : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      🏃 Müdahalede ({dispatchedCount})
                    </button>
                    <button
                      onClick={() => setIncidentFilterStatus('RESOLVED_BY_STAFF')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        incidentFilterStatus === 'RESOLVED_BY_STAFF'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                      }`}
                    >
                      📸 Fotoğraflı Onay ({resolvedCount})
                    </button>
                  </div>

                  {/* Çoklu Alan / Mahal Seçici Filtresi */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                      <i className="fa-solid fa-filter text-purple-600 mr-1"></i> Mahal Filtresi:
                    </span>
                    <select
                      value={incidentFilterLoc}
                      onChange={(e) => setIncidentFilterLoc(e.target.value)}
                      className="flex-1 bg-white border border-purple-200 rounded-lg p-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      <option value="all">🏢 Tüm Mahaller &amp; Alanlar ({activeAll.length} Bildirim)</option>
                      {locations.map((loc) => {
                        const count = activeAll.filter((i) => i.locationId === loc.id).length;
                        return (
                          <option key={loc.id} value={loc.id}>
                            {loc.name} ({loc.code}) {count > 0 ? `— 🚨 ${count} Bildirim` : '— Temiz'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {filteredIncidents.length > 0 ? (
                    filteredIncidents.map((inc) => {
                      const isNonConformity = inc.issuesJson?.some((iss) => iss.startsWith('❌') || iss.includes('Denetim'));
                      return (
                        <div
                          key={inc.id}
                          className={`p-3.5 rounded-xl space-y-2 text-xs border-2 shadow-sm ${
                            inc.status === 'OPEN'
                              ? 'bg-rose-50 border-rose-400'
                              : inc.status === 'DISPATCHED'
                              ? 'bg-amber-50 border-amber-300'
                              : 'bg-emerald-50 border-emerald-400'
                          }`}
                        >
                          {/* Mahal Rozeti & Hızlı Odaklanma Butonu */}
                          <div className="flex items-center justify-between bg-white/90 p-2 rounded-lg border border-slate-200">
                            <span className="font-bold text-xs text-purple-950 flex items-center gap-1.5">
                              <i className="fa-solid fa-location-dot text-rose-600"></i>
                              {inc.locationName || locations.find((l) => l.id === inc.locationId)?.name || 'WC Mahali'} ({inc.locationCode || ''})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(inc.locationId);
                                setNotice({ text: `${inc.locationName || 'Seçilen mahal'} denetim için seçildi.` });
                              }}
                              className="text-[11px] bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold px-2 py-0.5 rounded transition flex items-center gap-1 shadow-sm"
                              title="Bu mahali denetim için seç"
                            >
                              <i className="fa-solid fa-arrow-right"></i> Bu Mahale Git
                            </button>
                          </div>

                          <div className="flex items-center justify-between font-bold">
                            <span className="text-slate-900 flex items-center gap-1.5">
                              {inc.status === 'OPEN' && '🚨 YENİ BİLDİRİM'}
                              {inc.status === 'DISPATCHED' && '🏃 MÜDAHALE SÜRÜYOR'}
                              {inc.status === 'RESOLVED_BY_STAFF' && '📸 MÜDAHALE TAMAMLANDI - FOTOĞRAFLI ONAY BEKLİYOR'}
                              <span className="font-mono text-[10px] text-slate-500">({inc.id})</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isNonConformity ? 'bg-purple-200 text-purple-900' : 'bg-rose-200 text-rose-900'
                            }`}>
                              {isNonConformity ? 'Şef Uygunsuzluğu' : 'Ziyaretçi Anketi'} • Saat: {inc.time}
                            </span>
                          </div>

                          <p className="text-slate-800">
                            Tespit Edilen Sorunlar:{' '}
                            <strong className="text-rose-700">
                              {inc.issuesJson?.join(', ') || 'Genel Şikayet'}
                            </strong>
                          </p>

                          {/* Durum: AÇIK ŞİKAYET - PERSONELE ATA */}
                          {inc.status === 'OPEN' && (
                            <div className="flex items-center gap-2 pt-1 border-t border-rose-200">
                              <select
                                value={assigneeMap[inc.id] || 'Ahmet Temizlik'}
                                onChange={(e) => setAssigneeMap({ ...assigneeMap, [inc.id]: e.target.value })}
                                className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-purple-500"
                              >
                                <option value="Ahmet Temizlik">Ahmet Temizlik (Görevli Personel)</option>
                                <option value="Mehmet Hijyen">Mehmet Hijyen</option>
                                <option value="Ayşe Kaya">Ayşe Kaya</option>
                                <option value="Fatma Çelik">Fatma Çelik</option>
                              </select>
                              <button
                                onClick={async () => {
                                  await handleDispatch(inc.id);
                                  void loadIncidents();
                                }}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-3 rounded-lg shadow text-xs flex items-center gap-1.5 whitespace-nowrap"
                              >
                                📢 Personele Görev Ata
                              </button>
                            </div>
                          )}

                          {/* Durum: ATANDI - PERSONEL SAHADA */}
                          {inc.status === 'DISPATCHED' && (
                            <div className="p-2 bg-amber-100/70 rounded-lg text-amber-900 font-medium flex items-center justify-between">
                              <span>
                                Görev <strong>{inc.assignedStaffName || 'Personel'}</strong> personeline atandı. Müdahale bekleniyor...
                              </span>
                            </div>
                          )}

                          {/* Durum: PERSONEL MÜDAHALE ETTİ - FOTOĞRAFLI ONAY BEKLİYOR */}
                          {inc.status === 'RESOLVED_BY_STAFF' && (
                            <div className="space-y-2 pt-1 border-t border-emerald-200">
                              <p className="text-xs text-emerald-900">
                                <strong>{inc.assignedStaffName}</strong> müdahaleyi tamamladı.
                                <span className="block mt-0.5 text-slate-700 italic">
                                  Not: "{inc.resolutionNote || 'Sorun giderildi'}"
                                </span>
                              </p>

                              {/* Fotoğraf Kanıtı */}
                              {inc.photoUrl && (
                                <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-emerald-300">
                                  <img
                                    src={inc.photoUrl}
                                    alt="Müdahale Kanıt Fotoğrafı"
                                    onClick={() => setViewPhotoUrl(inc.photoUrl || null)}
                                    className="w-16 h-16 object-cover rounded-lg border-2 border-emerald-500 cursor-pointer shadow hover:opacity-90 transition"
                                    title="Büyük boyutta görmek için tıklayınız"
                                  />
                                  <div className="text-xs text-slate-600">
                                    <span className="font-bold text-emerald-800 block">📸 Personel Müdahale Kanıt Fotoğrafı</span>
                                    <span className="text-[11px] text-slate-500">Büyütmek için fotoğrafa tıklayabilirsiniz.</span>
                                  </div>
                                </div>
                              )}

                              <button
                                onClick={async () => {
                                  await handleVerifyClose(inc.id);
                                  void loadIncidents();
                                }}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl shadow flex items-center justify-center gap-1.5 text-xs transition"
                              >
                                <i className="fa-solid fa-stamp"></i> Fotoğrafı &amp; Müdahaleyi Doğrula ve Olayı Kapat
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                      <span className="flex items-center gap-2 font-bold">
                        <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
                        Seçili filtrede bekleyen açık şikayet veya uygunsuzluk bildirimi yok
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">
                        Standart Operasyon
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. WC SEÇME KUTUSU VE SEÇTİĞİ ALAN İÇİN 3 BUTON */}
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                    <i className="fa-solid fa-restroom text-purple-600"></i>
                    Denetlenecek WC / Mahal Seçimi:
                  </label>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-300 hover:border-purple-400 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition shadow-sm"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code}) — {loc.building}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Seçili WC: <strong className="text-slate-800">{curLocation?.name}</strong> • Son Temizlik:{' '}
                    <strong className="text-purple-800">
                      {supervisorStatus?.lastCleaning?.actualTime || 'Henüz Yapılmadı'}
                    </strong>
                  </p>
                </div>

                {/* 3 BÜYÜK EYLEM BUTONU (ŞEF EKRANINDA BAŞKA BİR ŞEY OLMAYACAK) */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  {/* Buton 1: Denetim Yap */}
                  <button
                    type="button"
                    onClick={() => setSupervisorAuditModalOpen(true)}
                    className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-black py-4 px-5 rounded-2xl shadow-lg transition flex items-center justify-between text-sm group"
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                        <i className="fa-solid fa-clipboard-check"></i>
                      </span>
                      <span className="text-left">
                        <span className="block text-base">📋 Denetim Yap</span>
                        <span className="text-xs text-purple-200 font-normal">Bu alan için kalite denetim checklistini doldur ve onayla</span>
                      </span>
                    </span>
                    <i className="fa-solid fa-chevron-right text-purple-300 group-hover:translate-x-1 transition"></i>
                  </button>

                  {/* Buton 2: Planlanan Temizlik Saatleri */}
                  <button
                    type="button"
                    onClick={() => setStaffScheduleOpen(true)}
                    className="w-full bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-700 hover:to-blue-800 text-white font-black py-4 px-5 rounded-2xl shadow-lg transition flex items-center justify-between text-sm group"
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                        <i className="fa-solid fa-calendar-days"></i>
                      </span>
                      <span className="text-left">
                        <span className="block text-base">📅 Planlanan Temizlik Saatleri</span>
                        <span className="text-xs text-indigo-200 font-normal">Günlük slot saatleri, SLA durumları ve tolerans uyumu</span>
                      </span>
                    </span>
                    <i className="fa-solid fa-chevron-right text-indigo-300 group-hover:translate-x-1 transition"></i>
                  </button>

                  {/* Buton 3: Mevcut Temizlik Saatleri */}
                  <button
                    type="button"
                    onClick={() => setStaffPastOpen(true)}
                    className="w-full bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white font-black py-4 px-5 rounded-2xl shadow-lg transition flex items-center justify-between text-sm group"
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                        <i className="fa-solid fa-clock-rotate-left text-teal-300"></i>
                      </span>
                      <span className="text-left">
                        <span className="block text-base">🕒 Mevcut Temizlik Saatleri</span>
                        <span className="text-xs text-slate-300 font-normal">Bugün bu alanda yapılan temizliklerin saat ve personel kayıtları</span>
                      </span>
                    </span>
                    <i className="fa-solid fa-chevron-right text-slate-400 group-hover:translate-x-1 transition"></i>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}{/* 4. ROL GÖRÜNÜMÜ: SİSTEM YÖNETİCİSİ (ADMİN) MERKEZİ       */}
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
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Toplam Temizlik</span>
                        <span className="text-2xl font-black text-blue-600">{dashboard.kpis.totalCleans}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Tamamlanan</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Zamanında Uyum %</span>
                        <span className="text-2xl font-black text-emerald-600">{dashboard.kpis.onTimeRate}%</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Tam vaktinde</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Plan Dışı (±Tol.)</span>
                        <span className="text-2xl font-black text-amber-600">{dashboard.kpis.outOfTimeCount}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Tolerans içi erken</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Gecikmeli (&gt;Tol.)</span>
                        <span className="text-2xl font-black text-amber-700">{dashboard.kpis.notDoneCount}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Toleransı aşan</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-sm text-center bg-rose-50/40">
                        <span className="text-[11px] font-bold text-rose-800 uppercase block">Kaçırılan (MISSED)</span>
                        <span className="text-2xl font-black text-rose-600">{dashboard.kpis.missedSlotCount ?? 0}</span>
                        <span className="text-[10px] text-rose-500 block mt-0.5">Hiç yapılmayan</span>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Memnuniyet (CSAT)</span>
                        <span className="text-2xl font-black text-purple-600">{dashboard.kpis.csatRate}%</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Olumlu Anket</span>
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
                      <th className="py-2 px-3">Kaçırılan (MISSED)</th>
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
                        <td className="py-2 px-3">
                          {row.missedCount && row.missedCount > 0 ? (
                            <span className="px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800 text-[10px] whitespace-nowrap">
                              {row.missedCount} Kaçırıldı
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold text-[11px]">✓ Eksiksiz</span>
                          )}
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

      {/* 2.5. Personel Rutin Temizlik Checklist Modalı */}
      {staffChecklistModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-blue-500/40 px-2 py-0.5 rounded">
                  Rutin Temizlik Formu
                </span>
                <h3 className="font-bold text-sm mt-1">📋 {curLocation?.name}</h3>
              </div>
              <button
                onClick={() => setStaffChecklistModalOpen(false)}
                className="text-white hover:text-blue-200 text-lg w-8 h-8 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition">
                  <input
                    type="checkbox"
                    checked={task1}
                    onChange={(e) => setTask1(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">1. Klozet, pisuvar ve lavabolar dezenfekte edildi</span>
                </label>
                <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition">
                  <input
                    type="checkbox"
                    checked={task2}
                    onChange={(e) => setTask2(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">2. Sıvı sabun, kağıt havlu ve tuvalet kağıdı ikmali yapıldı</span>
                </label>
                <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition">
                  <input
                    type="checkbox"
                    checked={task3}
                    onChange={(e) => setTask3(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">3. Çöp kovaları boşaltıldı ve yeni poşet takıldı</span>
                </label>
                <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition">
                  <input
                    type="checkbox"
                    checked={task4}
                    onChange={(e) => setTask4(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">4. Zemin mop ile silindi ve kurulandı</span>
                </label>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Varsa Sarf / Arıza Notu:</label>
                <input
                  type="text"
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  placeholder="Sarf malzeme ikmali veya teknik arıza notu..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  disabled={busy}
                  onClick={async () => {
                    await handleCleaningSubmit();
                    setStaffChecklistModalOpen(false);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <i className="fa-solid fa-circle-check text-base"></i>
                  Temizliği Tamamla ve Dijital Beyan Oluştur
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3.5. Şef Kalite Denetim Modalı */}
      {supervisorAuditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-purple-800 to-indigo-800 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-600/40 px-2 py-0.5 rounded">
                  Kalite Denetim Formu (v1.2)
                </span>
                <h3 className="font-bold text-sm mt-1">📋 {curLocation?.name}</h3>
              </div>
              <button
                onClick={() => setSupervisorAuditModalOpen(false)}
                className="text-white hover:text-purple-200 text-lg w-8 h-8 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-2 text-xs">
                {CHECKLIST_ITEMS_V12.map((item, idx) => {
                  const isOk = checklistAnswers[idx] ?? true;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="font-semibold text-slate-800">
                        {idx + 1}. {item}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setChecklistAnswers({ ...checklistAnswers, [idx]: true })}
                          className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                            isOk ? 'bg-emerald-600 text-white shadow' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          ✓ Uygun
                        </button>
                        <button
                          type="button"
                          onClick={() => setChecklistAnswers({ ...checklistAnswers, [idx]: false })}
                          className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                            !isOk ? 'bg-rose-600 text-white shadow' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          ✗ Uygun Değil
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Şef Denetim Notu:</label>
                <input
                  type="text"
                  value={auditNote}
                  onChange={(e) => setAuditNote(e.target.value)}
                  placeholder="Varsa şef denetim notu..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  disabled={busy}
                  onClick={async () => {
                    await handleAuditSubmit(true);
                    setSupervisorAuditModalOpen(false);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition"
                >
                  <i className="fa-solid fa-check-double"></i> Denetimi Onayla
                </button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    await handleAuditSubmit(false);
                    setSupervisorAuditModalOpen(false);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition"
                >
                  <i className="fa-solid fa-triangle-exclamation"></i> Uygunsuzluk Aç
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3.6. Kanıt Fotoğrafı Büyütme Modalı */}
      {viewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setViewPhotoUrl(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-2xl w-full p-3 relative cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <i className="fa-solid fa-camera text-blue-600"></i> Müdahale Kanıt Fotoğrafı
              </span>
              <button
                type="button"
                onClick={() => setViewPhotoUrl(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>
            <div className="py-2 flex items-center justify-center bg-slate-950 rounded-xl overflow-hidden my-2">
              <img
                src={viewPhotoUrl}
                alt="Büyük Müdahale Fotoğrafı"
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
            <p className="text-center text-[11px] text-slate-500 font-medium">
              Saha personeli tarafından sisteme yüklenen kanıt fotoğrafı.
            </p>
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
              <div className="text-xs text-slate-600 mb-3 space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <p className="font-semibold text-slate-800">SLA Uyum Kriterleri (Geçerli Tolerans: ±{curLocation?.toleranceMinutes || 15} dk):</p>
                <div className="flex flex-wrap gap-2 text-[10px] mt-1">
                  <span className="badge-ontime px-2 py-0.5 rounded font-bold">✓ Zamanında: 0 dk veya Tolerans İçi</span>
                  <span className="badge-outoftime px-2 py-0.5 rounded font-bold">⏱ Plan Dışı: Erken</span>
                  <span className="badge-notdone px-2 py-0.5 rounded font-bold">✗ Gecikmeli veya Kaçırıldı</span>
                </div>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">Planlanan Saat</th>
                    <th className="py-2 px-2.5">Gerçekleşen</th>
                    <th className="py-2 px-2.5">Personel</th>
                    <th className="py-2 px-2.5">SLA Durumu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supervisorStatus?.dailyScheduleStatus?.slots ? (
                    supervisorStatus.dailyScheduleStatus.slots.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-2.5 font-bold font-mono text-slate-800">{item.slot}</td>
                        <td className="py-2.5 px-2.5 font-mono text-slate-700">{item.actualTime || '--:--'}</td>
                        <td className="py-2.5 px-2.5 text-slate-600">{item.staffName || '-'}</td>
                        <td className="py-2.5 px-2.5">
                          <span className={`${item.badgeClass} px-2 py-0.5 rounded font-bold text-[10px] whitespace-nowrap`}>
                            {item.label}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    curLocation?.schedule?.map((slot, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-2.5 font-bold font-mono text-slate-800">{slot}</td>
                        <td className="py-2.5 px-2.5 font-mono text-slate-400">--:--</td>
                        <td className="py-2.5 px-2.5 text-slate-400">-</td>
                        <td className="py-2.5 px-2.5">
                          <span className="badge-waiting px-2 py-0.5 rounded font-bold text-[10px]">Bekliyor</span>
                        </td>
                      </tr>
                    ))
                  )}
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
