/**
 * 排版引擎自检 + 终端网格预览。
 *   node --experimental-strip-types scripts/test-typeset.ts
 * 顺便导出 out/preview-page*.svg，方便肉眼 / 截图核对。
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultStyle, pageToSvg, type RenderStyle } from '../src/core/svg.ts'
import type { Cell, Page, TypesetOptions } from '../src/core/types.ts'
import { textToParagraphs, typeset } from '../src/core/typeset.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'out')

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

/** 关掉缩进等干扰项，测试只关心断行本身。 */
const RAW: Partial<TypesetOptions> = {
  indentEnabled: false,
  keepBlankLines: false,
  centerAlignment: false,
}

/** 一行的 20 个格子里各自有什么（压缩标点写成 ⟦x⟧ 便于断言）。 */
function cellsOf(line: Cell[]): string[] {
  return line.map((c) =>
    c.glyphs.map((g) => (g.squeezed ? `⟦${g.ch}⟧` : g.ch)).join(''),
  )
}

/** 所有行的可见文本，行首行尾的空格子去掉。 */
function textsOf(lines: Cell[][]): string[] {
  return lines.map((line) =>
    cellsOf(line)
      .join('')
      .replace(/^[\u3000 ]+|[\u3000 ]+$/g, ''),
  )
}

function asciiPage(page: Page, cols: number, rows: number): string {
  const out: string[] = []
  for (let j = 0; j < rows; j++) {
    let line = ''
    for (let i = 0; i < cols; i++) {
      const c = page.cells[j * cols + i]
      if (!c || c.glyphs.length === 0) {
        line += '· '.padEnd(4, ' ')
        continue
      }
      const main = c.glyphs.find((g) => !g.squeezed)
      const sq = c.glyphs.filter((g) => g.squeezed).map((g) => g.ch).join('')
      const text = (main ? main.ch : '') === '\u3000' ? '·' : (main?.ch ?? '')
      line += (text + (sq ? `+${sq}` : '')).padEnd(4, ' ')
    }
    out.push(`${String(j + 1).padStart(2, ' ')}|${line}|`)
  }
  return out.join('\n')
}

console.log('\n稿纸排版引擎自检\n' + '─'.repeat(52))

test('每行 20 格，超出自动换行', () => {
  const r = typeset(textToParagraphs('甲'.repeat(45)), RAW)
  assert.deepEqual(
    textsOf(r.lines).map((t) => t.length),
    [20, 20, 5],
  )
  assert.equal(r.stats.lines, 3)
  assert.equal(r.stats.pages, 1)
})

test('每页 20 行 = 400 格，第 401 个字翻页', () => {
  const r = typeset(textToParagraphs('甲'.repeat(401)), RAW)
  assert.equal(r.lines.length, 21)
  assert.equal(r.stats.pages, 2)
  assert.equal(r.pages[0].cells.length, 400)
  assert.equal(r.pages[1].cells.length, 400)
  assert.equal(r.pages[1].cells[0].glyphs[0].ch, '甲')
  assert.equal(r.pages[1].cells[1].glyphs.length, 0, '第 2 页第 2 格应为空')
})

test('行首禁则：句号被压缩进前一格，不顶行首', () => {
  const r = typeset(textToParagraphs('甲'.repeat(19) + '乙' + '。' + '丙丙'), RAW)
  const l1 = r.lines[0]
  assert.equal(cellsOf(l1).length, 20)
  assert.equal(cellsOf(l1)[19], '乙⟦。⟧')
  assert.equal(r.stats.squeezed, 1)
  assert.equal(textsOf(r.lines)[1], '丙丙')
})

test('行尾禁则：左括号正好落在行尾时退到下一行', () => {
  // 19 个甲 + （ 刚好填满第 1 行，最后一个格子是左括号 → 必须退回
  const r = typeset(textToParagraphs('甲'.repeat(19) + '（乙'), RAW)
  assert.deepEqual(textsOf(r.lines).slice(0, 2), ['甲'.repeat(19), '（乙'])
  // 反过来，左括号本来就在行首是允许的，不需要任何修正
  const r2 = typeset(textToParagraphs('甲'.repeat(20) + '（乙'), RAW)
  assert.deepEqual(textsOf(r2.lines).slice(0, 2), ['甲'.repeat(20), '（乙'])
})

test('连续半角字符合占一格（21 个字母 = 11 格）', () => {
  const r = typeset(textToParagraphs('A'.repeat(21)), RAW)
  const l = r.lines[0]
  assert.equal(l[9].glyphs.length, 2)
  assert.equal(l[10].glyphs.length, 1)
  assert.equal(l[11].glyphs.length, 0)
  assert.equal(r.stats.chars, 10.5)
})

test('省略号作为原子单元，不被拆行', () => {
  const r = typeset(textToParagraphs('甲'.repeat(19) + '……'), RAW)
  // 19 个字后放不下两格的省略号 → 移字：末字陪它一起到下一行
  assert.equal(textsOf(r.lines)[0], '甲'.repeat(18))
  assert.equal(textsOf(r.lines)[1], '甲……')
  assert.equal(r.lines[1][1].glyphs[0].ch, '…')
  assert.equal(r.lines[1][2].glyphs[0].ch, '…')
})

test('首行缩进 2 格生效', () => {
  const r = typeset(textToParagraphs('甲乙丙'), { ...RAW, indentEnabled: true })
  assert.deepEqual(cellsOf(r.lines[0]).slice(0, 3), ['\u3000', '\u3000', '甲'])
})

test('空段落按需保留为一整行', () => {
  const keep = typeset(textToParagraphs('甲\n\n乙'), { ...RAW, keepBlankLines: true })
  assert.equal(keep.stats.lines, 3)
  assert.equal(textsOf(keep.lines)[1], '')
  // 不保留空段落时，两段会按"连续填格"接在同一行
  const drop = typeset(textToParagraphs('甲\n\n乙'), RAW)
  assert.equal(drop.stats.lines, 1)
  assert.equal(textsOf(drop.lines)[0], '甲乙')
})

test('连续填格（默认）与每段另起一行', () => {
  const src = textToParagraphs('甲'.repeat(10) + '\n' + '乙'.repeat(10))
  assert.equal(typeset(src, RAW).stats.lines, 1, '默认应当接在同一行')
  assert.equal(typeset(src, { ...RAW, paragraphPerLine: true }).stats.lines, 2)
})

test('软回车（段内 \\n）强制断行，即使没填满一行', () => {
  // 纯文本按行拆段，所以这里手工构造一个"段内有软回车"的段落
  const r = typeset([{ text: '甲乙\n丙丁', indent: 0, align: 'left' }], RAW)
  assert.deepEqual(textsOf(r.lines).slice(0, 2), ['甲乙', '丙丁'])
  // 段内软回车后面继续写，仍然是从新行第 1 格开始
  const r2 = typeset([{ text: `甲${'乙'.repeat(30)}\n丙`, indent: 0, align: 'left' }], RAW)
  assert.equal(textsOf(r2.lines)[1], '乙'.repeat(11))
  assert.equal(textsOf(r2.lines)[2], '丙')
})

test('空文档也有一页 400 格，不崩', () => {
  const r = typeset([], RAW)
  assert.equal(r.stats.pages, 1)
  assert.equal(r.pages[0].cells.length, 400)
  assert.equal(
    r.pages[0].cells.every((c) => c.glyphs.length === 0),
    true,
  )
})

test('居中段落左右留白', () => {
  const r = typeset([{ text: '标题', indent: 2, align: 'center' }], {
    ...RAW,
    centerAlignment: true,
  })
  assert.deepEqual(cellsOf(r.lines[0]).slice(0, 8), Array(8).fill('\u3000'))
  assert.equal(cellsOf(r.lines[0])[9], '标')
})

test('标点连用合占一格：冒号+上引号', () => {
  const r = typeset(textToParagraphs('他说：“你好。”'), RAW)
  const cells = cellsOf(r.lines[0])
  // 他说：“你好。” → 他|说|：“|你|好|。” = 6 格
  assert.deepEqual(cells.slice(0, 6), ['他', '说', '：⟦“⟧', '你', '好', '。⟦”⟧'])
  assert.equal(cells[6], '')
  assert.equal(r.stats.merged, 2)
})

test('标点连用合占一格：问号/叹号 + 下引号', () => {
  const r = typeset(textToParagraphs('“走？”他问！“好！”'), RAW)
  const cells = cellsOf(r.lines[0])
  // 相邻标点一律合占，不分点号标号、不分前后
  assert.deepEqual(cells.slice(0, 8), [
    '“',
    '走',
    '？⟦”⟧',
    '他',
    '问',
    '！⟦“⟧',
    '好',
    '！⟦”⟧',
  ])
  assert.equal(r.stats.merged, 3)
})

test('省略号不能作为被合占的那一个，但引号可以挤进它的第二格', () => {
  const r = typeset(textToParagraphs('他说“……”然后走了。'), RAW)
  const cells = cellsOf(r.lines[0])
  // 他说“……”然后走了。 → 他|说|“|…|…⟦”⟧|然|后|走|了|。
  assert.equal(cells[4], '…⟦”⟧')
  assert.equal(r.stats.merged, 1)
})

test('关掉合占开关后，两个标点各占一格', () => {
  const r = typeset(textToParagraphs('他说：“你好。”'), {
    ...RAW,
    mergePunctuation: false,
  })
  assert.deepEqual(cellsOf(r.lines[0]).slice(0, 8), [
    '他',
    '说',
    '：',
    '“',
    '你',
    '好',
    '。',
    '”',
  ])
  assert.equal(r.stats.merged, 0)
})

test('合占后的标点作为整体断行，不会被打散到两行', () => {
  // 前 19 格放 19 个字，合占的 "。”" 正好补满第 20 格
  const r = typeset(textToParagraphs('甲'.repeat(19) + '。”' + '乙'), RAW)
  const first = cellsOf(r.lines[0])
  assert.equal(first[19], '。⟦”⟧', '合占的一对必须留在同一格')
  assert.equal(textsOf(r.lines)[1], '乙')
})

test('数字/西文单词不从中间拆到两行', () => {
  // 19 个字之后跟 "2024"，第 20 格放不下整个数字 → 整个 2024 退到下一行
  const r = typeset(textToParagraphs('甲'.repeat(19) + '2024年'), RAW)
  const lines = textsOf(r.lines)
  assert.equal(lines[0], '甲'.repeat(19), '不能把 2024 拆成 20 / 24')
  assert.equal(lines[1], '2024年')
  // 英文单词同理
  const w = typeset(textToParagraphs('甲'.repeat(19) + 'manuscript'), RAW)
  assert.equal(textsOf(w.lines)[0], '甲'.repeat(19))
  assert.equal(textsOf(w.lines)[1], 'manuscript')
  // 放得下的时候正常跟着走，不产生空行
  const ok = typeset(textToParagraphs('甲'.repeat(10) + '2024年'), RAW)
  assert.equal(ok.stats.lines, 1)
})

test('省略号、破折号也不能顶到行首', () => {
  const r = typeset(textToParagraphs('甲'.repeat(19) + '……'), RAW)
  assert.equal(textsOf(r.lines)[0], '甲'.repeat(18))
  assert.equal(textsOf(r.lines)[1], '甲……')
  const d = typeset(textToParagraphs('甲'.repeat(19) + '——'), RAW)
  assert.equal(textsOf(d.lines)[1], '甲——')
  // 18 个字时省略号正好占满最后两格，不该被推走
  const fit = typeset(textToParagraphs('甲'.repeat(18) + '……'), RAW)
  assert.equal(fit.stats.lines, 1)
  assert.equal(textsOf(fit.lines)[0], '甲'.repeat(18) + '……')
})

test('半角括号也守行首/行尾禁则', () => {
  // 19 个字 + 半角 ( = 19.5 格，最后一个单位是 '(' → 行尾禁则把它退回下一行
  const r = typeset(textToParagraphs('甲'.repeat(19) + '(乙)'), RAW)
  const lines = textsOf(r.lines)
  assert.equal(lines[0], '甲'.repeat(19))
  assert.equal(lines[1], '(乙)')
})

test('间隔号不拆人名：不能落在行首，与前一字同格', () => {
  const r = typeset(textToParagraphs('甲'.repeat(20) + '·乙'), RAW)
  // '·' 是行首禁则 → 压缩进前一格，人名不会从中间断开
  assert.equal(cellsOf(r.lines[0])[19], '甲⟦·⟧')
  assert.equal(textsOf(r.lines)[1], '乙')
  // 落在行尾时先被行尾禁则退回，再被行首禁则压回前一格 —— 两个方向都堵死
  const t = typeset(textToParagraphs('甲'.repeat(19) + '·乙'), RAW)
  assert.equal(cellsOf(t.lines[0])[18], '甲⟦·⟧')
  assert.equal(textsOf(t.lines)[1], '乙')
})

/** 取出一页 SVG 里所有 <text> 的落点，用来验证标点到底画在哪儿。 */
function svgMarks(svg: string) {
  return [
    ...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/g),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), ch: m[3] }))
}

function renderMarks(text: string, punctStyle: RenderStyle['punctStyle']) {
  const r = typeset(textToParagraphs(text), RAW)
  const svg = pageToSvg(r.pages[0], {
    style: {
      ...defaultStyle,
      showGrid: false,
      showHeader: false,
      showFooter: false,
      punctStyle,
    },
    totalPages: 1,
  })
  return svgMarks(svg)
}

const CELL_PX = 8.5 * (96 / 25.4) // 一个格子约 32.1px

test('合占格里的两个标点各占半格，不会叠在同一处', () => {
  const marks = renderMarks('甲乙丙丁。”', 'traditional')
  const dot = marks.find((m) => m.ch === '。')
  const quote = marks.find((m) => m.ch === '”')
  assert.ok(dot && quote, '应当找得到 。 和 ”')
  assert.ok(
    quote.x - dot.x > CELL_PX * 0.35,
    `两个标点应当各占半格，实际 x 只差了 ${(quote.x - dot.x).toFixed(1)}px（半格约 ${(CELL_PX / 2).toFixed(1)}px）`,
  )
  assert.ok(dot.y > quote.y, '点号应当比后引号更靠下')
})

test('字 + 被压缩的标点也各占半格，标点不压在字上', () => {
  const marks = renderMarks('甲乙丙丁，戊', 'traditional')
  const comma = marks.find((m) => m.ch === '，')
  const last = marks.find((m) => m.ch === '丁')
  assert.ok(comma && last, '应当找得到 ， 和 丁')
  assert.ok(
    comma.x - last.x > 8,
    `标点应当落在右半格，实际只偏了 ${(comma.x - last.x).toFixed(1)}px`,
  )
  assert.ok(comma.y > last.y, '点号应当沉到格子下部')
})

test('标点位置切回居中时，两个字形仍然分列左右', () => {
  const marks = renderMarks('甲乙丙丁。”', 'center')
  const dot = marks.find((m) => m.ch === '。')
  const quote = marks.find((m) => m.ch === '”')
  assert.ok(dot && quote)
  assert.ok(quote.x - dot.x > 8)
  assert.equal(dot.y, quote.y, '居中模式下两者应在同一水平线')
})

test('右对齐：含单个半角数字时不会把末字顶到下一行', () => {
  // "第1章" 视觉宽度 2.5 格，但实际要占 3 格。
  // 早先按宽度算 pad = 20 - 2.5 = 17.5，循环按 18 次补空格 → 总宽 20.5 → 末字溢出
  const r = typeset([{ text: '第1章', indent: 0, align: 'right' }], RAW)
  assert.equal(r.stats.lines, 1, '应当只占一行')
  const cells = cellsOf(r.lines[0])
  assert.equal(cells[17], '第')
  assert.equal(cells[18], '1')
  assert.equal(cells[19], '章', '右对齐的末字必须落在最后一格')
})

test('右对齐：内容里浪费半格时同样不能溢出', () => {
  // "A第A" 宽度只有 2 格，却要占 3 格（A 后面那半格放不下全角字）
  // 按宽度补 18 格 → 21 格，末字会被挤走
  const r = typeset([{ text: 'A第A', indent: 0, align: 'right' }], RAW)
  assert.equal(r.stats.lines, 1)
  assert.deepEqual(cellsOf(r.lines[0]).slice(17), ['A', '第', 'A'])
})

test('一行的格子数绝不超过 cols（半角与全角混排会浪费半格）', () => {
  const samples = [
    '第A第A第A第A第A第A第A第A第A第A章',
    '甲1乙2丙3丁4戊5己6庚7辛8壬9癸0',
    'A甲B乙C丙D丁E戊F己G庚H辛I壬J癸',
    '2024年12月31日甲乙丙丁戊己庚辛壬癸',
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  ]
  for (const s of samples) {
    const r = typeset(textToParagraphs(s), RAW)
    r.lines.forEach((line, i) => {
      assert.equal(
        line.length,
        20,
        `第 ${i + 1} 行排出了 ${line.length} 格（超过 20）：${s}`,
      )
    })
    // 页面上的可见字符必须一个不少、一个不多
    const onPage = r.pages[0].cells
      .map((c) => c.glyphs.map((g) => g.ch).join(''))
      .join('')
      .replace(/[\u3000 ]/g, '')
    assert.equal(onPage, s, `页面内容与原文不一致（有字被丢掉或挤串）：${s}`)
  }
})

test('居中标题独占一行，不与正文挤在同一行', () => {
  const r = typeset(
    [
      { text: '秋天的黄昏', indent: 2, align: 'center' },
      { text: '我坐在窗前读一本旧书。', indent: 2, align: 'left' },
      { text: '第二段。', indent: 2, align: 'left' },
    ],
    { ...RAW, centerAlignment: true, indentEnabled: true },
  )
  const lines = textsOf(r.lines)
  assert.equal(lines[0], '秋天的黄昏', '标题必须独占第 1 行')
  // 段首空两格出现在行中间 —— 这正是稿纸的写法：段落不另起一行，靠缩进分段
  assert.equal(
    lines[1],
    '我坐在窗前读一本旧书。\u3000\u3000第二段。',
    '正文连续填格，段首缩进 2 格',
  )
  // 关掉居中处理时，标题就会按普通段落参与连续填格
  const merged = typeset(
    [
      { text: '秋天的黄昏', indent: 2, align: 'center' },
      { text: '我坐在窗前读一本旧书。', indent: 2, align: 'left' },
    ],
    { ...RAW, centerAlignment: false, indentEnabled: true },
  )
  assert.equal(merged.stats.lines, 1)
})

test('一页刚好 400 格时不产生空白第二页', () => {
  const r = typeset(textToParagraphs('甲'.repeat(400)), RAW)
  assert.equal(r.stats.lines, 20)
  assert.equal(r.stats.pages, 1)
})

console.log('─'.repeat(52))
console.log(`  ${passed} 项通过${process.exitCode ? '（有失败）' : ''}\n`)

// ---------- 终端网格预览 + 导出 SVG ----------
const demo =
  '秋天的黄昏，我坐在窗前读一本旧书。书页已经泛黄，边角卷起，像一片被风反复吹过的叶子。' +
  '窗外那棵老槐树，叶子落得差不多了，只剩下几根细枝在风里轻轻摇晃。' +
  '他问我：“小朋友，要不要来一串？”我摇摇头，因为口袋里只有五毛钱——那是准备买橡皮的。' +
  '老人笑了笑说“没关系，送你一串”……后来我搬了家，再也没有见过那位老人。' +
  '那棵槐树也早就被砍掉了，原地盖起了一栋 12 层的高楼。只有书还在，纸页一年比一年黄，字迹却依然清楚。'
const demoResult = typeset(textToParagraphs(demo))

console.log('第 1 页网格预览（· = 空格子；+× = 被压缩进本格的标点）\n')
console.log(asciiPage(demoResult.pages[0], 20, 20))
console.log(
  `\n统计：${demoResult.stats.chars} 格字 / ${demoResult.stats.lines} 行 / ` +
    `${demoResult.stats.pages} 页 / 标点合占 ${demoResult.stats.merged} 处 / ` +
    `避头尾压缩 ${demoResult.stats.squeezed} 处\n`,
)

mkdirSync(OUT, { recursive: true })
for (let i = 0; i < demoResult.pages.length; i++) {
  const svg = pageToSvg(demoResult.pages[i], {
    style: { ...defaultStyle, header: '秋天的黄昏' },
    totalPages: demoResult.pages.length,
  })
  writeFileSync(join(OUT, `preview-page${i + 1}.svg`), svg, 'utf8')
}
console.log(`已写出 ${demoResult.pages.length} 个 SVG 到 out/\n`)
