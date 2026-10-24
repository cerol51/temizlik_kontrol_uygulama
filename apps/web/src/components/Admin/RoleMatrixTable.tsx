import React from 'react';
import { DashboardData } from '../../api';

interface RoleMatrixTableProps {
  dashboard: DashboardData | null;
}

export const RoleMatrixTable: React.FC<RoleMatrixTableProps> = ({ dashboard }) => {
  if (!dashboard) return null;

  return (
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
  );
};
