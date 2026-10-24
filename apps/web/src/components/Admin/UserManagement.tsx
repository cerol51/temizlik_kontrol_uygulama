import React from 'react';
import { AppUser, formatTime } from '../../api';

interface UserManagementProps {
  usersList: AppUser[];
  currentUser: AppUser | null;
  busy?: boolean;
  onOpenCreateUser: () => void;
  onDeleteUser: (user: AppUser) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({
  usersList,
  currentUser,
  busy = false,
  onOpenCreateUser,
  onDeleteUser,
}) => {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 bg-purple-100 text-purple-800 rounded-lg text-sm font-bold">
              <i className="fa-solid fa-users-gear"></i>
            </span>
            <h3 className="text-sm font-bold text-slate-800">
              Sistem Kullanıcıları ve Personel Yönetim Merkezi
            </h3>
            <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
              {usersList.length} Kayıtlı Kullanıcı
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Sisteme kayıtlı personelleri ve yöneticileri listeleyebilir, rolleri inceleyebilir, yeni kullanıcı ekleyebilir veya silebilirsiniz.
          </p>
        </div>
        <button
          onClick={onOpenCreateUser}
          className="bg-purple-700 hover:bg-purple-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 shadow transition"
        >
          <i className="fa-solid fa-user-plus"></i> Yeni Kullanıcı Ekle
        </button>
      </div>

      {/* Kullanıcılar Tablosu */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3">Adı Soyadı</th>
              <th className="py-2.5 px-3">Kullanıcı Adı</th>
              <th className="py-2.5 px-3">Yetki / Rol</th>
              <th className="py-2.5 px-3">Kayıt Tarihi</th>
              <th className="py-2.5 px-3 text-right">Eylemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usersList.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400 italic">
                  Kayıtlı kullanıcı bulunamadı veya yükleniyor...
                </td>
              </tr>
            ) : (
              usersList.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition">
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] flex items-center justify-center font-bold">
                        {u.fullName.charAt(0).toUpperCase()}
                      </span>
                      {u.fullName}
                      {currentUser?.id === u.id && (
                        <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded font-bold">
                          Siz
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">
                    @{u.username}
                  </td>
                  <td className="py-2.5 px-3">
                    {u.role === 'admin' || (u.username === 'admin') ? (
                      <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-900 font-bold px-2 py-0.5 rounded text-[11px] border border-purple-200">
                        <i className="fa-solid fa-crown text-[10px] text-purple-700"></i> Sistem Yöneticisi
                      </span>
                    ) : u.role === 'supervisor' ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                        <i className="fa-solid fa-user-tie text-[10px] text-emerald-700"></i> Şef (Supervisor)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[11px] border border-blue-200">
                        <i className="fa-solid fa-broom text-[10px] text-blue-700"></i> Temizlik Personeli
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                    {u.createdAt ? formatTime(u.createdAt) : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => onDeleteUser(u)}
                      disabled={busy || currentUser?.id === u.id || u.username === 'admin'}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium px-2.5 py-1 rounded text-[11px] inline-flex items-center gap-1 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        u.username === 'admin'
                          ? 'Ana yönetici silinemez'
                          : currentUser?.id === u.id
                          ? 'Aktif oturumdaki kullanıcı silinemez'
                          : 'Kullanıcıyı Sil'
                      }
                    >
                      <i className="fa-solid fa-trash"></i> Sil
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
