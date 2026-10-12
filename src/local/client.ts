import type { LocalQuery, LocalRequest, LocalResponse } from './protocol'

let worker: Worker | undefined
let nextId = 0
const pending = new Map<number, { resolve: (response: LocalResponse) => void; timer: ReturnType<typeof setTimeout> }>()
export function localRequest(request: LocalRequest): Promise<LocalResponse> {
  if (!worker) {
    worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module', name: 'factory-solo-sqlite' })
    worker.addEventListener('message', (event: MessageEvent<{ id: number; result: LocalResponse }>) => {
      const entry = pending.get(event.data.id)
      if (!entry) return
      clearTimeout(entry.timer); pending.delete(event.data.id); entry.resolve(event.data.result)
    })
    worker.addEventListener('error', () => {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.resolve({ data: null, error: { message: 'LOCAL_WORKER_FAILED', code: 'LOCAL_WORKER_FAILED' } }) }
      pending.clear()
    })
  }
  const id = ++nextId
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ data: null, error: { code: 'LOCAL_COMMAND_TIMEOUT', message: 'LOCAL_COMMAND_TIMEOUT' } }) }, 30_000)
    pending.set(id, { resolve: (result) => { resolve(result); if (!result.error && ['cutover_prepare', 'cutover_finish'].includes(request.operation)) window.dispatchEvent(new Event('factory-local-authority-changed')) }, timer }); worker!.postMessage({ id, request, workspace: localStorage.getItem('factory-solo-file') })
  })
}
class LocalTableQuery implements PromiseLike<LocalResponse> {
  private query: LocalQuery
  constructor(table: string) { this.query = { table, fields: '*', filters: [], orders: [], head: false } }
  select(fields = '*', options?: { head?: boolean; count?: string }) { this.query.fields = fields; this.query.head = options?.head ?? false; return this }
  eq(column: string, value: string | number | boolean | null) { this.query.filters.push({ column, value, operator: 'eq' }); return this }
  gt(column: string, value: string | number) { this.query.filters.push({ column, value, operator: 'gt' }); return this }
  lt(column: string, value: string | number) { this.query.filters.push({ column, value, operator: 'lt' }); return this }
  order(column: string, options?: { ascending?: boolean }) { this.query.orders.push({ column, ascending: options?.ascending ?? true }); return this }
  limit(limit: number) { this.query.limit = limit; return this }
  single() { this.query.single = 'one'; return this }
  maybeSingle() { this.query.single = 'maybe'; return this }
  insert(values: Record<string, unknown>) { this.query.mutation = { kind: 'insert', values }; return this }
  update(values: Record<string, unknown>) { this.query.mutation = { kind: 'update', values }; return this }
  then<TResult1 = LocalResponse, TResult2 = never>(onfulfilled?: ((value: LocalResponse) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return localRequest({ operation: 'query', query: this.query }).then((result) => {
      if (result.error) return result
      return { ...result, ...(result.data as { data: unknown; count: number }) }
    }).then(onfulfilled, onrejected)
  }
}
/** Narrow PostgREST-shaped facade lets existing ingress adapters keep their Zod checks.
 * No auth session is synthesized and no SQL crosses the worker boundary. */
export const localRepository = {
  from: (table: string) => new LocalTableQuery(table),
  rpc: (name: string, args: Record<string, unknown>) => localRequest({ operation: 'command', name, args }),
}
