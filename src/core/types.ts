/** 稿纸排版的全部数据模型。渲染层只依赖这里的类型。 */

/** 从 docx / 纯文本解析出来的段落。 */
export interface DocParagraph {
  /** 原始文本；段内用 \n 表示软回车（Shift+Enter）。 */
  text: string
  /** 首行缩进格数（docx 里读 firstLineChars，纯文本按选项给默认值）。 */
  indent: number
  align: 'left' | 'center' | 'right'
}

/** 解析结果 + 无法排版的元素提示。 */
export interface SourceDoc {
  paragraphs: DocParagraph[]
  warnings: string[]
  /** 文档里出现过的非正文元素计数。 */
  media: { images: number; tables: number; equations: number }
}

/** 排版选项。 */
export interface TypesetOptions {
  /** 每行格数，默认 20。 */
  cols: number
  /** 每页行数，默认 20。 */
  rows: number
  /** 每段另起一行；false = 连续填格（真实稿纸写法）。 */
  paragraphPerLine: boolean
  /** 是否套用首行缩进。 */
  indentEnabled: boolean
  /** 首行缩进格数。 */
  indentChars: number
  /** 允许把行首禁则标点压缩进前一格。 */
  squeeze: boolean
  /** 每行最多压缩几个标点。 */
  maxSqueezePerLine: number
  /** 两个标点连用时合占一格（：“ 。” ？”，省略号破折号不参与）。 */
  mergePunctuation: boolean
  /** 居中段落（如标题）在稿纸中左右留白居中。 */
  centerAlignment: boolean
  /** 保留原文空段落（占一整行）。 */
  keepBlankLines: boolean
  /** 是否把 ... / -- 规范化为 …… / ——。 */
  normalizePunctuation: boolean
}

export const defaultOptions: TypesetOptions = {
  cols: 20,
  rows: 20,
  paragraphPerLine: false,
  indentEnabled: true,
  indentChars: 2,
  squeeze: true,
  maxSqueezePerLine: 2,
  mergePunctuation: true,
  centerAlignment: true,
  keepBlankLines: false,
  normalizePunctuation: true,
}

/** 排版引擎内部的"字符单元"。 */
export interface Unit {
  /** 显示内容（可以是多字符的原子单元，如 ……）。 */
  ch: string
  /** 占几格。 */
  w: number
  paraIndex: number
  /** 行首禁则。 */
  noStart: boolean
  /** 行尾禁则。 */
  noEnd: boolean
  /** 强制断行（软回车 / 段末）。 */
  forceBreak: boolean
  /** 占一整行空行。 */
  blankLine: boolean
  /** 被压缩进本格的标点。 */
  squeezed: string[]
  /** 词组编号（数字/西文单词），同组不许拆到两行；0 表示不属于任何词组。 */
  group: number
}

/** 格子里的一个字形。 */
export interface Glyph {
  ch: string
  /** 半角，占半格。 */
  half: boolean
  /** 被压缩进来的标点（用更小的字号显示）。 */
  squeezed: boolean
}

/** 一个稿纸格子。 */
export interface Cell {
  glyphs: Glyph[]
  /** 该格属于第几段，用于渲染时做段落高亮。 */
  paraIndex: number
  /** 实际占用的格宽，用于调试。 */
  w: number
}

export interface Page {
  index: number
  /** 长度恒为 rows * cols，按行优先排列。 */
  cells: Cell[]
}

export interface TypesetResult {
  pages: Page[]
  lines: Cell[][]
  stats: {
    /** 按格算的字数（不含空白格）。 */
    chars: number
    lines: number
    pages: number
    /** 因避头尾被压缩进前一格的标点数。 */
    squeezed: number
    /** 因"两个标点连用"而合占一格、省下来的格子数。 */
    merged: number
  }
}

export function emptyCell(): Cell {
  return { glyphs: [], paraIndex: -1, w: 0 }
}
