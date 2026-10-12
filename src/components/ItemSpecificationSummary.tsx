import type { ItemSpecification } from '@/features/master-data/useItemControls'

export function ItemSpecificationSummary({ specification }: { specification?: ItemSpecification | null }) {
  if (!specification) return <p className="empty-state">No controlled specification recorded.</p>
  const row = specification
  return <div className="detail-summary" aria-label="Controlled item specification">
    <strong>Specification v{row.version} · {row.product_type}</strong>
    <p>{[
      row.diameter_mm && `Diameter ${row.diameter_mm} mm`, row.length_mm && `Length ${row.length_mm} mm`,
      row.thread_pitch_mm && `Pitch ${row.thread_pitch_mm} mm`, row.thread_designation && `Thread ${row.thread_designation}`,
      row.material_grade && `Material ${row.material_grade}`, row.property_class && `Class ${row.property_class}`,
      row.coating && `Coating ${row.coating}`, row.standard_reference && `Standard ${row.standard_reference}`,
    ].filter(Boolean).join(' · ') || 'Optional properties not recorded.'}</p>
  </div>
}
