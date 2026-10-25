import { create } from 'zustand';
import { Location } from '../api';

interface UiState {
  notice: { text: string; bad?: boolean } | null;
  photoPreviewUrl: string | null;
  qrModalLocation: Location | null;
  createLocationModalOpen: boolean;
  createUserModalOpen: boolean;
  authModalOpen: boolean;
  authMode: 'login' | 'register';
  plannerModalOpen: boolean;
  plannerLocationId: string;
  scannerOpen: boolean;
  scannerTarget: 'guest' | 'employee' | 'supervisor' | null;
  scanError: string;

  // Actions
  setNotice: (notice: { text: string; bad?: boolean } | null) => void;
  showNotice: (text: string, bad?: boolean, durationMs?: number) => void;
  setPhotoPreviewUrl: (url: string | null) => void;
  setQrModalLocation: (loc: Location | null) => void;
  setCreateLocationModalOpen: (open: boolean) => void;
  setCreateUserModalOpen: (open: boolean) => void;
  setAuthModalOpen: (open: boolean) => void;
  setAuthMode: (mode: 'login' | 'register') => void;
  openPlannerModal: (locId: string) => void;
  closePlannerModal: () => void;
  openScanner: (target: 'guest' | 'employee' | 'supervisor') => void;
  closeScanner: () => void;
  setScanError: (err: string) => void;
}

let noticeTimeout: any = null;

export const useUiStore = create<UiState>((set) => ({
  notice: null,
  photoPreviewUrl: null,
  qrModalLocation: null,
  createLocationModalOpen: false,
  createUserModalOpen: false,
  authModalOpen: false,
  authMode: 'login',
  plannerModalOpen: false,
  plannerLocationId: '',
  scannerOpen: false,
  scannerTarget: null,
  scanError: '',

  setNotice: (notice) => set({ notice }),
  showNotice: (text, bad = false, durationMs = 5000) => {
    if (noticeTimeout) clearTimeout(noticeTimeout);
    set({ notice: { text, bad } });
    noticeTimeout = setTimeout(() => {
      set({ notice: null });
    }, durationMs);
  },

  setPhotoPreviewUrl: (url) => set({ photoPreviewUrl: url }),
  setQrModalLocation: (loc) => set({ qrModalLocation: loc }),
  setCreateLocationModalOpen: (open) => set({ createLocationModalOpen: open }),
  setCreateUserModalOpen: (open) => set({ createUserModalOpen: open }),
  setAuthModalOpen: (open) => set({ authModalOpen: open }),
  setAuthMode: (mode) => set({ authMode: mode }),

  openPlannerModal: (locId) => set({ plannerModalOpen: true, plannerLocationId: locId }),
  closePlannerModal: () => set({ plannerModalOpen: false, plannerLocationId: '' }),

  openScanner: (target) => set({ scannerOpen: true, scannerTarget: target, scanError: '' }),
  closeScanner: () => set({ scannerOpen: false, scannerTarget: null, scanError: '' }),
  setScanError: (scanError) => set({ scanError }),
}));
