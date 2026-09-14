#!/usr/bin/env python3
"""ReportLab background for the synthetic shared-font amount probe."""
import io
import sys

from reportlab.lib.colors import HexColor
from reportlab.pdfgen.canvas import Canvas


def background():
    output = io.BytesIO()
    c = Canvas(output, pagesize=(612, 792), pageCompression=0, invariant=1)
    c.setTitle('SYNTHETIC TEST ONLY - Shared font signature amount probe')
    c.setAuthor('EmbedPDF interoperability research')
    c.setFillColor(HexColor('#12283D'))
    c.rect(0, 684, 612, 108, fill=1, stroke=0)
    c.setFillColor(HexColor('#72DDD1'))
    c.setFont('Helvetica-Bold', 10)
    c.drawString(48, 751, 'SYNTHETIC SECURITY TEST - NO REAL AGREEMENT')
    c.setFillColor(HexColor('#FFFFFF'))
    c.setFont('Helvetica-Bold', 23)
    c.drawString(48, 718, 'One signature. A shared font.')
    c.setFillColor(HexColor('#263F53'))
    c.setFont('Helvetica', 11)
    c.drawString(48, 651, 'This document has no monetary or legal effect. All data is fictional.')
    c.drawString(48, 632, 'The signing identity is a deliberately public test certificate.')

    c.setFillColor(HexColor('#F0F5F7'))
    c.roundRect(48, 447, 516, 158, 12, fill=1, stroke=0)
    c.setFillColor(HexColor('#536C7D'))
    c.setFont('Helvetica-Bold', 10)
    c.drawString(68, 577, 'PAGE AMOUNT - VISUAL RENDERING')
    c.setFont('Helvetica', 10)
    c.drawString(68, 470, 'Select and copy the large amount: its text mapping is always 9000.')

    c.setFillColor(HexColor('#263F53'))
    c.setFont('Helvetica-Bold', 11)
    c.drawString(48, 410, 'Form field sharing the same font')
    c.setFont('Helvetica', 10)
    c.drawString(48, 392, 'Its stored value stays 9000. A viewer may regenerate its appearance.')
    c.setFont('Helvetica-Bold', 11)
    c.drawString(48, 294, 'Original approval signature')
    c.setFont('Helvetica', 10)
    c.drawString(48, 276, 'Inspect Signature Properties and View Signed Version separately.')
    c.setStrokeColor(HexColor('#9DB0BB'))
    c.rect(48, 194, 420, 64, fill=0, stroke=1)

    c.setFont('Helvetica', 10)
    c.setFillColor(HexColor('#536C7D'))
    c.drawString(48, 152, 'Research question: can a later form appearance update change this')
    c.drawString(48, 136, 'signed page amount while the validator still accepts the signature?')
    c.setStrokeColor(HexColor('#D7E0E6'))
    c.line(48, 98, 564, 98)
    c.setFont('Helvetica-Bold', 9)
    c.drawString(48, 79, 'TEST FIXTURE ONLY - NOT A CONTRACT, INVOICE OR PAYMENT REQUEST')
    c.setFont('Helvetica', 9)
    c.drawString(48, 62, 'Shared-font amount series v1 | No JavaScript, network actions or customer data')
    c.showPage()
    c.save()
    return output.getvalue()


if __name__ == '__main__':
    sys.stdout.buffer.write(background())
