#!/usr/bin/env node
/**
 * Field coverage for /analysis: every leaf of FullRaceAnalysis (types/index.ts)
 * and the components reachable from a route that read it.
 *
 *   node scripts/parity/fields.mjs [--route app/race/[sessionKey]/page.tsx] [--json]
 *
 * Lexical, and says so: a file "reads" a field when it names the field AND
 * names one of its ancestors (a parent field or the parent's type), which
 * keeps `lap_number` from matching every file that has a lap. A field read
 * only in lib/ (e.g. to build chat suggestions) is reported as used but not
 * painted. Good enough to find the fields nobody draws; not a type checker.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ts = createRequire(join(ROOT, 'package.json'))('typescript')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const ROUTE = arg('--route', 'app/race/[sessionKey]/page.tsx')

const program = ts.createProgram([join(ROOT, 'types/index.ts')], { strict: true })
const checker = program.getTypeChecker()
const sf = program.getSourceFile(join(ROOT, 'types/index.ts'))
let root
ts.forEachChild(sf, (n) => { if (ts.isTypeAliasDeclaration(n) && n.name.text === 'FullRaceAnalysis') root = checker.getTypeAtLocation(n) })

const leaves = []
function walk(type, path, ancestors, depth) {
  const t = checker.getNonNullableType(type)
  const elem = checker.isArrayType(t) ? checker.getTypeArguments(t)[0] : null
  const target = elem ? checker.getNonNullableType(elem) : t
  const props = target.isUnion?.() ? [] : checker.getPropertiesOfType(target)
  const typeName = target.aliasSymbol?.name ?? target.symbol?.name
  const objectLike = props.length && !(target.flags & ts.TypeFlags.StringLike) && typeName !== 'Record' && !(target.flags & ts.TypeFlags.Primitive)
  if (!objectLike || depth > 5 || /^(String|Number|Boolean|Array)$/.test(typeName ?? '')) {
    leaves.push({ path, ancestors })
    return
  }
  for (const p of props) {
    const pt = checker.getTypeOfSymbolAtLocation(p, sf)
    const name = p.getName()
    walk(pt, `${path}${elem ? '[]' : ''}${path ? '.' : ''}${name}`, [...ancestors, ...(typeName && typeName !== '__type' ? [typeName] : [])], depth + 1)
  }
}
walk(root, '', [], 0)

const reach = JSON.parse(execFileSync('node', [join(ROOT, 'scripts/reachability.mjs'), '--json'], { cwd: ROOT }).toString())
const files = (reach.routes[ROUTE] ?? []).filter((f) => !f.startsWith('types/'))
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]))

const rows = leaves.map(({ path, ancestors }) => {
  const parts = path.replace(/\[\]/g, '').split('.')
  const leaf = parts.at(-1)
  const anc = [...new Set([...parts.slice(0, -1), ...ancestors])].filter((a) => a !== 'FullRaceAnalysis')
  const re = new RegExp(`\\b${leaf}\\b`)
  const readers = files.filter((f) => re.test(src[f]) && (anc.length === 0 || anc.some((a) => new RegExp(`\\b${a}\\b`).test(src[f]))))
  const painted = readers.filter((f) => f.startsWith('components/') || f.startsWith('app/'))
  return { path, painted, otherReaders: readers.filter((f) => !painted.includes(f)) }
})

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 1))
} else {
  const none = rows.filter((r) => !r.painted.length)
  console.log(`${rows.length} leaf fields under FullRaceAnalysis, reachable from ${ROUTE}`)
  console.log(`${rows.length - none.length} painted by at least one component, ${none.length} by none\n`)
  for (const r of rows) console.log(`${r.painted.length ? '  ' : '✗ '}${r.path.padEnd(58)} ${r.painted.map((f) => f.split('/').pop().replace(/\.tsx?$/, '')).join(', ')}${!r.painted.length && r.otherReaders.length ? `(read in ${r.otherReaders.join(', ')})` : ''}`)
}
