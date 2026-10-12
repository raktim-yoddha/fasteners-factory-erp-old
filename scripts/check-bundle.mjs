import { readFileSync,readdirSync } from 'node:fs'
import { join } from 'node:path'

const directory='dist/assets',files=readdirSync(directory).filter((file) => file.endsWith('.js')),graph=new Map()
for (const file of files) {
  const code=readFileSync(join(directory,file),'utf8'),dependencies=[]
  for (const match of code.matchAll(/(?:import|export)\s*(?:\{[^}]*\}|[\w*$,\s]+)\s*from\s*["']\.\/([^"']+\.js)["']/g)) dependencies.push(match[1])
  graph.set(file,dependencies)
}
const visited=new Set(),active=[]
function visit(file) {
  if (active.includes(file)) throw new Error(`Circular build chunks: ${[...active.slice(active.indexOf(file)),file].join(' -> ')}`)
  if (visited.has(file)) return
  active.push(file)
  for (const dependency of graph.get(file)??[]) { if (!graph.has(dependency)) throw new Error(`Missing build chunk: ${dependency}`);visit(dependency) }
  active.pop();visited.add(file)
}
for (const file of files) visit(file)
console.log(`Bundle validation PASS (${files.length} chunks, no circular static imports).`)
