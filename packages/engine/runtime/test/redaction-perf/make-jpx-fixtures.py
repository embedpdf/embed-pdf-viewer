"""Makes JPEG 2000 scans from the committed synthetic JPEG scan fixtures.

The source rasters retain the same text, noise, skew and lines.json coordinates.
Each output is one letter page at 300 dpi with one /JPXDecode image: 8-bit gray
or RGB, lossy wavelet compression at a target 20:1 ratio. No fonts or external
documents are needed. Needs Pillow with OpenJPEG support and pypdf:

    python3 make-jpx-fixtures.py
"""

from io import BytesIO
from pathlib import Path

from PIL import features
from pypdf import PdfReader

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def write_scan(image, destination):
    encoded = BytesIO()
    image.save(encoded, format="JPEG2000", irreversible=True,
               quality_mode="rates", quality_layers=[20], num_resolutions=6,
               mct=image.mode == "RGB")
    pixels = encoded.getvalue()
    color_space = "DeviceGray" if image.mode == "L" else "DeviceRGB"
    content = b"q\n612 0 0 792 0 0 cm\n/Scan Do\nQ\n"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
         b"/Resources << /XObject << /Scan 4 0 R >> >> /Contents 5 0 R >>"),
        (f"<< /Type /XObject /Subtype /Image /Width {image.width} "
         f"/Height {image.height} /ColorSpace /{color_space} "
         f"/BitsPerComponent 8 /Filter /JPXDecode /Length {len(pixels)} >>\n"
         .encode("ascii") + b"stream\n" + pixels + b"\nendstream"),
        (f"<< /Length {len(content)} >>\n".encode("ascii")
         + b"stream\n" + content + b"endstream"),
    ]
    document = BytesIO()
    document.write(b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(document.tell())
        document.write(f"{index} 0 obj\n".encode("ascii") + body + b"\nendobj\n")
    xref = document.tell()
    document.write(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        document.write(f"{offset:010d} 00000 n \n".encode("ascii"))
    document.write((f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\n"
                    f"startxref\n{xref}\n%%EOF\n").encode("ascii"))
    destination.write_bytes(document.getvalue())


def main():
    if not features.check_codec("jpg_2000"):
        raise RuntimeError("Pillow needs OpenJPEG support to write the JPEG 2000 fixtures")
    for kind, mode in (("gray", "L"), ("color", "RGB")):
        source = PdfReader(FIXTURES / f"{kind}-jpeg.pdf", strict=True)
        page = source.pages[0]
        if (len(source.pages) != 1 or list(page.mediabox) != [0, 0, 612, 792]
                or len(page.images) != 1):
            raise ValueError(f"{kind}-jpeg.pdf must be a single letter page with one scan")
        image = page.images[0].image
        if image.mode != mode or image.size != (2550, 3300):
            raise ValueError(f"{kind}-jpeg.pdf must contain a 300 dpi {mode} scan")
        write_scan(image, FIXTURES / f"{kind}-jpx.pdf")


if __name__ == "__main__":
    main()
