import React from 'react';
import { Location } from '../../api';

interface SupervisorAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  curLocation: Location | undefined;
  items: string[];
  checklistAnswers: Record<number, boolean>;
  setChecklistAnswers: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  auditNote: string;
  setAuditNote: (note: string) => void;
  busy?: boolean;
  onSubmit: (approved: boolean) => Promise<void>;
}

export const SupervisorAuditModal: React.FC<SupervisorAuditModalProps> = ({
  isOpen,
  onClose,
  curLocation,
  items,
  checklistAnswers,
  setChecklistAnswers,
  auditNote,
  setAuditNote,
  busy = false,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-purple-800 to-indigo-800 text-white p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-600/40 px-2 py-0.5 rounded">
              Kalite Denetim Formu
            </span>
            <h3 className="font-bold text-sm mt-1">📋 {curLocation?.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-purple-200 text-lg w-8 h-8 rounded-full flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-2 text-xs">
            {items.map((item, idx) => {
              const isOk = checklistAnswers[idx] ?? true;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <span className="font-semibold text-slate-800">
                    {idx + 1}. {item}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setChecklistAnswers({ ...checklistAnswers, [idx]: true })}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                        isOk
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      ✓ Uygun
                    </button>
                    <button
                      type="button"
                      onClick={() => setChecklistAnswers({ ...checklistAnswers, [idx]: false })}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                        !isOk
                          ? 'bg-rose-600 text-white shadow'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      ✗ Uygun Değil
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Şef Denetim Notu:</label>
            <input
              type="text"
              value={auditNote}
              onChange={(e) => setAuditNote(e.target.value)}
              placeholder="Varsa şef denetim notu..."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <button
              disabled={busy}
              onClick={async () => {
                await onSubmit(true);
                onClose();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition"
            >
              <i className="fa-solid fa-check-double"></i> Denetimi Onayla
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                await onSubmit(false);
                onClose();
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition"
            >
              <i className="fa-solid fa-triangle-exclamation"></i> Uygunsuzluk Aç
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
