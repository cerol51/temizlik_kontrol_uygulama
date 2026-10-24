import React from 'react';
import { Location, SupervisorLocationStatus } from '../../api';

interface StaffPastModalProps {
  isOpen: boolean;
  onClose: () => void;
  curLocation: Location | undefined;
  supervisorStatus: SupervisorLocationStatus | null;
}

export const StaffPastModal: React.FC<StaffPastModalProps> = ({
  isOpen,
  onClose,
  curLocation,
  supervisorStatus,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">Önceki Temizlik Kayıtları</h3>
            <p className="text-[11px] text-blue-100">{curLocation?.name}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-blue-200 text-lg">
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
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold py-1.5 px-4 rounded-lg"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
