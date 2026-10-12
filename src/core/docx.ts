/**
 * 浏览器端 .docx 解析：直接用 JSZip 解开 OOXML，自己读 word/document.xml。
 * 不走 mammoth 之类的转换层，是为了拿到软回车（w:br）、制表符、首行缩进（w:ind）
 * 和居中对齐（w:jc）——这些恰好是稿纸排版必须的输入。
 */
import JSZip from 'jszip'
import type { DocParagraph, SourceDoc } from './types.ts'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

const attr = (el: Element | null | undefined, name: string): string | null =>
  el ? el.getAttributeNS(W, name) : null

function directChild(el: Element, localName: string): Element | null {
  for (const child of Array.from(el.children)) {
    if (child.localName === localName) return child
  }
  return null
}

/** 从 styles.xml 读取默认字号（半磅），用于把 w:firstLine 的 twips 折算成格数。 */
function defaultFontPt(stylesXml: string | null): number {
  if (!stylesXml) return 10.5
  try {
    const doc = new DOMParser().parseFromString(stylesXml, 'text/xml')
    const sz = doc.getElementsByTagNameNS(W, 'sz')
    for (const el of Array.from(sz)) {
      const v = attr(el, 'val')
      if (v) {
        const pt = Number(v) / 2
        if (Number.isFinite(pt) && pt > 0) return pt
      }
    }
  } catch {
    /* 忽略：退回默认字号 */
  }
  return 10.5
}

interface ParaContext {
  fontPt: number
  media: SourceDoc['media']
  warnings: Set<string>
}

function parseParagraph(p: Element, ctx: ParaContext): DocParagraph {
  const pPr = directChild(p, 'pPr')
  const jc = attr(directChild(pPr ?? p, 'jc'), 'val')
  const align: DocParagraph['align'] =
    jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left'

  // 首行缩进：优先 firstLineChars（1/100 字符），否则用 firstLine（twips）折算
  let indent = 2
  const ind = directChild(pPr ?? p, 'ind')
  const firstLineChars = attr(ind, 'firstLineChars')
  const firstLine = attr(ind, 'firstLine')
  if (firstLineChars !== null) {
    indent = Math.max(0, Math.min(8, Math.round(Number(firstLineChars) / 100) || 0))
  } else if (firstLine !== null) {
    const twips = Number(firstLine)
    const perChar = ctx.fontPt * 20
    indent = Math.max(0, Math.min(8, Math.round(twips / perChar) || 0))
  }

  // 按文档顺序收集文本 / 软回车 / 制表符，并统计无法排版的对象
  let text = ''
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      switch (child.localName) {
        case 't':
          text += child.textContent ?? ''
          break
        case 'delText':
          break // 修订删除的内容不计入
        case 'br': {
          const type = attr(child, 'type')
          if (type === 'page') {
            ctx.warnings.add('文档含手动分页符，已忽略（稿纸按 400 格自动分页）')
          } else {
            text += '\n'
          }
          break
        }
        case 'tab':
          text += '\t'
          break
        case 'drawing':
        case 'pict':
        case 'object':
          ctx.media.images++
          break
        case 'oMath':
        case 'oMathPara':
          ctx.media.equations++
          break
        case 'rPr':
        case 'pPr':
        case 'sectPr':
          break // 属性节点，不递归
        default:
          walk(child)
      }
    }
  }
  walk(p)

  return { text, indent, align }
}

function collectParagraphs(
  node: Element,
  out: DocParagraph[],
  ctx: ParaContext,
): void {
  for (const child of Array.from(node.children)) {
    switch (child.localName) {
      case 'p':
        out.push(parseParagraph(child, ctx))
        break
      case 'tbl':
        ctx.media.tables++
        collectParagraphs(child, out, ctx)
        break
      case 'tr':
      case 'tc':
      case 'sdt':
      case 'sdtContent':
      case 'body':
        collectParagraphs(child, out, ctx)
        break
      default:
        break
    }
  }
}

export async function parseDocx(data: ArrayBuffer | Blob): Promise<SourceDoc> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data
  const zip = await JSZip.loadAsync(buf)

  const docEntry = zip.file('word/document.xml')
  if (!docEntry) {
    throw new Error('这不是一个有效的 .docx 文件（缺少 word/document.xml）。如果是 .doc 请先用 Word 另存为 .docx。')
  }

  const [documentXml, stylesXml] = await Promise.all([
    docEntry.async('string'),
    zip.file('word/styles.xml')?.async('string') ?? Promise.resolve(null),
  ])

  const xml = new DOMParser().parseFromString(documentXml, 'text/xml')
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error('word/document.xml 解析失败，文件可能已损坏。')
  }

  const ctx: ParaContext = {
    fontPt: defaultFontPt(stylesXml),
    media: { images: 0, tables: 0, equations: 0 },
    warnings: new Set<string>(),
  }

  const paragraphs: DocParagraph[] = []
  const body = xml.getElementsByTagNameNS(W, 'body')[0]
  if (body) collectParagraphs(body, paragraphs, ctx)

  if (ctx.media.tables > 0) {
    ctx.warnings.add(
      `文档含 ${ctx.media.tables} 个表格，已按单元格顺序提取文字并排进稿纸（不保留表格边框）。`,
    )
  }
  if (ctx.media.images > 0) {
    ctx.warnings.add(`文档含 ${ctx.media.images} 个图片/图形，稿纸中不显示（仅显示文字）。`)
  }
  if (ctx.media.equations > 0) {
    ctx.warnings.add(`文档含 ${ctx.media.equations} 个公式对象，稿纸中不显示。`)
  }

  return { paragraphs, warnings: [...ctx.warnings], media: ctx.media }
}
