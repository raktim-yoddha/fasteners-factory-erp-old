import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url'
import { LocalEngine } from './engine'
import type { LocalRequest, LocalResponse } from './protocol'
import type { Database, Row } from './database'
import { validateSnapshot } from './integrity'

// ADR 0019: one persistent OPFS writer. Initialization failure never deletes the database.
function start(workspace: string | null) { return new Promise<{ engine: LocalEngine; snapshot: () => Uint8Array; restore: (bytes: Uint8Array, workspaceId: string) => Promise<string> }>((resolve, reject) => {
  if (!globalThis.crossOriginIsolated || !navigator.storage?.getDirectory || !navigator.locks) {
    reject(new Error('LOCAL_STORAGE_UNAVAILABLE')); return
  }
  void navigator.locks.request('fasteners-solo-database-writer', { ifAvailable: true }, async (lock) => {
    if (!lock) { reject(new Error('LOCAL_WORKSPACE_OPEN_IN_ANOTHER_TAB')); return }
    try {
      // Published declarations omit the documented Emscripten configuration argument.
      const sqlite = await Reflect.apply(sqlite3InitModule, undefined, [{ locateFile: (name: string) => name.endsWith('.wasm') ? wasmUrl : name }]) as Awaited<ReturnType<typeof sqlite3InitModule>>
      if (!sqlite.oo1.OpfsDb) throw new Error('LOCAL_STORAGE_UNAVAILABLE')
      if (workspace && !/^[a-f0-9-]{36}$/.test(workspace)) throw new Error('INVALID_WORKSPACE_PATH')
      const connection = new sqlite.oo1.OpfsDb(workspace ? `/fasteners-solo-${workspace}.sqlite3` : '/fasteners-solo.sqlite3', 'c')
      const adapter = (connection: InstanceType<typeof sqlite.oo1.OpfsDb>): Database => ({
        exec: (sql, bind = []) => { connection.exec({ sql, bind }) },
        all: (sql, bind = []) => connection.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' }) as Row[],
        register: (name, handler) => { connection.createFunction(name, { xFunc: (_context, value) => handler(value), deterministic: true }) },
      })
      const db = adapter(connection)
      const engine = new LocalEngine(db)
      resolve({ engine, snapshot: () => sqlite.capi.sqlite3_js_db_export(connection), restore: async (bytes, workspaceId) => {
        if (bytes.length > 128 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(0, 16)) !== 'SQLite format 3\0') throw new Error('INVALID_SQLITE_SNAPSHOT')
        const id = crypto.randomUUID(), path = `/fasteners-solo-${id}.sqlite3`
        await sqlite.oo1.OpfsDb.importDb(path, bytes)
        const imported = new sqlite.oo1.OpfsDb(path, 'w')
        try {
          if (imported.selectValue('PRAGMA user_version') !== 1) throw new Error('LOCAL_DATABASE_VERSION_UNSUPPORTED')
          const restored = new LocalEngine(adapter(imported))
          await validateSnapshot(restored, workspaceId)
          return id
        } finally { imported.close() }
      } })
      await new Promise<void>(() => undefined) // The worker lifetime owns the lock.
    } catch (error) { reject(error) }
  }).catch(reject)
}) }
let ready: ReturnType<typeof start> | undefined
let queue = Promise.resolve()
globalThis.addEventListener('message', (event: MessageEvent<{ id: number; request: LocalRequest; workspace: string | null }>) => {
  ready ??= start(event.data.workspace)
  queue = queue.then(async () => {
    let result: LocalResponse
    try {
      const { engine, snapshot, restore } = await ready!
      if (event.data.request.operation === 'file_write') {
        const request = event.data.request
        const digest = await crypto.subtle.digest('SHA-256', request.bytes as Uint8Array<ArrayBuffer>)
        const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
        if (hash !== request.sha256) throw new Error('DOCUMENT_FILE_MISMATCH')
      }
      const request = event.data.request
      const data = request.operation === 'snapshot' ? snapshot() : request.operation === 'restore' ? await restore(request.bytes, request.workspaceId) : engine.execute(request)
      result = { data, error: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LOCAL_DATABASE_ERROR'
      result = { data: null, error: { code: message, message } }
    }
    globalThis.postMessage({ id: event.data.id, result })
  })
})
