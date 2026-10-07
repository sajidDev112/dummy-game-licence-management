import { useCallback, useEffect, useRef, useState } from 'react'

import {
  SYNC_SECONDS,
  clearStoredKey,
  login as apiLogin,
  readSession,
  readStoredKey,
  storeKey,
  syncKey,
  verifyKey,
  writeSession,
} from '../services/licenseApi'

/** Stages where re-checking with the server still tells us something useful. */
const POLLED_STAGES = ['ready', 'expired', 'deactivated', 'pending']

/**
 * The gate every screen is driven by.
 *
 *   login  -> sign in (required on every launch, never remembered)
 *   key    -> enter the licence key (remembered once it verifies)
 *   ready  -> the game is playable
 *   expired | deactivated | pending | invalid -> blocked, with a reason
 *
 * While the game is running the licence is re-checked on a timer and whenever
 * the window regains focus, so a change made in the dashboard takes effect
 * without the player restarting anything.
 */
export default function useLicenseGate() {
  // A restored session starts on 'booting' so the login screen never flashes
  // before the licence has been re-checked.
  const [stage, setStage] = useState(() => (readSession() ? 'booting' : 'login'))
  const [client, setClient] = useState(() => readSession())
  const [licenseKey, setLicenseKey] = useState('')
  const [license, setLicense] = useState(null)
  const [blockedReason, setBlockedReason] = useState('')
  const [checking, setChecking] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState(null)
  const [offline, setOffline] = useState(false)

  // Read inside the interval so it always sees the current key.
  const keyRef = useRef('')
  keyRef.current = licenseKey
  // Every licence check is made as the signed-in user.
  const clientRef = useRef(client)
  clientRef.current = client

  /** Routes a verify/sync outcome to the right screen. */
  const applyOutcome = useCallback((outcome, key) => {
    setOffline(false)

    if (outcome.state === 'valid') {
      setLicense(outcome.license)
      setBlockedReason('')
      setStage('ready')
      return true
    }

    setLicense(outcome.license || null)
    setBlockedReason(outcome.message || '')

    if (['expired', 'deactivated', 'pending'].includes(outcome.state)) {
      setStage(outcome.state)
      return false
    }

    // Invalid, not this user's, wrong product, another machine, rate limited or
    // a server error: the stored key is no longer usable, so ask for one again
    // rather than leaving a dead state.
    if (key) clearStoredKey(clientRef.current)
    setLicenseKey('')
    setStage('key')
    return false
  }, [])

  /** A key entered previously is re-checked, never trusted blindly. */
  const resumeWithStoredKey = useCallback(async () => {
    const forClient = clientRef.current
    const stored = readStoredKey(forClient)
    if (!stored) {
      setStage('key')
      return
    }

    setLicenseKey(stored)
    setChecking(true)
    try {
      applyOutcome(await verifyKey(stored, forClient), stored)
    } catch (err) {
      // Offline: there is no way to confirm the licence, so play does not begin.
      setOffline(true)
      setBlockedReason(err.message)
      setStage('key')
    } finally {
      setChecking(false)
    }
  }, [applyOutcome])

  // Restore a session that survived a page refresh.
  useEffect(() => {
    if (stage !== 'booting') return
    resumeWithStoredKey()
  }, [stage, resumeWithStoredKey])

  const signIn = useCallback(
    async (username, password) => {
      const result = await apiLogin(username, password)
      if (!result.ok) return result

      setClient(result.client)
      clientRef.current = result.client
      writeSession(result.client)
      await resumeWithStoredKey()
      return result
    },
    [resumeWithStoredKey]
  )

  const submitKey = useCallback(
    async (key) => {
      const trimmed = key.trim().toUpperCase()
      setChecking(true)
      try {
        const outcome = await verifyKey(trimmed, clientRef.current)
        if (outcome.state === 'valid') {
          storeKey(clientRef.current, trimmed)
          setLicenseKey(trimmed)
        }
        applyOutcome(outcome, trimmed)
        return outcome
      } catch (err) {
        setOffline(true)
        return { state: 'error', message: err.message }
      } finally {
        setChecking(false)
      }
    },
    [applyOutcome]
  )

  /** Re-checks with the server. Called on a timer, on focus, and manually. */
  const recheck = useCallback(async () => {
    const key = keyRef.current
    if (!key) return
    try {
      const outcome = await syncKey(key, clientRef.current)
      setLastCheckedAt(outcome.checkedAt)
      applyOutcome(outcome, key)
    } catch {
      // A failed check must not lock out a player mid-game over a dropped
      // connection; the next tick will try again.
      setOffline(true)
    }
  }, [applyOutcome])

  // Poll while the game is playable AND while it is blocked: a licence that is
  // reactivated or renewed in the dashboard must let the player back in on its
  // own, without them having to press anything.
  useEffect(() => {
    if (!POLLED_STAGES.includes(stage)) return undefined

    const id = setInterval(recheck, Math.max(10, SYNC_SECONDS) * 1000)
    const onFocus = () => {
      if (document.visibilityState === 'visible') recheck()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [stage, recheck])

  const signOut = useCallback(() => {
    // The key stays remembered; only the session ends.
    writeSession(null)
    setClient(null)
    setLicense(null)
    setBlockedReason('')
    setStage('login')
  }, [])

  const forgetKey = useCallback(() => {
    clearStoredKey(client)
    setLicenseKey('')
    setLicense(null)
    setBlockedReason('')
    setStage(client ? 'key' : 'login')
  }, [client])

  return {
    stage,
    client,
    license,
    licenseKey,
    blockedReason,
    checking,
    offline,
    lastCheckedAt,
    signIn,
    signOut,
    submitKey,
    forgetKey,
    recheck,
  }
}
