import { useSyncExternalStore } from 'react'
import { workspaceMode } from '@/local/mode'

const subscribe = (onStoreChange: () => void) => {
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)

  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

// Existing operation gates mean authority available. Solo availability is established at startup.
const getSnapshot = () => workspaceMode() === 'solo' || navigator.onLine

export function useNetworkStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
