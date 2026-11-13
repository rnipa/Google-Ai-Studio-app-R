import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Cloud, Copy, ExternalLink, Fingerprint, Lock, LogIn, ShieldCheck, Smartphone } from 'lucide-react';
import { getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { sha256Hex } from '../utils/accounting';
import { checkBiometricAvailability, verifyFingerprint } from '../utils/biometric';

interface AuthScreenProps {
  onError: (msg: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onError }) => {
  const [busy, setBusy] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const isEmbeddedWebView = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /; wv\)/i.test(ua) || /FBAN|FBAV|Instagram|WhatsApp/i.test(ua);
  }, []);

  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      const msg = err instanceof Error ? err.message : 'Google Sign-In redirect failed.';
      onError(msg);
    });
  }, [onError]);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          onError(
            redirectErr instanceof Error ? redirectErr.message : 'Google Sign-In redirect failed.'
          );
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
        onError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3.5">
          <img
            src="/pwa-192x192.png"
            alt="Rasidul Premium ERP"
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 object-cover shrink-0"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Rasidul Premium ERP
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cloud-Backed Business &amp; Expense Control Center
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3.5 border-t border-slate-100 dark:border-slate-800 pt-5 text-sm text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-3">
            <Cloud className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <span>
              Every shift closing, ledger entry, and expense saves directly to Firestore Cloud — zero local data loss.
            </span>
          </div>
          <div className="flex items-start gap-3">
            <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Sign in with the same Google account on both Phone and PC for instant real-time sync.
            </span>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              Import existing JSON backups anytime and send Bengali WhatsApp receipts to clients in one tap.
            </span>
          </div>
        </div>

        {isEmbeddedWebView && (
          <div className="mt-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <p className="font-semibold">
              In-app browser / WebView detected. Google blocks sign-in inside embedded WebViews — open this link in Chrome or Safari.
            </p>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-100 cursor-pointer"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'App Link Copied!' : 'Copy Link to Open in Chrome'}</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={handleGoogleSignIn}
          className="mt-7 w-full min-h-[46px] flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-700 text-white py-3 px-4 text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>{busy ? 'Signing in...' : 'Continue with Google'}</span>
        </button>
      </div>
    </div>
  );
};

interface PinLockModalProps {
  uid: string;
  expectedPinHash: string;
  hasPin: boolean;
  hasFingerprint: boolean;
  shopName: string;
  onUnlock: () => void;
  onSignOutFallback?: () => void;
}

export const PinLockOverlay: React.FC<PinLockModalProps> = ({
  uid,
  expectedPinHash,
  hasPin,
  hasFingerprint,
  shopName,
  onUnlock,
  onSignOutFallback,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const autoTriedRef = useRef(false);

  const handleBiometricUnlock = useCallback(async () => {
    if (!uid || !hasFingerprint || bioBusy) return;
    setBioBusy(true);
    setError('');
    try {
      const ok = await verifyFingerprint(uid);
      if (ok) onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fingerprint verification failed.');
    } finally {
      setBioBusy(false);
    }
  }, [uid, hasFingerprint, bioBusy, onUnlock]);

  useEffect(() => {
    if (!hasFingerprint || autoTriedRef.current) return;
    autoTriedRef.current = true;
    let cancelled = false;
    checkBiometricAvailability().then((status) => {
      if (!cancelled && status.supported && !status.inIframe) {
        window.setTimeout(() => {
          if (!cancelled) handleBiometricUnlock();
        }, 250);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasFingerprint, handleBiometricUnlock]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPin) return;
    if (pin.length < 4) {
      setError('Enter at least a 4-digit PIN.');
      return;
    }
    setChecking(true);
    try {
      const hash = await sha256Hex(pin);
      if (hash === expectedPinHash) {
        setPin('');
        setError('');
        onUnlock();
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/92 backdrop-blur-md p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-7 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
          {hasFingerprint ? <Fingerprint className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">{shopName} — Security Lock</h2>
        <p className="mt-1 text-xs text-slate-400">
          {hasFingerprint && hasPin
            ? 'Unlock with your Fingerprint or Counter PIN'
            : hasFingerprint
              ? 'Verify your Fingerprint to unlock the workspace'
              : 'Enter your 4–6 digit security PIN to unlock the workspace'}
        </p>

        {hasFingerprint && (
          <div className="mt-5">
            <button
              type="button"
              onClick={handleBiometricUnlock}
              disabled={bioBusy}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 active:scale-[0.98] py-3 px-4 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-60 cursor-pointer"
            >
              <Fingerprint className={`w-5 h-5 ${bioBusy ? 'animate-pulse' : ''}`} />
              <span>{bioBusy ? 'Scanning Fingerprint...' : 'Unlock with Fingerprint'}</span>
            </button>
          </div>
        )}

        {hasPin && (
          <form onSubmit={handleSubmit} className={hasFingerprint ? 'mt-5 pt-5 border-t border-slate-800' : 'mt-5'}>
            {hasFingerprint && (
              <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2.5">
                Or enter Counter PIN
              </p>
            )}
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setError('');
                setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
              }}
              placeholder="••••"
              autoFocus={!hasFingerprint}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center font-mono-num text-2xl tracking-[0.5em] text-white focus:border-sky-500 focus:outline-none"
            />

            <button
              type="submit"
              disabled={checking}
              className="mt-3.5 w-full min-h-[46px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
            >
              {checking ? 'Verifying...' : 'Unlock with PIN'}
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-xs font-medium text-rose-400 leading-relaxed">{error}</p>}

        {!hasPin && hasFingerprint && onSignOutFallback && (
          <button
            type="button"
            onClick={onSignOutFallback}
            className="mt-5 text-xs font-medium text-slate-400 hover:text-slate-200 underline cursor-pointer"
          >
            Fingerprint sensor unavailable? Sign out to recover
          </button>
        )}
      </div>
    </div>
  );
};
