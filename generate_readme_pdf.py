#!/usr/bin/env python3
"""Generate a visual PDF guide for X Badge Filter."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, HRFlowable, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, Circle, String, Line, Polygon
from reportlab.graphics import renderPDF
import os

# ── Font setup ──
# Try to find a Japanese font
FONT_PATHS = [
    os.path.expanduser('~/.local/share/fonts/ipagp.ttf'),
    os.path.expanduser('~/.local/share/fonts/ipaexg.ttf'),
    os.path.expanduser('~/.local/share/fonts/ipag.ttf'),
    '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
    '/usr/share/fonts/truetype/takao-gothic/TakaoGothic.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]

jp_font = 'Helvetica'
jp_font_bold = 'Helvetica-Bold'

for fp in FONT_PATHS:
    if os.path.exists(fp):
        try:
            pdfmetrics.registerFont(TTFont('JPFont', fp))
            jp_font = 'JPFont'
            jp_font_bold = 'JPFont'
            print(f'Using font: {fp}')
            break
        except Exception:
            continue

# ── Colors ──
BLUE = HexColor('#1d9bf0')
GOLD = HexColor('#e5af00')
GREY = HexColor('#829aab')
DARK_BG = HexColor('#15202b')
DARK_CARD = HexColor('#1e2732')
DARK_BORDER = HexColor('#38444d')
TEXT_LIGHT = HexColor('#e7e9ea')
TEXT_MUTED = HexColor('#8b98a5')
SUCCESS = HexColor('#198754')
LINK_BLUE = HexColor('#1d9bf0')
SECTION_BG = HexColor('#f0f4f8')
WHITE = white
BLACK = black

# ── Styles ──
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'Title_JP', parent=styles['Title'],
    fontName=jp_font_bold, fontSize=28, spaceAfter=6,
    textColor=BLUE,
)
subtitle_style = ParagraphStyle(
    'Subtitle_JP', parent=styles['Normal'],
    fontName=jp_font, fontSize=12, spaceAfter=20,
    textColor=HexColor('#555555'), alignment=TA_CENTER,
)
h1_style = ParagraphStyle(
    'H1_JP', parent=styles['Heading1'],
    fontName=jp_font_bold, fontSize=20, spaceBefore=24, spaceAfter=10,
    textColor=HexColor('#1a1a2e'), borderPadding=(0, 0, 4, 0),
)
h2_style = ParagraphStyle(
    'H2_JP', parent=styles['Heading2'],
    fontName=jp_font_bold, fontSize=15, spaceBefore=16, spaceAfter=8,
    textColor=HexColor('#333333'),
)
h3_style = ParagraphStyle(
    'H3_JP', parent=styles['Heading3'],
    fontName=jp_font_bold, fontSize=12, spaceBefore=10, spaceAfter=6,
    textColor=HexColor('#444444'),
)
body_style = ParagraphStyle(
    'Body_JP', parent=styles['Normal'],
    fontName=jp_font, fontSize=10, leading=16, spaceAfter=6,
)
step_style = ParagraphStyle(
    'Step_JP', parent=styles['Normal'],
    fontName=jp_font, fontSize=10, leading=16, spaceAfter=4,
    leftIndent=20,
)
note_style = ParagraphStyle(
    'Note_JP', parent=styles['Normal'],
    fontName=jp_font, fontSize=9, leading=14, spaceAfter=8,
    textColor=HexColor('#666666'), leftIndent=10,
    borderColor=HexColor('#ddd'), borderWidth=0, borderPadding=5,
)
code_style = ParagraphStyle(
    'Code_JP', parent=styles['Code'],
    fontName='Courier', fontSize=9, leading=13, spaceAfter=8,
    backColor=HexColor('#f5f5f5'), borderColor=HexColor('#ddd'),
    borderWidth=1, borderPadding=8, borderRadius=4,
)
table_header_style = ParagraphStyle(
    'TableH', fontName=jp_font_bold, fontSize=9, textColor=WHITE, leading=13,
)
table_cell_style = ParagraphStyle(
    'TableC', fontName=jp_font, fontSize=9, leading=13,
)


def draw_badge_icon(d, x, y, color, size=12):
    """Draw a small colored badge circle."""
    d.add(Circle(x, y, size/2, fillColor=color, strokeColor=None))
    # Checkmark
    d.add(String(x-3, y-4, '\u2713', fontName='Helvetica-Bold', fontSize=8, fillColor=WHITE))


def create_browser_mockup(width=460, height=80, content_text=''):
    """Create a simple browser window mockup."""
    d = Drawing(width, height)
    # Browser frame
    d.add(Rect(0, 0, width, height, fillColor=HexColor('#f8f9fa'), strokeColor=HexColor('#dee2e6'), rx=6, ry=6))
    # Title bar
    d.add(Rect(0, height-24, width, 24, fillColor=HexColor('#e9ecef'), strokeColor=None, rx=6, ry=6))
    d.add(Rect(0, height-24, width, 12, fillColor=HexColor('#e9ecef'), strokeColor=None))
    # Traffic lights
    d.add(Circle(14, height-12, 4, fillColor=HexColor('#ff5f57'), strokeColor=None))
    d.add(Circle(28, height-12, 4, fillColor=HexColor('#febc2e'), strokeColor=None))
    d.add(Circle(42, height-12, 4, fillColor=HexColor('#28c840'), strokeColor=None))
    # URL bar
    d.add(Rect(60, height-20, width-120, 16, fillColor=WHITE, strokeColor=HexColor('#ced4da'), rx=3, ry=3))
    d.add(String(68, height-16, 'chrome://extensions/', fontName='Courier', fontSize=8, fillColor=HexColor('#666')))
    # XBF icon in toolbar
    d.add(Circle(width-20, height-12, 8, fillColor=BLUE, strokeColor=None))
    d.add(String(width-24, height-15, 'XB', fontName='Helvetica-Bold', fontSize=6, fillColor=WHITE))
    # Content
    if content_text:
        d.add(String(20, height-45, content_text, fontName=jp_font, fontSize=9, fillColor=HexColor('#333')))
    return d


def create_toggle_switch(width=120, height=28, label='', on=True):
    """Create a toggle switch drawing."""
    d = Drawing(width, height)
    # Label
    d.add(String(0, 10, label, fontName=jp_font, fontSize=9, fillColor=HexColor('#333')))
    # Switch track
    sx = width - 36
    color = BLUE if on else HexColor('#ccc')
    d.add(Rect(sx, 5, 30, 16, fillColor=color, strokeColor=None, rx=8, ry=8))
    # Switch knob
    kx = sx + 16 if on else sx + 4
    d.add(Circle(kx + 4, 13, 6, fillColor=WHITE, strokeColor=None))
    return d


def create_phone_mockup(width=200, height=340, content_lines=None):
    """Create a simple phone mockup."""
    d = Drawing(width, height)
    # Phone body
    d.add(Rect(30, 0, 140, height, fillColor=DARK_BG, strokeColor=HexColor('#555'), rx=16, ry=16, strokeWidth=2))
    # Notch
    d.add(Rect(70, height-14, 60, 10, fillColor=HexColor('#333'), strokeColor=None, rx=4, ry=4))
    # Screen content area
    d.add(Rect(36, 16, 128, height-40, fillColor=DARK_BG, strokeColor=None))
    # Status bar
    d.add(String(42, height-32, 'x.com', fontName='Helvetica', fontSize=8, fillColor=TEXT_LIGHT))
    # Content lines
    if content_lines:
        y = height - 60
        for line in content_lines:
            if y < 30:
                break
            d.add(String(42, y, line, fontName=jp_font, fontSize=7, fillColor=TEXT_LIGHT))
            y -= 14
    # FAB button
    d.add(Circle(150, 30, 14, fillColor=BLUE, strokeColor=None))
    d.add(String(141, 26, 'XBF', fontName='Helvetica-Bold', fontSize=7, fillColor=WHITE))
    # Badge count
    d.add(Circle(160, 40, 7, fillColor=HexColor('#f4212e'), strokeColor=None))
    d.add(String(157, 37, '5', fontName='Helvetica-Bold', fontSize=7, fillColor=WHITE))
    return d


def create_placeholder_bar(width=440, height=32):
    """Create a tweet placeholder bar mockup."""
    d = Drawing(width, height)
    d.add(Rect(0, 0, width, height, fillColor=HexColor('#f8f9fa'), strokeColor=HexColor('#dee2e6'), rx=4, ry=4))
    d.add(String(12, 10, '@example_user \u306e\u6295\u7a3f\u3092\u975e\u8868\u793a\u306b\u3057\u307e\u3057\u305f', fontName=jp_font, fontSize=9, fillColor=TEXT_MUTED))
    # Show button
    d.add(Rect(width-140, 6, 50, 20, fillColor=WHITE, strokeColor=BLUE, rx=10, ry=10))
    d.add(String(width-132, 11, '\u8868\u793a', fontName=jp_font, fontSize=8, fillColor=BLUE))
    # Whitelist button
    d.add(Rect(width-80, 6, 70, 20, fillColor=WHITE, strokeColor=BLUE, rx=10, ry=10))
    d.add(String(width-74, 11, '\u5e38\u306b\u8868\u793a', fontName=jp_font, fontSize=8, fillColor=BLUE))
    return d


def create_popup_mockup(width=220, height=280):
    """Create the extension popup mockup."""
    d = Drawing(width, height)
    # Background
    d.add(Rect(0, 0, width, height, fillColor=DARK_BG, strokeColor=DARK_BORDER, rx=8, ry=8))
    y = height - 24
    # Header
    d.add(String(12, y, 'X Badge Filter', fontName='Helvetica-Bold', fontSize=12, fillColor=TEXT_LIGHT))
    # Toggle ON
    d.add(Rect(width-44, y-2, 30, 16, fillColor=BLUE, strokeColor=None, rx=8, ry=8))
    d.add(Circle(width-44+20+4, y+6, 6, fillColor=WHITE, strokeColor=None))
    y -= 20
    d.add(Line(12, y, width-12, y, strokeColor=DARK_BORDER, strokeWidth=1))
    y -= 18
    d.add(String(12, y, '\u975e\u8868\u793a\u306b\u3059\u308b\u30d0\u30c3\u30b8', fontName=jp_font, fontSize=9, fillColor=TEXT_MUTED))
    # Blue badge
    y -= 20
    d.add(Circle(20, y+5, 5, fillColor=BLUE, strokeColor=None))
    d.add(String(30, y, '\u9752\u30d0\u30c3\u30b8 (Premium)', fontName=jp_font, fontSize=9, fillColor=TEXT_LIGHT))
    d.add(Rect(width-30, y-1, 14, 14, fillColor=BLUE, strokeColor=None, rx=2, ry=2))
    d.add(String(width-27, y+1, '\u2713', fontName='Helvetica-Bold', fontSize=8, fillColor=WHITE))
    # Gold badge
    y -= 20
    d.add(Circle(20, y+5, 5, fillColor=GOLD, strokeColor=None))
    d.add(String(30, y, '\u91d1\u30d0\u30c3\u30b8 (\u4f01\u696d)', fontName=jp_font, fontSize=9, fillColor=TEXT_LIGHT))
    d.add(Rect(width-30, y-1, 14, 14, fillColor=None, strokeColor=HexColor('#536471'), rx=2, ry=2, strokeWidth=1.5))
    # Grey badge
    y -= 20
    d.add(Circle(20, y+5, 5, fillColor=GREY, strokeColor=None))
    d.add(String(30, y, '\u7070\u30d0\u30c3\u30b8 (\u653f\u5e9c)', fontName=jp_font, fontSize=9, fillColor=TEXT_LIGHT))
    d.add(Rect(width-30, y-1, 14, 14, fillColor=None, strokeColor=HexColor('#536471'), rx=2, ry=2, strokeWidth=1.5))
    y -= 14
    d.add(Line(12, y, width-12, y, strokeColor=DARK_BORDER, strokeWidth=1))
    y -= 18
    d.add(String(12, y, '\u30db\u30ef\u30a4\u30c8\u30ea\u30b9\u30c8', fontName=jp_font, fontSize=9, fillColor=TEXT_MUTED))
    y -= 20
    d.add(Rect(12, y-2, width-70, 18, fillColor=DARK_CARD, strokeColor=DARK_BORDER, rx=4, ry=4))
    d.add(String(18, y+1, '@handle', fontName='Courier', fontSize=8, fillColor=TEXT_MUTED))
    d.add(Rect(width-50, y-2, 38, 18, fillColor=BLUE, strokeColor=None, rx=4, ry=4))
    d.add(String(width-44, y+1, '\u8ffd\u52a0', fontName=jp_font, fontSize=8, fillColor=WHITE))
    y -= 18
    d.add(Line(12, y, width-12, y, strokeColor=DARK_BORDER, strokeWidth=1))
    y -= 16
    d.add(String(width/2-30, y, '23 \u4ef6\u975e\u8868\u793a', fontName=jp_font, fontSize=9, fillColor=TEXT_MUTED))
    return d


def create_flow_diagram(width=460, height=100):
    """Create a simple flow diagram showing the filtering process."""
    d = Drawing(width, height)
    boxes = [
        ('\u30c4\u30a4\u30fc\u30c8\u691c\u51fa', HexColor('#e3f2fd')),
        ('\u30d0\u30c3\u30b8\u78ba\u8a8d', HexColor('#fff3e0')),
        ('\u30d5\u30a9\u30ed\u30fc\u78ba\u8a8d', HexColor('#e8f5e9')),
        ('\u30d5\u30a3\u30eb\u30bf', HexColor('#fce4ec')),
        ('\u975e\u8868\u793a', HexColor('#f3e5f5')),
    ]
    bw = 76
    bh = 36
    gap = 14
    sx = (width - (len(boxes) * bw + (len(boxes)-1) * gap)) / 2
    y = (height - bh) / 2
    for i, (label, color) in enumerate(boxes):
        x = sx + i * (bw + gap)
        d.add(Rect(x, y, bw, bh, fillColor=color, strokeColor=HexColor('#bbb'), rx=6, ry=6))
        d.add(String(x + bw/2 - len(label)*4.5, y + bh/2 - 5, label, fontName=jp_font, fontSize=9, fillColor=HexColor('#333')))
        if i < len(boxes) - 1:
            ax = x + bw + 2
            ay = y + bh / 2
            d.add(Line(ax, ay, ax + gap - 4, ay, strokeColor=BLUE, strokeWidth=1.5))
            # Arrowhead
            d.add(Polygon([ax+gap-4, ay+3, ax+gap-4, ay-3, ax+gap, ay], fillColor=BLUE, strokeColor=None))
    return d


def build_pdf():
    output_path = '/home/kimkimjp/x-badge-filter/X_Badge_Filter_Guide.pdf'
    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
        title='X Badge Filter - \u5c0e\u5165\u30ac\u30a4\u30c9',
        author='kimkimjp',
    )

    story = []
    page_width = A4[0] - 40*mm

    # ━━━━━ COVER ━━━━━
    story.append(Spacer(1, 40))
    story.append(Paragraph('X Badge Filter', title_style))
    story.append(Paragraph('\u5c0e\u5165\u30ac\u30a4\u30c9 - \u521d\u5fc3\u8005\u5411\u3051\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb\u624b\u9806', subtitle_style))
    story.append(Spacer(1, 16))

    # Subtitle explanation
    story.append(Paragraph(
        'X\uff08\u65e7Twitter\uff09\u306e\u30bf\u30a4\u30e0\u30e9\u30a4\u30f3\u304b\u3089\u3001\u30d5\u30a9\u30ed\u30fc\u3057\u3066\u3044\u306a\u3044\u8a8d\u8a3c\u30d0\u30c3\u30b8\u4ed8\u304d\u30a2\u30ab\u30a6\u30f3\u30c8\u306e\u6295\u7a3f\u3092\u81ea\u52d5\u3067\u975e\u8868\u793a\u306b\u3059\u308b\u30c4\u30fc\u30eb\u3067\u3059\u3002',
        body_style
    ))
    story.append(Spacer(1, 12))

    # Feature table
    features = [
        [Paragraph('<b>\u6a5f\u80fd</b>', table_header_style), Paragraph('<b>\u8aac\u660e</b>', table_header_style)],
        [Paragraph('\u30d0\u30c3\u30b8\u30d5\u30a3\u30eb\u30bf', table_cell_style), Paragraph('\u9752/\u91d1/\u7070\u30d0\u30c3\u30b8\u3054\u3068\u306bON/OFF\u8a2d\u5b9a', table_cell_style)],
        [Paragraph('\u30db\u30ef\u30a4\u30c8\u30ea\u30b9\u30c8', table_cell_style), Paragraph('\u7279\u5b9a\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u30d5\u30a3\u30eb\u30bf\u304b\u3089\u9664\u5916', table_cell_style)],
        [Paragraph('\u975e\u8868\u793a\u30d0\u30fc', table_cell_style), Paragraph('\u300c\u8868\u793a\u300d\u300c\u5e38\u306b\u8868\u793a\u300d\u30dc\u30bf\u30f3\u4ed8\u304d', table_cell_style)],
        [Paragraph('\u30ab\u30a6\u30f3\u30bf\u30fc', table_cell_style), Paragraph('\u975e\u8868\u793a\u306b\u3057\u305f\u4ef6\u6570\u3092\u8868\u793a', table_cell_style)],
        [Paragraph('\u30de\u30eb\u30c1\u30d7\u30e9\u30c3\u30c8\u30d5\u30a9\u30fc\u30e0', table_cell_style), Paragraph('PC / Android / iPhone \u5bfe\u5fdc', table_cell_style)],
    ]
    ft = Table(features, colWidths=[page_width*0.3, page_width*0.7])
    ft.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BLUE),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f8f9fa')),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dee2e6')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
    ]))
    story.append(ft)
    story.append(Spacer(1, 16))

    # Flow diagram
    story.append(Paragraph('\u25bc \u30d5\u30a3\u30eb\u30bf\u30ea\u30f3\u30b0\u306e\u6d41\u308c', h3_style))
    story.append(create_flow_diagram(page_width, 70))
    story.append(Spacer(1, 8))

    # Platform table
    story.append(Paragraph('\u25bc \u5bfe\u5fdc\u74b0\u5883', h3_style))
    platforms = [
        [Paragraph('<b>\u74b0\u5883</b>', table_header_style), Paragraph('<b>\u65b9\u5f0f</b>', table_header_style), Paragraph('<b>\u96e3\u6613\u5ea6</b>', table_header_style)],
        [Paragraph('Chrome / Edge', table_cell_style), Paragraph('\u62e1\u5f35\u6a5f\u80fd', table_cell_style), Paragraph('\u2605\u2606\u2606 \u7c21\u5358', table_cell_style)],
        [Paragraph('Firefox', table_cell_style), Paragraph('\u62e1\u5f35\u6a5f\u80fd', table_cell_style), Paragraph('\u2605\u2606\u2606 \u7c21\u5358', table_cell_style)],
        [Paragraph('Android', table_cell_style), Paragraph('\u30e6\u30fc\u30b6\u30fc\u30b9\u30af\u30ea\u30d7\u30c8', table_cell_style), Paragraph('\u2605\u2605\u2606 \u3075\u3064\u3046', table_cell_style)],
        [Paragraph('iPhone / iPad', table_cell_style), Paragraph('\u30e6\u30fc\u30b6\u30fc\u30b9\u30af\u30ea\u30d7\u30c8', table_cell_style), Paragraph('\u2605\u2605\u2606 \u3075\u3064\u3046', table_cell_style)],
    ]
    pt = Table(platforms, colWidths=[page_width*0.3, page_width*0.4, page_width*0.3])
    pt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#333')),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f8f9fa')),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dee2e6')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(pt)

    # ━━━━━ PAGE: Chrome Install ━━━━━
    story.append(PageBreak())
    story.append(Paragraph('\u65b9\u6cd5A: Chrome / Edge \u306b\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb', h1_style))
    story.append(HRFlowable(width='100%', thickness=2, color=BLUE))
    story.append(Spacer(1, 8))

    # Step 1
    story.append(Paragraph('<b>Step 1.</b> \u30d5\u30a9\u30eb\u30c0\u3092\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9', h2_style))
    story.append(Paragraph(
        'Git\u304c\u4f7f\u3048\u308b\u5834\u5408\u306f\u30bf\u30fc\u30df\u30ca\u30eb\u3067\u4ee5\u4e0b\u3092\u5b9f\u884c\uff1a',
        body_style
    ))
    story.append(Paragraph('git clone &lt;\u30ea\u30dd\u30b8\u30c8\u30eaURL&gt;', code_style))
    story.append(Paragraph(
        'Git\u304c\u308f\u304b\u3089\u306a\u3044\u5834\u5408\u306f\u3001\u300cCode\u300d\u30dc\u30bf\u30f3 \u2192 \u300cDownload ZIP\u300d \u2192 \u5c55\u958b',
        note_style
    ))

    # Step 2
    story.append(Paragraph('<b>Step 2.</b> \u62e1\u5f35\u6a5f\u80fd\u30da\u30fc\u30b8\u3092\u958b\u304f', h2_style))
    story.append(Paragraph(
        '\u30a2\u30c9\u30ec\u30b9\u30d0\u30fc\u306b\u4ee5\u4e0b\u3092\u5165\u529b\u3057\u3066Enter\uff1a',
        body_style
    ))
    story.append(Paragraph('chrome://extensions/', code_style))
    story.append(Paragraph(
        'Edge\u306e\u5834\u5408\u306f edge://extensions/',
        note_style
    ))

    # Step 3 with diagram
    story.append(Paragraph('<b>Step 3.</b> \u300c\u30c7\u30d9\u30ed\u30c3\u30d1\u30fc\u30e2\u30fc\u30c9\u300d\u3092ON\u306b\u3059\u308b', h2_style))
    # Dev mode toggle diagram
    dm = Drawing(page_width, 40)
    dm.add(Rect(0, 5, page_width, 30, fillColor=HexColor('#f0f0f0'), strokeColor=HexColor('#ccc'), rx=6, ry=6))
    dm.add(String(16, 15, '\u62e1\u5f35\u6a5f\u80fd', fontName=jp_font, fontSize=11, fillColor=HexColor('#333')))
    # Toggle
    tw = page_width - 160
    dm.add(String(tw, 15, '\u30c7\u30d9\u30ed\u30c3\u30d1\u30fc\u30e2\u30fc\u30c9', fontName=jp_font, fontSize=9, fillColor=HexColor('#666')))
    dm.add(Rect(tw+100, 12, 30, 16, fillColor=BLUE, strokeColor=None, rx=8, ry=8))
    dm.add(Circle(tw+100+22, 20, 6, fillColor=WHITE, strokeColor=None))
    # Arrow
    ax = tw + 80
    dm.add(String(tw+140, 15, '\u2190 \u3053\u3053\u3092ON', fontName=jp_font, fontSize=9, fillColor=HexColor('#e74c3c')))
    story.append(dm)

    # Step 4
    story.append(Paragraph('<b>Step 4.</b> \u300c\u30d1\u30c3\u30b1\u30fc\u30b8\u5316\u3055\u308c\u3066\u3044\u306a\u3044\u62e1\u5f35\u6a5f\u80fd\u3092\u8aad\u307f\u8fbc\u3080\u300d\u3092\u30af\u30ea\u30c3\u30af', h2_style))
    # Button diagram
    bd = Drawing(page_width, 36)
    bd.add(Rect(10, 4, 280, 28, fillColor=WHITE, strokeColor=BLUE, rx=4, ry=4, strokeWidth=1.5))
    bd.add(String(20, 13, '\u30d1\u30c3\u30b1\u30fc\u30b8\u5316\u3055\u308c\u3066\u3044\u306a\u3044\u62e1\u5f35\u6a5f\u80fd\u3092\u8aad\u307f\u8fbc\u3080', fontName=jp_font, fontSize=10, fillColor=BLUE))
    bd.add(String(300, 13, '\u2190 \u3053\u306e\u30dc\u30bf\u30f3\u3092\u30af\u30ea\u30c3\u30af', fontName=jp_font, fontSize=9, fillColor=HexColor('#e74c3c')))
    story.append(bd)

    # Step 5
    story.append(Paragraph('<b>Step 5.</b> \u300cx-badge-filter\u300d\u30d5\u30a9\u30eb\u30c0\u3092\u9078\u629e', h2_style))
    story.append(Paragraph(
        '\u30d5\u30a1\u30a4\u30eb\u9078\u629e\u753b\u9762\u3067\u3001\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3057\u305f\u300cx-badge-filter\u300d\u30d5\u30a9\u30eb\u30c0\u3092\u9078\u3093\u3067\u300c\u30d5\u30a9\u30eb\u30c0\u30fc\u306e\u9078\u629e\u300d\u3092\u30af\u30ea\u30c3\u30af',
        body_style
    ))

    # Step 6 - Complete
    story.append(Paragraph('<b>Step 6.</b> \u5b8c\u4e86\uff01', h2_style))
    story.append(create_browser_mockup(page_width, 70, 'X Badge Filter \u304c\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb\u3055\u308c\u307e\u3057\u305f'))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        '\u30d6\u30e9\u30a6\u30b6\u53f3\u4e0a\u306e\u30c4\u30fc\u30eb\u30d0\u30fc\u306b\u300cXBF\u300d\u30a2\u30a4\u30b3\u30f3\u304c\u8868\u793a\u3055\u308c\u307e\u3059\u3002\u30af\u30ea\u30c3\u30af\u3059\u308b\u3068\u8a2d\u5b9a\u753b\u9762\u304c\u958b\u304d\u307e\u3059\u3002',
        body_style
    ))

    # ━━━━━ PAGE: Android ━━━━━
    story.append(PageBreak())
    story.append(Paragraph('\u65b9\u6cd5C: Android\u30b9\u30de\u30db\u306b\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb', h1_style))
    story.append(HRFlowable(width='100%', thickness=2, color=SUCCESS))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Step 1.</b> Kiwi Browser \u3092\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb', h2_style))
    story.append(Paragraph(
        'Google Play\u30b9\u30c8\u30a2\u3067\u300cKiwi Browser\u300d\u3092\u691c\u7d22\u3057\u3066\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb\uff08\u7121\u6599\uff09',
        body_style
    ))

    story.append(Paragraph('<b>Step 2.</b> Tampermonkey \u3092\u8ffd\u52a0', h2_style))
    story.append(Paragraph(
        'Kiwi Browser\u3092\u958b\u304f \u2192 \u53f3\u4e0a\u300c\u22ee\u300d\u30e1\u30cb\u30e5\u30fc \u2192 \u300c\u62e1\u5f35\u6a5f\u80fd\u300d\u2192 \u300c+ (from store)\u300d\u2192 \u300cTampermonkey\u300d\u3092\u691c\u7d22\u3057\u3066\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb',
        body_style
    ))

    story.append(Paragraph('<b>Step 3.</b> \u30b9\u30af\u30ea\u30d7\u30c8\u3092\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb', h2_style))
    story.append(Paragraph(
        '\u3053\u306e\u30ea\u30dd\u30b8\u30c8\u30ea\u306e <b>userscript/x-badge-filter.user.js</b> \u3092Kiwi Browser\u3067\u958b\u304f\u3068\u3001Tampermonkey\u304c\u300c\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb\u3057\u307e\u3059\u304b\uff1f\u300d\u3068\u8868\u793a\u3055\u308c\u308b\u306e\u3067\u300c\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb\u300d\u3092\u30bf\u30c3\u30d7',
        body_style
    ))

    story.append(Paragraph('<b>Step 4.</b> \u5b8c\u4e86\uff01', h2_style))
    # Phone mockup
    story.append(create_phone_mockup(200, 260, [
        'TL   @user1',
        '\u3053\u306e\u6295\u7a3f\u306f...',
        '',
        '@badge_user \u306e\u6295\u7a3f\u3092',
        '\u975e\u8868\u793a\u306b\u3057\u307e\u3057\u305f',
        '[\u8868\u793a] [\u5e38\u306b\u8868\u793a]',
        '',
        'TL   @user2',
        '\u4eca\u65e5\u306e\u30cb\u30e5\u30fc\u30b9...',
    ]))
    story.append(Paragraph(
        '\u753b\u9762\u53f3\u4e0b\u306e\u300cXBF\u300d\u30dc\u30bf\u30f3\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u8a2d\u5b9a\u30d1\u30cd\u30eb\u304c\u958b\u304d\u307e\u3059',
        body_style
    ))

    # ━━━━━ PAGE: iPhone ━━━━━
    story.append(PageBreak())
    story.append(Paragraph('\u65b9\u6cd5D: iPhone / iPad \u306b\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb', h1_style))
    story.append(HRFlowable(width='100%', thickness=2, color=HexColor('#ff9500')))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Step 1.</b> Userscripts \u30a2\u30d7\u30ea\u3092\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb', h2_style))
    story.append(Paragraph(
        'App Store\u3067\u300cUserscripts\u300d\uff08\u958b\u767a\u8005: Justin Wasack\uff09\u3092\u691c\u7d22\u3057\u3066\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb\uff08\u7121\u6599\uff09',
        body_style
    ))

    story.append(Paragraph('<b>Step 2.</b> Safari\u62e1\u5f35\u6a5f\u80fd\u3092\u6709\u52b9\u306b\u3059\u308b', h2_style))
    # Settings diagram
    sd = Drawing(page_width, 80)
    sd.add(Rect(20, 10, 300, 60, fillColor=HexColor('#f2f2f7'), strokeColor=HexColor('#c7c7cc'), rx=10, ry=10))
    sd.add(String(34, 50, '\u8a2d\u5b9a  \u203a  Safari  \u203a  \u62e1\u5f35\u6a5f\u80fd', fontName=jp_font, fontSize=10, fillColor=HexColor('#333')))
    sd.add(Rect(34, 20, 260, 24, fillColor=WHITE, strokeColor=HexColor('#ddd'), rx=6, ry=6))
    sd.add(String(44, 27, 'Userscripts', fontName=jp_font, fontSize=10, fillColor=HexColor('#333')))
    sd.add(Rect(254, 24, 30, 16, fillColor=SUCCESS, strokeColor=None, rx=8, ry=8))
    sd.add(Circle(254+22, 32, 6, fillColor=WHITE, strokeColor=None))
    sd.add(String(330, 27, '\u2190 ON\u306b\u3059\u308b', fontName=jp_font, fontSize=9, fillColor=HexColor('#e74c3c')))
    story.append(sd)

    story.append(Paragraph('<b>Step 3.</b> \u30b9\u30af\u30ea\u30d7\u30c8\u30d5\u30a1\u30a4\u30eb\u3092\u4fdd\u5b58', h2_style))
    story.append(Paragraph(
        '<b>userscript/x-badge-filter.user.js</b> \u3092iPhone\u306b\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3057\u3001\n'
        'Userscripts\u30a2\u30d7\u30ea\u306e\u30b9\u30af\u30ea\u30d7\u30c8\u30d5\u30a9\u30eb\u30c0\u306b\u4fdd\u5b58\u3057\u307e\u3059',
        body_style
    ))

    story.append(Paragraph('<b>Step 4.</b> \u5b8c\u4e86\uff01', h2_style))
    story.append(Paragraph(
        'Safari\u3067x.com\u3092\u958b\u304f\u3068\u81ea\u52d5\u3067\u52d5\u4f5c\u3057\u307e\u3059\u3002\u753b\u9762\u53f3\u4e0b\u306b\u300cXBF\u300d\u30dc\u30bf\u30f3\u304c\u8868\u793a\u3055\u308c\u307e\u3059\u3002',
        body_style
    ))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        '\u203b iOS\u306eSafari\u3067\u306f\u4e00\u90e8\u306e\u6a5f\u80fd\uff08API\u50b5\u53d7\uff09\u304c\u5236\u9650\u3055\u308c\u308b\u5834\u5408\u304c\u3042\u308a\u307e\u3059\u3002\u305d\u306e\u5834\u5408\u306fDOM\u89e3\u6790\u30e2\u30fc\u30c9\u3067\u52d5\u4f5c\u3057\u307e\u3059\u3002',
        note_style
    ))

    # ━━━━━ PAGE: Usage ━━━━━
    story.append(PageBreak())
    story.append(Paragraph('\u4f7f\u3044\u65b9', h1_style))
    story.append(HRFlowable(width='100%', thickness=2, color=HexColor('#6f42c1')))
    story.append(Spacer(1, 8))

    # Popup mockup
    story.append(Paragraph('\u25bc \u8a2d\u5b9a\u753b\u9762\uff08PC\uff1a\u30a2\u30a4\u30b3\u30f3\u30af\u30ea\u30c3\u30af / \u30b9\u30de\u30db\uff1aXBF\u30dc\u30bf\u30f3\u30bf\u30c3\u30d7\uff09', h3_style))
    story.append(create_popup_mockup(220, 260))
    story.append(Spacer(1, 12))

    # Placeholder bar
    story.append(Paragraph('\u25bc \u30bf\u30a4\u30e0\u30e9\u30a4\u30f3\u3067\u306e\u8868\u793a', h3_style))
    story.append(Paragraph(
        '\u30d5\u30a3\u30eb\u30bf\u30ea\u30f3\u30b0\u3055\u308c\u305f\u6295\u7a3f\u306f\u4ee5\u4e0b\u306e\u30d0\u30fc\u306b\u7f6e\u304d\u63db\u308f\u308a\u307e\u3059\uff1a',
        body_style
    ))
    story.append(create_placeholder_bar(page_width, 32))
    story.append(Spacer(1, 8))

    # Button explanations
    btn_data = [
        [Paragraph('<b>\u30dc\u30bf\u30f3</b>', table_header_style), Paragraph('<b>\u52d5\u4f5c</b>', table_header_style)],
        [Paragraph('\u300c\u8868\u793a\u300d', table_cell_style), Paragraph('\u305d\u306e\u6295\u7a3f\u3092\u4e00\u6642\u7684\u306b\u8868\u793a\u3057\u307e\u3059\uff08\u30da\u30fc\u30b8\u3092\u96e2\u308c\u308b\u3068\u307e\u305f\u975e\u8868\u793a\uff09', table_cell_style)],
        [Paragraph('\u300c\u5e38\u306b\u8868\u793a\u300d', table_cell_style), Paragraph('\u305d\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u30db\u30ef\u30a4\u30c8\u30ea\u30b9\u30c8\u306b\u8ffd\u52a0\u3057\u3001\u4eca\u5f8c\u306f\u5e38\u306b\u8868\u793a', table_cell_style)],
    ]
    bt = Table(btn_data, colWidths=[page_width*0.25, page_width*0.75])
    bt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#6f42c1')),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f8f9fa')),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dee2e6')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(bt)

    # ━━━━━ PAGE: FAQ ━━━━━
    story.append(PageBreak())
    story.append(Paragraph('\u3088\u304f\u3042\u308b\u8cea\u554f', h1_style))
    story.append(HRFlowable(width='100%', thickness=2, color=HexColor('#e74c3c')))
    story.append(Spacer(1, 8))

    faqs = [
        ('\u30d5\u30a9\u30ed\u30fc\u4e2d\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u3082\u975e\u8868\u793a\u306b\u306a\u308b\uff1f',
         '\u3044\u3044\u3048\u3002\u30d5\u30a9\u30ed\u30fc\u3057\u3066\u3044\u308b\u30a2\u30ab\u30a6\u30f3\u30c8\u306e\u6295\u7a3f\u306f\u8868\u793a\u3055\u308c\u307e\u3059\u3002\u300c\u30d5\u30a9\u30ed\u30fc\u3057\u3066\u3044\u306a\u3044\u300d\u304b\u3064\u300c\u30d0\u30c3\u30b8\u4ed8\u304d\u300d\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u306e\u307f\u304c\u5bfe\u8c61\u3067\u3059\u3002'),
        ('\u975e\u8868\u793a\u306b\u3057\u305f\u304f\u306a\u3044\u30d0\u30c3\u30b8\u4ed8\u304d\u30a2\u30ab\u30a6\u30f3\u30c8\u304c\u3042\u308b\u5834\u5408\u306f\uff1f',
         '\u300c\u5e38\u306b\u8868\u793a\u300d\u30dc\u30bf\u30f3\u3092\u30af\u30ea\u30c3\u30af\u3059\u308b\u304b\u3001\u8a2d\u5b9a\u753b\u9762\u306e\u30db\u30ef\u30a4\u30c8\u30ea\u30b9\u30c8\u306b @\u30e6\u30fc\u30b6\u30fc\u540d \u3092\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044\u3002'),
        ('\u5e83\u544a\u3082\u975e\u8868\u793a\u306b\u306a\u308b\uff1f',
         '\u3044\u3044\u3048\u3002\u5e83\u544a\uff08\u30d7\u30ed\u30e2\u30fc\u30b7\u30e7\u30f3\uff09\u306b\u306f\u5f71\u97ff\u3057\u307e\u305b\u3093\u3002'),
        ('X\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u304cBAN\u3055\u308c\u305f\u308a\u3059\u308b\uff1f',
         '\u3053\u306e\u30c4\u30fc\u30eb\u306f\u30d6\u30e9\u30a6\u30b6\u306e\u753b\u9762\u8868\u793a\u3092\u5909\u3048\u3066\u3044\u308b\u3060\u3051\u3067\u3001X\u306e\u30b5\u30fc\u30d0\u30fc\u306b\u306f\u4f55\u3082\u9001\u4fe1\u3057\u307e\u305b\u3093\u3002\u30a2\u30ab\u30a6\u30f3\u30c8\u306b\u5f71\u97ff\u306f\u3042\u308a\u307e\u305b\u3093\u3002'),
        ('\u8a2d\u5b9a\u306f\u3069\u3053\u306b\u4fdd\u5b58\u3055\u308c\u308b\uff1f',
         '\u304a\u4f7f\u3044\u306e\u7aef\u672b\u5185\u306b\u306e\u307f\u4fdd\u5b58\u3055\u308c\u307e\u3059\u3002\u5916\u90e8\u306b\u306f\u4e00\u5207\u9001\u4fe1\u3055\u308c\u307e\u305b\u3093\u3002'),
        ('\u52d5\u304b\u306a\u3044\u5834\u5408\u306f\uff1f',
         '\u2460 x.com\u3092\u958b\u3044\u3066\u3044\u308b\u304b\u78ba\u8a8d \u2461 \u62e1\u5f35\u6a5f\u80fd/\u30b9\u30af\u30ea\u30d7\u30c8\u304cON\u304b\u78ba\u8a8d \u2462 \u30da\u30fc\u30b8\u3092\u518d\u8aad\u307f\u8fbc\u307f \u2463 \u300c\u304a\u3059\u3059\u3081\u300d\u30bf\u30d6\u304b\u78ba\u8a8d\uff08\u300c\u30d5\u30a9\u30ed\u30fc\u4e2d\u300d\u30bf\u30d6\u3067\u306f\u52b9\u679c\u306a\u3057\uff09'),
    ]

    for q, a in faqs:
        qa_block = []
        qa_block.append(Paragraph(f'<b>Q. {q}</b>', ParagraphStyle(
            'FAQ_Q', parent=body_style, fontName=jp_font_bold, fontSize=11, spaceBefore=10, spaceAfter=2,
            textColor=HexColor('#1a1a2e'),
        )))
        qa_block.append(Paragraph(f'A. {a}', ParagraphStyle(
            'FAQ_A', parent=body_style, fontName=jp_font, fontSize=10, spaceAfter=8,
            leftIndent=16, textColor=HexColor('#444'),
        )))
        story.append(KeepTogether(qa_block))

    # ━━━━━ PAGE: Uninstall ━━━━━
    story.append(Spacer(1, 20))
    story.append(Paragraph('\u30a2\u30f3\u30a4\u30f3\u30b9\u30c8\u30fc\u30eb\u65b9\u6cd5', h1_style))
    story.append(HRFlowable(width='100%', thickness=2, color=HexColor('#adb5bd')))
    story.append(Spacer(1, 8))

    uninstall_data = [
        [Paragraph('<b>\u74b0\u5883</b>', table_header_style), Paragraph('<b>\u624b\u9806</b>', table_header_style)],
        [Paragraph('Chrome / Edge', table_cell_style), Paragraph('chrome://extensions/ \u2192 \u300c\u524a\u9664\u300d\u30dc\u30bf\u30f3', table_cell_style)],
        [Paragraph('Firefox', table_cell_style), Paragraph('about:addons \u2192 \u300c...\u300d\u2192 \u300c\u524a\u9664\u300d', table_cell_style)],
        [Paragraph('Android', table_cell_style), Paragraph('Tampermonkey\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9 \u2192 \u30b4\u30df\u7bb1\u30a2\u30a4\u30b3\u30f3', table_cell_style)],
        [Paragraph('iPhone', table_cell_style), Paragraph('Userscripts\u30d5\u30a9\u30eb\u30c0\u304b\u3089\u30d5\u30a1\u30a4\u30eb\u3092\u524a\u9664', table_cell_style)],
    ]
    ut = Table(uninstall_data, colWidths=[page_width*0.25, page_width*0.75])
    ut.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#6c757d')),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f8f9fa')),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#dee2e6')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(ut)

    # Build
    doc.build(story)
    print(f'PDF generated: {output_path}')


if __name__ == '__main__':
    build_pdf()
