/**
 * 纸张与格子的几何常量。CSS 用 mm，SVG 导出按 96dpi 换算成 px，
 * 两边共用这里的数字，保证屏幕上看到的就是导出的。
 */
export const PAGE_W_MM = 210 // A4
export const PAGE_H_MM = 297
export const CELL_MM = 8.5
export const MM2PX = 96 / 25.4

export interface Layout {
  cols: number
  rows: number
  cell: number
  gridW: number
  gridH: number
  gridX: number
  gridY: number
  headerY: number
  footerY: number
}

export function computeLayout(cols: number, rows: number, cell = CELL_MM): Layout {
  const gridW = cols * cell
  const gridH = rows * cell
  const gridX = (PAGE_W_MM - gridW) / 2
  const gridY = (PAGE_H_MM - gridH) / 2
  return {
    cols,
    rows,
    cell,
    gridW,
    gridH,
    gridX,
    gridY,
    headerY: gridY - 16,
    footerY: gridY + gridH + 16,
  }
}
