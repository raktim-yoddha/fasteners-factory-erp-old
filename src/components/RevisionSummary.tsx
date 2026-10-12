import type { EngineeringRevisionOptions } from '@/features/sales/useEngineeringRevisionOptions'

export function RevisionSummary({
  engineering,
  drawingId,
  bomId,
  routingId,
}: {
  engineering: EngineeringRevisionOptions
  drawingId?: string | null
  bomId?: string | null
  routingId?: string | null
}) {
  return (
    <dl className="revision-summary">
      {(
        [
          ['Drawing', drawingId, engineering.drawings],
          ['BOM', bomId, engineering.boms],
          ['Routing', routingId, engineering.routings],
        ] as const
      ).map(([label, id, revisions]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {id
              ? (revisions.find((revision) => revision.id === id)?.label ??
                `Pinned revision ${id}`)
              : 'Not specified'}
          </dd>
        </div>
      ))}
    </dl>
  )
}
