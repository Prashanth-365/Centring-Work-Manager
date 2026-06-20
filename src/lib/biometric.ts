// Biometric / device-credential unlock.
//   • Web: a WebAuthn platform authenticator used as a LOCAL gate — we register
//     a platform credential and later assert it. There is no server, so a
//     successful ceremony (user verification by the device) is what unlocks; we
//     don't verify a signature. The credential id is stored in appLock.
//   • Native (APK): a Capacitor biometric plugin, loaded lazily so the web
//     bundle never touches it.
// PIN is always the fallback (see LockGate), so every path degrades gracefully.
import { bytesToBase64, base64ToBytes } from './crypto'
import { isNative } from './native'

function bufToB64url(buf: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBuf(s: string): ArrayBuffer {
  // base64ToBytes already tolerates url-safe chars + missing padding.
  const bytes = base64ToBytes(s)
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

/** Can this device offer biometric / platform-authenticator unlock right now? */
export async function isBiometricAvailable(): Promise<boolean> {
  if (isNative()) {
    try {
      const mod = await import('@aparajita/capacitor-biometric-auth')
      const info = await mod.BiometricAuth.checkBiometry()
      return !!info.isAvailable
    } catch {
      return false
    }
  }
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/**
 * Enroll biometric unlock. On web this creates a platform credential and returns
 * its id (store it in appLock.webauthnCredId). On native nothing is stored — the
 * OS owns enrollment — so a sentinel is returned. Returns undefined on failure.
 */
export async function enrollBiometric(): Promise<string | undefined> {
  if (isNative()) {
    return (await isBiometricAvailable()) ? 'native' : undefined
  }
  if (!window.PublicKeyCredential) return undefined
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userId = crypto.getRandomValues(new Uint8Array(16))
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Centering Manager', id: location.hostname },
        user: { id: userId, name: 'meistri', displayName: 'Meistri' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    return cred ? bufToB64url(cred.rawId) : undefined
  } catch {
    return undefined
  }
}

/** Prompt for biometric verification. Resolves true only on a successful ceremony. */
export async function verifyBiometric(webauthnCredId?: string): Promise<boolean> {
  if (isNative()) {
    try {
      const mod = await import('@aparajita/capacitor-biometric-auth')
      await mod.BiometricAuth.authenticate({
        reason: 'Unlock Centering Manager',
        cancelTitle: 'Use PIN',
        allowDeviceCredential: true,
        androidTitle: 'Unlock',
      })
      return true
    } catch {
      return false
    }
  }
  if (!webauthnCredId || !window.PublicKeyCredential) return false
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: b64urlToBuf(webauthnCredId) }],
        userVerification: 'required',
        timeout: 60_000,
        rpId: location.hostname,
      },
    })
    return !!assertion
  } catch {
    return false
  }
}
