import { useEffect, useState } from 'react'

import { APP_NAME, APP_VERSION, MACHINE_NUMBER, copyText } from '../services/licenseApi'

function Shell({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-600">
          {APP_NAME}
          {APP_VERSION && ` v${APP_VERSION}`} · licensed by Opezee
        </p>
      </div>
    </div>
  )
}

function Heading({ title, subtitle }) {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
        OP
      </div>
      <h1 className="text-lg font-bold text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    </div>
  )
}

function Alert({ children }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-900 bg-red-950 px-3 py-2.5 text-sm font-medium text-red-300"
    >
      {children}
    </div>
  )
}

/** 1234567890123456 -> 1234 5678 9012 3456, easier to read out to support. */
export function formatMachineNumber(value) {
  return String(value || '').replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** The 16-digit number identifying this PC, with a copy button. */
export function MachineNumber({ compact = false }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await copyText(MACHINE_NUMBER)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the number is still on screen to copy by hand.
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        title="Machine number — click to copy"
        className="rounded-md border border-slate-800 px-2.5 py-1 font-mono text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
      >
        {copied ? 'Copied' : formatMachineNumber(MACHINE_NUMBER)}
      </button>
    )
  }

  return (
    <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 px-3 py-2.5 text-sm">
      <div>
        <div className="text-xs text-slate-500">Machine number</div>
        <div className="font-mono tracking-wider text-slate-200">{formatMachineNumber(MACHINE_NUMBER)}</div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-700"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400'

const primaryClass =
  'w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60'

/** Shown while a restored session has its licence re-checked. */
export function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      <p className="text-sm text-slate-500">Checking your license…</p>
    </div>
  )
}

/** Step 1 — required every time the product is opened. */
export function LoginScreen({ onSubmit, busy }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Clear the "no internet" message the moment the connection is back, so the
  // player is not left staring at a stale error before trying again.
  useEffect(() => {
    const onOnline = () => setError('')
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your username and password')
      return
    }

    setSubmitting(true)
    setError('')
    const result = await onSubmit(username.trim(), password)
    if (!result.ok) setError(result.message)
    setSubmitting(false)
  }

  const disabled = submitting || busy

  return (
    <Shell>
      <form onSubmit={handleSubmit} noValidate>
        <Heading title="Sign in to play" subtitle="Use the credentials your supplier gave you." />
        <Alert>{error}</Alert>

        <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="username">
          Client user ID
        </label>
        <input
          id="username"
          autoFocus
          autoComplete="username"
          className={`${inputClass} mb-4`}
          placeholder="john.doe"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={`${inputClass} mb-5`}
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" className={primaryClass} disabled={disabled}>
          {disabled ? 'Checking...' : 'Sign In'}
        </button>
      </form>
    </Shell>
  )
}

/** Step 2 — asked once; the key is remembered after it verifies. */
export function LicenseScreen({ onSubmit, onBack, busy, initialError }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState(initialError || '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => setError(initialError || ''), [initialError])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!key.trim()) {
      setError('Enter your license key')
      return
    }

    setSubmitting(true)
    setError('')
    const outcome = await onSubmit(key)
    // A valid key changes the stage, so only failures land back here.
    if (outcome && outcome.state !== 'valid') setError(outcome.message)
    setSubmitting(false)
  }

  const disabled = submitting || busy

  return (
    <Shell>
      <form onSubmit={handleSubmit} noValidate>
        <Heading
          title="Activate this product"
          subtitle="Enter the license key your supplier sent you. You only need to do this once on this device."
        />
        <Alert>{error}</Alert>

        <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="licenseKey">
          License key
        </label>
        <input
          id="licenseKey"
          autoFocus
          spellCheck="false"
          autoCapitalize="characters"
          className={`${inputClass} mb-5 font-mono tracking-wider`}
          placeholder="OPEZ-XXXX-XXXX-XXXX"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
        />

        <button type="submit" className={primaryClass} disabled={disabled}>
          {disabled ? 'Verifying...' : 'Activate'}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full text-center text-xs font-semibold text-slate-400 transition hover:text-white"
        >
          Sign out
        </button>

        <MachineNumber />
      </form>
    </Shell>
  )
}

const BLOCKED = {
  expired: {
    title: 'License expired',
    tone: 'text-red-400',
    body: 'This license has passed its expiry date, so the game is locked. Contact your supplier to renew it.',
  },
  deactivated: {
    title: 'License deactivated',
    tone: 'text-slate-300',
    body: 'Your supplier has switched this license off. It can be turned back on from their dashboard.',
  },
  pending: {
    title: 'License not active yet',
    tone: 'text-amber-400',
    body: 'This license has a start date in the future. It will work from that date.',
  },
}

/**
 * Shown when the licence is not usable — reached on launch or mid-game, since
 * the running game keeps re-checking.
 */
export function BlockedScreen({
  kind,
  license,
  message,
  onRetry,
  onForgetKey,
  onSignOut,
  busy,
  lastCheckedAt,
  syncSeconds,
}) {
  const copy = BLOCKED[kind] || BLOCKED.expired
  const formatDate = (value) => {
    if (!value) return '—'
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? '—' : d.toUTCString().slice(5, 16)
  }

  return (
    <Shell>
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
          <svg className={`h-6 w-6 ${copy.tone}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={
                kind === 'deactivated'
                  ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
                  : 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
              }
            />
          </svg>
        </div>

        <h1 className={`text-lg font-bold ${copy.tone}`}>{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{message || copy.body}</p>
      </div>

      {license && (
        <dl className="mt-5 space-y-2 rounded-lg bg-slate-800/60 p-4 text-sm">
          {[
            ['License Key', license.licenseKey],
            ['Product', license.productName],
            ['Start Date', formatDate(license.startDate)],
            ['Expiry Date', formatDate(license.expiryDate)],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-200">{value}</dd>
              </div>
            ))}
        </dl>
      )}

      <MachineNumber />

      <button type="button" onClick={onRetry} className={`${primaryClass} mt-6`} disabled={busy}>
        {busy ? 'Checking...' : 'Check again'}
      </button>

      {/* The licence keeps being re-checked from this screen, so one reactivated
          in the dashboard lets the player back in on its own. This line makes
          that visible instead of leaving the screen looking frozen. */}
      <p className="mt-3 text-center text-xs text-slate-500">
        {lastCheckedAt
          ? `Last checked ${new Date(lastCheckedAt).toLocaleTimeString()} · re-checking every ${syncSeconds}s`
          : `Re-checking every ${syncSeconds}s`}
      </p>

      <div className="mt-3 flex justify-center gap-4 text-xs font-semibold text-slate-400">
        <button type="button" onClick={onForgetKey} className="transition hover:text-white">
          Use a different key
        </button>
        <button type="button" onClick={onSignOut} className="transition hover:text-white">
          Sign out
        </button>
      </div>
    </Shell>
  )
}
