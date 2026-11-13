#!/usr/bin/env python3
"""Generate the DB Monitor app logo in Soft Day theme (terracotta/cream).

Creates:
- assets/images/app_logo.png        (1024x1024, rounded-square source)
- android mipmap-*/ic_launcher.png  (legacy launcher icons)
- mipmap-*/ic_launcher_round.png    (round launcher icons)
- mipmap-*/ic_launcher_foreground.png (adaptive foreground, safe zone)
- values/ic_launcher_background.xml  (adaptive background color)
- drawable/ic_notification.png      (white status-bar small icon)
"""
from PIL import Image, ImageDraw
import os

ROOT = "/home/z/my-project/app"
A = "/home/z/my-project/app/android/app/src/main/res"

# Soft Day palette
CARD = (248, 244, 238, 255)      # #F8F4EE
ACCENT = (192, 104, 79, 255)     # #C0684F terracotta
ACCENT_DARK = (184, 92, 66, 255) # #B85C42
HEADING = (46, 42, 38, 255)      # #2E2A26 charcoal

SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
FG_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def make_logo(size=1024):
    """Main logo: cream rounded card, stacked terracotta DB cylinders,
    charcoal monitor pulse line over them."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 1024.0

    # background card
    d.rounded_rectangle((int(28*s), int(28*s), int(996*s), int(996*s)),
                        radius=int(220*s), fill=CARD)
    d.rounded_rectangle((int(28*s), int(28*s), int(996*s), int(996*s)),
                        radius=int(220*s),
                        outline=(232, 224, 214, 255), width=int(6*s))

    # database stack (3 cylinders)
    cx = size / 2
    db_w = int(460*s)
    db_h = int(120*s)
    top_y = int(250*s)
    gap = int(78*s)
    body_l = cx - db_w/2
    body_r = cx + db_w/2

    d.rounded_rectangle(
        (body_l, top_y + db_h//2,
         body_r, top_y + db_h + gap + db_h + gap + db_h//2),
        radius=int(db_h/2), fill=ACCENT)
    d.ellipse((body_l, top_y, body_r, top_y + db_h), fill=ACCENT_DARK)
    for i in (1, 2):
        y = top_y + db_h//2 + i*(db_h + gap) - db_h//2
        d.ellipse((body_l, y, body_r, y + db_h),
                  outline=ACCENT_DARK, width=max(2, int(10*s)))

    # monitor pulse line
    line_y = int(760*s)
    lw = int(30*s)
    pts = [
        (int(200*s), line_y), (int(360*s), line_y),
        (int(430*s), line_y - int(90*s)), (int(520*s), line_y + int(80*s)),
        (int(600*s), line_y - int(60*s)), (int(660*s), line_y),
        (int(830*s), line_y),
    ]
    d.line(pts, fill=HEADING, width=lw, joint="curve")
    r = lw/2
    d.ellipse((pts[0][0]-r, pts[0][1]-r, pts[0][0]+r, pts[0][1]+r), fill=HEADING)
    d.ellipse((pts[-1][0]-r, pts[-1][1]-r, pts[-1][0]+r, pts[-1][1]+r), fill=HEADING)
    return img


def paste_on_square(src, size, bg=CARD, radius_ratio=0.24):
    img = Image.new("RGBA", (size, size), bg)
    art = src.resize((int(size*0.82), int(size*0.82)), Image.LANCZOS)
    off = (size - art.width)//2
    img.alpha_composite(art, (off, off))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size-1, size-1),
                                           radius=int(size*radius_ratio), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def make_foreground(size):
    """Adaptive icon foreground: art on TRANSPARENT background inside the
    66% safe zone."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 432.0
    cx = size/2
    db_w = int(300*s)
    db_h = int(84*s)
    top_y = int(96*s)
    gap = int(52*s)
    body_l = cx - db_w/2
    body_r = cx + db_w/2

    d.rounded_rectangle(
        (body_l, top_y + db_h//2,
         body_r, top_y + db_h + gap + db_h + gap + db_h//2),
        radius=int(db_h/2), fill=ACCENT)
    d.ellipse((body_l, top_y, body_r, top_y + db_h), fill=ACCENT_DARK)
    for i in (1, 2):
        y = top_y + db_h//2 + i*(db_h + gap) - db_h//2
        d.ellipse((body_l, y, body_r, y + db_h),
                  outline=ACCENT_DARK, width=max(2, int(8*s)))

    line_y = int(330*s)
    lw = int(22*s)
    pts = [
        (int(96*s), line_y), (int(190*s), line_y),
        (int(238*s), line_y - int(62*s)), (int(292*s), line_y + int(56*s)),
        (int(340*s), line_y - int(44*s)), (int(380*s), line_y),
        (int(432*s), line_y),
    ]
    d.line(pts, fill=HEADING, width=lw, joint="curve")
    r = lw/2
    d.ellipse((pts[0][0]-r, pts[0][1]-r, pts[0][0]+r, pts[0][1]+r), fill=HEADING)
    d.ellipse((pts[-1][0]-r, pts[-1][1]-r, pts[-1][0]+r, pts[-1][1]+r), fill=HEADING)
    return img


def make_notification_icon(size=96):
    """White alpha-only small icon for the status bar."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size/96.0
    cx = size/2
    db_w = int(56*s)
    db_h = int(16*s)
    top_y = int(18*s)
    gap = int(12*s)
    body_l = cx - db_w/2
    body_r = cx + db_w/2

    d.rounded_rectangle(
        (body_l, top_y + db_h//2,
         body_r, top_y + db_h + gap + db_h + gap + db_h//2),
        radius=int(db_h/2), fill=(255, 255, 255, 255))
    d.ellipse((body_l, top_y, body_r, top_y + db_h), fill=(255, 255, 255, 255))

    line_y = int(72*s)
    lw = int(8*s)
    pts = [
        (int(18*s), line_y), (int(38*s), line_y),
        (int(46*s), line_y - int(12*s)), (int(54*s), line_y + int(10*s)),
        (int(60*s), line_y - int(8*s)), (int(66*s), line_y),
        (int(78*s), line_y),
    ]
    d.line(pts, fill=(255, 255, 255, 255), width=lw, joint="curve")
    r = lw/2
    d.ellipse((pts[0][0]-r, pts[0][1]-r, pts[0][0]+r, pts[0][1]+r),
              fill=(255, 255, 255, 255))
    d.ellipse((pts[-1][0]-r, pts[-1][1]-r, pts[-1][0]+r, pts[-1][1]+r),
              fill=(255, 255, 255, 255))
    return img


os.makedirs(f"{ROOT}/assets/images", exist_ok=True)
master = make_logo(1024)
master.save(f"{ROOT}/assets/images/app_logo.png")

for dpi, sz in SIZES.items():
    os.makedirs(f"{A}/{dpi}", exist_ok=True)
    paste_on_square(master, sz).save(f"{A}/{dpi}/ic_launcher.png")
    # round icon
    circ = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    sq = Image.new("RGBA", (sz, sz), CARD)
    art = master.resize((int(sz*0.80), int(sz*0.80)), Image.LANCZOS)
    off = (sz - art.width)//2
    sq.alpha_composite(art, (off, off))
    mask = Image.new("L", (sz, sz), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, sz-1, sz-1), fill=255)
    circ.paste(sq, (0, 0), mask)
    circ.save(f"{A}/{dpi}/ic_launcher_round.png")

for dpi, sz in FG_SIZES.items():
    make_foreground(sz).save(f"{A}/{dpi}/ic_launcher_foreground.png")

make_notification_icon().save(f"{A}/drawable/ic_notification.png")

os.makedirs(f"{A}/mipmap-anydpi-v26", exist_ok=True)
for name in ("ic_launcher", "ic_launcher_round"):
    with open(f"{A}/mipmap-anydpi-v26/{name}.xml", "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background"/>\n'
                '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
                '</adaptive-icon>\n')

# verify none are blank
for rel in [f"{ROOT}/assets/images/app_logo.png",
            f"{A}/mipmap-xxxhdpi/ic_launcher.png",
            f"{A}/drawable/ic_notification.png"]:
    im = Image.open(rel).convert("RGBA")
    alpha = im.getchannel("A")
    nonblank = sum(1 for p in alpha.getdata() if p > 8)
    print(rel.split("/app/")[-1], im.size, "nonblank px:", nonblank)
print("LOGO DONE")
