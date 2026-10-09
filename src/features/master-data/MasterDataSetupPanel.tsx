import { useState } from 'react'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { CreateMasterDataCommand } from '@/features/master-data/useCreateMasterData'
import { formatCommandError } from '@/lib/commandError'

type MasterDataSetupPanelProps = {
  companyId: string | null
  options: MasterDataOptions
  creating: boolean
  onCreate: (command: CreateMasterDataCommand) => Promise<void>
}

export function MasterDataSetupPanel({ companyId, options, creating, onCreate }: MasterDataSetupPanelProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [baseUom, setBaseUom] = useState<'pcs' | 'kg' | 'm' | 'set'>('pcs')
  const [warehousePlantId, setWarehousePlantId] = useState('')
  const [warehouseCode, setWarehouseCode] = useState('')
  const [warehouseName, setWarehouseName] = useState('')
  const [locationWarehouseId, setLocationWarehouseId] = useState('')
  const [locationCode, setLocationCode] = useState('')
  const [locationName, setLocationName] = useState('')

  async function submit(command: CreateMasterDataCommand, success: string) {
    try {
      await onCreate(command)
      setMessage(success)
    } catch (error) {
      setMessage(formatCommandError(error, 'the server could not create this record. Check the required details and try again.'))
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="master-data-title">
      <h3 className="font-bold" id="master-data-title">Initial master data</h3>
      <p className="mt-1 text-sm leading-6 text-muted">Create operational records in the active company. The database applies your role permissions before saving any change.</p>
      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <form className="master-form" onSubmit={(event) => { event.preventDefault(); if (companyId) void submit({ kind: 'customer', companyId, code: customerCode, name: customerName }, 'Customer created.') }}>
          <h4>Customer</h4>
          <label className="form-label">Customer code<input className="form-input" required value={customerCode} onChange={(event) => setCustomerCode(event.target.value)} /></label>
          <label className="form-label">Customer name<input className="form-input" required value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
          <button className="secondary-button" disabled={!companyId || creating} type="submit">Create customer</button>
        </form>
        <form className="master-form" onSubmit={(event) => { event.preventDefault(); if (companyId) void submit({ kind: 'item', companyId, sku, description, baseUom }, 'Item created.') }}>
          <h4>Item</h4>
          <label className="form-label">SKU<input className="form-input" required value={sku} onChange={(event) => setSku(event.target.value)} /></label>
          <label className="form-label">Description<input className="form-input" required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="form-label">Base unit<select className="form-input" value={baseUom} onChange={(event) => setBaseUom(event.target.value as typeof baseUom)}><option value="pcs">Pieces</option><option value="kg">Kilograms</option><option value="m">Metres</option><option value="set">Sets</option></select></label>
          <button className="secondary-button" disabled={!companyId || creating} type="submit">Create item</button>
        </form>
        <form className="master-form" onSubmit={(event) => { event.preventDefault(); if (companyId) void submit({ kind: 'warehouse', companyId, plantId: warehousePlantId, code: warehouseCode, name: warehouseName }, 'Warehouse created.') }}>
          <h4>Warehouse</h4>
          <label className="form-label">Plant<select className="form-input" required value={warehousePlantId} onChange={(event) => setWarehousePlantId(event.target.value)}><option value="">Select plant</option>{options.plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></label>
          <label className="form-label">Warehouse code<input className="form-input" required value={warehouseCode} onChange={(event) => setWarehouseCode(event.target.value)} /></label>
          <label className="form-label">Warehouse name<input className="form-input" required value={warehouseName} onChange={(event) => setWarehouseName(event.target.value)} /></label>
          <button className="secondary-button" disabled={!companyId || options.plants.length === 0 || creating} type="submit">Create warehouse</button>
        </form>
        <form className="master-form" onSubmit={(event) => { event.preventDefault(); if (companyId) void submit({ kind: 'location', companyId, warehouseId: locationWarehouseId, code: locationCode, name: locationName }, 'Stock location created.') }}>
          <h4>Stock location</h4>
          <label className="form-label">Warehouse<select className="form-input" required value={locationWarehouseId} onChange={(event) => setLocationWarehouseId(event.target.value)}><option value="">Select warehouse</option>{options.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}</select></label>
          <label className="form-label">Location code<input className="form-input" required value={locationCode} onChange={(event) => setLocationCode(event.target.value)} /></label>
          <label className="form-label">Location name<input className="form-input" required value={locationName} onChange={(event) => setLocationName(event.target.value)} /></label>
          <button className="secondary-button" disabled={!companyId || options.warehouses.length === 0 || creating} type="submit">Create location</button>
        </form>
      </div>
      {message ? <p className={message.startsWith('Blocked because') ? 'mt-4 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning' : 'mt-4 rounded-lg border border-line bg-canvas p-3 text-sm'} role={message.startsWith('Blocked because') ? 'alert' : 'status'}>{message}</p> : null}
    </section>
  )
}
