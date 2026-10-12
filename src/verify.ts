/** 临时校验页：在真实浏览器里跑一遍 .docx 解析 → 排版 → 渲染。 */
import { parseDocx } from './core/docx.ts'
import { defaultStyle, pageToSvg } from './core/svg.ts'
import { typeset } from './core/typeset.ts'

const out = document.getElementById('out')!
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const res = await fetch('/sample.docx')
if (!res.ok) throw new Error(`fetch sample.docx: ${res.status}`)
const doc = await parseDocx(await res.arrayBuffer())
const result = typeset(doc.paragraphs)

const summary = [
  `段落数: ${doc.paragraphs.length}`,
  `media: ${JSON.stringify(doc.media)}`,
  `warnings: ${doc.warnings.length ? doc.warnings.join(' | ') : '（无）'}`,
  `统计: ${JSON.stringify(result.stats)}`,
  '--- 解析出的段落 ---',
  ...doc.paragraphs.map(
    (p, i) =>
      `${i}: align=${p.align} indent=${p.indent} text=${JSON.stringify(p.text).slice(0, 60)}`,
  ),
].join('\n')

out.innerHTML =
  `<pre id="dump">${esc(summary)}</pre>` +
  `<div class="pages">${result.pages
    .map((p) => pageToSvg(p, { style: defaultStyle, totalPages: result.pages.length }))
    .join('')}</div>`

document.title = `docx 校验 · ${result.stats.pages} 页 / ${result.stats.chars} 格字`
