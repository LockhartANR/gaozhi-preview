/**
 * PNG 导出：把页面 SVG 交给浏览器光栅化（HTMLImageElement → canvas）。
 * 好处是不用引入 html2canvas 之类的重依赖，而且和屏幕上的 SVG 完全同源。
 */
import JSZip from 'jszip'
import { MM2PX, PAGE_H_MM, PAGE_W_MM } from '../core/layout.ts'

const SVG_W = PAGE_W_MM * MM2PX
const SVG_H = PAGE_H_MM * MM2PX

export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  )
  try {
    const img = new Image()
    img.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG 光栅化失败'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(SVG_W * scale)
    canvas.height = Math.round(SVG_H * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持 canvas')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) throw new Error('PNG 编码失败')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function downloadPagesAsZip(
  svgs: string[],
  baseName: string,
  scale: number,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip()
  const pad = String(svgs.length).length
  for (let i = 0; i < svgs.length; i++) {
    const blob = await svgToPngBlob(svgs[i], scale)
    zip.file(`${baseName}-${String(i + 1).padStart(pad, '0')}.png`, blob)
    onProgress?.(i + 1, svgs.length)
  }
  const out = await zip.generateAsync({ type: 'blob' })
  downloadBlob(out, `${baseName}-${svgs.length}页PNG.zip`)
}
