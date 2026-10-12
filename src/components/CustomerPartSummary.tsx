export function CustomerPartSummary({ number, revision }: { number?: string | null; revision?: string | null }) {
  if (!number) return null
  return <p>Customer part {number}{revision ? ` · Rev ${revision}` : ' · No customer revision recorded'}</p>
}
