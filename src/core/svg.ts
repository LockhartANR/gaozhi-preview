/**
 * 把一页排版结果画成 SVG。屏幕预览、打印 PDF、导出 PNG 全都复用这一个函数，
 * 所以"看到的"和"导出的"必然一致。
 */
import { isPunct, punctAnchor } from './east-asian.ts'
import { computeLayout, MM2PX, PAGE_H_MM, PAGE_W_MM } from './layout.ts'
import type { Page } from './types.ts'

export type GridStyle = 'square' | 'tian' | 'mi'

export interface RenderStyle {
  cols: number
  rows: number
  grid: GridStyle
  gridColor: string
  gridOpacity: number
  textColor: string
  paper: string
  showGrid: boolean
  showHeader: boolean
  showFooter: boolean
  /** 页眉文字（一般是文题）。 */
  header: string
  headerAlign: 'left' | 'center' | 'right'
  fontFamily: string
  /** 整页字号缩放系数，1 = 默认。 */
  fontScale: number
  /**
   * 标点在格子里的位置。
   * center = 一律居中；
   * traditional = 稿纸规范：点号写格子左下角，问号叹号在左半格中间，
   *               前引号/前括号靠右，后引号/后括号靠左。
   */
  punctStyle: 'center' | 'traditional'
  /** 是否给段落起始格做淡色标记（校对用）。 */
  showParagraphMark: boolean
}

export const defaultStyle: RenderStyle = {
  cols: 20,
  rows: 20,
  grid: 'square',
  gridColor: '#2f8f6b',
  gridOpacity: 0.55,
  textColor: '#14181c',
  paper: '#ffffff',
  showGrid: true,
  showHeader: true,
  showFooter: true,
  header: '',
  headerAlign: 'center',
  fontFamily:
    '"Source Han Serif SC","Noto Serif CJK SC","Songti SC",SimSun,"Microsoft YaHei",serif',
  fontScale: 1,
  punctStyle: 'traditional',
  showParagraphMark: false,
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const n = (v: number) => Math.round(v * 100) / 100

interface TextOpts {
  x: number
  y: number
  size: number
  color: string
  family: string
  weight?: number
  anchor?: 'start' | 'middle' | 'end'
}

function text(ch: string, o: TextOpts): string {
  if (!ch) return ''
  return (
    `<text x="${n(o.x)}" y="${n(o.y)}" font-size="${n(o.size)}"` +
    ` font-family="${esc(o.family)}" fill="${o.color}"` +
    (o.weight ? ` font-weight="${o.weight}"` : '') +
    ` text-anchor="${o.anchor ?? 'middle'}"` +
    ` xml:space="preserve">${esc(ch)}</text>`
  )
}

/**
 * 画一个格子里的字形：一个全角字 / 两个半角 / 主字 + 压缩或合占进来的标点。
 *
 * 一个格子里有两个字形时（"：" + "“"、汉字 + 被压缩的"，"），
 * 这一格就当作**两个半格**用：每个字形只在自己那一半里安放，
 * 并且仍然按稿纸规范定位（点号在自己半格里的左下角、前引号靠右……）。
 * 早期版本在这里直接用整格锚点覆盖横坐标，导致 。 和 ” 被叠在同一处。
 */
function drawCell(
  page: Page,
  index: number,
  x: number,
  y: number,
  cell: number,
  style: RenderStyle,
): string {
  const c = page.cells[index]
  if (!c || c.glyphs.length === 0) return ''

  const base = cell * 0.78 * style.fontScale
  const cx = x + cell / 2
  const cy = y + cell / 2
  const traditional = style.punctStyle === 'traditional'

  /** 独占一整格时的落点。 */
  const soloPos = (ch: string, fallbackX: number, size: number) => {
    const a = traditional ? punctAnchor(ch) : null
    return {
      x: a ? x + cell * a.x : fallbackX,
      y: a ? y + cell * a.y + size * 0.36 : cy + size * 0.36,
    }
  }

  /** 半格（slot 0 = 左半，1 = 右半）里的落点，标点在半格内继续按规范摆。 */
  const halfPos = (ch: string, slot: number, size: number) => {
    if (!traditional) {
      return { x: x + cell * (slot === 0 ? 0.3 : 0.76), y: cy + size * 0.36 }
    }
    const a = punctAnchor(ch)
    const fx = a ? a.x : 0.5 // 汉字在半格里居中
    const fy = a ? a.y : 0.5
    return {
      x: x + cell * (slot * 0.5 + 0.5 * fx),
      y: y + cell * fy + size * 0.36,
    }
  }

  const color = style.textColor
  const family = style.fontFamily
  const normal = c.glyphs.filter((g) => !g.squeezed)
  const squeezed = c.glyphs.filter((g) => g.squeezed)
  let out = ''

  if (squeezed.length === 0 && normal.length === 2) {
    // 两个半角字符合占一格（如 "AI"、"12"）
    normal.forEach((g, i) => {
      out += text(g.ch, {
        x: x + cell * (0.25 + i * 0.5),
        y: cy + base * 0.9 * 0.36,
        size: base * 0.9,
        color,
        family,
      })
    })
    return out
  }

  if (squeezed.length === 0) {
    const g = normal[0]
    const size = g.half ? base * 0.92 : base
    const p = soloPos(g.ch, g.half ? x + cell * 0.25 : cx, size)
    out += text(g.ch, { x: p.x, y: p.y, size, color, family })
    return out
  }

  // ——— 一格两个字形：分成两个半格 ———
  // 两个都是标点（合占）时大小一致；汉字 + 标点（避头尾压缩）时汉字保大一点。
  const main = normal[0]
  const allPunct = squeezed.every((g) => isPunct(g.ch)) && (!main || isPunct(main.ch))
  const mainSize = base * (allPunct ? 0.72 : 0.76)
  const sqSize = base * (allPunct ? 0.72 : 0.64)

  if (main) {
    const p = halfPos(main.ch, 0, mainSize)
    out += text(main.ch, { x: p.x, y: p.y, size: mainSize, color, family })
  }
  // 一个格子里最多两个字形，所以 squeezed 正常只有一个；
  // 万一有多余的，往右错开一点，至少不会完全重叠。
  squeezed.forEach((g, i) => {
    const p = halfPos(g.ch, 1, sqSize)
    out += text(g.ch, {
      x: squeezed.length > 1 ? p.x + cell * 0.22 * i : p.x,
      y: p.y,
      size: sqSize,
      color,
      family,
    })
  })
  return out
}

function gridLines(l: ReturnType<typeof computeLayout>, style: RenderStyle): string {
  const { gridX, gridY, gridW, gridH, cell, cols, rows } = l
  const stroke =
    `stroke="${style.gridColor}" stroke-opacity="${style.gridOpacity}" stroke-width="1"`
  let out = ''
  for (let i = 0; i <= cols; i++) {
    const x = gridX + i * cell
    out += `<line x1="${n(x)}" y1="${n(gridY)}" x2="${n(x)}" y2="${n(gridY + gridH)}" ${stroke}/>`
  }
  for (let j = 0; j <= rows; j++) {
    const y = gridY + j * cell
    out += `<line x1="${n(gridX)}" y1="${n(y)}" x2="${n(gridX + gridW)}" y2="${n(y)}" ${stroke}/>`
  }

  const inner =
    `stroke="${style.gridColor}" stroke-opacity="${style.gridOpacity * 0.55}"` +
    ` stroke-width="0.7" stroke-dasharray="2 2.4"`

  if (style.grid === 'tian' || style.grid === 'mi') {
    // 田字格：每行/每列一条中心虚线，40 条搞定，不用画 400 个十字
    for (let j = 0; j < rows; j++) {
      const y = gridY + (j + 0.5) * cell
      out += `<line x1="${n(gridX)}" y1="${n(y)}" x2="${n(gridX + gridW)}" y2="${n(y)}" ${inner}/>`
    }
    for (let i = 0; i < cols; i++) {
      const x = gridX + (i + 0.5) * cell
      out += `<line x1="${n(x)}" y1="${n(gridY)}" x2="${n(x)}" y2="${n(gridY + gridH)}" ${inner}/>`
    }
  }
  if (style.grid === 'mi') {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = gridX + i * cell
        const y = gridY + j * cell
        out += `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + cell)}" y2="${n(y + cell)}" ${inner}/>`
        out += `<line x1="${n(x + cell)}" y1="${n(y)}" x2="${n(x)}" y2="${n(y + cell)}" ${inner}/>`
      }
    }
  }
  return out
}

export interface PageSvgOptions {
  style: RenderStyle
  totalPages: number
  /** 页眉文字覆盖，默认用 style.header。 */
  header?: string
  /** 页脚文字覆盖，默认 "第 N 页 共 M 页"。 */
  footer?: string
}

/** 生成一整页 SVG（含纸张底色），单位 px。 */
export function pageToSvg(page: Page, opts: PageSvgOptions): string {
  const style = opts.style
  const l = computeLayout(style.cols, style.rows)
  const W = PAGE_W_MM * MM2PX
  const H = PAGE_H_MM * MM2PX
  const cell = l.cell * MM2PX
  const gridX = l.gridX * MM2PX
  const gridY = l.gridY * MM2PX

  const parts: string[] = []
  parts.push(
    `<rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="${style.paper}"/>`,
  )

  if (style.showGrid) {
    parts.push(
      `<g>${gridLines(
        { ...l, gridX, gridY, gridW: l.gridW * MM2PX, gridH: l.gridH * MM2PX, cell },
        style,
      )}</g>`,
    )
    // 外框加粗
    parts.push(
      `<rect x="${n(gridX)}" y="${n(gridY)}" width="${n(l.gridW * MM2PX)}" height="${n(l.gridH * MM2PX)}"` +
        ` fill="none" stroke="${style.gridColor}" stroke-width="1.8" stroke-opacity="${Math.min(
          1,
          style.gridOpacity + 0.3,
        )}"/>`,
    )
  }

  for (let j = 0; j < style.rows; j++) {
    for (let i = 0; i < style.cols; i++) {
      const idx = j * style.cols + i
      const c = page.cells[idx]
      if (c && style.showParagraphMark && c.glyphs.length > 0 && c.paraIndex >= 0) {
        const prev = idx > 0 ? page.cells[idx - 1] : undefined
        const isParaStart =
          i === 0 || !prev || prev.glyphs.length === 0 || prev.paraIndex !== c.paraIndex
        if (isParaStart) {
          parts.push(
            `<rect x="${n(gridX + i * cell + 1.5)}" y="${n(gridY + j * cell + 1.5)}"` +
              ` width="${n(cell - 3)}" height="${n(cell - 3)}" fill="none" stroke="${style.gridColor}"` +
              ` stroke-opacity="0.65" stroke-width="1" rx="2"/>`,
          )
        }
      }
      parts.push(
        drawCell(page, idx, gridX + i * cell, gridY + j * cell, cell, style),
      )
    }
  }

  const fontPt = 4.2 * MM2PX * style.fontScale
  if (style.showHeader) {
    const hx =
      style.headerAlign === 'left'
        ? gridX
        : style.headerAlign === 'right'
          ? gridX + l.gridW * MM2PX
          : gridX + (l.gridW * MM2PX) / 2
    const anchor =
      style.headerAlign === 'left' ? 'start' : style.headerAlign === 'right' ? 'end' : 'middle'
    const header = opts.header ?? style.header
    if (header.trim()) {
      parts.push(
        text(header, {
          x: hx,
          y: l.headerY * MM2PX,
          size: fontPt * 1.15,
          color: style.textColor,
          family: style.fontFamily,
          anchor,
        }),
      )
    }
  }

  if (style.showFooter) {
    const footer = opts.footer ?? `第 ${page.index + 1} 页 · 共 ${opts.totalPages} 页`
    parts.push(
      text(`— ${footer} —`, {
        x: gridX + (l.gridW * MM2PX) / 2,
        y: l.footerY * MM2PX,
        size: fontPt,
        color: style.textColor,
        family: style.fontFamily,
        anchor: 'middle',
      }),
    )
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}"` +
    ` viewBox="0 0 ${n(W)} ${n(H)}" role="img">${parts.join('')}</svg>`
  )
}

/** 页面在屏幕/打印时使用的物理尺寸（mm）。 */
export function pageCssSize(): { width: string; height: string } {
  return { width: `${PAGE_W_MM}mm`, height: `${PAGE_H_MM}mm` }
}
