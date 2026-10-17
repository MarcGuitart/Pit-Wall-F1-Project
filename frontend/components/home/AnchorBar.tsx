import h from './home.module.css'

const LINKS = [
  ['#questions', 'Questions'],
  ['#analysis', 'Sample analysis'],
  ['#live', 'Live mode'],
  ['#plans', 'Plans'],
  ['#method', 'Method'],
  ['#faq', 'FAQ'],
] as const

/** The landing's section links, as a sub-bar under the site's top bar (not a second nav bar with its own mark). */
export function AnchorBar() {
  return (
    <nav className={h.anchors} aria-label="On this page">
      {LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
    </nav>
  )
}
