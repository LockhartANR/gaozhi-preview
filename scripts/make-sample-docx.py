"""生成一个用于测试 .docx 解析的样例文档（手写 OOXML，不依赖 Word/LibreOffice）。

覆盖：居中标题(w:jc)、首行缩进(w:ind/@firstLineChars)、软回车(w:br)、
显式零缩进、表格(w:tbl)、图片对象(w:drawing)、自定义默认字号(styles.xml)。

    python scripts/make-sample-docx.py
输出：public/sample.docx
"""
from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "sample.docx"

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"

PARAS = [
    # 居中标题
    f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
    f'<w:r><w:t>秋天的黄昏</w:t></w:r></w:p>',
    # 正文：2 字符首行缩进（firstLineChars 单位是 1/100 字符）
    f'<w:p><w:pPr><w:ind w:firstLineChars="200" w:firstLine="420"/></w:pPr><w:r>'
    f'<w:t xml:space="preserve">秋天的黄昏，我坐在窗前读一本旧书。书页已经泛黄，边角卷起，'
    f'像一片被风反复吹过的叶子。窗外那棵老槐树，叶子落得差不多了，只剩下几根细枝在风里轻轻摇晃。</w:t>'
    f'</w:r></w:p>',
    # 段内软回车（Shift+Enter）：必须强制断行，即使没填满 20 格
    f'<w:p><w:pPr><w:ind w:firstLineChars="200" w:firstLine="420"/></w:pPr><w:r>'
    f'<w:t>他问我：“小朋友，要不要来一串？”</w:t><w:br/>'
    f'<w:t>我摇摇头，因为口袋里只有五毛钱——那是准备买橡皮的。</w:t></w:r></w:p>',
    # 显式取消缩进
    f'<w:p><w:pPr><w:ind w:firstLineChars="0" w:firstLine="0"/></w:pPr><w:r>'
    f'<w:t>这一行没有首行缩进（w:firstLineChars=0）。英文单词 manuscript 与数字 2024 都按半角处理，'
    f'两个半角合占一格。</w:t></w:r></w:p>',
    # 表格：应提取文字并给出提示
    f'<w:tbl><w:tr>'
    f'<w:tc><w:p><w:r><w:t>表格第一格</w:t></w:r></w:p></w:tc>'
    f'<w:tc><w:p><w:r><w:t>表格第二格</w:t></w:r></w:p></w:tc>'
    f'</w:tr></w:tbl>',
    # 段末标点刚好落到行首的场景
    f'<w:p><w:pPr><w:ind w:firstLineChars="0" w:firstLine="0"/></w:pPr><w:r>'
    f'<w:t>一二三四五六七八九十一二三四五六七八九十甲乙丙丁戊己庚辛。'
    f'这句的句号会被压缩进前一格，不能顶到行首。</w:t></w:r></w:p>',
    # 图片对象：应被统计并提示
    f'<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1"/></wp:inline>'
    f'</w:drawing></w:r></w:p>',
]

TYPOGRAPH = (
    '一二三四五六七八九十一二三四五六七八九十甲乙丙丁戊己庚辛。'
    '这句的句号会被压缩进前一格，不能顶到行首。他笑着说：“好的。”'
)

DOCUMENT = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{W}" xmlns:r="{R}" xmlns:wp="{WP}">
  <w:body>
    {"".join(PARAS)}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1800" w:right="1800"/></w:sectPr>
  </w:body>
</w:document>
'''

STYLES = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{W}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
</w:styles>
'''

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
'''

RELS = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="{R}/officeDocument" Target="word/document.xml"/>
</Relationships>
'''

DOC_RELS = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="{R}/styles" Target="styles.xml"/>
</Relationships>
'''


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/document.xml", DOCUMENT)
        z.writestr("word/styles.xml", STYLES)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print(f"（正文含一处排版校验句：{TYPOGRAPH[:12]}…）")


if __name__ == "__main__":
    main()
