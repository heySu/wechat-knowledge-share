from PIL import Image, ImageDraw, ImageFont
import os

W, H = 900, 383
BG = (247, 249, 248)
INK = (17, 24, 20)
GREEN = (7, 193, 96)
GRAY = (120, 131, 125)
MARK = (225, 237, 229)

BOLD = [p for p in ("C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/simhei.ttf") if os.path.exists(p)]
REG = [p for p in ("C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf") if os.path.exists(p)]
if not BOLD or not REG:
    raise SystemExit("no usable CJK font")

def font(paths, size):
    return ImageFont.truetype(paths[0], size)

def wrap(draw, text, f, maxw):
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=f) <= maxw:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines

COVERS = [
    ("01", "知识小站 · AGENT 学习笔记 01", "把 Agent 拆开看", "模型 · 工具 · 记忆 · 循环"),
    ("02", "知识小站 · AGENT 学习笔记 02", "工具调用的三种翻车方式", "选错工具 · 参数幻觉 · 连环调用"),
    ("03", "知识小站 · AGENT 学习笔记 03", "断了，还能接着跑", "状态 · 恢复 · 幂等"),
    ("04", "知识小站 · AGENT 学习笔记 04", "Agent 的成本账", "步数 · 缓存 · 模型分级"),
    ("05", "知识小站 · AGENT 学习笔记 05", "从 demo 到上线", "权限 · 审计 · 灰度"),
    ("06", "知识小站 · AGENT 学习笔记 06", "怎么证明它变好了", "任务集 · 判定 · 回归"),
    ("07", "知识小站 · AGENT 学习笔记 07", "Agent 落地地图", "七个阶段 · 三个判断"),
]

for num, label, title, sub in COVERS:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)

    d.rectangle([0, 0, 7, H], fill=GREEN)

    f_mark = font(BOLD, 172)
    d.text((W - 46, H - 34), num, font=f_mark, fill=MARK, anchor="rb")

    f_label = font(BOLD, 19)
    d.text((72, 58), label, font=f_label, fill=GREEN)

    f_title = font(BOLD, 50)
    lines = wrap(d, title, f_title, 600)
    y = 104
    for line in lines:
        d.text((72, y), line, font=f_title, fill=INK)
        y += 66

    y += 14
    d.rectangle([72, y, 128, y + 4], fill=GREEN)
    y += 24

    f_sub = font(REG, 21)
    d.text((72, y), sub, font=f_sub, fill=GRAY)

    im.save(f"封面-{num}.png")

# 方形版手动断行，避免把词拆开
SQ_LINES = {
    "01": ["把 Agent 拆开看"],
    "02": ["工具调用的", "三种翻车方式"],
    "03": ["断了，还能接着跑"],
    "04": ["Agent 的成本账"],
    "05": ["从 demo", "到上线"],
    "06": ["怎么证明", "它变好了"],
    "07": ["Agent", "落地地图"],
}

# 方形版：订阅号次条 / 分享卡片用 1:1
SW = SH = 500
for num, label, title, sub in COVERS:
    im = Image.new("RGB", (SW, SH), BG)
    d = ImageDraw.Draw(im)

    d.rectangle([0, 0, 6, SH], fill=GREEN)

    f_mark = font(BOLD, 158)
    d.text((SW - 34, SH - 26), num, font=f_mark, fill=MARK, anchor="rb")

    f_label = font(BOLD, 17)
    d.text((56, 92), label, font=f_label, fill=GREEN)

    f_title = font(BOLD, 44)
    lines = SQ_LINES.get(num) or wrap(d, title, f_title, 372)
    y = 140
    for line in lines:
        d.text((56, y), line, font=f_title, fill=INK)
        y += 58

    y += 12
    d.rectangle([56, y, 104, y + 4], fill=GREEN)
    y += 22

    f_sub = font(REG, 19)
    d.text((56, y), sub, font=f_sub, fill=GRAY)

    im.save(f"封面-{num}-方.png")

print("ok")
