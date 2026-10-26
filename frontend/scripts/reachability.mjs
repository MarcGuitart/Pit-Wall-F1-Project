#!/usr/bin/env node
/**
 * Import graph from every route entry (app/**\/{page,layout,template,not-found,error}.tsx
 * and route.ts) to every file it reaches. Static `import … from` and dynamic
 * `import('…')` both count. Only '@/…' and relative specifiers are followed:
 * packages are leaves.
 *
 *   node scripts/reachability.mjs            # human summary
 *   node scripts/reachability.mjs --json     # { routes: {route: [files]}, unreachable: [...] }
 *
 * Phase 0 of the UI migration (PARITY.md) uses it to list every component a
 * route can render — each one is a feature to preserve.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXT = ['.tsx', '.ts', '.jsx', '.js', '.mjs']
const SRC_DIRS = ['app', 'components', 'hooks', 'lib', 'stores', 'types']

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

function resolveSpec(from, spec) {
  let base
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec)
  else return null
  const cands = [base, ...EXT.map(e => base + e), ...EXT.map(e => join(base, 'index' + e))]
  for (const c of cands) if (existsSync(c) && statSync(c).isFile()) return c
  return null
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function importsOf(file) {
  if (!/\.(tsx?|jsx?|mjs)$/.test(file)) return []
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')            // block comments
    .replace(/^\s*\/\/.*$/gm, '')                 // line comments
  const out = []
  for (const m of src.matchAll(IMPORT_RE)) {
    // `import type` edges carry no runtime component; keep them, they matter for field coverage
    const r = resolveSpec(file, m[1] ?? m[2])
    if (r) out.push(r)
  }
  return out
}

function closure(entry) {
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const d of importsOf(f)) stack.push(d)
  }
  return seen
}

const entries = walk(join(ROOT, 'app')).filter(f =>
  /\/(page|layout|template|not-found|error|loading)\.tsx$/.test(f) || /\/route\.ts$/.test(f))
const routes = {}
const all = new Set()
for (const e of entries.sort()) {
  const rel = relative(ROOT, e)
  const files = [...closure(e)].map(f => relative(ROOT, f)).filter(f => !/\.test\.tsx?$/.test(f)).sort()
  routes[rel] = files
  files.forEach(f => all.add(f))
}
const source = SRC_DIRS.flatMap(d => walk(join(ROOT, d)))
  .map(f => relative(ROOT, f))
  .filter(f => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
const unreachable = source.filter(f => !all.has(f) && !/\.css$/.test(f)).sort()

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ routes, unreachable }, null, 2))
} else {
  for (const [r, files] of Object.entries(routes)) {
    console.log(`\n## ${r}  (${files.length} files)`)
    for (const f of files) console.log('  ' + f)
  }
  console.log(`\n## Unreachable from any route (${unreachable.length})`)
  for (const f of unreachable) console.log('  ' + f)
}
