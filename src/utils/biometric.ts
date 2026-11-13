export interface BiometricLockConfig {
  enabled: boolean;
  credentialIdB64: string;
  deviceLabel: string;
  enrolledAt: number;
}

const getBioKey = (uid: string) => `rasidul_bio_lock_${uid}`;

function bufferToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToUint8Array(b64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = b64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'This Device';
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'Android Biometric Sensor';
  if (/iphone|ipad|ipod/.test(ua)) return 'iPhone / iPad Face ID or Touch ID';
  if (/mac/.test(ua)) return 'Mac Touch ID';
  if (/windows/.test(ua)) return 'Windows Hello / Fingerprint';
  return 'Device Biometric Sensor';
}

export function getBiometricConfig(uid: string): BiometricLockConfig | null {
  if (!uid || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getBioKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricLockConfig;
    if (parsed && parsed.credentialIdB64 && typeof parsed.enabled === 'boolean') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveBiometricConfig(uid: string, config: BiometricLockConfig | null): void {
  if (!uid || typeof localStorage === 'undefined') return;
  try {
    if (!config) {
      localStorage.removeItem(getBioKey(uid));
    } else {
      localStorage.setItem(getBioKey(uid), JSON.stringify(config));
    }
  } catch {
    // ignore storage errors
  }
}

export async function checkBiometricAvailability(): Promise<{
  supported: boolean;
  inIframe: boolean;
  reason?: string;
}> {
  if (typeof window === 'undefined') {
    return { supported: false, inIframe: false, reason: 'Browser environment unavailable.' };
  }
  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  if (!window.isSecureContext) {
    return {
      supported: false,
      inIframe,
      reason: 'Fingerprint lock requires a secure HTTPS connection.',
    };
  }

  if (!('PublicKeyCredential' in window) || !navigator.credentials) {
    return {
      supported: false,
      inIframe,
      reason: 'This browser does not support WebAuthn Fingerprint authentication.',
    };
  }

  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      return {
        supported: false,
        inIframe,
        reason: 'No built-in fingerprint or screen-lock biometric sensor detected on this device.',
      };
    }
    return { supported: true, inIframe };
  } catch {
    return {
      supported: false,
      inIframe,
      reason: 'Unable to query device biometric hardware.',
    };
  }
}

function mapWebAuthnError(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as { name: string }).name);
    if (name === 'NotAllowedError') {
      return 'Fingerprint prompt was cancelled or timed out. If inside an embedded preview, open the app directly in Chrome/Safari or install the PWA first.';
    }
    if (name === 'SecurityError') {
      return 'Security policy blocked fingerprint access inside an embedded frame. Open the app in a direct browser tab or installed PWA app.';
    }
    if (name === 'InvalidStateError') {
      return 'Device biometric state changed. Please disable and re-enroll Fingerprint Lock.';
    }
    if (name === 'NotSupportedError') {
      return 'Device biometric authenticator is not available on this browser.';
    }
  }
  return err instanceof Error ? err.message : 'Fingerprint verification failed.';
}

export async function enrollFingerprint(
  uid: string,
  email: string,
  shopName: string
): Promise<BiometricLockConfig> {
  const status = await checkBiometricAvailability();
  if (!status.supported) {
    throw new Error(status.reason || 'Fingerprint hardware is not available on this device.');
  }

  const challenge = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(challenge);

  const uidEncoded = new TextEncoder().encode(uid);
  const userIdBuffer = new ArrayBuffer(uidEncoded.byteLength);
  new Uint8Array(userIdBuffer).set(uidEncoded);

  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Rasidul Premium ERP',
          id: window.location.hostname,
        },
        user: {
          id: new Uint8Array(userIdBuffer),
          name: email || uid,
          displayName: shopName || 'Shop Owner',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (!cred || !cred.rawId) {
      throw new Error('Could not register fingerprint credential.');
    }

    const config: BiometricLockConfig = {
      enabled: true,
      credentialIdB64: bufferToBase64Url(cred.rawId),
      deviceLabel: detectDeviceLabel(),
      enrolledAt: Date.now(),
    };
    saveBiometricConfig(uid, config);
    return config;
  } catch (err) {
    throw new Error(mapWebAuthnError(err));
  }
}

export async function verifyFingerprint(uid: string): Promise<boolean> {
  const config = getBiometricConfig(uid);
  if (!config || !config.enabled || !config.credentialIdB64) {
    throw new Error('Fingerprint lock is not enrolled on this device.');
  }

  const challenge = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(challenge);

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [
          {
            id: base64UrlToUint8Array(config.credentialIdB64),
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Fingerprint verification did not return a credential.');
    }
    return true;
  } catch (err) {
    throw new Error(mapWebAuthnError(err));
  }
}
