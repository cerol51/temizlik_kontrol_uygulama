import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Navbar } from './components/Navbar';
import { PhotoPreviewModal } from './components/Modals/PhotoPreviewModal';
import { AuthModal } from './components/Modals/AuthModal';

// Modular Feature Sections
import { GuestSection } from './features/guest/GuestSection';
import { StaffSection } from './features/staff/StaffSection';
import { SupervisorSection } from './features/supervisor/SupervisorSection';
import { AdminSection } from './features/admin/AdminSection';

// Centralized Zustand Stores & Hooks
import { useAuthStore } from './stores/authStore';
import { useLocationsStore } from './stores/locationsStore';
import { useUiStore } from './stores/uiStore';
import { useNotificationsSse } from './hooks/useNotificationsSse';

export default function App() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const activeTab = useAuthStore((s) => s.activeTab);
  const setActiveTab = useAuthStore((s) => s.setActiveTab);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);

  const locations = useLocationsStore((s) => s.locations);
  const selectedId = useLocationsStore((s) => s.selectedId);
  const setSelectedId = useLocationsStore((s) => s.setSelectedId);
  const status = useLocationsStore((s) => s.status);
  const fetchLocations = useLocationsStore((s) => s.fetchLocations);

  const notice = useUiStore((s) => s.notice);
  const setNotice = useUiStore((s) => s.setNotice);
  const showNotice = useUiStore((s) => s.showNotice);
  const photoPreviewUrl = useUiStore((s) => s.photoPreviewUrl);
  const setPhotoPreviewUrl = useUiStore((s) => s.setPhotoPreviewUrl);
  const authModalOpen = useUiStore((s) => s.authModalOpen);
  const setAuthModalOpen = useUiStore((s) => s.setAuthModalOpen);
  const scannerOpen = useUiStore((s) => s.scannerOpen);
  const closeScanner = useUiStore((s) => s.closeScanner);

  // Live time ticker
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  );
  const [adminSubTab, setAdminSubTab] = useState<'overview' | 'locations' | 'users' | 'matrix' | 'audit'>('overview');
  const [busy, setBusy] = useState(false);

  // QR Scanner refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<IScannerControls | null>(null);

  // 1. Subscribe to SSE real-time notifications for supervisor and admin
  useNotificationsSse();

  // 2. Clock update interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. Initial location fetch & URL QR parsing
  useEffect(() => {
    void fetchLocations().then((items) => {
      if (!items || items.length === 0) return;
      const params = new URLSearchParams(window.location.search);
      const tokenParam = params.get('q');
      const wcParam = params.get('wc');

      if (tokenParam) {
        const found = items.find((l) => l.token === tokenParam);
        if (found) setSelectedId(found.id);
      } else if (wcParam) {
        const found = items.find((l) => l.id === wcParam || l.code === wcParam);
        if (found) setSelectedId(found.id);
      } else if (window.location.pathname.startsWith('/q/')) {
        const pathToken = window.location.pathname.replace('/q/', '').split('?')[0];
        const found = items.find((l) => l.token === pathToken);
        if (found) setSelectedId(found.id);
      }
    });
  }, [fetchLocations, setSelectedId]);

  // 4. Video QR Camera Reader
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
          const tokenVal = text.split('/q/')[1]?.split('?')[0];
          const found = locations.find((l) => l.token === tokenVal);
          if (found) targetId = found.id;
        } else if (text.includes('wc=')) {
          const id = new URL(text, window.location.origin).searchParams.get('wc');
          if (id) targetId = id;
        }

        if (targetId) {
          setSelectedId(targetId);
          closeScanner();
          showNotice('✓ Mahal QR kodu başarıyla algılandı.');
        }
      })
      .then((controls) => {
        scannerRef.current = controls;
      })
      .catch((err) => {
        showNotice('Kamera açılamadı: ' + String(err), true);
        closeScanner();
      });

    return () => {
      active = false;
      scannerRef.current?.stop();
      scannerRef.current = null;
    };
  }, [scannerOpen, locations, closeScanner, setSelectedId, showNotice]);

  const curLocation = locations.find((l) => l.id === selectedId) || locations[0];

  const handleLogin = async (u: string, p: string) => {
    try {
      setBusy(true);
      const loggedUser = await login(u, p);
      showNotice(`✓ Hoş geldiniz, ${loggedUser.fullName}!`);
      setAuthModalOpen(false);
    } catch (err: any) {
      showNotice(err.message || 'Giriş başarısız.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (fullName: string, u: string, p: string) => {
    try {
      setBusy(true);
      const registered = await register(u, p, fullName, 'employee');
      showNotice(`✓ Kayıt başarılı! Hoş geldiniz, ${registered.fullName}!`);
      setAuthModalOpen(false);
    } catch (err: any) {
      showNotice(err.message || 'Kayıt başarısız.', true);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    logout();
    showNotice('Oturum kapatıldı.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. ÜST ÇUBUK / NAVİGASYON */}
      <Navbar
        role={role}
        currentUser={user}
        currentTime={currentTime}
        locations={locations}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        busy={busy}
        adminSubTab={adminSubTab}
        setAdminSubTab={setAdminSubTab}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenCreateLocation={() => {
          setActiveTab('admin');
          setAdminSubTab('locations');
        }}
      />

      {/* 2. QR Kamera Canlı Tarayıcı Katmanı */}
      {scannerOpen && (
        <div className="fixed inset-x-4 top-16 max-w-sm mx-auto z-50 bg-slate-900 p-4 rounded-2xl border border-slate-700 shadow-2xl">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <i className="fa-solid fa-camera text-teal-400"></i> Kamera ile QR Okutun
            </span>
            <button
              onClick={closeScanner}
              className="text-xs bg-slate-800 text-slate-400 hover:text-white px-2 py-0.5 rounded"
            >
              ✕ Kapat
            </button>
          </div>
          <video ref={videoRef} className="w-full rounded-lg bg-black aspect-video object-cover" />
          <p className="text-xs text-slate-400 mt-2">WC kapısındaki QR kodu kameraya gösteriniz.</p>
        </div>
      )}

      {/* 3. Toast Bildirim Banner */}
      {notice && (
        <div
          className={`max-w-6xl mx-auto w-full my-2 px-4 py-2 rounded-lg text-xs font-semibold flex justify-between items-center ${
            notice.bad
              ? 'bg-rose-100 text-rose-800 border border-rose-300'
              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-2 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* 4. Ana İçerik Alanı (Feature Modülleri) */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 flex flex-col items-center justify-start gap-6">
        {/* Misafir / Ziyaretçi Ekranı */}
        {activeTab === 'guest' && (
          <GuestSection
            curLocation={curLocation}
            status={status}
            busy={busy}
          />
        )}

        {/* Personel Saha Görev Ekranı */}
        {activeTab === 'employee' && (
          <StaffSection
            curLocation={curLocation}
            currentTime={currentTime}
          />
        )}

        {/* Şef Denetim ve Operasyon Portalı */}
        {activeTab === 'supervisor' && (
          <SupervisorSection
            curLocation={curLocation}
          />
        )}

        {/* Sistem Yöneticisi (Admin) Merkezi */}
        {activeTab === 'admin' && (
          <AdminSection />
        )}
      </main>

      {/* 5. Genel Modallar */}
      <PhotoPreviewModal
        photoUrl={photoPreviewUrl}
        onClose={() => setPhotoPreviewUrl(null)}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
        busy={busy}
      />
    </div>
  );
}
