/**
 * 稿纸排版引擎：段落 → 字符单元 → 断行（含避头尾）→ 分页（20×20 = 400 格）。
 * 全部是纯函数，不依赖 DOM，可以直接在 Node 里跑测试。
 */
import {
  charWidth,
  graphemes,
  isPunct,
  isWordChar,
  isWordJoiner,
  isWordSuffix,
  noLineEnd,
  noLineStart,
  normalizeEllipsis,
} from './east-asian.ts'
import {
  defaultOptions,
  emptyCell,
  type Cell,
  type DocParagraph,
  type Page,
  type TypesetOptions,
  type TypesetResult,
  type Unit,
} from './types.ts'

function mkUnit(ch: string, paraIndex: number, w = charWidth(ch)): Unit {
  return {
    ch,
    w,
    paraIndex,
    noStart: noLineStart(ch),
    noEnd: noLineEnd(ch),
    forceBreak: false,
    blankLine: false,
    squeezed: [],
    group: 0,
  }
}

function mkBreak(paraIndex: number): Unit {
  return {
    ch: '',
    w: 0,
    paraIndex,
    noStart: false,
    noEnd: false,
    forceBreak: true,
    blankLine: false,
    squeezed: [],
    group: 0,
  }
}

function mkBlank(paraIndex: number): Unit {
  return { ...mkBreak(paraIndex), forceBreak: false, blankLine: true }
}

/** 把 "..." / "--" 之类合并成原子单元 …… / ——（各占 2 格，不可拆行）。 */
function mkAtomic(text: string, paraIndex: number): Unit {
  return {
    ch: text,
    w: text.length,
    paraIndex,
    // 省略号和破折号同样不能出现在行首（这里曾经漏掉，导致 …… 会顶到行首）
    noStart: noLineStart(text),
    noEnd: noLineEnd(text),
    forceBreak: false,
    blankLine: false,
    squeezed: [],
    group: 0,
  }
}

/**
 * 给数字 / 西文单词打上分组号，同一个组不允许被拆到两行。
 * `2024年` 不能断成 `20` / `24年`，`manuscript` 不能断成 `manus` / `cript`。
 */
function assignWordGroups(units: Unit[]): void {
  let gid = 0
  let i = 0
  while (i < units.length) {
    if (!isWordChar(units[i].ch)) {
      i++
      continue
    }
    gid++
    units[i].group = gid
    let j = i + 1
    while (j < units.length) {
      const c = units[j].ch
      if (isWordChar(c)) {
        units[j].group = gid
        j++
        continue
      }
      // 连接符 + 后续词字符（3.14 / www.a.com / A-1）算同一组
      if (
        isWordJoiner(c) &&
        j + 1 < units.length &&
        isWordChar(units[j + 1].ch)
      ) {
        units[j].group = gid
        j++
        continue
      }
      // 紧跟数字的单位符号（50% / 20℃）
      if (isWordSuffix(c)) {
        units[j].group = gid
        j++
        continue
      }
      break
    }
    i = j
  }
}

/** 确保当前位置是"行的开头"：末尾已有断行就不重复插。 */
function ensureBreak(units: Unit[], paraIndex: number): void {
  if (units.length === 0) return
  const last = units[units.length - 1]
  if (last.forceBreak || last.blankLine) return
  units.push(mkBreak(paraIndex))
}

/**
 * 稿纸规则：两个标点符号连用时合占一格（：“ 。” ？” ，” ……" 等）。
 * 省略号、破折号本身各占两格，不能作为被合占的那一个；
 * 但引号可以挤进省略号的第二个格子里（……"）。
 * 合占之后这两个标点变成一个整体，断行时不会被打散。
 * @returns 合占掉的对数
 */
function mergePunctPairs(units: Unit[]): number {
  let merged = 0
  for (let i = 0; i < units.length - 1; i++) {
    const a = units[i]
    const b = units[i + 1]
    if (b.w > 1) continue // 省略号/破折号占两格，挤不进半格
    if (a.w > 1 && a.ch !== '……') continue // 只有省略号允许带一个尾巴
    if (a.squeezed.length > 0) continue // 一格最多两个字形
    if (!isPunct(a.ch) || !isPunct(b.ch)) continue
    a.squeezed.push(b.ch)
    // 合占后整体继承两个标点的禁则属性
    a.noStart = a.noStart || b.noStart
    a.noEnd = a.noEnd || b.noEnd
    units.splice(i + 1, 1)
    merged++
  }
  return merged
}

/**
 * 段落数组 → 线性字符单元流（含缩进空格、强制断行、空行）。
 * 返回单元流和"标点合占"的对数。
 */
export function toUnits(
  paragraphs: DocParagraph[],
  options: TypesetOptions,
): { units: Unit[]; merged: number } {
  const { cols } = options
  const units: Unit[] = []
  let mergedTotal = 0
  let pendingBreak = false

  paragraphs.forEach((p, pi) => {
    // 居中/右对齐的段落（标题）必须独占一行，否则会和正文挤在同一行
    const isBlock = options.centerAlignment && p.align !== 'left'
    if ((pendingBreak && options.paragraphPerLine) || isBlock) {
      ensureBreak(units, pi)
    }
    pendingBreak = true

    const raw = options.normalizePunctuation
      ? normalizeEllipsis(p.text)
      : p.text
    const normalized = raw.replace(/\t/g, '\u3000').replace(/\r/g, '')

    // 拆成"行"（软回车 \n 强制断行）
    const segments = normalized.split('\n')

    segments.forEach((segment, si) => {
      if (si > 0) units.push(mkBreak(pi))

      // 只清掉首尾的半角空格，全角空格是有意为之的缩进，保留
      const trimmed = segment.replace(/^[ ]+/, '').replace(/[ ]+$/, '')
      if (trimmed.length === 0) {
        if (options.keepBlankLines) units.push(mkBlank(pi))
        return
      }

      const chars = graphemes(trimmed)

      // 正文：先攒成本段的单元，标点合占要在段内做（不能跨段/跨缩进）
      const segUnits: Unit[] = []
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]
        const next = chars[i + 1]
        const atomic =
          (ch === '…' && next === '…') || (ch === '—' && next === '—')
        if (atomic) {
          segUnits.push(mkAtomic(ch + next, pi))
          i++
        } else {
          segUnits.push(mkUnit(ch, pi))
        }
      }
      if (options.mergePunctuation) mergedTotal += mergePunctPairs(segUnits)
      assignWordGroups(segUnits)

      // 首行缩进 / 居中 / 右对齐 → 左侧补空格子。
      // 必须按"段内这一段要占几格"算，不能按宽度和算：
      // 右对齐时 cols - 2.5 = 17.5，按 18 格补就溢出成 21 格，末字被顶到下一行。
      const contentCells = packOf(segUnits).cells
      let pad = 0
      if (options.centerAlignment && p.align === 'center' && contentCells < cols) {
        pad = Math.floor((cols - contentCells) / 2)
      } else if (p.align === 'right' && contentCells < cols) {
        pad = cols - contentCells
      } else if (options.indentEnabled) {
        pad = si === 0 ? p.indent : 0
      }
      for (let k = 0; k < pad; k++) units.push(mkUnit('\u3000', pi))

      units.push(...segUnits)
    })

    // 标题单独占一行，后面的正文从新的一行开始
    if (isBlock) units.push(mkBreak(pi))
  })

  return { units, merged: mergedTotal }
}

/**
 * 一组单元按格装箱后的状态。
 *
 * 这是"放不放得下"的唯一判据 —— 必须按**格子数**算，不能按宽度和。
 * 半角字符后面跟全角字符时，那个半角字符独占半格、另外半格是浪费的：
 *   第 A 章  →  宽度 2.5，却要占 3 格
 * 早先按宽度和判断，于是会排出 21 格的"一行"，最后一个字被 paginate 悄悄丢掉
 * 或者被挤到下一行（右对齐补空格时最容易触发）。
 */
export function packOf(units: Unit[]): {
  /** 占用的格子数。 */
  cells: number
  /** 当前这一格已经填了多少宽度（0 表示还没开格，0.5 表示半格）。 */
  half: number
  /** 宽度和，仅用于展示。 */
  used: number
} {
  let cells = 0
  let half = 0
  let used = 0

  for (const u of units) {
    const glyphChars = u.w > 1 ? graphemes(u.ch) : [u.ch]
    for (const g of glyphChars) {
      const gw = charWidth(g)
      if (half === 0) {
        cells++
        half = gw
      } else if (half + gw <= 1.0001) {
        half += gw // 两个半角合占一格
      } else {
        cells++
        half = gw
      }
    }
    // squeezed 挤在当前格里，不额外占格、不额外算宽度
    used += u.w
  }

  return { cells, half, used }
}

/** 一行单元 → 格子数组，长度补齐到 cols。 */
export function unitsToCells(line: Unit[], cols: number): Cell[] {
  const cells: Cell[] = []
  let cur: Cell | null = null
  let curW = 0

  const open = (paraIndex: number) => {
    cur = { glyphs: [], paraIndex, w: 0 }
    cells.push(cur)
    curW = 0
  }

  for (const u of line) {
    const glyphChars = u.w > 1 ? graphemes(u.ch) : [u.ch]
    for (const g of glyphChars) {
      const gw = charWidth(g)
      if (!cur || curW + gw > 1.0001) open(u.paraIndex)
      cur!.glyphs.push({ ch: g, half: gw === 0.5, squeezed: false })
      curW += gw
      cur!.w = curW
    }
    for (const s of u.squeezed) {
      if (!cur) open(u.paraIndex)
      cur!.glyphs.push({ ch: s, half: false, squeezed: true })
      cur!.w = 1
    }
  }

  while (cells.length < cols) cells.push(emptyCell())
  return cells
}

/**
 * 断行：贪心填满 cols 格，然后做中文避头尾修正。
 * - 行尾禁则：左括号/左引号不能挂在行尾 → 推到下一行（追い出し / 移字）
 * - 行首禁则：句号/逗号/右括号不能顶到行首 → 压缩进前一格（追い込み / 压缩）
 */
export function buildLines(
  units: Unit[],
  options: TypesetOptions = defaultOptions,
): { lines: Cell[][]; squeezedCount: number } {
  const { cols } = options
  const lines: Cell[][] = []
  let squeezedCount = 0

  let cur: Unit[] = []
  let i = 0
  let squeezeInLine = 0

  const flush = () => {
    lines.push(unitsToCells(cur, cols))
    cur = []
    squeezeInLine = 0
  }

  while (i < units.length) {
    const u = units[i]

    if (u.blankLine) {
      if (cur.length) flush()
      lines.push(unitsToCells([], cols))
      i++
      continue
    }

    if (u.forceBreak) {
      if (cur.length) flush()
      i++
      continue
    }

    // 按格子数判断放不放得下（不是宽度和：半角后面跟全角会浪费半格）。
    // cur 为空时必须收下，否则这个单元永远放不进去 → 死循环。
    if (cur.length === 0 || packOf([...cur, u]).cells <= cols) {
      cur.push(u)
      i++
      continue
    }

    // ——— 本行装不下 u 了，做断行前的禁则修正 ———
    // cur 恒等于 units[lineStart, tail)，所以弹出末尾单元等价于 tail--
    let tail = i

    // (0) 数字 / 西文词组不拆分：被切开的整组退到下一行
    //     （组太长、一行根本放不下时不做回退，否则会死循环）
    const lastGroup = cur.length > 0 ? cur[cur.length - 1].group : 0
    if (lastGroup !== 0 && tail < units.length && units[tail].group === lastGroup) {
      let g = cur.length - 1
      while (g >= 0 && cur[g].group === lastGroup) g--
      if (g >= 0) {
        while (cur.length > g + 1) {
          const moved = cur.pop()!
          tail--
          if (tail < 0 || units[tail] !== moved) break // 一致性兜底
        }
      }
    }

    // (1) 行尾禁则：把行末不能结尾的字符退回去
    while (cur.length > 1 && cur[cur.length - 1].noEnd) {
      const moved = cur.pop()!
      tail--
      if (tail < 0 || units[tail] !== moved) break // 一致性兜底
    }

    // (2) 行首禁则：下一个字符若不能顶行首，压缩进本行末尾的格子
    //     一格最多放两个字形，所以已经被"合占"占满的格子不再接收；
    //     占两格的 …… —— 也压不进半格，只能走下面的移字。
    if (options.squeeze) {
      while (
        squeezeInLine < options.maxSqueezePerLine &&
        cur.length > 0 &&
        tail < units.length &&
        !units[tail].forceBreak &&
        !units[tail].blankLine &&
        units[tail].noStart &&
        units[tail].w <= 1 &&
        cur[cur.length - 1].squeezed.length === 0
      ) {
        const target = cur[cur.length - 1]
        target.squeezed.push(units[tail].ch)
        squeezedCount++
        squeezeInLine++
        tail++
      }
    }

    // (3) 移字（追い出し）：圧缩不了的行首禁则标点（…… —— 之类），
    //     把行末一个字带到下一行，让它不再顶在行首。每行最多退一个字。
    if (
      options.squeeze &&
      cur.length > 1 &&
      tail < units.length &&
      units[tail].noStart &&
      !cur[cur.length - 1].noEnd
    ) {
      const moved = cur.pop()!
      tail--
      if (tail < 0 || units[tail] !== moved) {
        cur.push(moved)
      }
    }

    flush()
    i = tail
  }

  if (cur.length) flush()
  return { lines, squeezedCount }
}

/** 按每页 rows 行切页，每页补齐 rows*cols 个格子（行优先）。 */
export function paginate(
  lines: Cell[][],
  options: TypesetOptions = defaultOptions,
): Page[] {
  const { cols, rows } = options
  const pages: Page[] = []

  const pushPage = (chunk: Cell[][]) => {
    const cells: Cell[] = []
    for (let r = 0; r < rows; r++) {
      const line = chunk[r]
      for (let c = 0; c < cols; c++) {
        cells.push(line?.[c] ?? emptyCell())
      }
    }
    pages.push({ index: pages.length, cells })
  }

  if (lines.length === 0) {
    pushPage([])
    return pages
  }

  for (let r = 0; r < lines.length; r += rows) {
    pushPage(lines.slice(r, r + rows))
  }
  return pages
}

export function typeset(
  paragraphs: DocParagraph[],
  partial: Partial<TypesetOptions> = {},
): TypesetResult {
  const options: TypesetOptions = { ...defaultOptions, ...partial }
  const { units, merged } = toUnits(paragraphs, options)
  const { lines, squeezedCount } = buildLines(units, options)
  const pages = paginate(lines, options)

  let chars = 0
  for (const line of lines) {
    for (const cell of line) {
      for (const g of cell.glyphs) {
        if (g.ch === '' || g.ch === '\u3000' || g.ch === ' ') continue
        chars += g.half ? 0.5 : 1
      }
    }
  }

  return {
    pages,
    lines,
    stats: {
      chars,
      lines: lines.length,
      pages: pages.length,
      squeezed: squeezedCount,
      merged,
    },
  }
}

/** 纯文本 → 段落（每个换行算一段）。 */
export function textToParagraphs(
  text: string,
  indentChars = 2,
): DocParagraph[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => ({ text: line, indent: indentChars, align: 'left' }))
}
