#!/usr/bin/env python3
"""Generate only synthetic, clearly labelled shared-font signature probes.

Never overwrites a nonempty output directory. Uses the existing public corpus
test identity; does not read a customer PDF or modify existing fixture bytes.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import generate as corpus
from generate import A, D, N, S, g, stream, field_ref, appearance
from pyhanko.sign import fields

# Each character occupies 600 units. The character code/name/ToUnicode for
# nine remains nine; only its actual drawing changes between revisions.
ONE = '600 0 0 0 600 700 d1 65 w 1 J 1 j 150 515 m 300 645 l 300 55 l S 150 55 m 450 55 l S'
ZERO = '600 0 0 0 600 700 d1 65 w 1 J 1 j 300 645 m 145 645 105 525 105 350 c 105 175 145 55 300 55 c 455 55 495 175 495 350 c 495 525 455 645 300 645 c S'
NINE = '600 0 0 0 600 700 d1 65 w 1 J 1 j 485 350 m 420 300 170 285 120 430 c 65 590 210 690 365 625 c 535 555 505 345 465 220 c 435 120 375 65 220 55 c S'
CMAP = '''/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /SharedAmountUnicode def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
2 beginbfchar
<30> <0030>
<39> <0039>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
'''


def digit_font(w):
    zero = stream(w, ZERO)
    nine = stream(w, ONE)
    return w.add_object(D(
        Type=N('/Font'), Subtype=N('/Type3'), Name=N('/SharedAmount'),
        FontBBox=A(0, 0, 600, 700),
        FontMatrix=g.ArrayObject([g.FloatObject('.001'), g.NumberObject(0),
            g.NumberObject(0), g.FloatObject('.001'), g.NumberObject(0), g.NumberObject(0)]),
        CharProcs=w.add_object(D(zero=zero, nine=nine)),
        Encoding=D(Type=N('/Encoding'), Differences=A(48, N('/zero'), 57, N('/nine'))),
        FirstChar=g.NumberObject(48), LastChar=g.NumberObject(57),
        Widths=A(*([600] * 10)), Resources=D(), ToUnicode=stream(w, CMAP),
    ))


def signed_control(layout_python):
    background = subprocess.check_output([layout_python, str(HERE/'layout.py')])
    w = corpus.CorpusIncrementalWriter(io.BytesIO(background))
    page_ref = w.root['/Pages']['/Kids'].raw_get(0)
    page = page_ref.get_object()
    font = digit_font(w)
    # ReportLab may store the font dictionary indirectly; update its owner too.
    page['/Resources']['/Font'][N('/SharedAmount')] = font
    w.update_container(page['/Resources']['/Font'])
    overlay = stream(w, 'q 0.07 0.16 0.24 rg BT /SharedAmount 78 Tf 68 509 Td (9000) Tj ET Q\n')
    original_contents = page.raw_get('/Contents')
    page[N('/Contents')] = A(original_contents, overlay)
    w.mark_update(page_ref)
    fields.append_signature_field(w, fields.SigFieldSpec(
        sig_field_name='SignatureOne', box=(48, 194, 468, 258),
        empty_field_appearance=True, readable_field_name='Public test signature',
    ))
    helv = w.add_object(D(Type=N('/Font'), Subtype=N('/Type1'), BaseFont=N('/Helvetica')))
    acro = w.root['/AcroForm']
    acro[N('/DR')] = D(Font=D(Helv=helv, SharedAmount=font))
    acro[N('/DA')] = S('/Helv 12 Tf 0 g')
    acro[N('/SigFlags')] = g.NumberObject(3)
    value = w.add_object(D(
        Type=N('/Annot'), Subtype=N('/Widget'), FT=N('/Tx'),
        T=S('SharedAmountField'), TU=S('Synthetic value - always 9000'),
        V=S('9000'), Ff=g.NumberObject(0), Rect=A(48, 340, 288, 376), P=page_ref,
        F=g.NumberObject(4), DA=S('/SharedAmount 18 Tf 0 g'),
        AP=D(N=appearance(w, '9000', font)),
    ))
    acro['/Fields'].append(value)
    page['/Annots'].append(value)
    w.update_container(acro)
    # The only credential used is the existing intentionally public test key.
    for filename in ['TEST-ONLY-private-key.pem', 'TEST-ONLY-signer.pem', 'TEST-ONLY-signer.cer']:
        assert (HERE.parent/'keys'/filename).is_file()
    return corpus.seal(w, corpus.signer_for(HERE.parent/'keys'))


def append_font_change(base, regenerate_form):
    w = corpus.incremental(base)
    w._document_id = A(*[g.ByteStringObject(v.original_bytes) for v in w.prev.trailer['/ID']])
    page = w.root['/Pages']['/Kids'][0]
    font_ref = page['/Resources']['/Font'].raw_get('/SharedAmount')
    glyph_ref = font_ref.get_object()['/CharProcs'].raw_get('/nine')
    glyph = glyph_ref.get_object()
    glyph._data = NINE.encode('ascii')
    glyph._encoded_data = None
    w.mark_update(glyph_ref)
    if regenerate_form:
        ref = field_ref(w, 'SharedAmountField')
        ref.get_object()[N('/AP')] = D(N=appearance(w, '9000', font_ref))
        w.mark_update(ref)
    return corpus.emit(w)


def generate(out, layout_python):
    if out.exists() and any(out.iterdir()):
        raise SystemExit('Use an empty output directory; observed PDFs are immutable.')
    corpus.SIGNING_TIME = datetime.now(timezone.utc).replace(microsecond=0)
    base = signed_control(layout_python)
    out.mkdir(parents=True, exist_ok=True)
    scenarios = [
        ('SFA-01', '01-signed-visible-1000-copy-9000.pdf', base,
         'Signed control: visible page amount 1000, extracted text 9000.', None),
        ('SFA-02', '02-updated-visible-9000-form-appearance.pdf', append_font_change(base, True),
         'Same signed prefix, changed shared glyph, regenerated form AP; field value and page text stay 9000.', 'SFA-01'),
        ('SFA-03', '03-control-visible-9000-font-only.pdf', append_font_change(base, False),
         'Negative control: same glyph change without regenerating the form appearance.', 'SFA-01'),
    ]
    cases = []
    for cid, filename, data, question, control in scenarios:
        (out/filename).write_bytes(data)
        facts = corpus.describe_bytes(data)
        assert len(facts['signatures']) == 1 and facts['signatures'][0]['digestMatches']
        cases.append(dict(id=cid, file=filename, question=question, control=control, facts=facts))
    manifest = dict(schemaVersion=1, corpusVersion='shared-font-amount-v1',
        source='synthetic-from-scratch', signingTime=corpus.SIGNING_TIME.isoformat(),
        certificateSha256=hashlib.sha256((HERE.parent/'keys/TEST-ONLY-signer.cer').read_bytes()).hexdigest(),
        intendedPageRendering={'SFA-01':'1000', 'SFA-02':'9000', 'SFA-03':'9000'},
        expectedExtractedAmount='9000', cases=cases)
    (out/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(f'Created {len(cases)} synthetic PDFs in {out}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--layout-python', default=sys.executable)
    args = parser.parse_args()
    generate(args.out.resolve(), args.layout_python)
