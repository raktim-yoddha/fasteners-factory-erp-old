import { useEffect, useState } from 'react'

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches ?? false

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const onAppInstalled = () => setInstalled(true)

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setDeferredPrompt(null)
  }

  if (installed) {
    return (
      <section className="rounded-xl border border-line bg-canvas p-4" aria-labelledby="installed-title">
        <h2 id="installed-title" className="font-semibold">Installed app</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Open Fasteners Factory ERP from your device app list.</p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-line bg-canvas p-4" aria-labelledby="install-title">
      <h2 id="install-title" className="font-semibold">Install this workspace</h2>
      <p className="mt-1 text-sm leading-6 text-muted">Use the installed app for the focused Windows and Android experience.</p>
      {deferredPrompt ? (
        <button className="primary-button mt-4" type="button" onClick={() => void install()}>
          Install Fasteners Factory ERP
        </button>
      ) : (
        <p className="mt-3 text-sm text-muted">In Chrome, open the menu and choose <strong>Install app</strong>.</p>
      )}
    </section>
  )
}
