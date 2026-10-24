import React from 'react';
import { AppUser, Location } from '../api';

interface NavbarProps {
  role: 'admin' | 'supervisor' | 'employee' | '';
  currentUser: AppUser | null;
  currentTime: string;
  locations: Location[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  busy?: boolean;
  adminSubTab: 'overview' | 'locations' | 'users' | 'matrix' | 'audit';
  setAdminSubTab: (tab: 'overview' | 'locations' | 'users' | 'matrix' | 'audit') => void;
  onQuickAdminLogin: () => void;
  onLogout: () => void;
  onOpenCreateLocation: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  role,
  currentUser,
  currentTime,
  locations,
  selectedId,
  setSelectedId,
  busy = false,
  adminSubTab,
  setAdminSubTab,
  onQuickAdminLogin,
  onLogout,
  onOpenCreateLocation,
}) => {
  return (
    <>
      {/* ÜST ÇUBUK / NAVİGASYON */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* 1. SİSTEM YÖNETİCİSİ GİRİŞ / MİSAFİR HEADER */}
          {!role && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-black text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-desktop"></i> Sistem Yöneticisi Merkezi (Desktop)
                </span>
                <span className="text-slate-500 hidden sm:inline">|</span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px] hidden md:inline">
                  📱 Saha ekranları mobil uygulamada (@wc/mobile)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-xs">
                  {currentTime}
                </span>
                <button
                  onClick={onQuickAdminLogin}
                  disabled={busy}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow flex items-center gap-1.5 transition"
                  title="Yönetici Olarak Hızlı Giriş Yap"
                >
                  <i className="fa-solid fa-crown"></i> Admin Girişi
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
                  onClick={onLogout}
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
                  onClick={onLogout}
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
                  <i className="fa-solid fa-crown"></i> Sistem Yöneticisi Portalı (Desktop)
                </span>
                <button
                  onClick={onOpenCreateLocation}
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
                  onClick={onLogout}
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

      {/* SAHA MOBİL UYGULAMASI BİLGİLENDİRME ŞERİDİ */}
      {role === 'admin' && (
        <div className="max-w-6xl mx-auto w-full px-4 pt-3">
          <div className="bg-blue-900/30 border border-blue-500/30 text-blue-200 px-4 py-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-mobile-screen text-blue-400 text-base"></i>
              <span>
                <strong>Saha Mimarisi:</strong> Anket girişi, personel görev ekranı ve şef denetimi saha kullanımı için <strong>Mobil Uygulamaya (<code className="bg-blue-950 px-1 py-0.5 rounded text-blue-300">@wc/mobile</code>)</strong> taşınmıştır. Sistem yönetimi, analitikler ve raporlar bu masaüstü portalından yürütülür.
              </span>
            </div>
            <span className="bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-400/30">
              Masaüstü Portalı Aktif
            </span>
          </div>
        </div>
      )}
    </>
  );
};
