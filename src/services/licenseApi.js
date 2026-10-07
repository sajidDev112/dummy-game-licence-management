/*
 * Everything this product knows about licensing. It talks to three public
 * endpoints and never touches Firebase or an admin token.
 */

const BASE = import.meta.env.VITE_LICENSE_API || 'http://192.168.0.186:5173/api'
/** Display name of this product. */
export const APP_NAME = 'OpEzee Puzzle'

/** Must match a product in the licence dashboard exactly. */
export const PRODUCT_NAME = import.meta.env.VITE_PRODUCT_NAME || 'OpEzee Puzzle'
export const SYNC_SECONDS = Number(import.meta.env.VITE_SYNC_SECONDS || 60)

const KEY_STORAGE = `opezee.puzzle.licenseKey.${PRODUCT_NAME}`
const SESSION_STORAGE = 'opezee.puzzle.session'
const MACHINE_STORAGE = 'opezee.puzzle.machineNumber'

/** Present only in the desktop (Electron) build — see electron/preload.cjs. */
const desktop = typeof window !== 'undefined' ? window.opezee : undefined
export const IS_DESKTOP = Boolean(desktop?.isDesktop)
export const APP_VERSION = desktop?.appVersion || ''

/**
 * The 16-digit number identifying this PC, sent with every licence check.
 *
 * On the desktop it is created once at the first launch after installing and
 * kept across reinstalls and updates (electron/machineNumber.cjs). In a plain
 * browser — `npm run dev` — it falls back to one kept in localStorage.
 */
export const MACHINE_NUMBER = desktop?.machineNumber || browserMachineNumber()

function browserMachineNumber() {
  try {
    const stored = localStorage.getItem(MACHINE_STORAGE)
    if (/^\d{16}$/.test(stored || '')) return stored
  } catch {
    /* storage unavailable: a fresh number for this page load */
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const value = Array.from(bytes, (b, i) => (i === 0 ? 1 + (b % 9) : b % 10)).join('')
  try {
    localStorage.setItem(MACHINE_STORAGE, value)
  } catch {
    /* see above */
  }
  return value
}

export async function copyText(text) {
  if (desktop?.copyText) return desktop.copyText(text)
  await navigator.clipboard.writeText(text)
  return true
}

/** Shown whenever the product cannot reach the licence server at all. */
export const OFFLINE_MESSAGE = 'Internet connection required. Please connect and try again'

function offlineError() {
  const err = new Error(OFFLINE_MESSAGE)
  err.offline = true
  return err
}

/**
 * The licence endpoints answer 401/403/404 with a useful JSON body, so the
 * status is returned alongside the payload rather than thrown away.
 */
async function post(path, body) {
  // The browser already knows there is no connection, so fail immediately with
  // the real reason rather than waiting out a doomed request.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw offlineError()
  }

  // The desktop app sends the request from the main process, so a file:// page
  // is not blocked by CORS.
  if (desktop?.post) {
    try {
      return await desktop.post(`${BASE}/${path}`, body)
    } catch {
      throw offlineError()
    }
  }

  let res
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Offline or the licence server is down — the caller decides what to do.
    throw offlineError()
  }

  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  return { status: res.status, data }
}

/** The product's own login screen. */
export async function login(username, password) {
  let status
  let data
  try {
    ;({ status, data } = await post('clients/login', {
      username,
      password,
      productName: PRODUCT_NAME,
      machine_number: MACHINE_NUMBER,
    }))
  } catch (err) {
    // Signing in needs the server, so there is nothing to fall back on: the
    // screen says so plainly instead of rejecting into an unhandled error.
    return { ok: false, offline: true, message: err.message }
  }

  if (status === 200 && data.valid) {
    // The session carries who signed in and which licences they own, so every
    // later licence check can be matched against this user.
    const client = {
      ...data.client,
      username: data.client?.username || username,
      licenses: data.licenses || [],
    }
    return { ok: true, client, licenses: client.licenses }
  }
  return { ok: false, message: data.message || 'Sign in failed' }
}

// --- the licence must belong to the signed-in user ---------------------------

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
const firstOf = (...values) => values.find((v) => v !== undefined && v !== null && v !== '')

function clientIdOf(client) {
  return firstOf(client?.id, client?.clientId, client?._id, client?.uid)
}

/** Who the server says the licence was issued to, if it says. */
function licenseOwner(license) {
  return {
    id: firstOf(license?.clientId, license?.client?.id, license?.client?._id, license?.client?.clientId),
    username: firstOf(license?.username, license?.clientUsername, license?.client?.username),
  }
}

/** Identifies the signed-in user on every licence call. */
function identity(client) {
  return { username: client?.username || '', clientId: clientIdOf(client) || '' }
}

/**
 * The licence key, product and machine number must all match the user who
 * signed in. The server is sent the user too and should enforce this itself;
 * this is the product's own check on whatever the server sends back.
 */
function checkOwnership(outcome, licenseKey, client) {
  const license = outcome.license
  if (!license || !client) return outcome

  const owned = client.licenses || []
  if (owned.length && !owned.some((l) => same(l.licenseKey || l.key || l, licenseKey))) {
    return { state: 'not-yours', message: 'This license key is not assigned to your account' }
  }

  const owner = licenseOwner(license)
  const myId = clientIdOf(client)
  if ((owner.id && myId && !same(owner.id, myId)) || (owner.username && !same(owner.username, client.username))) {
    return { state: 'not-yours', message: 'This license key is not assigned to your account' }
  }

  if (license.productName && !same(license.productName, PRODUCT_NAME)) {
    return { state: 'wrong-product', message: 'This key is for another product' }
  }

  const boundTo = firstOf(license.machine_number, license.machineNumber)
  if (boundTo && String(boundTo) !== MACHINE_NUMBER) {
    return { state: 'other-machine', message: 'This license key is already activated on another machine' }
  }

  return outcome
}

/**
 * Normalises every licence outcome into one of the states the UI renders.
 * `state` is what the app switches on; `message` is what the user reads.
 */
function toOutcome(status, data) {
  if (status === 404) return { state: 'invalid', message: data.message || 'Invalid license key' }
  if (status === 403) {
    return { state: 'wrong-product', message: data.message || 'This key is for another product' }
  }
  if (status === 429) {
    return { state: 'rate-limited', message: data.message || 'Too many attempts. Try again shortly.' }
  }
  if (status !== 200) {
    return { state: 'error', message: data.message || 'The licence could not be checked' }
  }

  if (data.valid) return { state: 'valid', message: data.message, license: data.license || data }

  // 200 but not valid: expired, deactivated, or not started yet.
  const licenseStatus = data.license?.status || data.status
  return {
    state: licenseStatus === 'deactivated' ? 'deactivated' : licenseStatus === 'pending' ? 'pending' : 'expired',
    message: data.message,
    license: data.license || data,
  }
}

/** Used once, when the key is first entered. */
export async function verifyKey(licenseKey, client) {
  const { status, data } = await post('licenses/verify', {
    licenseKey,
    productName: PRODUCT_NAME,
    machine_number: MACHINE_NUMBER,
    ...identity(client),
  })
  return checkOwnership(toOutcome(status, data), licenseKey, client)
}

/** Used on a timer while the game is running. */
export async function syncKey(licenseKey, client) {
  const { status, data } = await post('licenses/sync', {
    licenseKey,
    productName: PRODUCT_NAME,
    machine_number: MACHINE_NUMBER,
    ...identity(client),
  })
  return {
    ...checkOwnership(toOutcome(status, data), licenseKey, client),
    checkedAt: data.checkedAt || new Date().toISOString(),
  }
}

// --- remembered licence key -------------------------------------------------
// The key is stored so it is only ever typed once. The login is deliberately
// NOT stored: signing in is required every time the product is opened.
// Each user on this PC has their own remembered key, so one user's key is
// never tried for another.

const keyStorage = (client) => `${KEY_STORAGE}.${String(client?.username || '').toLowerCase()}`

export function readStoredKey(client) {
  try {
    return localStorage.getItem(keyStorage(client)) || ''
  } catch {
    return ''
  }
}

export function storeKey(client, key) {
  try {
    localStorage.setItem(keyStorage(client), key)
  } catch {
    // Private mode: the key simply has to be entered again next time.
  }
}

// --- signed-in session -------------------------------------------------------
// sessionStorage, not localStorage: the session survives a page refresh but
// ends when the tab or browser closes, so opening the product still requires
// signing in. Signing out clears it immediately.

export function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_STORAGE) || 'null')
  } catch {
    return null
  }
}

export function writeSession(client) {
  try {
    if (client) sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(client))
    else sessionStorage.removeItem(SESSION_STORAGE)
  } catch {
    // Storage unavailable: the session just will not survive a refresh.
  }
}

export function clearStoredKey(client) {
  try {
    localStorage.removeItem(keyStorage(client))
  } catch {
    /* nothing to clean up */
  }
}
