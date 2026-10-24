import React, { useState } from 'react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (fullName: string, username: string, password: string) => Promise<void>;
  busy?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onRegister,
  busy = false,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) return;
    await onLogin(loginUsername, loginPassword);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFullName || !regUsername || !regPassword) return;
    await onRegister(regFullName, regUsername, regPassword);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Modal Başlığı & Sekmeler */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-shield-halved text-emerald-400 text-lg"></i>
            <h3 className="font-bold text-sm">
              {authTab === 'login' ? 'Kullanıcı Girişi' : 'Yeni Kullanıcı Kaydı'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">
            ✕
          </button>
        </div>

        {/* Tab Seçimi */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => setAuthTab('login')}
            className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition ${
              authTab === 'login'
                ? 'border-emerald-600 text-emerald-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className="fa-solid fa-right-to-bracket mr-1.5"></i> Giriş Yap
          </button>
          <button
            type="button"
            onClick={() => setAuthTab('register')}
            className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition ${
              authTab === 'register'
                ? 'border-emerald-600 text-emerald-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className="fa-solid fa-user-plus mr-1.5"></i> Kayıt Ol
          </button>
        </div>

        {/* 1. GİRİŞ YAP FORMU */}
        {authTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="p-5 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                required
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Örn: kemal veya ahmet"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Şifre
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-right-to-bracket"></i> Giriş Yap
            </button>

            {/* Hızlı Demo Giriş Seçenekleri */}
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2 text-center">
                Hızlı Demo Giriş Seçenekleri
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setLoginUsername('admin');
                    setLoginPassword('admin123');
                  }}
                  className="p-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-left text-[11px] transition"
                >
                  <strong className="block text-amber-900 font-bold">👑 Admin</strong>
                  <span className="text-amber-700 font-mono text-[9px]">admin / admin123</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginUsername('kemal');
                    setLoginPassword('kemal123');
                  }}
                  className="p-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-left text-[11px] transition"
                >
                  <strong className="block text-purple-900 font-bold">👔 Kemal Şef</strong>
                  <span className="text-purple-600 font-mono text-[9px]">kemal / kemal123</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginUsername('ahmet');
                    setLoginPassword('ahmet123');
                  }}
                  className="p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left text-[11px] transition"
                >
                  <strong className="block text-blue-900 font-bold">🧹 Ahmet</strong>
                  <span className="text-blue-600 font-mono text-[9px]">ahmet / ahmet123</span>
                </button>
              </div>
            </div>

            <div className="text-center pt-1">
              <span className="text-xs text-slate-500">Hesabınız yok mu? </span>
              <button
                type="button"
                onClick={() => setAuthTab('register')}
                className="text-xs text-emerald-700 hover:underline font-bold"
              >
                Kayıt Olun
              </button>
            </div>
          </form>
        ) : (
          /* 2. KAYIT OL FORMU */
          <form onSubmit={handleRegisterSubmit} className="p-5 space-y-3.5">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Adı Soyadı <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={regFullName}
                onChange={(e) => setRegFullName(e.target.value)}
                placeholder="Örn: Ayşe Yılmaz"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Kullanıcı Adı <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="Örn: ayseyilmaz"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Şifre <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="En az 8 karakter"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-0.5">
                <i className="fa-solid fa-broom text-blue-600"></i>
                <span>Başlangıç Rolü: Temizlik Personeli</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Açık kayıtlar güvenlik kuralı gereği Personel olarak başlar. Şef veya Admin yetkileri sistem yöneticisi tarafından atanır.
              </p>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-user-check"></i> Kayıt Ol ve Giriş Yap
            </button>

            <div className="text-center pt-1">
              <span className="text-xs text-slate-500">Zaten hesabınız var mı? </span>
              <button
                type="button"
                onClick={() => setAuthTab('login')}
                className="text-xs text-emerald-700 hover:underline font-bold"
              >
                Giriş Yapın
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
