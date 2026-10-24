import React from 'react';
import { Incident, Location, DashboardData, SupervisorLocationStatus } from '../../api';

interface SupervisorViewProps {
  locations: Location[];
  curLocation: Location | undefined;
  allIncidents: Incident[];
  dashboard: DashboardData | null;
  supervisorStatus: SupervisorLocationStatus | null;
  selectedId: string;
  setSelectedId: (id: string) => void;
  incidentFilterLoc: string;
  setIncidentFilterLoc: (loc: string) => void;
  incidentFilterStatus: string;
  setIncidentFilterStatus: (status: string) => void;
  assigneeMap: Record<string, string>;
  setAssigneeMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetNotice: (n: { text: string; bad?: boolean }) => void;
  onViewPhoto: (url: string | null) => void;
  onDispatch: (incidentId: string) => Promise<void>;
  onVerifyClose: (incidentId: string) => Promise<void>;
  onLoadIncidents: () => Promise<void>;
  onOpenAuditModal: () => void;
  onOpenScheduleModal: () => void;
  onOpenPastModal: () => void;
}

export const SupervisorView: React.FC<SupervisorViewProps> = ({
  locations,
  curLocation,
  allIncidents,
  dashboard,
  supervisorStatus,
  selectedId,
  setSelectedId,
  incidentFilterLoc,
  setIncidentFilterLoc,
  incidentFilterStatus,
  setIncidentFilterStatus,
  assigneeMap,
  setAssigneeMap,
  onSetNotice,
  onViewPhoto,
  onDispatch,
  onVerifyClose,
  onLoadIncidents,
  onOpenAuditModal,
  onOpenScheduleModal,
  onOpenPastModal,
}) => {
  const effectiveIncidents =
    allIncidents.length > 0
      ? allIncidents
      : dashboard?.allIncidents || supervisorStatus?.activeIncidents || [];
  const activeAll = effectiveIncidents.filter((i) => i.status !== 'VERIFIED_CLOSED');
  const filteredIncidents = activeAll.filter((inc) => {
    if (incidentFilterLoc !== 'all' && inc.locationId !== incidentFilterLoc) return false;
    if (incidentFilterStatus !== 'all' && inc.status !== incidentFilterStatus) return false;
    return true;
  });

  const openCount = activeAll.filter((i) => i.status === 'OPEN').length;
  const dispatchedCount = activeAll.filter((i) => i.status === 'DISPATCHED').length;
  const resolvedCount = activeAll.filter((i) => i.status === 'RESOLVED_BY_STAFF').length;

  return (
    <div className="w-full max-w-2xl space-y-4">
      {/* 1. EN ÜSTTE: ÇOKLU MAHAL ANKET & UYGUNSUZLUK BİLDİRİM MERKEZİ */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-800 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <i className="fa-solid fa-bell text-rose-400 text-lg animate-pulse"></i>
            <div>
              <h3 className="text-sm font-black tracking-wide">
                🚨 ANKET &amp; UYGUNSUZLUK BİLDİRİM EKRANI
              </h3>
              <p className="text-[11px] text-purple-200">
                Tüm mahallerden gelen canlı şikayet ve olay masası
              </p>
            </div>
          </div>
          <span className="bg-rose-600 text-white font-black px-2.5 py-1 rounded-full text-xs shadow">
            {activeAll.length} Canlı Bildirim
          </span>
        </div>

        {/* Filtreleme ve Özet Çubuğu */}
        <div className="p-4 space-y-3 border-b border-slate-100 bg-slate-50/70">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setIncidentFilterStatus('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                incidentFilterStatus === 'all'
                  ? 'bg-purple-700 text-white shadow'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tümü ({activeAll.length})
            </button>
            <button
              onClick={() => setIncidentFilterStatus('OPEN')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                incidentFilterStatus === 'OPEN'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              🚨 Bekleyen ({openCount})
            </button>
            <button
              onClick={() => setIncidentFilterStatus('DISPATCHED')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                incidentFilterStatus === 'DISPATCHED'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              🏃 Müdahalede ({dispatchedCount})
            </button>
            <button
              onClick={() => setIncidentFilterStatus('RESOLVED_BY_STAFF')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                incidentFilterStatus === 'RESOLVED_BY_STAFF'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              📸 Fotoğraflı Onay ({resolvedCount})
            </button>
          </div>

          {/* Çoklu Alan / Mahal Seçici Filtresi */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
              <i className="fa-solid fa-filter text-purple-600 mr-1"></i> Mahal Filtresi:
            </span>
            <select
              value={incidentFilterLoc}
              onChange={(e) => setIncidentFilterLoc(e.target.value)}
              className="flex-1 bg-white border border-purple-200 rounded-lg p-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-purple-400"
            >
              <option value="all">
                🏢 Tüm Mahaller &amp; Alanlar ({activeAll.length} Bildirim)
              </option>
              {locations.map((loc) => {
                const count = activeAll.filter((i) => i.locationId === loc.id).length;
                return (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code}) {count > 0 ? `— 🚨 ${count} Bildirim` : '— Temiz'}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {filteredIncidents.length > 0 ? (
            filteredIncidents.map((inc) => {
              const isNonConformity = inc.issuesJson?.some(
                (iss) => iss.startsWith('❌') || iss.includes('Denetim'),
              );
              return (
                <div
                  key={inc.id}
                  className={`p-3.5 rounded-xl space-y-2 text-xs border-2 shadow-sm ${
                    inc.status === 'OPEN'
                      ? 'bg-rose-50 border-rose-400'
                      : inc.status === 'DISPATCHED'
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-emerald-50 border-emerald-400'
                  }`}
                >
                  {/* Mahal Rozeti & Hızlı Odaklanma Butonu */}
                  <div className="flex items-center justify-between bg-white/90 p-2 rounded-lg border border-slate-200">
                    <span className="font-bold text-xs text-purple-950 flex items-center gap-1.5">
                      <i className="fa-solid fa-location-dot text-rose-600"></i>
                      {inc.locationName ||
                        locations.find((l) => l.id === inc.locationId)?.name ||
                        'WC Mahali'}{' '}
                      ({inc.locationCode || ''})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(inc.locationId);
                        onSetNotice({
                          text: `${inc.locationName || 'Seçilen mahal'} denetim için seçildi.`,
                        });
                      }}
                      className="text-[11px] bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold px-2 py-0.5 rounded transition flex items-center gap-1 shadow-sm"
                      title="Bu mahali denetim için seç"
                    >
                      <i className="fa-solid fa-arrow-right"></i> Bu Mahale Git
                    </button>
                  </div>

                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-900 flex items-center gap-1.5">
                      {inc.status === 'OPEN' && '🚨 YENİ BİLDİRİM'}
                      {inc.status === 'DISPATCHED' && '🏃 MÜDAHALE SÜRÜYOR'}
                      {inc.status === 'RESOLVED_BY_STAFF' &&
                        '📸 MÜDAHALE TAMAMLANDI - FOTOĞRAFLI ONAY BEKLİYOR'}
                      <span className="font-mono text-[10px] text-slate-500">({inc.id})</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isNonConformity
                          ? 'bg-purple-200 text-purple-900'
                          : 'bg-rose-200 text-rose-900'
                      }`}
                    >
                      {isNonConformity ? 'Şef Uygunsuzluğu' : 'Ziyaretçi Anketi'} • Saat: {inc.time}
                    </span>
                  </div>

                  <p className="text-slate-800">
                    Tespit Edilen Sorunlar:{' '}
                    <strong className="text-rose-700">
                      {inc.issuesJson?.join(', ') || 'Genel Şikayet'}
                    </strong>
                  </p>

                  {/* Durum: AÇIK ŞİKAYET - PERSONELE ATA */}
                  {inc.status === 'OPEN' && (
                    <div className="flex items-center gap-2 pt-1 border-t border-rose-200">
                      <select
                        value={assigneeMap[inc.id] || 'Ahmet Temizlik'}
                        onChange={(e) =>
                          setAssigneeMap({ ...assigneeMap, [inc.id]: e.target.value })
                        }
                        className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-purple-500"
                      >
                        <option value="Ahmet Temizlik">Ahmet Temizlik (Görevli Personel)</option>
                        <option value="Mehmet Hijyen">Mehmet Hijyen</option>
                        <option value="Ayşe Kaya">Ayşe Kaya</option>
                        <option value="Fatma Çelik">Fatma Çelik</option>
                      </select>
                      <button
                        onClick={async () => {
                          await onDispatch(inc.id);
                          void onLoadIncidents();
                        }}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-3 rounded-lg shadow text-xs flex items-center gap-1.5 whitespace-nowrap"
                      >
                        📢 Personele Görev Ata
                      </button>
                    </div>
                  )}

                  {/* Durum: ATANDI - PERSONEL SAHADA */}
                  {inc.status === 'DISPATCHED' && (
                    <div className="p-2 bg-amber-100/70 rounded-lg text-amber-900 font-medium flex items-center justify-between">
                      <span>
                        Görev <strong>{inc.assignedStaffName || 'Personel'}</strong> personeline atandı.
                        Müdahale bekleniyor...
                      </span>
                    </div>
                  )}

                  {/* Durum: PERSONEL MÜDAHALE ETTİ - FOTOĞRAFLI ONAY BEKLİYOR */}
                  {inc.status === 'RESOLVED_BY_STAFF' && (
                    <div className="space-y-2 pt-1 border-t border-emerald-200">
                      <p className="text-xs text-emerald-900">
                        <strong>{inc.assignedStaffName}</strong> müdahaleyi tamamladı.
                        <span className="block mt-0.5 text-slate-700 italic">
                          Not: "{inc.resolutionNote || 'Sorun giderildi'}"
                        </span>
                      </p>

                      {/* Fotoğraf Kanıtı */}
                      {inc.photoUrl && (
                        <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-emerald-300">
                          <img
                            src={inc.photoUrl}
                            alt="Müdahale Kanıt Fotoğrafı"
                            onClick={() => onViewPhoto(inc.photoUrl || null)}
                            className="w-16 h-16 object-cover rounded-lg border-2 border-emerald-500 cursor-pointer shadow hover:opacity-90 transition"
                            title="Büyük boyutta görmek için tıklayınız"
                          />
                          <div className="text-xs text-slate-600">
                            <span className="font-bold text-emerald-800 block">
                              📸 Personel Müdahale Kanıt Fotoğrafı
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Büyütmek için fotoğrafa tıklayabilirsiniz.
                            </span>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={async () => {
                          await onVerifyClose(inc.id);
                          void onLoadIncidents();
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl shadow flex items-center justify-center gap-1.5 text-xs transition"
                      >
                        <i className="fa-solid fa-stamp"></i> Fotoğrafı &amp; Müdahaleyi Doğrula ve Olayı Kapat
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
              <span className="flex items-center gap-2 font-bold">
                <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
                Seçili filtrede bekleyen açık şikayet veya uygunsuzluk bildirimi yok
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">
                Standart Operasyon
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. WC SEÇME KUTUSU VE SEÇTİĞİ ALAN İÇİN 3 BUTON */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
        <div>
          <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
            <i className="fa-solid fa-restroom text-purple-600"></i>
            Denetlenecek WC / Mahal Seçimi:
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-slate-50 border-2 border-slate-300 hover:border-purple-400 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition shadow-sm"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code}) — {loc.building}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Seçili WC: <strong className="text-slate-800">{curLocation?.name}</strong> • Son Temizlik:{' '}
            <strong className="text-purple-800">
              {supervisorStatus?.lastCleaning?.actualTime || 'Henüz Yapılmadı'}
            </strong>
          </p>
        </div>

        {/* 3 BÜYÜK EYLEM BUTONU (ŞEF EKRANINDA BAŞKA BİR ŞEY OLMAYACAK) */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          {/* Buton 1: Denetim Yap */}
          <button
            type="button"
            onClick={onOpenAuditModal}
            className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-black py-4 px-5 rounded-2xl shadow-lg transition flex items-center justify-between text-sm group"
          >
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                <i className="fa-solid fa-clipboard-check"></i>
              </span>
              <span className="text-left">
                <span className="block text-base">📋 Denetim Yap</span>
                <span className="text-xs text-purple-200 font-normal">
                  Bu alan için kalite denetim checklistini doldur ve onayla
                </span>
              </span>
            </span>
            <i className="fa-solid fa-chevron-right text-purple-300 group-hover:translate-x-1 transition"></i>
          </button>

          {/* Buton 2: Planlanan Temizlik Saatleri */}
          <button
            type="button"
            onClick={onOpenScheduleModal}
            className="w-full bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-700 hover:to-blue-800 text-white font-black py-4 px-5 rounded-2xl shadow-lg transition flex items-center justify-between text-sm group"
          >
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                <i className="fa-solid fa-calendar-days"></i>
              </span>
              <span className="text-left">
                <span className="block text-base">📅 Planlanan Temizlik Saatleri</span>
                <span className="text-xs text-indigo-200 font-normal">
                  Günlük slot saatleri, SLA durumları ve tolerans uyumu
                </span>
              </span>
            </span>
            <i className="fa-solid fa-chevron-right text-indigo-300 group-hover:translate-x-1 transition"></i>
          </button>

          {/* Buton 3: Mevcut Temizlik Saatleri */}
          <button
            type="button"
            onClick={onOpenPastModal}
            className="w-full bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white font-black py-4 px-5 rounded-2xl shadow-lg transition flex items-center justify-between text-sm group"
          >
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg">
                <i className="fa-solid fa-clock-rotate-left text-teal-300"></i>
              </span>
              <span className="text-left">
                <span className="block text-base">🕒 Mevcut Temizlik Saatleri</span>
                <span className="text-xs text-slate-300 font-normal">
                  Bugün bu alanda yapılan temizliklerin saat ve personel kayıtları
                </span>
              </span>
            </span>
            <i className="fa-solid fa-chevron-right text-slate-400 group-hover:translate-x-1 transition"></i>
          </button>
        </div>
      </div>
    </div>
  );
};
