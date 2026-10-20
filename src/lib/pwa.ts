import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface PWAState {
  needRefresh: boolean;
  offlineReady: boolean;
}

let state: PWAState = { needRefresh: false, offlineReady: false };
const listeners = new Set<() => void>();
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;

function set(patch: Partial<PWAState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Registers the service worker (production builds only) and starts watching for new versions. */
export function initPWA() {
  if (updateSW || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => set({ needRefresh: true }),
    onOfflineReady: () => set({ offlineReady: true }),
    onRegisteredSW: (_url, reg) => {
      registration = reg;
      if (reg) window.setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
  // An installed iPhone app is resumed rather than reloaded, so look for updates on resume.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined);
  });
}

export function usePWAState(): PWAState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function dismissOfflineReady() {
  set({ offlineReady: false });
}

export function dismissUpdate() {
  set({ needRefresh: false });
}

/** Activates the waiting service worker and reloads into the new version. */
export async function applyUpdate() {
  await updateSW?.(true);
}

/** Asks the browser to look for a new version now. Resolves true if one is ready to install. */
export async function checkForUpdate(): Promise<'unsupported' | 'available' | 'current'> {
  if (!registration) return 'unsupported';
  try {
    await registration.update();
  } catch {
    return 'current';
  }
  await new Promise((r) => window.setTimeout(r, 1500));
  return state.needRefresh || registration.waiting ? 'available' : 'current';
}
