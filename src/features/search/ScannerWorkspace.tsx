import { ScannerPanel } from './ScannerPanel'
import { useScannerLookup } from './useScannerLookup'
import type { GlobalSearchResult } from './useGlobalSearch'

export function ScannerWorkspace({ companyId,online,onOpen }: { companyId: string|null;online: boolean;onOpen: (record: GlobalSearchResult) => void }) {
  const lookup=useScannerLookup(companyId)
  return <ScannerPanel disabled={!companyId || !online} busy={lookup.isPending} onLookup={(value) => lookup.mutateAsync(value)} onOpen={onOpen} />
}
