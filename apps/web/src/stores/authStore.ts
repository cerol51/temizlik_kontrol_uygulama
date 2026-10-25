import { create } from 'zustand';
import { AppUser, loginApi, registerApi } from '../api';

interface AuthState {
  user: AppUser | null;
  token: string | null;
  role: 'admin' | 'supervisor' | 'employee' | '';
  activeTab: 'guest' | 'employee' | 'supervisor' | 'admin';
  loading: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<AppUser>;
  register: (username: string, password: string, fullName: string, role: string) => Promise<AppUser>;
  logout: () => void;
  setActiveTab: (tab: 'guest' | 'employee' | 'supervisor' | 'admin') => void;
  setRole: (role: 'admin' | 'supervisor' | 'employee' | '') => void;
  setUserAndToken: (user: AppUser, token: string) => void;
}

function getInitialUser(): { user: AppUser | null; token: string | null; role: 'admin' | 'supervisor' | 'employee' | ''; tab: 'guest' | 'employee' | 'supervisor' | 'admin' } {
  try {
    const savedToken = localStorage.getItem('wc_token');
    const savedUser = localStorage.getItem('wc_user');
    if (savedUser && savedToken) {
      const u = JSON.parse(savedUser) as AppUser;
      let userRole: 'admin' | 'supervisor' | 'employee' | '' = '';
      if (u.username === 'admin' || u.role === 'admin') userRole = 'admin';
      else if (u.role === 'supervisor') userRole = 'supervisor';
      else if (u.role === 'employee') userRole = 'employee';

      const initialTab = userRole ? (userRole as 'admin' | 'supervisor' | 'employee') : 'guest';
      return { user: u, token: savedToken, role: userRole, tab: initialTab };
    }
  } catch {
    // ignore parse error
  }
  return { user: null, token: null, role: '', tab: 'guest' };
}

const initial = getInitialUser();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial.user,
  token: initial.token,
  role: initial.role,
  activeTab: initial.tab,
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await loginApi(username.trim(), password.trim());
      localStorage.setItem('wc_token', res.token);
      localStorage.setItem('wc_user', JSON.stringify(res.user));

      let userRole: 'admin' | 'supervisor' | 'employee' | '' = '';
      if (res.user.username === 'admin' || res.user.role === 'admin') userRole = 'admin';
      else if (res.user.role === 'supervisor') userRole = 'supervisor';
      else if (res.user.role === 'employee') userRole = 'employee';

      const nextTab = userRole || 'guest';
      set({
        user: res.user,
        token: res.token,
        role: userRole,
        activeTab: nextTab,
        loading: false,
      });
      return res.user;
    } catch (err: any) {
      const msg = err?.message || 'Giriş yapılamadı.';
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  register: async (username: string, password: string, fullName: string, role: string) => {
    set({ loading: true, error: null });
    try {
      const res = await registerApi(username.trim(), password.trim(), fullName.trim(), role);
      localStorage.setItem('wc_token', res.token);
      localStorage.setItem('wc_user', JSON.stringify(res.user));

      let userRole: 'admin' | 'supervisor' | 'employee' | '' = '';
      if (res.user.username === 'admin' || res.user.role === 'admin') userRole = 'admin';
      else if (res.user.role === 'supervisor') userRole = 'supervisor';
      else if (res.user.role === 'employee') userRole = 'employee';

      const nextTab = userRole || 'guest';
      set({
        user: res.user,
        token: res.token,
        role: userRole,
        activeTab: nextTab,
        loading: false,
      });
      return res.user;
    } catch (err: any) {
      const msg = err?.message || 'Kayıt yapılamadı.';
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  logout: () => {
    localStorage.removeItem('wc_token');
    localStorage.removeItem('wc_user');
    set({
      user: null,
      token: null,
      role: '',
      activeTab: 'guest',
      error: null,
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setRole: (role) => set({ role }),
  setUserAndToken: (user, token) => {
    localStorage.setItem('wc_token', token);
    localStorage.setItem('wc_user', JSON.stringify(user));
    let userRole: 'admin' | 'supervisor' | 'employee' | '' = '';
    if (user.username === 'admin' || user.role === 'admin') userRole = 'admin';
    else if (user.role === 'supervisor') userRole = 'supervisor';
    else if (user.role === 'employee') userRole = 'employee';
    set({ user, token, role: userRole });
  },
}));
