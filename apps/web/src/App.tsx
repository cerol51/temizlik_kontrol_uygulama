import Keycloak from 'keycloak-js';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  AppUser,
  createLocation,
  createUserApi,
  DashboardData,
  deleteLocation,
  deleteUserApi,
  fetchActiveChecklistApi,
  fetchUsersApi,
  Incident,
  Location,
  loginApi,
  PublicLocationStatus,
  regenerateLocationToken,
  registerApi,
  SupervisorLocationStatus,
} from './api';

// Modüler Bileşenler (Components)
import { Navbar } from './components/Navbar';
import { AdminHeader } from './components/Admin/AdminHeader';
import { AdminOverview } from './components/Admin/AdminOverview';
import { LocationManagement } from './components/Admin/LocationManagement';
import { UserManagement } from './components/Admin/UserManagement';
import { RoleMatrixTable } from './components/Admin/RoleMatrixTable';
import { AuditTrailTable } from './components/Admin/AuditTrailTable';
import { GuestView } from './components/Views/GuestView';
import { StaffView } from './components/Views/StaffView';
import { SupervisorView } from './components/Views/SupervisorView';

// Modallar (Modals)
import { QrModal } from './components/Modals/QrModal';
import { CreateLocationModal } from './components/Modals/CreateLocationModal';
import { CreateUserModal } from './components/Modals/CreateUserModal';
import { PhotoPreviewModal } from './components/Modals/PhotoPreviewModal';
import { AuthModal } from './components/Modals/AuthModal';
import { PlannerModal } from './components/Modals/PlannerModal';
import { SupervisorAuditModal } from './components/Modals/SupervisorAuditModal';
import { StaffChecklistModal } from './components/Modals/StaffChecklistModal';
import { StaffScheduleModal } from './components/Modals/StaffScheduleModal';
import { StaffPastModal } from './components/Modals/StaffPastModal';

const DEFAULT_CHECKLIST_ITEMS = [
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
  const [, setAppError] = useState('');
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

  const [adminSubTab, setAdminSubTab] = useState<'overview' | 'locations' | 'users' | 'matrix' | 'audit'>('overview');
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
  const [previewGuestMode, setPreviewGuestMode] = useState(false);
  const isDirectQrVisit = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/q/') ||
    window.location.search.includes('q=') ||
    window.location.search.includes('wc=')
  );

  // Personel state
  const [task1, setTask1] = useState(true);
  const [task2, setTask2] = useState(true);
  const [task3, setTask3] = useState(true);
  const [task4, setTask4] = useState(true);
  const [staffNote, setStaffNote] = useState('');
  const [staffScheduleOpen, setStaffScheduleOpen] = useState(false);
  const [staffPastOpen, setStaffPastOpen] = useState(false);
  const [staffPhotoBase64, setStaffPhotoBase64] = useState('');
  const [staffResolveNote, setStaffResolveNote] = useState('');
  const [staffChecklistModalOpen, setStaffChecklistModalOpen] = useState(false);

  // Şef state
  const [checklistItems, setChecklistItems] = useState<string[]>([...DEFAULT_CHECKLIST_ITEMS]);
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
  const [incidentFilterLoc, setIncidentFilterLoc] = useState<string>('all');
  const [incidentFilterStatus, setIncidentFilterStatus] = useState<string>('all');
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [supervisorAuditModalOpen, setSupervisorAuditModalOpen] = useState(false);
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null);

  // Admin Mahal & Kullanıcı Yönetimi
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminUserModalOpen, setAdminUserModalOpen] = useState(false);
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
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // UI / Kamera / Bildirim
  const [scannerOpen, setScannerOpen] = useState(false);
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

  // Dinamik Veritabanı Sürümlü Checklist'i Çekme
  useEffect(() => {
    fetchActiveChecklistApi()
      .then((res) => {
        if (res?.items && res.items.length > 0) {
          const labels = res.items.map((i) => i.label);
          setChecklistItems(labels);
          const initialAns: Record<number, boolean> = {};
          labels.forEach((_, idx) => {
            initialAns[idx] = true;
          });
          setChecklistAnswers(initialAns);
        }
      })
      .catch(() => {
        // Fallback varsayılan maddeler
      });
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

  // Olayları Yükleme
  const loadIncidents = useCallback(async () => {
    try {
      const token = await accessToken();
      const data = await api<Incident[]>('/incidents', token);
      setAllIncidents(data);
    } catch {
      // fallback to dashboard
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

  // Rol İzolasyonu
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

  // Acil Durum Sireni
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

  // QR Tarama Başlatma
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

  // Ziyaretçi Anket Gönderimi
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

  // Personel Temizlik Beyanı
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

  // Şef Olay Görevlendirme
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

  // Şef Doğrulama ve Kapatma
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

  // Şef Checklist Denetim Gönderme
  const handleAuditSubmit = async (isApproved: boolean) => {
    try {
      setBusy(true);
      const token = await accessToken();
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

  // Şef Planlayıcı Kaydetme
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

  // Admin Mahal Silme & Token Yenileme
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

  // Kullanıcı Girişi
  const handleLogin = async (usernameInput: string, passwordInput: string) => {
    try {
      setBusy(true);
      const res = await loginApi(usernameInput.trim(), passwordInput.trim());
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

  const handleRegister = async (fullNameInput: string, usernameInput: string, passwordInput: string) => {
    try {
      setBusy(true);
      const res = await registerApi(fullNameInput.trim(), usernameInput.trim(), passwordInput.trim(), 'employee');
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

  const handleQuickAdminLogin = async () => {
    try {
      setBusy(true);
      const res = await loginApi('admin', 'admin123');
      setCurrentUser(res.user);
      setAuthToken(res.token);
      localStorage.setItem('wc_user', JSON.stringify(res.user));
      localStorage.setItem('wc_token', res.token);
      setRole('admin');
      setActiveTab('admin');
      setNotice({ text: '👑 Sistem Yöneticisi olarak başarıyla giriş yapıldı.' });
      void loadStatus();
      void loadDashboard();
      void loadUsers();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

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

  const handleAdminCreateUser = async (user: {
    fullName: string;
    username: string;
    password: string;
    role: 'employee' | 'supervisor' | 'admin';
  }) => {
    try {
      setBusy(true);
      const token = await accessToken();
      const created = await createUserApi(user, token);
      setNotice({ text: `Yeni kullanıcı (${created.fullName}) başarıyla sisteme eklendi!` });
      setAdminUserModalOpen(false);
      void loadUsers();
    } catch (err: any) {
      setNotice({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

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

  const handleCreateLocationSubmit = async (locData: {
    name: string;
    code?: string;
    building?: string;
    toleranceMinutes?: number;
    schedulePreset?: string;
    currentSupervisorName?: string;
    backupSupervisorName?: string;
  }) => {
    let schedule = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
    if (locData.schedulePreset === '1hour') {
      schedule = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    } else if (locData.schedulePreset === '3shift') {
      schedule = ['09:00', '14:00', '19:00'];
    }

    try {
      setBusy(true);
      const token = await accessToken();
      const created = await createLocation(
        {
          name: locData.name,
          code: locData.code,
          building: locData.building,
          toleranceMinutes: locData.toleranceMinutes,
          schedule,
          currentSupervisorName: locData.currentSupervisorName,
          backupSupervisorName: locData.backupSupervisorName,
        },
        token,
      );

      setNotice({ text: `Yeni WC mahali (${created.name}) başarıyla oluşturuldu!` });
      setAdminModalOpen(false);
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

  const curLocation = locations.find((l) => l.id === selectedId) || locations[0];

  return (
    <div className="bg-slate-100 text-slate-800 font-sans min-h-screen flex flex-col antialiased">
      {/* Üst Navigasyon Çubuğu */}
      <Navbar
        role={role}
        currentUser={currentUser}
        currentTime={currentTime}
        locations={locations}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        busy={busy}
        adminSubTab={adminSubTab}
        setAdminSubTab={setAdminSubTab}
        onQuickAdminLogin={handleQuickAdminLogin}
        onLogout={handleLogout}
        onOpenCreateLocation={() => setAdminModalOpen(true)}
      />

      {/* Kamera QR Tarayıcı */}
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

      {/* Bildirim Banner */}
      {notice && (
        <div
          className={`max-w-6xl mx-auto w-full my-2 px-4 py-2 rounded-lg text-xs font-semibold flex justify-between items-center ${
            notice.bad
              ? 'bg-rose-100 text-rose-800 border border-rose-300'
              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-2 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Ana İçerik Alanı */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 flex flex-col items-center justify-start gap-6">
        {/* 1. Misafir / Karşılama Ekranı */}
        {activeTab === 'guest' && (
          <GuestView
            isDirectQrVisit={isDirectQrVisit}
            previewGuestMode={previewGuestMode}
            setPreviewGuestMode={setPreviewGuestMode}
            curLocation={curLocation}
            status={status}
            busy={busy}
            selectedRating={selectedRating}
            selectedIssues={selectedIssues}
            setSelectedIssues={setSelectedIssues}
            surveySent={surveySent}
            rootCauses={ROOT_CAUSES}
            onQuickAdminLogin={handleQuickAdminLogin}
            onOpenAuthModal={() => setAuthModalOpen(true)}
            onOpenGuestSchedule={() => setGuestScheduleOpen(true)}
            onRatingClick={handleRatingClick}
            onNegativeFeedbackSubmit={handleNegativeFeedbackSubmit}
          />
        )}

        {/* 2. Personel Saha Görev Ekranı */}
        {activeTab === 'employee' && (
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
            onViewPhoto={(url) => setViewPhotoUrl(url)}
            onStaffResolve={handleStaffResolve}
            onLoadIncidents={loadIncidents}
            onOpenChecklistModal={() => setStaffChecklistModalOpen(true)}
            onOpenScheduleModal={() => setStaffScheduleOpen(true)}
            onOpenPastModal={() => setStaffPastOpen(true)}
          />
        )}

        {/* 3. Şef Denetim ve Operasyon Portalı */}
        {activeTab === 'supervisor' && (
          <SupervisorView
            locations={locations}
            curLocation={curLocation}
            allIncidents={allIncidents}
            dashboard={dashboard}
            supervisorStatus={supervisorStatus}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            incidentFilterLoc={incidentFilterLoc}
            setIncidentFilterLoc={setIncidentFilterLoc}
            incidentFilterStatus={incidentFilterStatus}
            setIncidentFilterStatus={setIncidentFilterStatus}
            assigneeMap={assigneeMap}
            setAssigneeMap={setAssigneeMap}
            onSetNotice={setNotice}
            onViewPhoto={(url) => setViewPhotoUrl(url)}
            onDispatch={handleDispatch}
            onVerifyClose={handleVerifyClose}
            onLoadIncidents={loadIncidents}
            onOpenAuditModal={() => setSupervisorAuditModalOpen(true)}
            onOpenScheduleModal={() => setStaffScheduleOpen(true)}
            onOpenPastModal={() => setStaffPastOpen(true)}
          />
        )}

        {/* 4. Sistem Yöneticisi (Admin) Merkezi */}
        {activeTab === 'admin' && (
          <div className="w-full max-w-5xl space-y-4">
            <AdminHeader
              currentUser={currentUser}
              adminSubTab={adminSubTab}
              setAdminSubTab={setAdminSubTab}
              onOpenCreateLocation={() => setAdminModalOpen(true)}
              onOpenCreateUser={() => setAdminUserModalOpen(true)}
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
                onOpenCreateLocation={() => setAdminModalOpen(true)}
                onOpenSticker={(loc) => {
                  setStickerLoc(loc);
                  setPrintStickerModalOpen(true);
                }}
                onRegenerateToken={handleRegenerateToken}
                onDeleteLocation={handleDeleteLocation}
              />
            )}

            {adminSubTab === 'users' && (
              <UserManagement
                usersList={usersList}
                currentUser={currentUser}
                busy={busy}
                onOpenCreateUser={() => setAdminUserModalOpen(true)}
                onDeleteUser={handleAdminDeleteUser}
              />
            )}

            {adminSubTab === 'matrix' && (
              <RoleMatrixTable dashboard={dashboard} />
            )}

            {adminSubTab === 'audit' && (
              <AuditTrailTable dashboard={dashboard} />
            )}
          </div>
        )}
      </main>

      {/* MODALLAR */}
      {/* 1. Şef Planlayıcı Modalı */}
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

      {/* 2. Ziyaretçi / Personel Günlük Temizlik Saatleri */}
      <StaffScheduleModal
        isOpen={guestScheduleOpen || staffScheduleOpen}
        onClose={() => {
          setGuestScheduleOpen(false);
          setStaffScheduleOpen(false);
        }}
        curLocation={curLocation}
        status={status}
      />

      {/* 3. Geçmiş Temizlik Kayıtları Modalı */}
      <StaffPastModal
        isOpen={staffPastOpen}
        onClose={() => setStaffPastOpen(false)}
        curLocation={curLocation}
        supervisorStatus={supervisorStatus}
      />

      {/* 4. Personel Rutin Temizlik Checklist Modalı */}
      <StaffChecklistModal
        isOpen={staffChecklistModalOpen}
        onClose={() => setStaffChecklistModalOpen(false)}
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

      {/* 5. Şef Kalite Denetim Modalı (Dinamik Sürümlü Checklist) */}
      <SupervisorAuditModal
        isOpen={supervisorAuditModalOpen}
        onClose={() => setSupervisorAuditModalOpen(false)}
        curLocation={curLocation}
        items={checklistItems}
        checklistAnswers={checklistAnswers}
        setChecklistAnswers={setChecklistAnswers}
        auditNote={auditNote}
        setAuditNote={setAuditNote}
        busy={busy}
        onSubmit={handleAuditSubmit}
      />

      {/* 6. Kanıt Fotoğrafı Büyütme Modalı */}
      <PhotoPreviewModal
        photoUrl={viewPhotoUrl}
        onClose={() => setViewPhotoUrl(null)}
      />

      {/* 7. Admin Yeni WC Ekleme Modalı */}
      <CreateLocationModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onSubmit={handleCreateLocationSubmit}
        busy={busy}
      />

      {/* 8. QR Kod & Yazdırılabilir Etiket Modalı */}
      <QrModal
        open={printStickerModalOpen}
        onClose={() => setPrintStickerModalOpen(false)}
        location={stickerLoc}
      />

      {/* 9. Kullanıcı Giriş & Kayıt Ol Modalı */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
        busy={busy}
      />

      {/* 10. Admin Yeni Kullanıcı Ekleme Modalı */}
      <CreateUserModal
        isOpen={adminUserModalOpen}
        onClose={() => setAdminUserModalOpen(false)}
        onSubmit={handleAdminCreateUser}
        busy={busy}
      />
    </div>
  );
}
