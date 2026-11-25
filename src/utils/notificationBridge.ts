import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface RawFinanceNotification {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  bigText?: string;
  timestamp: number;
}

interface NotificationCapturePluginInterface {
  isPermissionGranted(): Promise<{ granted: boolean }>;
  openNotificationAccessSettings(): Promise<void>;
  drainPendingNotifications(): Promise<{ items: RawFinanceNotification[] }>;
  acknowledgeNotifications(options: { ids: string[] }): Promise<void>;
  addListener(
    eventName: 'notificationReceived',
    listenerFunc: (item: RawFinanceNotification) => void
  ): Promise<PluginListenerHandle>;
}

const NotificationCapture =
  registerPlugin<NotificationCapturePluginInterface>('NotificationCapture');

const AUTO_RECORD_STORAGE_KEY = 'financial-tracker:notif-auto-record:v1';

export function isNotificationCaptureSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (!isNotificationCaptureSupported()) return false;
  try {
    const result = await NotificationCapture.isPermissionGranted();
    return Boolean(result?.granted);
  } catch {
    return false;
  }
}

export async function openNotificationAccessSettings(): Promise<void> {
  if (!isNotificationCaptureSupported()) return;
  await NotificationCapture.openNotificationAccessSettings();
}

export async function drainPendingNotifications(): Promise<RawFinanceNotification[]> {
  if (!isNotificationCaptureSupported()) return [];
  try {
    const result = await NotificationCapture.drainPendingNotifications();
    return Array.isArray(result?.items) ? result.items : [];
  } catch {
    return [];
  }
}

export async function acknowledgePendingNotifications(ids: string[]): Promise<void> {
  if (!isNotificationCaptureSupported() || ids.length === 0) return;
  try {
    await NotificationCapture.acknowledgeNotifications({ ids });
  } catch {
    // Ignore native acknowledgment errors.
  }
}

export async function addNotificationListener(
  callback: (item: RawFinanceNotification) => void
): Promise<PluginListenerHandle | null> {
  if (!isNotificationCaptureSupported()) return null;
  try {
    return await NotificationCapture.addListener('notificationReceived', callback);
  } catch {
    return null;
  }
}

export function loadAutoRecordEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = window.localStorage.getItem(AUTO_RECORD_STORAGE_KEY);
    return saved === 'false' ? false : true;
  } catch {
    return true;
  }
}

export function saveAutoRecordEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTO_RECORD_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota or private mode errors.
  }
}
