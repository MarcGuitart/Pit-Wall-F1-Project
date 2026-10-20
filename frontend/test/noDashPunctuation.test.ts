import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Block 32, task 2: no "—", "–" or " - " used as punctuation in the text the
 * frontend writes (pages, components, metadata, errors). Comma, full stop,
 * colon or middle dot instead; ranges read "2023 to 2025"; an empty value in a
 * table is "n/a". Hyphens inside words and names, and the minus sign of a
 * negative number, stay.
 *
 * Reads every string literal, template piece and JSX text with the TypeScript
 * parser, so comments and arithmetic never count. The rendered pages are
 * checked by tools/checks/55-content.sh (qa/preflight), which also covers text
 * that comes from the published analysis.
 *
 * Exceptions, and why:
 *   lib/liveContext.ts         the prompt sent to the language model, never shown
 *   app/api/engineer-chat/     a dead route (block 39 deletes it)
 *   app/preview/               the redesign preview (its fate is block 39's)
 *   components/notify/         removed by block 32, task 5
 */
const ROOT = join(__dirname, '..')
const EXCEPT = [/^lib\/liveContext\.ts$/, /^app\/api\/engineer-chat\//, /^app\/preview\//, /^components\/notify\//]
const DASH = /[—–]|\S - [A-Za-z]/

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
  }
  return out
}

function dashedStrings(path: string): string[] {
  const src = readFileSync(path, 'utf8')
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits: string[] = []
  const visit = (n: ts.Node) => {
    const text = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)
      ? n.text : ts.isJsxText(n) ? n.text : null
    if (text && DASH.test(text)) hits.push(`${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${text.trim().slice(0, 80)}`)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return hits
}

describe('dash punctuation', () => {
  it('none in the text the frontend writes', () => {
    const found: string[] = []
    for (const dir of ['app', 'components', 'lib', 'hooks']) {
      for (const f of files(join(ROOT, dir))) {
        const rel = relative(ROOT, f)
        if (EXCEPT.some((rx) => rx.test(rel))) continue
        for (const h of dashedStrings(f)) found.push(`${rel}:${h}`)
      }
    }
    expect(found).toEqual([])
  })
})
