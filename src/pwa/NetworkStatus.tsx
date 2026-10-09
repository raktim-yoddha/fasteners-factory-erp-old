import { useNetworkStatus } from '@/pwa/useNetworkStatus'

export function NetworkStatus() {
  const online = useNetworkStatus()
  const label = online ? 'Online' : 'Offline — read-only shell'

  return (
    <p className={online ? 'status status-online' : 'status status-offline'} role="status">
      <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d={online ? 'M5 12.55a11 11 0 0 1 14.08 0M8.5 16.11a6 6 0 0 1 7 0M12 20h.01' : 'M3 3l18 18M5.82 5.82A11 11 0 0 1 19.08 12.55M8.5 16.11a6 6 0 0 1 4.28-.95'} />
      </svg>
      {label}
    </p>
  )
}
