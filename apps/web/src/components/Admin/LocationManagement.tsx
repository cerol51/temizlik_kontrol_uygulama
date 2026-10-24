import React from 'react';
import { Location } from '../../api';

interface LocationManagementProps {
  locations: Location[];
  busy?: boolean;
  onOpenCreateLocation: () => void;
  onOpenSticker: (loc: Location) => void;
  onOpenPlanner?: (loc: Location) => void;
  onRegenerateToken: (loc: Location) => void;
  onDeleteLocation: (loc: Location) => void;
}

export const LocationManagement: React.FC<LocationManagementProps> = ({
  locations,
  busy = false,
  onOpenCreateLocation,
  onOpenSticker,
  onOpenPlanner,
  onRegenerateToken,
  onDeleteLocation,
}) => {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 bg-purple-100 text-purple-800 rounded-lg text-sm font-bold">
              <i className="fa-solid fa-qrcode"></i>
            </span>
            <h3 className="text-sm font-bold text-slate-800">
              WC Noktaları ve Güvenli QR Kod Yönetim Merkezi
            </h3>
            <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
              {locations.length} Mahal Kayıtlı
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Sistem genelindeki tüm WC mahallerini yönetebilir, yeni mahal ekleyebilir, QR etiketleri yazdırabilir veya token yenileyebilirsiniz.
          </p>
        </div>
        <button
          onClick={onOpenCreateLocation}
          className="bg-purple-700 hover:bg-purple-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 shadow transition"
        >
          <i className="fa-solid fa-plus-circle"></i> Yeni WC Noktası Ekle
        </button>
      </div>

      {/* Bilgilendirme Kutusu: Opaque Token Güvenliği */}
      <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-700">
        <i className="fa-solid fa-shield-halved text-purple-700 mt-0.5 text-sm"></i>
        <div>
          <strong className="text-purple-950">Opaque Token Mimarisi:</strong> QR kodlar doğrudan veritabanı ID'si barındırmaz; her mahal kriptografik bir token taşır (<code className="bg-purple-100 text-purple-900 px-1 py-0.5 rounded text-[11px]">/q/:token</code>). Hasar gören etiketlerde "Yenile" butonuna basılarak eski etiket anında geçersiz kılınır.
        </div>
      </div>

      {/* Lokasyonlar Tablosu */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3">Mahal Adı &amp; Kodu</th>
              <th className="py-2.5 px-3">Bina / Bölüm</th>
              <th className="py-2.5 px-3">Sorumlu Şefler</th>
              <th className="py-2.5 px-3">Plan / Tolerans</th>
              <th className="py-2.5 px-3">Güvenli Token</th>
              <th className="py-2.5 px-3 text-right">Eylemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {locations.map((loc) => (
              <tr key={loc.id} className="hover:bg-slate-50 transition">
                <td className="py-2.5 px-3">
                  <span className="font-bold text-slate-900 block">{loc.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">{loc.code}</span>
                </td>
                <td className="py-2.5 px-3 text-slate-600">
                  <span className="inline-block bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium">
                    {loc.building || 'Genel'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-600">
                  <div className="font-medium text-slate-800">{loc.currentSupervisorName || '-'}</div>
                  <div className="text-[10px] text-slate-400">Yedek: {loc.backupSupervisorName || '-'}</div>
                </td>
                <td className="py-2.5 px-3">
                  <span className="font-mono text-purple-700 font-bold">
                    {loc.schedule?.length || 0} Slot
                  </span>
                  <span className="text-[10px] text-slate-500 block">±{loc.toleranceMinutes} dk tolerans</span>
                </td>
                <td className="py-2.5 px-3">
                  <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px] border border-slate-200">
                    {loc.token ? `/q/${loc.token.slice(0, 14)}...` : '-'}
                  </code>
                </td>
                <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                  {onOpenPlanner && (
                    <button
                      onClick={() => onOpenPlanner(loc)}
                      className="bg-purple-100 hover:bg-purple-200 text-purple-900 font-medium px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition"
                      title="Temizlik Saat Planını ve Toleransı Düzenle"
                    >
                      <i className="fa-solid fa-sliders text-purple-700"></i> Saat Planı
                    </button>
                  )}
                  <button
                    onClick={() => onOpenSticker(loc)}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-medium px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 shadow-sm transition"
                    title="Yazdırılabilir QR Etiketi Aç"
                  >
                    <i className="fa-solid fa-print text-emerald-400"></i> Etiket
                  </button>
                  <button
                    onClick={() => onRegenerateToken(loc)}
                    disabled={busy}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition"
                    title="Yeni QR token üret (Eski QR geçersiz olur)"
                  >
                    <i className="fa-solid fa-rotate text-amber-700"></i> Yenile
                  </button>
                  <button
                    onClick={() => onDeleteLocation(loc)}
                    disabled={busy || locations.length <= 1}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 transition disabled:opacity-40"
                    title="Mahali Sil"
                  >
                    <i className="fa-solid fa-trash"></i> Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
