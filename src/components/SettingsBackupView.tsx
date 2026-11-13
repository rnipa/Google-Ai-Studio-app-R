import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Fingerprint,
  Laptop,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  Upload,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { UserProfile, WorkspaceState } from '../types';
import { safeNum, sha256Hex } from '../utils/accounting';
import {
  type BiometricLockConfig,
  checkBiometricAvailability,
  enrollFingerprint,
  saveBiometricConfig,
} from '../utils/biometric';

interface SettingsBackupViewProps {
  user: User;
  profile: UserProfile | null;
  workspace: WorkspaceState;
  bioConfig: BiometricLockConfig | null;
  darkMode: boolean;
  busy: boolean;
  lastJsonBackupAt?: string;
  onToggleDark: () => void;
  onUpdateShopAndTarget: (shopName: string, dailyTarget: number) => Promise<void>;
  onSavePinSettings: (enabled: boolean, pinHash: string) => Promise<void>;
  onBiometricChange: (next: BiometricLockConfig | null) => void;
  onLockNow: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const SettingsBackupView: React.FC<SettingsBackupViewProps> = ({
  user,
  profile,
  workspace,
  bioConfig,
  darkMode,
  busy,
  lastJsonBackupAt,
  onToggleDark,
  onUpdateShopAndTarget,
  onSavePinSettings,
  onBiometricChange,
  onLockNow,
  onExportJson,
  onImportJson,
  onSignOut,
}) => {
  const [shopName, setShopName] = useState(profile?.shopName || 'Rubaiya Pharmacy');
  const [dailyTarget, setDailyTarget] = useState(String(workspace.dailyTarget || 2000));

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [bioSupport, setBioSupport] = useState<{
    checked: boolean;
    supported: boolean;
    inIframe: boolean;
    reason?: string;
  }>({ checked: false, supported: false, inIframe: false });
  const [bioBusy, setBioBusy] = useState(false);
  const [bioMessage, setBioMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    checkBiometricAvailability().then((res) => {
      if (active) setBioSupport({ checked: true, ...res });
    });
    return () => {
      active = false;
    };
  }, []);

  const liveAppUrl =
    typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(liveAppUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore if clipboard unavailable
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateShopAndTarget(shopName.trim() || 'Rubaiya Pharmacy', safeNum(dailyTarget));
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    if (newPin.length < 4) {
      setPinError('PIN must be at least 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('Both PIN fields must match.');
      return;
    }
    const hash = await sha256Hex(newPin);
    await onSavePinSettings(true, hash);
    setNewPin('');
    setConfirmPin('');
  };

  const handleEnrollFingerprint = async () => {
    setBioBusy(true);
    setBioMessage(null);
    try {
      const next = await enrollFingerprint(
        user.uid,
        user.email || '',
        profile?.shopName || shopName || 'Rubaiya Pharmacy'
      );
      onBiometricChange(next);
      setBioMessage({
        type: 'ok',
        text: `Fingerprint Lock enabled (${next.deviceLabel}).`,
      });
    } catch (err) {
      setBioMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not enable Fingerprint Lock.',
      });
    } finally {
      setBioBusy(false);
    }
  };

  const handleDisableFingerprint = () => {
    saveBiometricConfig(user.uid, null);
    onBiometricChange(null);
    setBioMessage({
      type: 'ok',
      text: 'Fingerprint Lock disabled on this device.',
    });
  };

  const [cacheClearing, setCacheClearing] = useState(false);

  const handleClearAppCache = async () => {
    setCacheClearing(true);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      try {
        sessionStorage.removeItem('rasidul_sw_cleaned');
      } catch {
        // ignore storage error
      }
    } catch {
      // ignore cleanup failures
    }
    window.location.reload();
  };

  const backupAgeDays = (() => {
    if (!lastJsonBackupAt) return null;
    const ts = Date.parse(lastJsonBackupAt);
    if (!Number.isFinite(ts)) return null;
    return (Date.now() - ts) / (1000 * 60 * 60 * 24);
  })();
  const formattedBackupDate = (() => {
    if (!lastJsonBackupAt) return '';
    const d = new Date(lastJsonBackupAt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  })();

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {user.email} · Cloud Sync Active
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Settings, Security &amp; Backup
          </h2>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleDark}
            className="min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </div>

      {/* Multi-Device Quick Guide */}
      <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/80 via-sky-50/70 to-white dark:from-indigo-950/35 dark:via-sky-950/25 dark:to-slate-900 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <Laptop className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Use Seamlessly on Phone &amp; PC</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
              Open this same web app on your phone and computer and sign in with{' '}
              <strong className="font-semibold">{user.email}</strong>. All daily shifts, ledger balances, and expenses sync live in real time with offline IndexedDB protection.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {liveAppUrl && (
              <button
                type="button"
                onClick={handleCopyUrl}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] transition-all cursor-pointer"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Link Copied' : 'Copy Web Link'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Android APK & Zero-Data-Loss Vault Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Android .APK Build Note</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            This cloud workspace builds web applications and does not include a Java JDK or Android Gradle SDK to compile a signed <strong>.apk</strong> binary directly.
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            To run directly on your phone right now with full Google Sign-In, Fingerprint Lock, and Cloud Sync, open your Shared App URL in Android Chrome. To compile a native <strong>.apk</strong> on a computer, wrap this project with <strong>Capacitor</strong> + Android Studio.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>100% Zero-Data-Loss Vault Active</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Every keystroke is backed up locally before syncing to Firebase Cloud Firestore with IndexedDB offline persistence. If internet drops mid-entry or a tab closes unexpectedly, pending edits stay queued safely and auto-sync the instant your connection returns.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <form
          onSubmit={handleSaveGeneral}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Shop Profile &amp; Daily Target
          </h3>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Shop / Business Name (Shown on receipts &amp; WhatsApp)
            </label>
            <input
              type="text"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Daily Profit Target (৳)
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={dailyTarget}
              onChange={(e) => setDailyTarget(e.target.value)}
              className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="min-h-[42px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 text-sm font-semibold cursor-pointer"
          >
            Save Settings
          </button>
        </form>

        {/* PIN & Fingerprint Security */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Counter PIN &amp; Fingerprint Lock
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {(profile?.pinEnabled || bioConfig?.enabled) && (
                <button
                  type="button"
                  onClick={onLockNow}
                  className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer"
                >
                  Lock Screen Now
                </button>
              )}
              {profile?.pinEnabled && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSavePinSettings(false, profile.pinHash || '')}
                  className="rounded-lg border border-rose-200 dark:border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                >
                  Disable PIN
                </button>
              )}
            </div>
          </div>

          {/* Fingerprint / Biometric Lock */}
          <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/25 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Fingerprint / Biometric Lock
                </span>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  bioConfig?.enabled
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {bioConfig?.enabled ? 'Active on This Device' : 'Off'}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {bioConfig?.enabled
                ? `Unlocked with ${bioConfig.deviceLabel}. Works offline too — you can also keep a PIN below as backup.`
                : 'Use your phone Fingerprint, iPhone Face ID, or laptop Touch ID / Windows Hello to lock your counter screen on this device.'}
            </p>

            {bioSupport.checked && bioSupport.inIframe && (
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Note: Embedded preview blocks biometric sensors. Open this link directly in Chrome/Safari or install the PWA to enroll Fingerprint Lock.
              </p>
            )}

            {bioSupport.checked && !bioSupport.supported && bioSupport.reason && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">{bioSupport.reason}</p>
            )}

            {bioMessage && (
              <p
                className={`text-xs font-medium ${
                  bioMessage.type === 'ok'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {bioMessage.text}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={bioBusy || (bioSupport.checked && !bioSupport.supported)}
                onClick={handleEnrollFingerprint}
                className="min-h-[38px] inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 active:scale-[0.98] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                <Fingerprint className="w-3.5 h-3.5" />
                <span>
                  {bioBusy
                    ? 'Waiting for Sensor...'
                    : bioConfig?.enabled
                      ? 'Re-enroll Fingerprint'
                      : 'Enable Fingerprint Lock'}
                </span>
              </button>

              {bioConfig?.enabled && (
                <button
                  type="button"
                  onClick={handleDisableFingerprint}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                >
                  Disable Fingerprint
                </button>
              )}
            </div>
          </div>

          <div className="pt-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              Counter PIN (synced across all your devices) works standalone or as backup alongside Fingerprint Lock:
            </p>

            <form onSubmit={handlePinSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">New PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••"
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-center font-mono-num text-sm tracking-widest"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Confirm PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••"
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-center font-mono-num text-sm tracking-widest"
                  />
                </div>
              </div>
              {pinError && <p className="text-xs text-rose-600">{pinError}</p>}
              <button
                type="submit"
                disabled={busy}
                className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-sky-600 text-white px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{profile?.pinEnabled ? 'Update PIN' : 'Enable PIN Lock'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Backup & Legacy Import */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Backup Export &amp; Legacy Import
            </h3>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                !formattedBackupDate || (backupAgeDays !== null && backupAgeDays >= 7)
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {!formattedBackupDate
                ? 'No Weekly File Exported'
                : backupAgeDays !== null && backupAgeDays >= 7
                  ? 'Backup Over 7 Days Old'
                  : 'Backup Recent'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Download a complete JSON snapshot weekly to Google Drive or your PC, or import a legacy{' '}
            <code className="font-mono-num">rasidul_backup.json</code> /{' '}
            <code className="font-mono-num">expense-tracker-pro-backup.json</code> file directly into your cloud database.
          </p>

          <div
            className={`rounded-xl border px-3.5 py-2.5 text-xs ${
              !formattedBackupDate || (backupAgeDays !== null && backupAgeDays >= 7)
                ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
            }`}
          >
            {formattedBackupDate ? (
              <span>
                Last JSON File Backup: <strong>{formattedBackupDate}</strong>
                {backupAgeDays !== null && backupAgeDays >= 7
                  ? ' — Please export a fresh copy today for extra peace of mind.'
                  : ''}
              </span>
            ) : (
              <span>
                No manual JSON file exported from this browser yet. Click{' '}
                <strong>Export Full JSON</strong> once a week for a permanent offline copy.
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onExportJson}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Full JSON</span>
            </button>

            <label className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Import JSON Backup</span>
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportJson(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {/* Account Session & Cache Recovery */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Account Session &amp; App Recovery
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Signed in as <span className="font-medium text-slate-700 dark:text-slate-200">{user.email}</span>. Signing out never deletes your cloud records—simply sign back in on any device to resume.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              If an old browser shortcut shows stale screens or loading glitches, clear cached app files below. Your Firebase records and local draft vault will not be touched.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={cacheClearing}
              onClick={handleClearAppCache}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-2.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${cacheClearing ? 'animate-spin' : ''}`} />
              <span>{cacheClearing ? 'Clearing Cache...' : 'Clear App Cache & Reload'}</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
