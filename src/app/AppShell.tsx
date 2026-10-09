import { InstallPrompt } from '@/pwa/InstallPrompt'
import { NetworkStatus } from '@/pwa/NetworkStatus'
import { UpdatePrompt } from '@/pwa/UpdatePrompt'
import { isSupabaseConfigured } from '@/lib/supabase'

export function AppShell() {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 text-ink sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-5xl flex-col rounded-2xl border border-line bg-panel shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-7">
          <div>
            <p className="text-sm font-semibold tracking-wide text-brand">OPERATIONS SYSTEM</p>
            <h1 className="text-xl font-bold tracking-tight">Fasteners Factory ERP</h1>
          </div>
          <NetworkStatus />
        </header>

        <section className="grid flex-1 content-center gap-6 px-5 py-10 sm:px-7 lg:grid-cols-[1.4fr_1fr] lg:gap-10 lg:px-10">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-brand">Foundation in progress</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A reliable workspace for factory operations.</h2>
            <p className="mt-4 max-w-prose text-base leading-7 text-muted">
              The installable workspace is being prepared for Windows and Android. Operational changes will be available only after the server confirms them.
            </p>
          </div>

          <div className="grid content-start gap-3">
            <InstallPrompt />
            <section className="rounded-xl border border-line bg-canvas p-4" aria-labelledby="backend-title">
              <h2 id="backend-title" className="font-semibold">Supabase backend</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {isSupabaseConfigured
                  ? 'Public connection settings are ready. Authentication and operational data are added in the next secure slice.'
                  : 'Public connection settings are not configured yet. No data is loaded or stored by this shell.'}
              </p>
            </section>
          </div>
        </section>
      </div>
      <UpdatePrompt />
    </main>
  )
}
