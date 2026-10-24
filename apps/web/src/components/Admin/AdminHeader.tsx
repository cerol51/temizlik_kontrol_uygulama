import React from 'react';
import { AppUser } from '../../api';

interface AdminHeaderProps {
  currentUser: AppUser | null;
  adminSubTab: 'overview' | 'locations' | 'users' | 'matrix' | 'audit';
  setAdminSubTab: (tab: 'overview' | 'locations' | 'users' | 'matrix' | 'audit') => void;
  onOpenCreateLocation: () => void;
  onOpenCreateUser: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentUser,
  adminSubTab,
  setAdminSubTab,
  onOpenCreateLocation,
  onOpenCreateUser,
}) => {
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
    </>
  );
};
