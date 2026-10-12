/**
 * 东亚字宽判定 + 中文行首/行尾禁则表。
 * 这里是稿纸排版的"字典"，不含任何渲染逻辑，纯函数、可直接单测。
 */

/** 判断一个字符在稿纸里占 1 格（全角）还是 0.5 格（半角）。 */
export function isWide(ch: string): boolean {
  const cp = ch.codePointAt(0)
  if (cp === undefined) return false
  if (cp < 0x1100) return false // ASCII / Latin-1 一律半角
  if (cp >= 0x1100 && cp <= 0x115f) return true // 谚文字母
  if (cp >= 0x2010 && cp <= 0x203b) return true // 通用标点：— … “ ” ‘ ’ ‰ ′ ″ 等（中文语境全角）
  if (cp >= 0x2e80 && cp <= 0x303e) return true // CJK 部首、康熙部首、CJK 符号与标点（含全角空格 U+3000）
  if (cp >= 0x3041 && cp <= 0x33ff) return true // 假名、注音、CJK 兼容
  if (cp >= 0x3400 && cp <= 0x4dbf) return true // CJK 扩展 A
  if (cp >= 0x4e00 && cp <= 0x9fff) return true // CJK 基本区
  if (cp >= 0xa000 && cp <= 0xa4cf) return true // 彝文
  if (cp >= 0xac00 && cp <= 0xd7a3) return true // 谚文音节
  if (cp >= 0xf900 && cp <= 0xfaff) return true // CJK 兼容表意
  if (cp >= 0xfe10 && cp <= 0xfe19) return true // 竖排标点
  if (cp >= 0xfe30 && cp <= 0xfe6f) return true // CJK 兼容形式
  if (cp >= 0xff00 && cp <= 0xff60) return true // 全角 ASCII
  if (cp >= 0xffe0 && cp <= 0xffe6) return true // 全角符号
  if (cp >= 0x1f300 && cp <= 0x1faff) return true // emoji 视作一格
  if (cp >= 0x20000 && cp <= 0x3fffd) return true // CJK 扩展 B 及以后
  return false
}

/** 字符的格宽：1 或 0.5。 */
export function charWidth(ch: string): number {
  return isWide(ch) ? 1 : 0.5
}

/**
 * 行首禁则：这些字符不允许出现在一行的第一个格子里。
 * 出现时优先"压缩"进前一格（稿纸标准做法），无法压缩时"移字"。
 */
const NO_LINE_START = new Set<string>([
  ...'、。，．：；？！）〕］｝〉》」』】〗〙〛',
  ...'…—–～ー・·',
  ...'”’"\'',
  ...'%‰℃°′″※',
  ...')]}>',
  ...'ぁぃぅぇぉっゃゅょゎ゛゜ゝゞァィゥェォッャュョヮヵヶ',
])

/**
 * 行尾禁则：这些字符不允许出现在一行的最后一个格子里（必须推到下一行）。
 */
const NO_LINE_END = new Set<string>([
  ...'（〔［｛〈《「『【〖〘〚',
  ...'“‘"\'',
  ...'([{<',
  ...'¥$£€',
  ...'·', // 间隔号：人名不能从中间断开
])

/**
 * 判断是否可以出现在行首/行尾。
 * 支持 …… / —— 这类多字符单元——只要其中任一个字符命中禁则，整个单元就命中。
 */
export function noLineStart(ch: string): boolean {
  for (const c of ch) {
    if (NO_LINE_START.has(c)) return true
  }
  return false
}

export function noLineEnd(ch: string): boolean {
  for (const c of ch) {
    if (NO_LINE_END.has(c)) return true
  }
  return false
}

/**
 * 标点符号表（点号 + 标号），用于"两个标点连用可合占一格"这条稿纸规则。
 * 半角标点也收进来：中文里混用 ,.;:?! 时同样该合占。
 */
const PUNCT_CHARS = new Set<string>([
  ...'。，、；：？！', // 点号
  ...'“”‘’「」『』', // 引号
  ...'（）〔〕［］【】〖〗〈〉', // 括号
  ...'《》', // 书名号
  ...'·・…‥—–～〜', // 间隔号 / 连接号 / 省略号 / 破折号
  ...',.;:?!\'"()[]{}<>', // 半角
])

/** 是否标点符号（支持 …… / —— 这类多字符单元）。 */
export function isPunct(ch: string): boolean {
  if (ch.length === 0) return false
  for (const c of ch) {
    if (!PUNCT_CHARS.has(c)) return false
  }
  return true
}

/**
 * 数字 / 西文词组的字符分类。
 * 稿纸规范：阿拉伯数字每个占半个汉字宽，且**不能拆到两行**
 * （`2024` 不能写成上行的 `20` 加下行的 `24`，英文单词同理）。
 */
const WORD_CHAR = /[0-9A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]/
const WORD_JOINER = /[._+\-/@:&'’*]/
const WORD_SUFFIX = /[%‰℃°′″]/

/** 是否为可组成"词组"的字符（数字、拉丁字母等半角词字符）。 */
export function isWordChar(ch: string): boolean {
  return ch.length === 1 && WORD_CHAR.test(ch)
}

/** 词组内部的连接符（3.14、www.a.com、A-1 里的那个符号）。 */
export function isWordJoiner(ch: string): boolean {
  return ch.length === 1 && WORD_JOINER.test(ch)
}

/** 紧跟在数字后面的单位/符号（50%、20℃、30°）。 */
export function isWordSuffix(ch: string): boolean {
  return ch.length === 1 && WORD_SUFFIX.test(ch)
}

/** 标点在格子里的锚点（0~1 相对坐标）。稿纸规范：点号写在格子左下角。 */
export function punctAnchor(
  ch: string,
): { x: number; y: number } | null {
  if (ch.length !== 1) return null
  if ('。，、；：．,;:.'.includes(ch)) return { x: 0.3, y: 0.72 } // 点号：左下
  if ('？！?!'.includes(ch)) return { x: 0.3, y: 0.52 } // 问号叹号：左半格中间
  if ('（〔［｛〈《「『【〖“‘([{'.includes(ch)) return { x: 0.7, y: 0.5 } // 前一半靠右
  if ('）〕］｝〉》」』】〗”’)]}'.includes(ch)) return { x: 0.3, y: 0.5 } // 后一半靠左
  return null
}

/**
 * 按"用户感知的字符"切分字符串（正确处理代理对、组合字符、emoji ZWJ 序列）。
 * 没有 Intl.Segmenter 时退化为按码点切分。
 */
const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
    : null

export function graphemes(text: string): string[] {
  if (segmenter) {
    const out: string[] = []
    for (const s of segmenter.segment(text)) out.push(s.segment)
    return out
  }
  return Array.from(text)
}

/**
 * 省略号 / 破折号的规范化：
 * Word 里经常出现 "..." 或 "--" 或单个 "…"，稿纸习惯写作 "……" / "——"（各占 2 格）。
 */
export function normalizeEllipsis(text: string): string {
  return text
    .replace(/\.{3,}/g, '……')
    .replace(/。{3,}/g, '……')
    .replace(/(?<!—)—(?!—)/g, '——')
    .replace(/—{3,}/g, '——')
}
