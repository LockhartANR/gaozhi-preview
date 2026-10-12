import { memo, useEffect, useRef, useState } from 'react'
import { pageCssSize } from '../core/svg.ts'

interface Props {
  svg: string
  index: number
  /** 打印/导出时强制渲染（懒加载会被绕过）。 */
  eager: boolean
}

/**
 * 一页稿纸。长文档里 400 个 <text> × 几十页会拖慢首屏，
 * 所以用 IntersectionObserver 只渲染视口附近的页；打印时 eager 全开。
 */
export const PageSheet = memo(function PageSheet({ svg, index, eager }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (eager) setShown(true)
  }, [eager])

  useEffect(() => {
    if (shown || eager) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '900px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown, eager])

  const size = pageCssSize()

  return (
    <div
      ref={ref}
      className="sheet"
      style={{ width: size.width, height: size.height }}
      data-page={index + 1}
    >
      {shown || eager ? (
        <div className="sheet__art" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="sheet__ph">第 {index + 1} 页</div>
      )}
      <span className="sheet__badge">第 {index + 1} 页</span>
    </div>
  )
})
