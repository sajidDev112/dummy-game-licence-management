import Puzzle from './components/Puzzle'
import { BlockedScreen, BootScreen, LicenseScreen, LoginScreen, MachineNumber } from './components/Screens'
import useLicenseGate from './hooks/useLicenseGate'
import { APP_NAME, SYNC_SECONDS } from './services/licenseApi'

function Header({ client, license, lastCheckedAt, offline, onSignOut, onRecheck, checking }) {
  const checked = lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString() : null

  return (
    <header className="mb-6 flex flex-wrap items-center gap-3 border-b border-slate-800 pb-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
          OP
        </span>
        <strong className="text-white">{APP_NAME}</strong>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
        {offline ? (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-400">
            Offline — using last check
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-400">
            Licensed
          </span>
        )}

        <span className="hidden text-slate-500 sm:inline">
          {client?.clientName} · {license?.licenseKey}
        </span>

        <MachineNumber compact />

        <button
          type="button"
          onClick={onRecheck}
          disabled={checking}
          title={checked ? `Last checked ${checked}` : 'Check the licence now'}
          className="rounded-md border border-slate-700 px-2.5 py-1 font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-60"
        >
          {checking ? 'Checking…' : 'Re-check'}
        </button>

        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md px-2.5 py-1 font-semibold text-slate-400 transition hover:text-white"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}

export default function App() {
  const gate = useLicenseGate()

  if (gate.stage === 'booting') return <BootScreen />

  if (gate.stage === 'login') {
    return <LoginScreen onSubmit={gate.signIn} busy={gate.checking} />
  }

  if (gate.stage === 'key') {
    return (
      <LicenseScreen
        onSubmit={gate.submitKey}
        onBack={gate.signOut}
        busy={gate.checking}
        initialError={gate.blockedReason}
      />
    )
  }

  if (['expired', 'deactivated', 'pending'].includes(gate.stage)) {
    return (
      <BlockedScreen
        kind={gate.stage}
        license={gate.license}
        message={gate.blockedReason}
        busy={gate.checking}
        onRetry={gate.recheck}
        lastCheckedAt={gate.lastCheckedAt}
        syncSeconds={SYNC_SECONDS}
        onForgetKey={gate.forgetKey}
        onSignOut={gate.signOut}
      />
    )
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6">
      <Header
        client={gate.client}
        license={gate.license}
        lastCheckedAt={gate.lastCheckedAt}
        offline={gate.offline}
        checking={gate.checking}
        onRecheck={gate.recheck}
        onSignOut={gate.signOut}
      />

      <Puzzle />

      <p className="mt-8 text-center text-xs text-slate-600">
        Licence re-checked every {SYNC_SECONDS}s and whenever this window regains focus.
      </p>
    </div>
  )
}
