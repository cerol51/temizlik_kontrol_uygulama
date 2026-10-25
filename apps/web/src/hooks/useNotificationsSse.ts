import { useCallback, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useIncidentsStore } from '../stores/incidentsStore';
import { useLocationsStore } from '../stores/locationsStore';
import { useUiStore } from '../stores/uiStore';

export function useNotificationsSse() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const showNotice = useUiStore((s) => s.showNotice);
  const refreshDashboard = useLocationsStore((s) => s.refreshDashboard);
  const refreshSelectedLocation = useLocationsStore((s) => s.refreshSelectedLocation);
  const fetchIncidents = useIncidentsStore((s) => s.fetchIncidents);

  const playSiren = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.4);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.8);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // Audio permission or unsupported
    }
  }, []);

  useEffect(() => {
    if (role !== 'supervisor' && role !== 'admin') return;
    if (!token) return;

    const streamUrl = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const sse = new EventSource(streamUrl);

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INCIDENT_ALERT' || data.type === 'ESCALATION_ALERT') {
          playSiren();
          showNotice(`⚠️ ${data.title}: ${data.message}`, true, 8000);
          void refreshDashboard(token);
          void refreshSelectedLocation(token);
          void fetchIncidents(token);
        }
      } catch {
        // Parse error or heartbeat
      }
    };

    sse.onerror = () => {
      // Browser handles reconnect automatically
    };

    return () => {
      sse.close();
    };
  }, [role, token, playSiren, showNotice, refreshDashboard, refreshSelectedLocation, fetchIncidents]);
}
