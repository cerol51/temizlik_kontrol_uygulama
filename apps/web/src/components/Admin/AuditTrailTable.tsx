import React from 'react';
import { DashboardData } from '../../api';

interface AuditTrailTableProps {
  dashboard: DashboardData | null;
}

export const AuditTrailTable: React.FC<AuditTrailTableProps> = ({ dashboard }) => {
  if (!dashboard) return null;

  return (
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
  );
};
