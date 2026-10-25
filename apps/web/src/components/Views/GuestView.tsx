import React from 'react';
import { Location, PublicLocationStatus } from '../../api';

interface GuestViewProps {
  isDirectQrVisit: boolean;
  previewGuestMode: boolean;
  setPreviewGuestMode: (val: boolean) => void;
  curLocation: Location | undefined;
  status: PublicLocationStatus | null;
  busy?: boolean;
  selectedRating: 'good' | 'fair' | 'bad' | '';
  selectedIssues: string[];
  setSelectedIssues: (issues: string[]) => void;
  surveySent: boolean;
  rootCauses: readonly { id: string; label: string; short: string }[];
  onQuickAdminLogin?: () => void;
  onOpenAuthModal: () => void;
  onOpenGuestSchedule: () => void;
  onRatingClick: (rating: 'good' | 'fair' | 'bad') => void;
  onNegativeFeedbackSubmit: (e: React.FormEvent) => void;
}

export const GuestView: React.FC<GuestViewProps> = ({
  isDirectQrVisit,
  previewGuestMode,
  setPreviewGuestMode,
  curLocation,
  status,
  busy = false,
  selectedRating,
  selectedIssues,
  setSelectedIssues,
  surveySent,
  rootCauses,
  onQuickAdminLogin,
  onOpenAuthModal,
  onOpenGuestSchedule,
  onRatingClick,
  onNegativeFeedbackSubmit,
}) => {
  if (!isDirectQrVisit && !previewGuestMode) {
    return (
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col my-4">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-3xl">
              👑
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/30 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                Masaüstü Portalı (Desktop Web)
              </span>
              <h1 className="text-2xl font-black mt-1">Sistem Yöneticisi Merkezi</h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Operasyonel Analitik, Lokasyonlar, Vardiyalar &amp; Denetim İzi Yönetimi
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* SAHA MOBİL UYGULAMASI BİLGİLENDİRME KUTUSU */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shrink-0 mt-0.5">
                📱
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-blue-950">
                  Saha Operasyonları Mobil Uygulamaya Taşındı
                </h3>
                <p className="text-xs text-blue-900 leading-relaxed">
                  Saha kullanım standartları gereğince <strong>Ziyaretçi Anket Girişi</strong>, <strong>Personel Görev &amp; Checklist Ekranı</strong> ve <strong>Nöbetçi Şef Denetim &amp; Olay Atama Ekranı</strong> bağımsız <code className="bg-blue-200/80 text-blue-950 font-bold px-1.5 py-0.5 rounded">@wc/mobile</code> (React Native / Expo) uygulamasına taşınmıştır.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-blue-200 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-blue-100 flex items-center gap-2">
                <span className="text-base">📋</span>
                <div>
                  <div className="font-bold text-slate-800">Anket Terminali</div>
                  <div className="text-[10px] text-slate-500">Kiosk &amp; Saha Tableti</div>
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-blue-100 flex items-center gap-2">
                <span className="text-base">🧹</span>
                <div>
                  <div className="font-bold text-slate-800">Personel Ekranı</div>
                  <div className="text-[10px] text-slate-500">Checklist &amp; Fotoğraflı Çözüm</div>
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-blue-100 flex items-center gap-2">
                <span className="text-base">👔</span>
                <div>
                  <div className="font-bold text-slate-800">Şef Portalı</div>
                  <div className="text-[10px] text-slate-500">Olay Merkezi &amp; 3 Buton</div>
                </div>
              </div>
            </div>
          </div>

          {/* GİRİŞ EYLEMLERİ */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Yönetim ve Personel Portalı
              </h3>
            </div>

            <button
              type="button"
              onClick={onOpenAuthModal}
              disabled={busy}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-black py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.99] transition flex items-center justify-center gap-2 text-sm"
            >
              <i className="fa-solid fa-arrow-right-to-bracket text-indigo-200"></i>
              Sistem Yetkili Girişi (Şef / Personel / Admin)
            </button>
          </div>

          {/* MASAÜSTÜNDE SAHA SİMÜLASYONU / ÖNİZLEME */}
          <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Masaüstünde saha anket görünümünü test etmek ister misiniz?</span>
            <button
              type="button"
              onClick={() => setPreviewGuestMode(true)}
              className="text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 hover:bg-teal-100 transition"
            >
              <i className="fa-solid fa-mobile-screen"></i>
              Saha Anket Ekranını Masaüstünde Önizle
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
      {previewGuestMode && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 text-xs flex justify-between items-center">
          <span>
            <strong>Önizleme Modu:</strong> Ziyaretçi anket ekranı önizlenmektedir.
          </span>
          <button
            onClick={() => setPreviewGuestMode(false)}
            className="text-amber-950 font-bold underline ml-2"
          >
            Yönetici Paneline Dön
          </button>
        </div>
      )}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-700 text-white p-5 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 rounded-full mb-2">
          <i className="fa-solid fa-restroom text-2xl"></i>
        </div>
        <h2 className="text-xl font-bold">{curLocation?.name || 'Mahal Seçiniz'}</h2>
        <p className="text-xs text-teal-100 mt-0.5">{curLocation?.code || '-'}</p>
      </div>

      <div className="p-5 space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
            Bu Alan En Son Temizlendi
          </p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <i className="fa-regular fa-clock text-emerald-600 text-xl"></i>
            <span className="text-3xl font-black text-emerald-700">
              {status?.lastCleaningTime || '--:--'}
            </span>
          </div>
          <p className="text-[11px] text-emerald-600 mt-1">
            Periyodik dezenfeksiyon standartlarına tabidir.
          </p>
          <button
            onClick={onOpenGuestSchedule}
            className="mt-3 w-full bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm transition"
          >
            <i className="fa-solid fa-list-check text-emerald-600"></i>
            🕒 Bugünkü Temizlik Saatlerini Gör
          </button>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-bold text-slate-800 text-center mb-1">
            Tuvalet Temizliğini Nasıl Buldunuz?
          </h3>
          <p className="text-xs text-slate-500 text-center mb-3">
            Lütfen deneyiminizi 1 tıkla seçiniz:
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              disabled={busy}
              onClick={() => onRatingClick('good')}
              className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 active:scale-95 transition-all group"
            >
              <span className="text-4xl group-hover:scale-110 transition-transform">😊</span>
              <span className="text-xs font-bold text-emerald-800 mt-1">İyi / Temiz</span>
            </button>
            <button
              disabled={busy}
              onClick={() => onRatingClick('fair')}
              className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-amber-200 bg-amber-50/50 hover:bg-amber-100 active:scale-95 transition-all group"
            >
              <span className="text-4xl group-hover:scale-110 transition-transform">😐</span>
              <span className="text-xs font-bold text-amber-800 mt-1">Orta</span>
            </button>
            <button
              disabled={busy}
              onClick={() => onRatingClick('bad')}
              className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-rose-200 bg-rose-50/50 hover:bg-rose-100 active:scale-95 transition-all group"
            >
              <span className="text-4xl group-hover:scale-110 transition-transform">😡</span>
              <span className="text-xs font-bold text-rose-800 mt-1">Kötü</span>
            </button>
          </div>

          {(selectedRating === 'bad' || selectedRating === 'fair') && (
            <form
              onSubmit={onNegativeFeedbackSubmit}
              className={`mt-4 pt-3 border-t p-3 rounded-xl ${
                selectedRating === 'bad'
                  ? 'border-rose-200 bg-rose-50/50'
                  : 'border-amber-200 bg-amber-50/50'
              }`}
            >
              <div
                className={`flex items-center gap-1.5 font-bold text-xs mb-1 ${
                  selectedRating === 'bad' ? 'text-rose-800' : 'text-amber-800'
                }`}
              >
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>
                  {selectedRating === 'bad'
                    ? 'Lütfen Karşılaştığınız Sorunları Seçiniz:'
                    : 'Geliştirilmesi Gereken Hususları Seçebilirsiniz:'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-2">
                {selectedRating === 'bad'
                  ? 'En az bir neden işaretlenmelidir:'
                  : 'İyileştirme için geri bildiriminizi iletebilirsiniz:'}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {rootCauses.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-rose-400 select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIssues.includes(item.label)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIssues([...selectedIssues, item.label]);
                        else setSelectedIssues(selectedIssues.filter((i) => i !== item.label));
                      }}
                      className="rounded text-rose-600"
                    />
                    <span className="font-medium text-slate-700">{item.short}</span>
                  </label>
                ))}
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-3 w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md transition flex items-center justify-center gap-2 text-xs"
              >
                <i className="fa-solid fa-paper-plane"></i>
                Şikayeti İlet &amp; İlgili Şefe Bildir
              </button>
            </form>
          )}

          {surveySent && (
            <div className="mt-4 p-4 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-center">
              <i className="fa-solid fa-circle-check text-2xl text-emerald-600 mb-1"></i>
              <p className="font-bold text-sm">Geri Bildiriminiz Alındı!</p>
              <p className="text-xs text-emerald-700">
                Geri bildiriminiz ilgili yöneticiye iletilmiştir.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
