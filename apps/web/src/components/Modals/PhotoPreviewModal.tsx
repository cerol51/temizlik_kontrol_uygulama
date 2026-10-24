import React from 'react';

interface PhotoPreviewModalProps {
  photoUrl: string | null;
  onClose: () => void;
}

export const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({ photoUrl, onClose }) => {
  if (!photoUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-2xl w-full p-3 relative cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
            <i className="fa-solid fa-camera text-blue-600"></i> Müdahale Kanıt Fotoğrafı
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs"
          >
            ✕
          </button>
        </div>
        <div className="py-2 flex items-center justify-center bg-slate-950 rounded-xl overflow-hidden my-2">
          <img
            src={photoUrl}
            alt="Büyük Müdahale Fotoğrafı"
            className="max-h-[75vh] w-auto object-contain"
          />
        </div>
        <p className="text-center text-[11px] text-slate-500 font-medium">
          Saha personeli tarafından sisteme yüklenen kanıt fotoğrafı.
        </p>
      </div>
    </div>
  );
};
