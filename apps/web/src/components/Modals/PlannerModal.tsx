import React from 'react';
import { Location } from '../../api';

interface PlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  curLocation: Location | undefined;
  workingTolerance: number;
  setWorkingTolerance: (t: number) => void;
  workingSchedule: string[];
  setWorkingSchedule: (s: string[]) => void;
  newTimeInput: string;
  setNewTimeInput: (t: string) => void;
  onSave: () => Promise<void>;
}

export const PlannerModal: React.FC<PlannerModalProps> = ({
  isOpen,
  onClose,
  curLocation,
  workingTolerance,
  setWorkingTolerance,
  workingSchedule,
  setWorkingSchedule,
  newTimeInput,
  setNewTimeInput,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="bg-purple-800 text-white p-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <i className="fa-solid fa-sliders"></i> Plan ve Tolerans Parametreleri
            </h3>
            <p className="text-[11px] text-purple-200">{curLocation?.name}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-purple-200 text-lg">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <i className="fa-solid fa-stopwatch text-amber-700"></i> Süre Sapma Toleransı (Dakika):
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={workingTolerance}
                onChange={(e) => setWorkingTolerance(Number(e.target.value) || 15)}
                className="w-16 bg-white border border-amber-300 rounded-lg p-1 text-xs text-center font-bold text-amber-900 outline-none"
              />
            </div>
          </div>

          <div className="bg-purple-50 p-3 rounded-xl border border-purple-200">
            <span className="text-[11px] font-bold text-purple-900 block mb-1.5">⚡ Hızlı Saat Şablonları:</span>
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <button
                type="button"
                onClick={() =>
                  setWorkingSchedule(['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'])
                }
                className="bg-white border border-purple-300 text-purple-800 font-semibold py-1.5 rounded hover:bg-purple-100"
              >
                2 Saatte Bir<br />(08 - 20)
              </button>
              <button
                type="button"
                onClick={() =>
                  setWorkingSchedule([
                    '08:00',
                    '09:00',
                    '10:00',
                    '11:00',
                    '12:00',
                    '13:00',
                    '14:00',
                    '15:00',
                    '16:00',
                    '17:00',
                    '18:00',
                  ])
                }
                className="bg-white border border-purple-300 text-purple-800 font-semibold py-1.5 rounded hover:bg-purple-100"
              >
                1 Saatte Bir<br />(08 - 18)
              </button>
              <button
                type="button"
                onClick={() => setWorkingSchedule(['09:00', '14:00', '19:00'])}
                className="bg-white border border-purple-300 text-purple-800 font-semibold py-1.5 rounded hover:bg-purple-100"
              >
                3 Vardiya<br />(09, 14, 19)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Yeni Saat Ekle:</label>
              <input
                type="time"
                value={newTimeInput}
                onChange={(e) => setNewTimeInput(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-800"
              />
            </div>
            <div className="pt-4">
              <button
                type="button"
                onClick={() => {
                  if (!workingSchedule.includes(newTimeInput)) {
                    setWorkingSchedule([...workingSchedule, newTimeInput].sort());
                  }
                }}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1 shadow"
              >
                <i className="fa-solid fa-plus"></i> Ekle
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-700">Planlanan Saatler:</span>
              <span className="text-[11px] text-purple-700 font-bold">{workingSchedule.length} Slot</span>
            </div>
            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[60px]">
              {workingSchedule.map((timeStr, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 bg-purple-100 border border-purple-300 text-purple-900 font-bold px-2.5 py-1 rounded-lg text-xs shadow-sm"
                >
                  <i className="fa-regular fa-clock text-purple-700"></i>
                  <span>{timeStr}</span>
                  <button
                    type="button"
                    onClick={() => setWorkingSchedule(workingSchedule.filter((_, i) => i !== idx))}
                    className="ml-1 text-purple-400 hover:text-rose-600 font-black"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-3 flex items-center justify-between border-t border-slate-200">
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 font-semibold">
            Vazgeç
          </button>
          <button
            onClick={onSave}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-5 rounded-lg flex items-center gap-1.5 shadow"
          >
            <i className="fa-solid fa-floppy-disk"></i> Plan ve Toleransı Kaydet
          </button>
        </div>
      </div>
    </div>
  );
};
