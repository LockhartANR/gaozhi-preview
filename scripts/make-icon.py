"""生成 Tauri 用的应用图标源图（1024x1024 PNG）。

    python scripts/make-icon.py
输出：src-tauri/icons/source.png
再用 `pnpm tauri icon src-tauri/icons/source.png` 生成全套 ico/icns/png。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri" / "icons" / "source.png"

SIZE = 1024
GREEN_TOP = (74, 168, 127)
GREEN_BOTTOM = (35, 122, 92)
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",  # 微软雅黑 Bold
    r"C:\Windows\Fonts\msyh.ttc",  # 微软雅黑
    r"C:\Windows\Fonts\simhei.ttf",  # 黑体
    r"C:\Windows\Fonts\simsun.ttc",  # 宋体
]


def rounded_gradient_square() -> Image.Image:
    """竖向渐变的圆角方块。"""
    base = Image.new("RGB", (SIZE, SIZE), GREEN_BOTTOM)
    draw = ImageDraw.Draw(base)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        color = tuple(
            round(GREEN_TOP[i] + (GREEN_BOTTOM[i] - GREEN_TOP[i]) * t) for i in range(3)
        )
        draw.line([(0, y), (SIZE, y)], fill=color)

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, SIZE - 1, SIZE - 1], radius=int(SIZE * 0.22), fill=255
    )
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out


def draw_grid(img: Image.Image) -> None:
    """淡淡的方格，点一下"稿纸"这个题。"""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    pad = int(SIZE * 0.17)
    step = (SIZE - pad * 2) / 4
    line = (255, 255, 255, 46)
    for i in range(5):
        p = round(pad + i * step)
        d.line([(p, pad), (p, SIZE - pad)], fill=line, width=5)
        d.line([(pad, p), (SIZE - pad, p)], fill=line, width=5)
    img.alpha_composite(overlay)


def draw_glyph(img: Image.Image) -> None:
    font = None
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                font = ImageFont.truetype(path, int(SIZE * 0.56))
                break
            except OSError:
                continue

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    text = "稿"
    if font is not None:
        box = d.textbbox((0, 0), text, font=font)
        x = (SIZE - (box[2] - box[0])) / 2 - box[0]
        y = (SIZE - (box[3] - box[1])) / 2 - box[1]
        # 一点点阴影，白字在浅绿上更立得住
        d.text((x + 6, y + 8), text, font=font, fill=(0, 0, 0, 60))
        d.text((x, y), text, font=font, fill=(255, 255, 255, 255))
    else:
        # 没有中文字体就退化成画一个方框，至少别报错
        m = int(SIZE * 0.3)
        d.rounded_rectangle([m, m, SIZE - m, SIZE - m], radius=24, outline="white", width=14)
    img.alpha_composite(layer)


def main() -> None:
    img = rounded_gradient_square()
    draw_grid(img)
    draw_glyph(img)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB, {SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
