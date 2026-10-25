import React from 'react';
import { AppUser } from '../../api';

interface AdminHeaderProps {
  currentUser: AppUser | null;
  adminSubTab: 'overview' | 'locations' | 'users' | 'matrix' | 'audit';
  setAdminSubTab: (tab: 'overview' | 'locations' | 'users' | 'matrix' | 'audit') => void;
  onOpenCreateLocation: () => void;
  onOpenCreateUser: () => void;
  onDownloadCsv?: (type?: 'audit' | 'cleanings' | 'incidents') => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentUser,
  adminSubTab,
  setAdminSubTab,
  onOpenCreateLocation,
  onOpenCreateUser,
  onDownloadCsv,
}) => {
  const [csvMenuOpen, setCsvMenuOpen] = React.useState(false);

  return (
    <>
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
            onClick={onOpenCreateLocation}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition"
          >
            <i className="fa-solid fa-plus-circle"></i> Yeni WC Noktası
          </button>
          <button
            onClick={onOpenCreateUser}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 shadow transition"
          >
            <i className="fa-solid fa-user-plus"></i> Yeni Kullanıcı
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCsvMenuOpen(!csvMenuOpen)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition"
            >
              <i className="fa-solid fa-file-csv"></i> CSV Raporlar <i className="fa-solid fa-chevron-down text-[10px]"></i>
            </button>
            {csvMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setCsvMenuOpen(false);
                    onDownloadCsv?.('audit');
                  }}
                  className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition"
                >
                  <i className="fa-solid fa-list-check text-emerald-400"></i> Denetim İzi (Audit)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvMenuOpen(false);
                    onDownloadCsv?.('cleanings');
                  }}
                  className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition"
                >
                  <i className="fa-solid fa-broom text-blue-400"></i> Temizlik Kayıtları
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvMenuOpen(false);
                    onDownloadCsv?.('incidents');
                  }}
                  className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition"
                >
                  <i className="fa-solid fa-triangle-exclamation text-amber-400"></i> Arıza &amp; Şikayetler
                </button>
              </div>
            )}
          </div>
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
    </>
  );
};
