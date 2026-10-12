import { createPortal } from 'react-dom'
import { BarcodeLabel } from '@/components/BarcodeLabel'

export function LotLabelPanel({ code,sku,uom,onPrint }: { code: string;sku: string;uom: string;onPrint: () => void }) {
  const label=<article className="record-card package-label"><h4 className="font-bold">Lot {code}</h4><BarcodeLabel value={code} /><p>Item {sku} · Base unit {uom}</p><p>Scan to check current stock balance and QC state.</p></article>
  return <>
    <div aria-label="Selected lot label">{label}</div>
    <button className="secondary-button" type="button" onClick={onPrint}>Print lot label</button>
    {createPortal(<section className="package-print-sheet" aria-hidden="true">{label}</section>,document.body)}
  </>
}
