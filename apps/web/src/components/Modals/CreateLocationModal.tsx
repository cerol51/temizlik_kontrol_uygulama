import React, { FormEvent, useState } from 'react';

interface Props {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    code?: string;
    building?: string;
    toleranceMinutes?: number;
    schedule?: string[];
    currentSupervisorName?: string;
    backupSupervisorName?: string;
  }) => Promise<void>;
}

export function CreateLocationModal({ open, busy, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [building, setBuilding] = useState('Ana Bina');
  const [tolerance, setTolerance] = useState(15);
  const [preset, setPreset] = useState('2hour');
  const [sup, setSup] = useState('Kemal Şef');
  const [backupSup, setBackupSup] = useState('Ayşe Şef');

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    let schedule = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
    if (preset === '1hour') {
      schedule = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    } else if (preset === '3shift') {
      schedule = ['09:00', '14:00', '19:00'];
    }

    await onSubmit({
      name: name.trim(),
      code: code.trim() || undefined,
      building: building.trim() || undefined,
      toleranceMinutes: tolerance,
      schedule,
      currentSupervisorName: sup.trim() || undefined,
      backupSupervisorName: backupSup.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <i className="fa-solid fa-plus-circle text-emerald-400"></i> Yeni WC Mahali Tanımla
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Mahal / WC Adı <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: 2. Kat Doğu Kanadı Kadın WC"
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Mahal Kodu (Opsiyonel)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Örn: WC-T1-Z-01"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
              />
              <span className="text-[10px] text-slate-400">Boş bırakılırsa otomatik üretilir.</span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Bina / Bölüm
              </label>
              <input
                type="text"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                placeholder="Örn: Terminal 1 veya Ana Bina"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Süre Sapma Toleransı (Dakika)
              </label>
              <select
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
              >
                <option value={10}>±10 Dakika</option>
                <option value={15}>±15 Dakika (Standart)</option>
                <option value={20}>±20 Dakika</option>
                <option value={30}>±30 Dakika</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Temizlik Saat Planı Şablonu
              </label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
              >
                <option value="2hour">2 Saatte Bir (7 Slot: 08:00 - 20:00)</option>
                <option value="1hour">Saat Başı (11 Slot: 08:00 - 18:00)</option>
                <option value="3shift">Günde 3 Kez (09:00, 14:00, 19:00)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Nöbetçi Şef
              </label>
              <input
                type="text"
                value={sup}
                onChange={(e) => setSup(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Yedek Şef (Eskalasyon)
              </label>
              <input
                type="text"
                value={backupSup}
                onChange={(e) => setBackupSup(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
            <i className="fa-solid fa-qrcode text-emerald-600 mr-1.5"></i>
            Kaydet butonuna tıkladığınızda mahal oluşturulacak ve yazdırılabilir yüksek çözünürlüklü QR etiket kartı açılacaktır.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold py-2 px-5 rounded-lg shadow-sm flex items-center gap-1.5"
            >
              <i className="fa-solid fa-check"></i> Kaydet ve QR Oluştur
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
