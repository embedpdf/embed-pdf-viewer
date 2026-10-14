"""Makes the one-page scans the redaction benchmark repeats into documents.

Each fixture is one letter page at 300 dpi (2550 x 3300 px) holding one picture,
as a scanner writes it:

  bw-ccitt.pdf    1-bit, CCITT G4         (office scanner, black-and-white mode)
  gray-jpeg.pdf   8-bit gray JPEG, q75     (scanner, gray mode)
  color-jpeg.pdf  RGB JPEG, q75            (colour scanner, phone scan)

lines.json holds the text lines on the page, in PDF points from the bottom left,
so the benchmark can put its marks over real text.

Needs Pillow and ImageMagick (`magick`). The fixtures are committed; run this only
to change them:  python3 make-fixtures.py
Then run make-jpx-fixtures.py to update the JPEG 2000 variants of these scans.
"""
import json
import os
import random
import subprocess
import tempfile

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fixtures")
DPI = 300
W, H = 2550, 3300
FONT = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"
WORDS = (
    "the of and to in is was for on that with as by at from his her this which or be an "
    "agreement party client invoice account number address date payment amount total "
    "confidential patient record claim reference policy employee salary contract signed"
).split()


def page_image(rng):
    """A page of 10 pt text with a scanner's blur, sensor noise, dust and skew."""
    font = ImageFont.truetype(FONT, 42)
    img = Image.new("L", (W, H), 245)
    draw = ImageDraw.Draw(img)
    lines = []
    y = 260
    while y < H - 260:
        words, x = [], 250
        while True:
            word = str(rng.randint(10000, 99999999)) if rng.random() < 0.08 else rng.choice(WORDS)
            width = draw.textlength(word + " ", font=font)
            if x + width > W - 250:
                break
            words.append(word)
            x += width
        text = " ".join(words)
        draw.text((250, y), text, font=font, fill=20)
        right = 250 + draw.textlength(text, font=font)
        to_pt = 72 / DPI
        lines.append([round(v, 2) for v in (250 * to_pt, (H - y - 52) * to_pt, right * to_pt, (H - y + 4) * to_pt)])
        y += 64 if rng.random() > 0.12 else 128
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img = ImageChops.add(img, Image.effect_noise((W, H), 2), scale=1.0, offset=-128)
    pixels = img.load()
    for _ in range(4000):
        pixels[rng.randrange(W), rng.randrange(H)] = 30
    return img.rotate(0.25, resample=Image.BICUBIC, fillcolor=245), lines


def main():
    os.makedirs(OUT, exist_ok=True)
    gray, lines = page_image(random.Random(7))
    with tempfile.TemporaryDirectory() as tmp:
        gray_png = os.path.join(tmp, "gray.png")
        gray.save(gray_png)
        color_png = os.path.join(tmp, "color.png")
        # Warm paper: a little more red, a little less blue.
        Image.merge("RGB", [gray.point(lambda v: min(255, v + 4)), gray,
                            gray.point(lambda v: max(0, v - 10))]).save(color_png)

        def magick(source, args, name):
            subprocess.run(["magick", "-density", str(DPI), source, *args, os.path.join(OUT, name)],
                           check=True)

        magick(gray_png, ["-threshold", "55%", "-type", "bilevel", "-compress", "Group4"], "bw-ccitt.pdf")
        magick(gray_png, ["-colorspace", "Gray", "-compress", "JPEG", "-quality", "75"], "gray-jpeg.pdf")
        magick(color_png, ["-compress", "JPEG", "-quality", "75"], "color-jpeg.pdf")
    with open(os.path.join(OUT, "lines.json"), "w") as f:
        json.dump({"page": [612, 792], "lines": lines}, f, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    main()
