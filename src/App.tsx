import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageSheet } from './components/PageSheet.tsx'
import { Sidebar } from './components/Sidebar.tsx'
import { parseDocx } from './core/docx.ts'
import { defaultStyle, pageToSvg, type RenderStyle } from './core/svg.ts'
import {
  defaultOptions,
  type SourceDoc,
  type TypesetOptions,
} from './core/types.ts'
import { textToParagraphs, typeset } from './core/typeset.ts'
import { downloadBlob, downloadPagesAsZip, svgToPngBlob } from './exporters/png.ts'
import { SAMPLE_TEXT } from './sample.ts'

type Status = { kind: 'idle' | 'busy' | 'error' | 'ok'; text: string }

const emptyMedia = { images: 0, tables: 0, equations: 0 }

export default function App() {
  const [source, setSource] = useState<SourceDoc>(() => ({
    paragraphs: textToParagraphs(SAMPLE_TEXT),
    warnings: [],
    media: { ...emptyMedia },
  }))
  const [sourceName, setSourceName] = useState('示例文稿')
  const [options, setOptions] = useState<TypesetOptions>(defaultOptions)
  const [style, setStyle] = useState<RenderStyle>({ ...defaultStyle, header: '' })
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' })
  const [pngJob, setPngJob] = useState<{ done: number; total: number } | null>(null)
  const [printMode, setPrintMode] = useState(false)

  const patchOptions = useCallback(
    (p: Partial<TypesetOptions>) => setOptions((o) => ({ ...o, ...p })),
    [],
  )
  const patchStyle = useCallback(
    (p: Partial<RenderStyle>) => setStyle((s) => ({ ...s, ...p })),
    [],
  )

  const result = useMemo(() => typeset(source.paragraphs, options), [source, options])

  const renderStyle: RenderStyle = useMemo(
    () => ({ ...style, cols: options.cols, rows: options.rows }),
    [style, options.cols, options.rows],
  )

  const svgs = useMemo(
    () =>
      result.pages.map((p) =>
        pageToSvg(p, { style: renderStyle, totalPages: result.pages.length }),
      ),
    [result, renderStyle],
  )

  useEffect(() => {
    document.title = `${sourceName} · 方格纸预览`
  }, [sourceName])

  const baseName = sourceName.replace(/\.docx$/i, '') || '文稿'

  const loadFile = useCallback(async (file: File) => {
    setStatus({ kind: 'busy', text: `正在解析 ${file.name} …` })
    try {
      const doc = await parseDocx(file)
      const words = doc.paragraphs.reduce((n, p) => n + p.text.length, 0)
      if (words === 0) {
        setStatus({ kind: 'error', text: '这个文档里没读到文字（可能整篇都是图片）。' })
        return
      }
      setSource(doc)
      setSourceName(file.name)
      setStatus({
        kind: 'ok',
        text: `已解析 ${doc.paragraphs.length} 段 / ${words} 字。`,
      })
    } catch (err) {
      setStatus({
        kind: 'error',
        text: err instanceof Error ? err.message : '解析失败',
      })
    }
  }, [])

  const loadText = useCallback((text: string) => {
    setSource({
      paragraphs: textToParagraphs(text, 2),
      warnings: [],
      media: { ...emptyMedia },
    })
    setSourceName('粘贴的文本')
    setStatus({ kind: 'ok', text: '已按粘贴内容重排。' })
  }, [])

  const loadSample = useCallback(() => {
    setSource({
      paragraphs: textToParagraphs(SAMPLE_TEXT),
      warnings: [],
      media: { ...emptyMedia },
    })
    setSourceName('示例文稿')
    setStatus({ kind: 'idle', text: '' })
  }, [])

  const handlePrint = useCallback(async () => {
    setPrintMode(true)
    setStatus({ kind: 'busy', text: '正在准备打印视图（全部页面渲染中）…' })
    await new Promise((r) => setTimeout(r, 600))
    setStatus({ kind: 'idle', text: '' })
    window.print()
    setPrintMode(false)
  }, [])

  const handleCurrentPng = useCallback(async () => {
    if (svgs.length === 0) return
    setStatus({ kind: 'busy', text: '正在导出第 1 页 PNG …' })
    try {
      const blob = await svgToPngBlob(svgs[0], 3)
      downloadBlob(blob, `${baseName}-第01页.png`)
      setStatus({ kind: 'ok', text: '第 1 页 PNG 已开始下载。' })
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : '导出失败' })
    }
  }, [svgs, baseName])

  const handleAllPng = useCallback(async () => {
    if (svgs.length === 0) return
    setPngJob({ done: 0, total: svgs.length })
    try {
      await downloadPagesAsZip(svgs, baseName, 3, (done, total) =>
        setPngJob({ done, total }),
      )
      setStatus({ kind: 'ok', text: `已打包 ${svgs.length} 页 PNG。` })
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : '导出失败' })
    } finally {
      setPngJob(null)
    }
  }, [svgs, baseName])

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand__mark">稿</span>
          <div>
            <h1>方格纸预览</h1>
            <p>
              {options.cols} × {options.rows} = {options.cols * options.rows} 格 / 页 ·
              中文避头尾排版
            </p>
          </div>
        </div>
        <div className="tools">
          <div className="zoom">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}>
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(2.4, z + 0.1))}>
              ＋
            </button>
            <button type="button" className="ghost" onClick={() => setZoom(1)}>
              适应
            </button>
          </div>
          <button type="button" onClick={handleCurrentPng} disabled={!!pngJob}>
            导出本页 PNG
          </button>
          <button type="button" onClick={handleAllPng} disabled={!!pngJob}>
            {pngJob ? `导出中 ${pngJob.done}/${pngJob.total}` : '导出全部 PNG'}
          </button>
          <button type="button" className="primary" onClick={handlePrint}>
            打印 / 存 PDF
          </button>
        </div>
      </header>

      <div className="body">
        <Sidebar
          options={options}
          patchOptions={patchOptions}
          style={style}
          patchStyle={patchStyle}
          stats={result.stats}
          warnings={source.warnings}
          sourceName={sourceName}
          status={status}
          onFile={(f) => void loadFile(f)}
          onText={loadText}
          onSample={loadSample}
        />

        <main className="view">
          <div className="view__hint">
            每页 {result.stats.pages > 0 ? 400 : 0} 格 · 共 {result.stats.pages} 页 ·
            共 {result.stats.chars} 格字
          </div>
          <div className="pages" style={{ zoom }}>
            {svgs.map((svg, i) => (
              <PageSheet key={i} svg={svg} index={i} eager={printMode} />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
