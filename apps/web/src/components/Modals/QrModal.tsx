import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Location } from '../../api';

interface Props {
  open: boolean;
  location: Location | null;
  onClose: () => void;
}

export function QrModal({ open, location, onClose }: Props) {
  if (!open || !location) return null;

  const qrUrl = `${window.location.origin}/q/${location.token}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between no-print">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <i className="fa-solid fa-print text-emerald-400"></i> Saha QR Etiketi
            </h3>
            <p className="text-[11px] text-slate-400">{location.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg"
          >
            ✕
          </button>
        </div>

        {/* Fiziksel Yazdırılabilir Etiket Kartı */}
        <div className="p-6 flex flex-col items-center justify-center text-center space-y-4 printable-qr-card bg-white">
          <div className="border-b-2 border-slate-900 pb-2 w-full">
            <div className="text-[11px] uppercase tracking-widest font-black text-slate-700">
              AKILLI WC HİJYEN &amp; GERİ BİLDİRİM SİSTEMİ
            </div>
            <h2 className="text-base font-black text-slate-900 mt-1">{location.name}</h2>
            <div className="text-xs text-slate-600 font-medium">
              {location.building || 'Tesis'} • <span className="font-mono font-bold">{location.code}</span>
            </div>
          </div>

          {/* QR Kod SVG */}
          <div className="p-3 bg-white border-4 border-slate-900 rounded-2xl inline-block shadow-sm">
            <QRCodeSVG
              value={qrUrl}
              size={200}
              level="H"
              includeMargin={true}
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 w-full text-left space-y-1 text-xs">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <i className="fa-solid fa-mobile-screen-button text-emerald-600"></i> Ziyaretçiler:
            </div>
            <p className="text-[11px] text-slate-600">
              Kameranızla okutarak son temizlik saatini görebilir ve 1 tıkla memnuniyet bildirebilirsiniz.
            </p>
            <div className="font-bold text-slate-800 flex items-center gap-1.5 pt-1 border-t border-slate-200">
              <i className="fa-solid fa-id-badge text-blue-600"></i> Personel &amp; Şef:
            </div>
            <p className="text-[11px] text-slate-600">
              Kameranızla okutarak temizlik onayını ve rutin denetim formunu doldurunuz.
            </p>
          </div>

          <div className="w-full text-center">
            <code className="text-[10px] text-slate-500 font-mono block">
              {qrUrl}
            </code>
            <span className="text-[9px] text-slate-400 block mt-1">
              Güvenli Opaque Token Mimarisi • KVKK Uyumlu
            </span>
          </div>
        </div>

        {/* Butonlar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200"
          >
            Kapat
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-5 rounded-lg shadow flex items-center gap-2"
          >
            <i className="fa-solid fa-print"></i> Etiketi Yazdır (Print)
          </button>
        </div>
      </div>
    </div>
  );
}
