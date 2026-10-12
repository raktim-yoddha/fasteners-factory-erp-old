// Restore proof uses only the local SAMPLE stack and an owned temporary database.
// Archive bytes stay in memory; no credentials or customer records enter logs.
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'
import { databaseRegressions } from './database-regressions.mjs'
import { fingerprintSql } from './operations-db.mjs'
import { collectBackup, storageDownloader } from './create-backup.mjs'
import { openBackup, sealBackup } from './backup-format.mjs'

const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1]
if (!project) throw new Error('Local Supabase project ID is unavailable.')
const container=`supabase_db_${project}`,target=`sample_restore_${randomUUID().replaceAll('-','')}`
if (!/^sample_restore_[a-f0-9]{32}$/.test(target)) throw new Error('Unsafe restore target.')
const storageContainer=`supabase_storage_${project}`,storageTarget=`/tmp/${target}`
let created=false,storageCreated=false
function executeIn(selectedContainer,args,input,encoding='utf8') {
  const result=spawnSync('docker',['exec','-i',selectedContainer,...args],{ input,encoding,maxBuffer: 128*1024*1024 })
  if (result.error || result.status!==0) {
    // pg_restore's following lines can include row values: retain only the error header.
    const detail=String(result.stderr??'').split(/\r?\n/).find((line) => /^(pg_restore|pg_dump|createdb|dropdb): error:/.test(line))
    throw new Error(`${args[0]} failed (${result.status??'spawn error'})${detail ? `: ${detail}` : '.'}`)
  }
  return result.stdout
}
function execute(args,input,encoding) { return executeIn(container,args,input,encoding) }
function storage(args,input,encoding) { return executeIn(storageContainer,args,input,encoding) }
function storageSnapshot(directory) {
  // Positional arguments keep file paths out of shell source. Names and bytes stay out of logs.
  const hashes=storage(['sh','-c','cd "$1" && find . -type f -exec sha256sum {} +','restore-fingerprints',directory]).trim()
  return hashes ? hashes.split('\n').sort().join('\n') : ''
}
function storageSource() {
  const result=spawnSync('docker',['inspect',storageContainer],{ encoding:'utf8' })
  if (result.status!==0) throw new Error('Local Storage container is unavailable.')
  const details=JSON.parse(result.stdout)[0]
  const directory=details.Config.Env.find((value) => value.startsWith('FILE_STORAGE_BACKEND_PATH='))?.slice('FILE_STORAGE_BACKEND_PATH='.length)
  const resolved=directory ? storage(['realpath',directory]).trim() : null
  if (!resolved || !details.Mounts.some((mount) => mount.Destination!=='/' && (resolved===mount.Destination || resolved.startsWith(`${mount.Destination}/`)))) throw new Error('Local file storage is not inside a mounted Storage directory.')
  return resolved
}
function cleanStorageRestore() {
  if (!/^\/tmp\/sample_restore_[a-f0-9]{32}$/.test(storageTarget) || storage(['realpath',storageTarget]).trim()!==storageTarget) throw new Error('Unsafe storage cleanup target.')
  storage(['rm','-r','--',storageTarget])
}
function sql(database,query) { return execute(['psql','-U','postgres','-d',database,'--no-psqlrc','-At','-v','ON_ERROR_STOP=1'],query) }
const fingerprint=fingerprintSql
function snapshot(database) { return sql(database,fingerprint).trim().split(/\r?\n/).at(-1) }
const started=performance.now()
try {
  const safe=sql('postgres',`select exists(select 1 from public.companies) and not exists(select 1 from public.companies where name not like 'SAMPLE%') and not exists(select 1 from auth.users where email is null or email not like '%@invalid.test');`).trim()
  if (safe!=='t') throw new Error('Restore proof refuses an empty or non-SAMPLE local environment.')
  const before=snapshot('postgres')
  const sourceDirectory=storageSource(),filesBefore=storageSnapshot(sourceDirectory)
  const status=parseEnv(readFileSync('.env.supabase.local','utf8'))
  if (status.API_URL!=='http://127.0.0.1:54321' || !status.SERVICE_ROLE_KEY) throw new Error('Restore proof requires the local Storage endpoint and runner credential.')
  const portable=await collectBackup({ sql: (query) => sql('postgres',query), dump: () => execute(['pg_dump','-U','postgres','-d','postgres','--format=custom'],undefined,null), download: storageDownloader(status.API_URL,status.SERVICE_ROLE_KEY) })
  const key=randomBytes(32).toString('base64'), recovered=openBackup(sealBackup(portable.entries,key),key)
  const archive=recovered.get('database.dump')
  if (!archive) throw new Error('Encrypted backup is missing its database dump.')
  console.log(`Encrypted portable backup: ${portable.objects} private Storage objects authenticated and hash-verified.`)
  const storageArchive=storage(['tar','-cf','-','-C',sourceDirectory,'.'],undefined,null)
  execute(['createdb','-U','postgres','--template=template0',target]);created=true
  // Supabase-managed functions require the local bootstrap role; keep original owners and ACLs.
  execute(['pg_restore','-U','supabase_admin','-d',target,'--exit-on-error'],archive)
  storage(['mkdir',storageTarget]);storageCreated=true
  storage(['tar','-xf','-','-C',storageTarget],storageArchive)
  const filesRestored=storageSnapshot(storageTarget),filesAfter=storageSnapshot(sourceDirectory)
  const restored=snapshot(target),after=snapshot('postgres')
  if (before!==after || filesBefore!==filesAfter) throw new Error('Local records or files changed during backup. Run restore proof with the SAMPLE stack idle.')
  if (restored!==before) throw new Error('Restored rows, exact values, RLS flags or policy counts differ from the source.')
  if (filesRestored!==filesBefore) throw new Error('Restored private file paths or SHA-256 bytes differ from the source.')
  for (const file of databaseRegressions) {
    sql(target,readFileSync(file,'utf8'))
    console.log(`Restored database: ${file}: PASS (rolled back)`)
  }
  console.log(`Restore proof PASS (${((performance.now()-started)/1000).toFixed(1)}s; ${JSON.parse(before).length} tables and ${filesBefore ? filesBefore.split('\n').length : 0} storage files checked).`)
} catch (error) {
  console.error(`Restore proof FAIL: ${error.message}`);process.exitCode=1
} finally {
  if (created) {
    // The target was validated above and created exclusively by this process.
    try { execute(['dropdb','-U','postgres',target]) }
    catch (error) { console.error(`Temporary restore cleanup failed: ${error.message}`);process.exitCode=1 }
  }
  if (storageCreated) {
    try {
      cleanStorageRestore()
    } catch (error) { console.error(`Temporary storage cleanup failed: ${error.message}`);process.exitCode=1 }
  }
}
