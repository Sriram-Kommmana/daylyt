import { useSyncExternalStore } from 'react';

// Chrome and Edge offer an install prompt as an event. It fires early, so it's held until asked for.

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: InstallEvent | null = null;
const watchers = new Set<() => void>();
const notify = () => watchers.forEach((fn) => fn());

export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

const install = async () => {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  notify();
};

export function useInstall() {
  const canInstall = useSyncExternalStore((fn) => { watchers.add(fn); return () => void watchers.delete(fn); }, () => !!deferred);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return { canInstall, install, installed };
}
