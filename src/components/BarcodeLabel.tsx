import { code39 } from '@/lib/code39'

export function BarcodeLabel({ value }: { value: string }) {
  const barcode=code39(value)
  if (!barcode) return <p className="empty-state">Barcode unavailable for this code. Use the printed identifier.</p>
  return <svg className="barcode-label" role="img" aria-label={`Code 39 barcode ${value}`} viewBox={`0 0 ${barcode.width} 40`} xmlns="http://www.w3.org/2000/svg">
    {barcode.bars.map((bar) => <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={40} fill="currentColor" />)}
  </svg>
}
