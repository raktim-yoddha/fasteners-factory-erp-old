import { useState } from 'react'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { CreateMasterDataCommand } from '@/features/master-data/useCreateMasterData'
import { formatCommandError } from '@/lib/commandError'
import { CommandFeedback } from '@/components/CommandFeedback'

type MasterDataSetupPanelProps = {
  only?: 'commercial'
  companyId: string | null
  options: MasterDataOptions
  creating: boolean
  onCreate: (command: CreateMasterDataCommand) => Promise<void>
}

export function MasterDataSetupPanel({
  companyId,
  options,
  creating,
  onCreate,
  only,
}: MasterDataSetupPanelProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [supplierCode, setSupplierCode] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [baseUom, setBaseUom] = useState<'pcs' | 'kg' | 'm' | 'set'>('pcs')
  const [drawingItemId, setDrawingItemId] = useState('')
  const [drawingNumber, setDrawingNumber] = useState('')
  const [warehousePlantId, setWarehousePlantId] = useState('')
  const [warehouseCode, setWarehouseCode] = useState('')
  const [warehouseName, setWarehouseName] = useState('')
  const [locationWarehouseId, setLocationWarehouseId] = useState('')
  const [locationCode, setLocationCode] = useState('')
  const [locationName, setLocationName] = useState('')
  const [workCentrePlantId, setWorkCentrePlantId] = useState('')
  const [workCentreCode, setWorkCentreCode] = useState('')
  const [workCentreName, setWorkCentreName] = useState('')

  async function submit(command: CreateMasterDataCommand, success: string) {
    try {
      await onCreate(command)
      setMessage(success)
    } catch (error) {
      setMessage(
        formatCommandError(
          error,
          'the server could not create this record. Check the required details and try again.',
        ),
      )
    }
  }

  return (
    <section
      className="mt-6 rounded-xl border border-line bg-panel p-5"
      aria-labelledby="master-data-title"
    >
      <h3 className="font-bold" id="master-data-title">
        Initial master data
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted">
        Create operational records in the active company. Records save in the
        active workspace after validation.
      </p>
      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <form
          className="master-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (companyId)
              void submit(
                {
                  kind: 'customer',
                  companyId,
                  code: customerCode,
                  name: customerName,
                },
                'Customer created.',
              )
          }}
        >
          <h4>Customer</h4>
          <label className="form-label">
            Customer code
            <input
              className="form-input"
              required
              value={customerCode}
              onChange={(event) => setCustomerCode(event.target.value)}
            />
          </label>
          <label className="form-label">
            Customer name
            <input
              className="form-input"
              required
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={!companyId || creating}
            type="submit"
          >
            Create customer
          </button>
        </form>
        {!only ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId)
                void submit(
                  {
                    kind: 'supplier',
                    companyId,
                    code: supplierCode,
                    name: supplierName,
                  },
                  'Supplier created.',
                )
            }}
          >
            <h4>Supplier</h4>
            <label className="form-label">
              Supplier code
              <input
                className="form-input"
                required
                value={supplierCode}
                onChange={(event) => setSupplierCode(event.target.value)}
              />
            </label>
            <label className="form-label">
              Supplier name
              <input
                className="form-input"
                required
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={!companyId || creating}
              type="submit"
            >
              Create supplier
            </button>
          </form>
        ) : null}
        <form
          className="master-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (companyId)
              void submit(
                { kind: 'item', companyId, sku, description, baseUom },
                'Item created.',
              )
          }}
        >
          <h4>Item</h4>
          <label className="form-label">
            SKU
            <input
              className="form-input"
              required
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            />
          </label>
          <label className="form-label">
            Description
            <input
              className="form-input"
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="form-label">
            Base unit
            <select
              aria-label="Base unit"
              className="form-input"
              value={baseUom}
              onChange={(event) =>
                setBaseUom(event.target.value as typeof baseUom)
              }
            >
              <option value="pcs">Pieces</option>
              <option value="kg">Kilograms</option>
              <option value="m">Metres</option>
              <option value="set">Sets</option>
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={!companyId || creating}
            type="submit"
          >
            Create item
          </button>
        </form>
        {!only ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId)
                void submit(
                  {
                    kind: 'drawing',
                    companyId,
                    itemId: drawingItemId,
                    drawingNumber,
                  },
                  'Drawing created.',
                )
            }}
          >
            <h4>Drawing</h4>
            <label className="form-label">
              Item
              <select
                aria-label="Item"
                className="form-input"
                required
                value={drawingItemId}
                onChange={(event) => setDrawingItemId(event.target.value)}
              >
                <option value="">Select item</option>
                {options.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Drawing number
              <input
                className="form-input"
                required
                value={drawingNumber}
                onChange={(event) => setDrawingNumber(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={!companyId || options.items.length === 0 || creating}
              type="submit"
            >
              Create drawing
            </button>
          </form>
        ) : null}
        {!only ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId)
                void submit(
                  {
                    kind: 'warehouse',
                    companyId,
                    plantId: warehousePlantId,
                    code: warehouseCode,
                    name: warehouseName,
                  },
                  'Warehouse created.',
                )
            }}
          >
            <h4>Warehouse</h4>
            <label className="form-label">
              Plant
              <select
                aria-label="Plant"
                className="form-input"
                required
                value={warehousePlantId}
                onChange={(event) => setWarehousePlantId(event.target.value)}
              >
                <option value="">Select plant</option>
                {options.plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Warehouse code
              <input
                className="form-input"
                required
                value={warehouseCode}
                onChange={(event) => setWarehouseCode(event.target.value)}
              />
            </label>
            <label className="form-label">
              Warehouse name
              <input
                className="form-input"
                required
                value={warehouseName}
                onChange={(event) => setWarehouseName(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={!companyId || options.plants.length === 0 || creating}
              type="submit"
            >
              Create warehouse
            </button>
          </form>
        ) : null}
        {!only ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId)
                void submit(
                  {
                    kind: 'location',
                    companyId,
                    warehouseId: locationWarehouseId,
                    code: locationCode,
                    name: locationName,
                  },
                  'Stock location created.',
                )
            }}
          >
            <h4>Stock location</h4>
            <label className="form-label">
              Warehouse
              <select
                aria-label="Warehouse"
                className="form-input"
                required
                value={locationWarehouseId}
                onChange={(event) => setLocationWarehouseId(event.target.value)}
              >
                <option value="">Select warehouse</option>
                {options.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} — {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Location code
              <input
                className="form-input"
                required
                value={locationCode}
                onChange={(event) => setLocationCode(event.target.value)}
              />
            </label>
            <label className="form-label">
              Location name
              <input
                className="form-input"
                required
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={
                !companyId || options.warehouses.length === 0 || creating
              }
              type="submit"
            >
              Create location
            </button>
          </form>
        ) : null}
        {!only ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId)
                void submit(
                  {
                    kind: 'workCentre',
                    companyId,
                    plantId: workCentrePlantId,
                    code: workCentreCode,
                    name: workCentreName,
                  },
                  'Work centre created.',
                )
            }}
          >
            <h4>Work centre</h4>
            <label className="form-label">
              Plant
              <select
                aria-label="Plant"
                className="form-input"
                required
                value={workCentrePlantId}
                onChange={(event) => setWorkCentrePlantId(event.target.value)}
              >
                <option value="">Select plant</option>
                {options.plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Work centre code
              <input
                className="form-input"
                required
                value={workCentreCode}
                onChange={(event) => setWorkCentreCode(event.target.value)}
              />
            </label>
            <label className="form-label">
              Work centre name
              <input
                className="form-input"
                required
                value={workCentreName}
                onChange={(event) => setWorkCentreName(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={!companyId || options.plants.length === 0 || creating}
              type="submit"
            >
              Create work centre
            </button>
          </form>
        ) : null}
      </div>
      <CommandFeedback message={message} />
    </section>
  )
}
