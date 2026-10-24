import React, { useState } from 'react';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (user: {
    fullName: string;
    username: string;
    password: string;
    role: 'employee' | 'supervisor' | 'admin';
  }) => Promise<void>;
  busy?: boolean;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  busy = false,
}) => {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'employee' | 'supervisor' | 'admin'>('employee');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !username || !password) return;
    await onSubmit({ fullName, username, password, role });
    setFullName('');
    setUsername('');
    setPassword('');
    setRole('employee');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="bg-purple-800 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-user-plus text-purple-300"></i>
            <h3 className="font-bold text-sm">Yeni Kullanıcı / Personel Tanımla</h3>
          </div>
          <button onClick={onClose} className="text-white hover:text-purple-200 text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Adı Soyadı <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Örn: Zeynep Demir"
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Kullanıcı Adı <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Örn: zeynep"
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Giriş Şifresi <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 4 karakter"
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Kullanıcı Rolü &amp; Yetkisi
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`p-2 border rounded-xl cursor-pointer flex flex-col items-center justify-center text-center text-xs transition ${
                  role === 'employee'
                    ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="adminUserRole"
                  checked={role === 'employee'}
                  onChange={() => setRole('employee')}
                  className="mb-1"
                />
                <span>🧹 Personel</span>
              </label>

              <label
                className={`p-2 border rounded-xl cursor-pointer flex flex-col items-center justify-center text-center text-xs transition ${
                  role === 'supervisor'
                    ? 'border-purple-500 bg-purple-50 text-purple-900 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="adminUserRole"
                  checked={role === 'supervisor'}
                  onChange={() => setRole('supervisor')}
                  className="mb-1"
                />
                <span>👔 Şef</span>
              </label>

              <label
                className={`p-2 border rounded-xl cursor-pointer flex flex-col items-center justify-center text-center text-xs transition ${
                  role === 'admin'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="adminUserRole"
                  checked={role === 'admin'}
                  onChange={() => setRole('admin')}
                  className="mb-1"
                />
                <span>👑 Admin</span>
              </label>
            </div>
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
              className="bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-bold py-2 px-5 rounded-lg shadow-sm flex items-center gap-1.5"
            >
              <i className="fa-solid fa-check"></i> Kullanıcıyı Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
