import React from 'react';
import { Location } from '../../api';

interface StaffChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  curLocation: Location | undefined;
  task1: boolean;
  setTask1: (v: boolean) => void;
  task2: boolean;
  setTask2: (v: boolean) => void;
  task3: boolean;
  setTask3: (v: boolean) => void;
  task4: boolean;
  setTask4: (v: boolean) => void;
  staffNote: string;
  setStaffNote: (v: string) => void;
  busy?: boolean;
  onSubmit: () => Promise<void>;
}

export const StaffChecklistModal: React.FC<StaffChecklistModalProps> = ({
  isOpen,
  onClose,
  curLocation,
  task1,
  setTask1,
  task2,
  setTask2,
  task3,
  setTask3,
  task4,
  setTask4,
  staffNote,
  setStaffNote,
  busy = false,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider bg-blue-500/40 px-2 py-0.5 rounded">
              Rutin Temizlik Formu
            </span>
            <h3 className="font-bold text-sm mt-1">📋 {curLocation?.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-200 text-lg w-8 h-8 rounded-full flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition">
              <input
                type="checkbox"
                checked={task1}
                onChange={(e) => setTask1(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-semibold text-slate-800">
                1. Klozet, pisuvar ve lavabolar dezenfekte edildi
              </span>
            </label>
            <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition">
              <input
                type="checkbox"
                checked={task2}
                onChange={(e) => setTask2(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-semibold text-slate-800">
                2. Sıvı sabun, kağıt havlu ve tuvalet kağıdı ikmali yapıldı
              </span>
            </label>
            <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition">
              <input
                type="checkbox"
                checked={task3}
                onChange={(e) => setTask3(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-semibold text-slate-800">
                3. Çöp kovaları boşaltıldı ve yeni poşet takıldı
              </span>
            </label>
            <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition">
              <input
                type="checkbox"
                checked={task4}
                onChange={(e) => setTask4(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="font-semibold text-slate-800">
                4. Zemin mop ile silindi ve kurulandı
              </span>
            </label>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Varsa Sarf / Arıza Notu:
            </label>
            <input
              type="text"
              value={staffNote}
              onChange={(e) => setStaffNote(e.target.value)}
              placeholder="Sarf malzeme ikmali veya teknik arıza notu..."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              disabled={busy}
              onClick={async () => {
                await onSubmit();
                onClose();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition"
            >
              <i className="fa-solid fa-circle-check text-base"></i>
              Temizliği Tamamla ve Dijital Beyan Oluştur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
