/**
 * 把 vite build 的产物压成一个可以双击打开的单文件 HTML。
 *
 * 为什么要这么做：file:// 协议下浏览器会以 CORS 为由拒绝加载**独立的** module 脚本，
 * 所以 dist/index.html 直接双击是白屏。把 JS/CSS 内联进 HTML 就没有这个问题。
 *
 *   node node_modules/vite/bin/vite.js build
 *   node scripts/build-standalone.mjs
 * 输出：dist/方格纸预览.html
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const OUT_NAME = '方格纸预览.html'

const read = (p) => readFileSync(p, 'utf8')

/** 内联脚本时必须切断 </script，否则会提前闭合标签。 */
const safeForScript = (js) => js.replace(/<\/script/gi, '<\\/script')
/** 同理，样式里的 </style 也要处理（罕见但便宜）。 */
const safeForStyle = (css) => css.replace(/<\/style/gi, '<\\/style')
/** 用函数式 replace，避免 $& $1 之类被当成替换模式。 */
const put = (html, needle, replacement) => html.replace(needle, () => replacement)

const indexPath = join(DIST, 'index.html')
if (!existsSync(indexPath)) {
  console.error(`找不到 ${indexPath}，请先执行 vite build`)
  process.exit(1)
}

let html = read(indexPath)
const assetDir = join(DIST, 'assets')
const assets = existsSync(assetDir) ? readdirSync(assetDir) : []
const pick = (ext) => assets.find((f) => f.endsWith(ext))

// ---- 内联 CSS ----
const linkRe = /<link[^>]+rel="stylesheet"[^>]*>/i
const linkMatch = html.match(linkRe)
if (linkMatch) {
  const href = linkMatch[0].match(/href="([^"]+)"/)?.[1]
  const file = href ? join(DIST, href.replace(/^\.?\//, '')) : undefined
  const cssFile = file && existsSync(file) ? file : pick('.css') && join(assetDir, pick('.css'))
  if (cssFile) {
    html = put(html, linkMatch[0], `<style>\n${safeForStyle(read(cssFile))}\n</style>`)
    console.log(`  内联 CSS: ${cssFile.replace(ROOT, '.')}`)
  }
}

// ---- 内联 JS ----
const scriptRe = /<script[^>]+src="[^"]+\.js"[^>]*><\/script>/i
const scriptMatch = html.match(scriptRe)
if (!scriptMatch) {
  console.error('index.html 里没有找到外链脚本，可能已经被内联过了')
  process.exit(1)
}
const src = scriptMatch[0].match(/src="([^"]+)"/)?.[1]
const jsPath = join(DIST, src.replace(/^\.?\//, ''))
if (!existsSync(jsPath)) {
  console.error(`找不到脚本文件 ${jsPath}`)
  process.exit(1)
}
const js = safeForScript(read(jsPath))
html = put(
  html,
  scriptMatch[0],
  // 保留 type="module"：内联 module 不发起网络请求，file:// 下可以正常执行
  `<script type="module">\n${js}\n</script>`,
)
console.log(`  内联 JS : ${jsPath.replace(ROOT, '.')}`)

// ---- 收尾 ----
html = html.replace(
  /<title>([^<]*)<\/title>/,
  (m, t) => `<title>${t}</title>\n    <meta name="generator" content="gaozhi-preview standalone ${randomUUID().slice(0, 8)}">`,
)

const outPath = join(DIST, OUT_NAME)
writeFileSync(outPath, html, 'utf8')
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)
console.log(`\n✅ 单文件应用：${outPath}  (${kb} KB，双击即可用，不需要服务器)\n`)
