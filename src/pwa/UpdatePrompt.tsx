import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const updateServiceWorker = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD) return

    const update = registerSW({ onNeedRefresh: () => setUpdateAvailable(true) })
    updateServiceWorker.current = () => update(true)
  }, [])

  if (!updateAvailable) return null

  return (
    <section className="fixed inset-x-4 bottom-4 mx-auto max-w-lg rounded-xl border border-line bg-panel p-4 shadow-lg" aria-live="polite">
      <p className="font-semibold">Update available</p>
      <p className="mt-1 text-sm text-muted">Reload to use the latest version.</p>
      <button className="primary-button mt-3" type="button" onClick={() => void updateServiceWorker.current?.()}>
        Reload now
      </button>
    </section>
  )
}
