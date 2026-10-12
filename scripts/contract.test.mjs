import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The engineering contract (AGENTS.md = CLAUDE.md) and the ADR rules it sets. Keep in sync with the
// contract's "ADRs" rule. ADRs numbered below FULL_SHAPE_FROM keep whatever shape they had before Project Sync.
const FULL_SHAPE_FROM = 1
const POINTERS = ['GEMINI.md']

const root = new URL('../', import.meta.url)
const read = (file) => readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n')
const adrDir = new URL('adr/', root)
const adrs = existsSync(adrDir) ? readdirSync(adrDir).filter((f) => /^\d{4}-.*\.md$/.test(f)) : []

describe('the engineering contract', () => {
  it('keeps the product deterministic without AI provider dependencies', () => {
    expect(read('AGENTS.md')).toContain('**Non-AI product.**')
    const manifest = JSON.parse(read('package.json'))
    const packages = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    expect(packages.filter((name) => /^(openai|@anthropic-ai\/|@google\/genai|@ai-sdk\/|langchain)/.test(name))).toEqual([])
    expect(read('docs/roadmap.md')).not.toMatch(/\| L\d+ AI/)
  })
  it('is the same in AGENTS.md and CLAUDE.md', () => {
    expect(read('CLAUDE.md'), 'Make the same change in AGENTS.md and CLAUDE.md.').toBe(read('AGENTS.md'))
  })

  it('is what every other agent is pointed to', () => {
    for (const p of POINTERS) expect(existsSync(new URL(p, root)) && read(p).includes('AGENTS.md'), `${p} must point to AGENTS.md`).toBe(true)
  })
})

describe('ADRs', () => {
  it('are named NNNN-short-kebab-name.md with unique numbers and matching titles', () => {
    for (const f of readdirSync(adrDir).filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md')) expect(f, f).toMatch(/^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/)
    const numbers = adrs.map((f) => Number(f.slice(0, 4)))
    expect(new Set(numbers).size, 'two ADRs share a number').toBe(numbers.length)
    for (const f of adrs) expect(read(`adr/${f}`).split('\n')[0], f).toMatch(new RegExp(`^# ADR ${f.slice(0, 4)} — \\S`))
  })

  it('take the next free number and have the full shape', () => {
    const recent = adrs.filter((f) => Number(f.slice(0, 4)) >= FULL_SHAPE_FROM).sort()
    recent.forEach((f, i) => {
      expect(Number(f.slice(0, 4)), 'use the next free number').toBe(FULL_SHAPE_FROM + i)
      const text = read(`adr/${f}`)
      expect(text, `${f}: "Decided by …, YYYY-MM-DD."`).toMatch(/Decided by .+, \d{4}-\d{2}-\d{2}\./)
      for (const s of ['## Context', '## Decision', '## Consequences']) expect(text, `${f}: ${s}`).toMatch(new RegExp(`^${s}\\b`, 'm'))
    })
  })
})
