import React from 'react';
import { DashboardData, Location, AppUser } from '../../api';

interface AdminOverviewProps {
  locations: Location[];
  usersList: AppUser[];
  dashboard: DashboardData | null;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  locations,
  usersList,
  dashboard,
}) => {
  return (
    <div className="space-y-4">
      {/* Admin 4'lü Özet Kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            Tanımlı WC Noktaları
          </span>
          <span className="text-2xl font-black text-purple-700">{locations.length}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Aktif Mahal</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            Kayıtlı Kullanıcılar
          </span>
          <span className="text-2xl font-black text-blue-600">{usersList.length}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {usersList.filter((u) => u.role === 'supervisor' || (u.role as any) === 'admin').length} Şef /{' '}
            {usersList.filter((u) => u.role === 'employee').length} Personel
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            Açık Olay / Arıza
          </span>
          <span className="text-2xl font-black text-rose-600">
            {dashboard?.locationMatrix.filter((m) => m.incidentStatus !== 'NORMAL').length || 0}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Müdahale bekleyen</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            Güvenlik Mimarisi
          </span>
          <span className="text-2xl font-black text-emerald-600">Aktif</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Opaque Token &amp; SHA-256
          </span>
        </div>
      </div>

      {dashboard && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">
                Toplam Temizlik
              </span>
              <span className="text-2xl font-black text-blue-600">{dashboard.kpis.totalCleans}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Tamamlanan</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">
                Zamanında Uyum %
              </span>
              <span className="text-2xl font-black text-emerald-600">
                {dashboard.kpis.onTimeRate}%
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Tam vaktinde</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">
                Plan Dışı (±Tol.)
              </span>
              <span className="text-2xl font-black text-amber-600">
                {dashboard.kpis.outOfTimeCount}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Tolerans içi erken</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">
                Gecikmeli (&gt;Tol.)
              </span>
              <span className="text-2xl font-black text-amber-700">
                {dashboard.kpis.notDoneCount}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Toleransı aşan</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-sm text-center bg-rose-50/40">
              <span className="text-[11px] font-bold text-rose-800 uppercase block">
                Kaçırılan (MISSED)
              </span>
              <span className="text-2xl font-black text-rose-600">
                {dashboard.kpis.missedSlotCount ?? 0}
              </span>
              <span className="text-[10px] text-rose-500 block mt-0.5">Hiç yapılmayan</span>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">
                Memnuniyet (CSAT)
              </span>
              <span className="text-2xl font-black text-purple-600">
                {dashboard.kpis.csatRate}%
              </span>
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
                        <div
                          className="bg-rose-500 h-2 rounded-full"
                          style={{ width: `${pct}%` }}
                        ></div>
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
  );
};
