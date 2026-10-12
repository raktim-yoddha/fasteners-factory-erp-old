import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { useNetworkStatus } from './useNetworkStatus'

export function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false)
  const online=useNetworkStatus()
  const updateServiceWorker = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD) return

    const update = registerSW({ onNeedRefresh: () => setUpdateAvailable(true) })
    updateServiceWorker.current = () => update(true)
  }, [])

  if (!updateAvailable) return null

  async function reload() {
    if (!online || busy || !window.confirm('Reload to install this update? Unsaved form input will be lost. Save or copy it before continuing.')) return
    setBusy(true);setFailed(false)
    try { await updateServiceWorker.current?.() }
    catch { setFailed(true) }
    finally { setBusy(false) }
  }

  return (
    <section className="fixed inset-x-4 bottom-4 mx-auto max-w-lg rounded-xl border border-line bg-panel p-4 shadow-lg" aria-live="polite">
      <p className="font-semibold">Update available</p>
      <p className="mt-1 text-sm text-muted">Save or copy unsaved form input before reloading to use the latest version.</p>
      {!online && <p role="alert">Blocked because this device is offline. Reconnect before applying the update.</p>}
      {failed && <p role="alert">Blocked because the update could not finish. Your current screen is still open; retry when connected.</p>}
      <button className="primary-button mt-3" type="button" disabled={!online || busy} onClick={() => void reload()}>
        Reload now
      </button>
    </section>
  )
}
