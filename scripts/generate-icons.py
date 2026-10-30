"""开发时生成几何图标；网页运行/静态部署无需 Python 或 Pillow。"""
from pathlib import Path
from PIL import Image, ImageDraw

target = Path(__file__).resolve().parents[1] / "assets" / "icons"
for size, name in [(192, "app-192.png"), (512, "app-512.png"), (180, "apple-touch-icon.png")]:
    # 白底、黑色四则运算标记；所有图形保留于中心安全区域。
    image = Image.new("RGB", (size, size), "white")
    draw = ImageDraw.Draw(image)
    def line(points):
        draw.line([(round(x * size), round(y * size)) for x, y in points], fill="#111111", width=max(2, round(size * .035)))
    line([(.23, .33), (.43, .33)])
    line([(.33, .23), (.33, .43)])
    line([(.57, .33), (.77, .33)])
    line([(.25, .59), (.41, .75)])
    line([(.25, .75), (.41, .59)])
    line([(.57, .63), (.77, .63)])
    line([(.57, .71), (.77, .71)])
    image.save(target / name, optimize=True)
    print(f"{name}: {size}x{size}")
