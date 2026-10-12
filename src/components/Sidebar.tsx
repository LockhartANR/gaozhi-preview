import { useRef, useState, type ReactNode } from 'react'
import type { RenderStyle } from '../core/svg.ts'
import type { TypesetOptions, TypesetResult } from '../core/types.ts'

const GRID_PRESETS: { name: string; color: string }[] = [
  { name: '草绿', color: '#2f8f6b' },
  { name: '朱红', color: '#c0574f' },
  { name: '靛蓝', color: '#4a7fb5' },
  { name: '烟灰', color: '#98a3ad' },
  { name: '墨黑', color: '#3a3f45' },
]

const PAPER_PRESETS: { name: string; color: string }[] = [
  { name: '纯白', color: '#ffffff' },
  { name: '米黄', color: '#fdf8ec' },
  { name: '淡青', color: '#f4faf7' },
]

interface Props {
  options: TypesetOptions
  patchOptions: (p: Partial<TypesetOptions>) => void
  style: RenderStyle
  patchStyle: (p: Partial<RenderStyle>) => void
  stats: TypesetResult['stats']
  warnings: string[]
  sourceName: string
  status: { kind: 'idle' | 'busy' | 'error' | 'ok'; text: string }
  onFile: (f: File) => void
  onText: (t: string) => void
  onSample: () => void
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="row">
      <span className="row__label">
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      <span className="row__ctl">{children}</span>
    </label>
  )
}

export function Sidebar({
  options,
  patchOptions,
  style,
  patchStyle,
  stats,
  warnings,
  sourceName,
  status,
  onFile,
  onText,
  onSample,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <aside className="side">
      <section className="card">
        <h2>1 · 文稿来源</h2>
        <div
          className="drop"
          onDragOver={(e) => {
            e.preventDefault()
            e.currentTarget.classList.add('drop--over')
          }}
          onDragLeave={(e) => e.currentTarget.classList.remove('drop--over')}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('drop--over')
            const f = e.dataTransfer.files?.[0]
            if (f) onFile(f)
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
          }}
        >
          <strong>把 .docx 拖到这里</strong>
          <span>或点击选择文件</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
        <div className="btnrow">
          <button type="button" onClick={onSample}>
            载入示例
          </button>
          <button type="button" onClick={() => setPasteOpen((v) => !v)}>
            {pasteOpen ? '收起粘贴框' : '粘贴纯文本'}
          </button>
        </div>
        {pasteOpen && (
          <div className="paste">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="在这里粘贴正文，每个换行算一段……"
              rows={7}
            />
            <button
              type="button"
              className="primary"
              disabled={!draft.trim()}
              onClick={() => {
                onText(draft)
                setPasteOpen(false)
              }}
            >
              按稿纸排版
            </button>
          </div>
        )}
        <p className="src">
          当前：<b>{sourceName}</b>
        </p>
        {status.kind !== 'idle' && (
          <p className={`status status--${status.kind}`}>{status.text}</p>
        )}
        {warnings.map((w) => (
          <p key={w} className="warn">
            ⚠ {w}
          </p>
        ))}
      </section>

      <section className="card">
        <h2>2 · 稿纸规则</h2>
        <Row label="每段另起一行" hint="关掉 = 连续填格（真实稿纸）">
          <input
            type="checkbox"
            checked={options.paragraphPerLine}
            onChange={(e) => patchOptions({ paragraphPerLine: e.target.checked })}
          />
        </Row>
        <Row label="首行缩进">
          <input
            type="checkbox"
            checked={options.indentEnabled}
            onChange={(e) => patchOptions({ indentEnabled: e.target.checked })}
          />
          <input
            type="number"
            min={0}
            max={8}
            value={options.indentChars}
            disabled={!options.indentEnabled}
            onChange={(e) =>
              patchOptions({ indentChars: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })
            }
          />
          <span className="unit">格</span>
        </Row>
        <Row
          label="标点连用合占一格"
          hint="：“ 。” ？” 合占一格；省略号、破折号不参与"
        >
          <input
            type="checkbox"
            checked={options.mergePunctuation}
            onChange={(e) => patchOptions({ mergePunctuation: e.target.checked })}
          />
        </Row>
        <Row label="标点压缩避头尾" hint="句号逗号不顶行首，压进前一格">
          <input
            type="checkbox"
            checked={options.squeeze}
            onChange={(e) => patchOptions({ squeeze: e.target.checked })}
          />
        </Row>
        <Row label="居中段落左右留白" hint="标题在稿纸里居中">
          <input
            type="checkbox"
            checked={options.centerAlignment}
            onChange={(e) => patchOptions({ centerAlignment: e.target.checked })}
          />
        </Row>
        <Row label="保留空段落">
          <input
            type="checkbox"
            checked={options.keepBlankLines}
            onChange={(e) => patchOptions({ keepBlankLines: e.target.checked })}
          />
        </Row>
        <Row label="规范化省略号/破折号" hint="... → ……，-- → ——">
          <input
            type="checkbox"
            checked={options.normalizePunctuation}
            onChange={(e) => patchOptions({ normalizePunctuation: e.target.checked })}
          />
        </Row>
      </section>

      <section className="card">
        <h2>3 · 纸张样式</h2>
        <Row label="格子">
          <select
            value={style.grid}
            onChange={(e) => patchStyle({ grid: e.target.value as RenderStyle['grid'] })}
          >
            <option value="square">方格</option>
            <option value="tian">田字格</option>
            <option value="mi">米字格</option>
          </select>
        </Row>
        <Row label="格线颜色">
          <div className="swatches">
            {GRID_PRESETS.map((p) => (
              <button
                key={p.color}
                type="button"
                title={p.name}
                className={style.gridColor === p.color ? 'sw sw--on' : 'sw'}
                style={{ background: p.color }}
                onClick={() => patchStyle({ gridColor: p.color })}
              />
            ))}
          </div>
        </Row>
        <Row label="纸张">
          <div className="swatches">
            {PAPER_PRESETS.map((p) => (
              <button
                key={p.color}
                type="button"
                title={p.name}
                className={style.paper === p.color ? 'sw sw--on' : 'sw'}
                style={{ background: p.color, borderColor: '#c9d2d9' }}
                onClick={() => patchStyle({ paper: p.color })}
              />
            ))}
          </div>
        </Row>
        <Row label="字号">
          <input
            type="range"
            min={0.8}
            max={1.2}
            step={0.02}
            value={style.fontScale}
            onChange={(e) => patchStyle({ fontScale: Number(e.target.value) })}
          />
          <span className="unit">{Math.round(style.fontScale * 100)}%</span>
        </Row>
        <Row
          label="标点位置"
          hint={
            style.punctStyle === 'traditional'
              ? '稿纸规范：点号靠左下角'
              : '全部居中'
          }
        >
          <select
            value={style.punctStyle}
            onChange={(e) =>
              patchStyle({ punctStyle: e.target.value as RenderStyle['punctStyle'] })
            }
          >
            <option value="traditional">稿纸规范</option>
            <option value="center">居中</option>
          </select>
        </Row>
        <Row label="显示格线">
          <input
            type="checkbox"
            checked={style.showGrid}
            onChange={(e) => patchStyle({ showGrid: e.target.checked })}
          />
        </Row>
        <Row label="显示页码">
          <input
            type="checkbox"
            checked={style.showFooter}
            onChange={(e) => patchStyle({ showFooter: e.target.checked })}
          />
        </Row>
        <Row label="标记段首格" hint="校对用">
          <input
            type="checkbox"
            checked={style.showParagraphMark}
            onChange={(e) => patchStyle({ showParagraphMark: e.target.checked })}
          />
        </Row>
        <Row label="页眉">
          <input
            type="text"
            value={style.header}
            placeholder="留空则不显示"
            onChange={(e) => patchStyle({ header: e.target.value })}
          />
        </Row>
      </section>

      <section className="card">
        <h2>4 · 统计</h2>
        <ul className="stats">
          <li>
            <b>{stats.chars}</b>
            <span>按格字数</span>
          </li>
          <li>
            <b>{stats.lines}</b>
            <span>行数</span>
          </li>
          <li>
            <b>{stats.pages}</b>
            <span>页数（400 格/页）</span>
          </li>
          <li>
            <b>{stats.merged}</b>
            <span>标点合占 · 省 {stats.merged} 格</span>
          </li>
          <li>
            <b>{stats.squeezed}</b>
            <span>避头尾压缩</span>
          </li>
        </ul>
      </section>
    </aside>
  )
}
