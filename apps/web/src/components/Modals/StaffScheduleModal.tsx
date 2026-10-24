import React from 'react';
import { Location, PublicLocationStatus } from '../../api';

interface StaffScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  curLocation: Location | undefined;
  status: PublicLocationStatus | null;
}

export const StaffScheduleModal: React.FC<StaffScheduleModalProps> = ({
  isOpen,
  onClose,
  curLocation,
  status,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-emerald-600 text-white p-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">Bugünkü Temizlik Saatleri</h3>
            <p className="text-[11px] text-emerald-100">{curLocation?.name}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-emerald-200 text-lg">
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
            onClick={onClose}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
