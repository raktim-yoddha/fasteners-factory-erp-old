// Release (AGENTS.md › Releases):
//   node scripts/release.mjs next               the next SemVer version from the commits since the last release, and why
//   node scripts/release.mjs <version> --check  validate it and the CHANGELOG.md "## Unreleased — Title" entry
//   node scripts/release.mjs <version>          stamp that entry, bump every version file, commit, tag vX.Y.Z, push
// The tag starts .github/workflows/release.yml, which builds and publishes the GitHub release.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { suggestRelease, validateRelease } from './semver.mjs'

/**
 * Every file that carries the version. package.json is the source of truth; add the others your project has
 * (a mobile app.json, Cargo.toml, pyproject.toml…) with how to rewrite them. Files that don't exist are skipped.
 */
const VERSION_FILES = [
  { path: 'package.json', write: (text, v) => text.replace(/("version":\s*)"[^"]*"/, `$1"${v}"`) }
  // { path: 'mobile/app.json', write: (text, v) => text.replace(/("version":\s*)"[^"]*"/, `$1"${v}"`) },
]
const BRANCH = 'main'

const [requested, flag] = process.argv.slice(2)
const checkOnly = flag === '--check'
const run = (cmd, args, opts = {}) => (execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }) ?? '').trim()
const fail = (message) => {
  console.error(`✗ Not released: ${message}`)
  process.exit(1)
}

if (!requested) fail('usage: release next | release <version> [--check]')
const current = JSON.parse(readFileSync('package.json', 'utf8')).version

if (requested === 'next') {
  const last = `v${current}`
  const range = run('git', ['tag', '--list', last]) ? `${last}..HEAD` : 'HEAD'
  const SEP = '\u001e'
  const commits = run('git', ['log', `--format=%h %s%n%b${SEP}`, range])
    .split(SEP)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [first, ...body] = c.split(/\r?\n/)
      return { sha: first.slice(0, first.indexOf(' ')), subject: first.slice(first.indexOf(' ') + 1), body: body.join('\n') }
    })
  const s = suggestRelease(current, commits)
  if (s.kind === 'none') {
    console.log(`Nothing to release since ${last}: ${s.reason}`)
    process.exit(0)
  }
  console.log(`Next: ${s.version} (${s.kind}) after ${current} — ${s.reason}.`)
  console.log(`Commits since ${last}:`)
  for (const c of s.commits.slice().reverse()) console.log(`  ${c.sha} ${c.subject}`)
  process.exit(0)
}

const localTags = run('git', ['tag', '--list', 'v*']).split(/\r?\n/).filter(Boolean)
let remoteTags = []
try {
  remoteTags = run('git', ['ls-remote', '--tags', 'origin'])
    .split(/\r?\n/)
    .map((l) => l.split('refs/tags/')[1]?.replace(/\^\{\}$/, ''))
    .filter(Boolean)
} catch {
  // Offline: local tags still guard against duplicates.
}
const verdict = validateRelease(requested, current, [...new Set([...localTags, ...remoteTags])])
if (!verdict.valid) fail(verdict.reason)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = /^## Unreleased — (.+)\r?\n((?:- .+\r?\n?)+)/m.exec(changelog)
if (!unreleased) fail('CHANGELOG.md needs an "## Unreleased — Title" entry with "- " highlight lines for this release.')
console.log(`✓ ${verdict.version} is a valid ${verdict.kind} release after ${current}: "${unreleased[1]}".`)
if (checkOnly) process.exit(0)

if (run('git', ['branch', '--show-current']) !== BRANCH) fail(`releases are cut from ${BRANCH}.`)
// The release notes just written into CHANGELOG.md go into the release commit; anything else must not.
const dirty = run('git', ['status', '--porcelain']).split(/\r?\n/).filter((l) => l && !/ CHANGELOG\.md$/.test(l))
if (dirty.length) fail(`the working tree has other uncommitted changes (${dirty.length}). Commit or stash them first.`)

const version = verdict.version
const today = new Date().toISOString().slice(0, 10)
writeFileSync('CHANGELOG.md', changelog.replace(/^## Unreleased — (.+)$/m, `## v${version} — $1\n_${today}_\n`))
const touched = ['CHANGELOG.md']
for (const file of VERSION_FILES) {
  if (!existsSync(file.path)) continue
  writeFileSync(file.path, file.write(readFileSync(file.path, 'utf8'), version))
  touched.push(file.path)
}
run('git', ['add', ...touched])
run('git', ['commit', '-m', `chore(release): v${version}`])
run('git', ['tag', '-a', `v${version}`, '-m', `v${version} — ${unreleased[1]}`])
run('git', ['push', 'origin', BRANCH, `refs/tags/v${version}`], { stdio: 'inherit' })
console.log(`✓ Tagged v${version}; the release workflow builds and publishes it.`)
