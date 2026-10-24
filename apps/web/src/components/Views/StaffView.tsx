import React from 'react';
import { Incident, Location, DashboardData, SupervisorLocationStatus } from '../../api';

interface StaffViewProps {
  curLocation: Location | undefined;
  currentTime: string;
  allIncidents: Incident[];
  dashboard: DashboardData | null;
  supervisorStatus: SupervisorLocationStatus | null;
  selectedId: string;
  staffPhotoBase64: string;
  setStaffPhotoBase64: (val: string) => void;
  staffResolveNote: string;
  setStaffResolveNote: (val: string) => void;
  busy?: boolean;
  onPhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewPhoto: (url: string) => void;
  onStaffResolve: (incidentId: string) => Promise<void>;
  onLoadIncidents: () => Promise<void>;
  onOpenChecklistModal: () => void;
  onOpenScheduleModal: () => void;
  onOpenPastModal: () => void;
}

export const StaffView: React.FC<StaffViewProps> = ({
  curLocation,
  currentTime,
  allIncidents,
  dashboard,
  supervisorStatus,
  selectedId,
  staffPhotoBase64,
  setStaffPhotoBase64,
  staffResolveNote,
  setStaffResolveNote,
  busy = false,
  onPhotoSelect,
  onViewPhoto,
  onStaffResolve,
  onLoadIncidents,
  onOpenChecklistModal,
  onOpenScheduleModal,
  onOpenPastModal,
}) => {
  const effectiveIncidents =
    allIncidents.length > 0
      ? allIncidents
      : dashboard?.allIncidents || supervisorStatus?.activeIncidents || [];

  const staffAssignedTasks = effectiveIncidents.filter(
    (inc) =>
      inc.locationId === selectedId &&
      (inc.status === 'DISPATCHED' || inc.status === 'OPEN'),
  );

  return (
    <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
      {/* Personel Başlığı */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl border border-white/20">
              <i className="fa-solid fa-broom text-blue-200"></i>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider bg-blue-500/40 px-2 py-0.5 rounded">
                Saha Operasyon
              </span>
              <h2 className="text-xl font-black mt-0.5">{curLocation?.name}</h2>
              <p className="text-xs text-blue-100 font-mono">
                {curLocation?.code} — {curLocation?.building}
              </p>
            </div>
          </div>
          <span className="font-mono font-bold text-xs bg-black/25 px-2.5 py-1 rounded border border-white/20">
            {currentTime.substring(0, 5)}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* 1. ŞEFTEN GELEN GÖREVLER & UYGUNSUZLUKLAR (DOĞRU & MERKEZİ TAKİP) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <i className="fa-solid fa-bell text-rose-600 animate-bounce"></i>
              Şef Tarafından Atanan Görevler &amp; Bildirimler
            </h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                staffAssignedTasks.length > 0
                  ? 'bg-rose-100 text-rose-800 animate-pulse'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {staffAssignedTasks.length > 0
                ? `${staffAssignedTasks.length} Aktif Görev`
                : 'Görev Yok'}
            </span>
          </div>

          {staffAssignedTasks.length > 0 ? (
            staffAssignedTasks.map((task) => {
              const isNonConformity = task.issuesJson?.some(
                (iss) => iss.startsWith('❌') || iss.includes('Denetim'),
              );
              return (
                <div
                  key={task.id}
                  className="p-4 bg-amber-50/90 border-2 border-amber-400 rounded-2xl space-y-3 shadow-md"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`px-2 py-0.5 rounded font-black text-[10px] flex items-center gap-1 ${
                        isNonConformity
                          ? 'bg-purple-200 text-purple-900'
                          : 'bg-rose-200 text-rose-900'
                      }`}
                    >
                      <i
                        className={`fa-solid ${
                          isNonConformity
                            ? 'fa-clipboard-question'
                            : 'fa-triangle-exclamation'
                        }`}
                      ></i>
                      {isNonConformity
                        ? 'ŞEF DENETİM UYGUNSUZLUĞU'
                        : 'ZİYARETÇİ KÖTÜ ANKETİ'}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border">
                      {task.id} • {task.time}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-amber-200 space-y-1 text-xs">
                    <span className="text-slate-500 block text-[11px] font-bold">
                      Müdahale Edilecek Konular:
                    </span>
                    <div className="font-bold text-rose-900 text-xs">
                      {task.issuesJson?.join(', ') || 'Genel Temizlik İhtiyacı'}
                    </div>
                    {task.resolutionNote && (
                      <p className="text-[11px] text-purple-800 italic pt-1 border-t border-slate-100">
                        {task.resolutionNote}
                      </p>
                    )}
                  </div>

                  {/* Fotoğraf Ekleme Alanı */}
                  <div className="space-y-2 pt-1 border-t border-amber-200">
                    <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <i className="fa-solid fa-camera text-blue-600"></i>
                      Müdahale Kanıt Fotoğrafı Ekleyiniz:
                    </label>

                    <div className="flex items-center gap-2">
                      <label className="flex-1 bg-white hover:bg-slate-50 border-2 border-dashed border-amber-400 rounded-xl p-2.5 text-center cursor-pointer transition flex items-center justify-center gap-2 text-xs font-bold text-amber-900 shadow-sm">
                        <i className="fa-solid fa-camera text-base text-amber-600"></i>
                        <span>
                          {staffPhotoBase64
                            ? '✓ Fotoğraf Yüklendi (Değiştir)'
                            : 'Fotoğraf Çek / Dosya Seç'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={onPhotoSelect}
                          className="hidden"
                        />
                      </label>
                      {staffPhotoBase64 && (
                        <div className="relative">
                          <img
                            src={staffPhotoBase64}
                            alt="Önizleme"
                            onClick={() => onViewPhoto(staffPhotoBase64)}
                            className="w-12 h-12 object-cover rounded-xl border-2 border-amber-500 cursor-pointer shadow"
                            title="Büyütmek için tıklayınız"
                          />
                          <button
                            type="button"
                            onClick={() => setStaffPhotoBase64('')}
                            className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center shadow font-bold"
                            title="Fotoğrafı Kaldır"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={staffResolveNote}
                        onChange={(e) => setStaffResolveNote(e.target.value)}
                        placeholder="Yapılan müdahale notu (örn: Sabun takviye edildi, zemin kurulandı)..."
                        className="w-full text-xs p-2.5 bg-white border border-amber-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                      />
                    </div>

                    <button
                      disabled={busy}
                      onClick={async () => {
                        await onStaffResolve(task.id);
                        void onLoadIncidents();
                      }}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md flex items-center justify-center gap-2 transition"
                    >
                      <i className="fa-solid fa-camera"></i>
                      Fotoğrafla Müdahaleyi Tamamla ve Görevi Kapat
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
              <span className="flex items-center gap-2 font-bold">
                <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
                Şu anda şeften atanmış acil görev veya denetim uygunsuzluğu yok
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">
                Rutin Mod
              </span>
            </div>
          )}
        </div>

        {/* 2. SADE EYLEM BUTONLARI (ŞEF EKRANI GİBİ SADE) */}
        <div className="space-y-3 pt-3 border-t border-slate-200">
          {/* Buton 1: Rutin Temizlik Checklist'i Yap */}
          <button
            type="button"
            onClick={onOpenChecklistModal}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black py-4 px-5 rounded-2xl shadow-lg transition flex items-center justify-between text-sm group"
          >
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                <i className="fa-solid fa-list-check"></i>
              </span>
              <span className="text-left">
                <span className="block font-black text-sm">
                  📋 Rutin Temizlik Checklist'i Yap
                </span>
                <span className="block text-[11px] text-blue-200 font-normal">
                  4 maddelik temizlik checklistini doldur ve beyan oluştur
                </span>
              </span>
            </span>
            <i className="fa-solid fa-chevron-right text-blue-200 group-hover:translate-x-1 transition"></i>
          </button>

          {/* Buton 2 & 3: Planlanan & Geçmiş Saatler */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenScheduleModal}
              className="py-3 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <i className="fa-solid fa-calendar-days text-indigo-600"></i> Planlanan Saatler
            </button>
            <button
              type="button"
              onClick={onOpenPastModal}
              className="py-3 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <i className="fa-solid fa-clock-rotate-left text-blue-600"></i> Geçmiş Temizlikler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
