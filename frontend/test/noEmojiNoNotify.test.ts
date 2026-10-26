import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Block 32, task 5: no emoji anywhere in the text the UI writes (Unicode
 * Extended_Pictographic, or the emoji variation selector), and nothing that
 * notifies or promises to: the "Notify me" button, its watcher and the
 * browser notifications are gone; "Add to calendar" puts the session in the
 * visitor's calendar and that is all.
 */
const ROOT = join(__dirname, '..')
// The u flag through the constructor: tsconfig's target does not allow it in a literal.
const EMOJI = new RegExp('\\p{Extended_Pictographic}|\\uFE0F', 'u')
const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(p) }
  return out
}
const texts = (path: string): string[] => {
  const src = readFileSync(path, 'utf8')
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) out.push(n.text)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}
const files = ['app', 'components', 'lib', 'hooks'].flatMap((d) => walk(join(ROOT, d)))

describe('no emoji, no notifications', () => {
  it('no emoji in any string or JSX text', () => {
    const found = files.flatMap((f) => texts(f).filter((t) => EMOJI.test(t)).map((t) => `${relative(ROOT, f)}: ${t.trim().slice(0, 60)}`))
    expect(found).toEqual([])
  })

  it('the notify button, its watcher and the Notification API are gone', () => {
    expect(existsSync(join(ROOT, 'components/notify'))).toBe(false)
    expect(existsSync(join(ROOT, 'lib/notify.ts'))).toBe(false)
    const uses = files.filter((f) => /\bNotification\b|requestPermission|NotifyButton|NotifyWatcher/.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f))
    expect(uses).toEqual([])
  })

  it('nothing in the UI promises a notification or a reminder', () => {
    const found = files.flatMap((f) => texts(f).filter((t) => /notif|remind/i.test(t)).map((t) => `${relative(ROOT, f)}: ${t.trim().slice(0, 60)}`))
    expect(found).toEqual([])
  })
})
