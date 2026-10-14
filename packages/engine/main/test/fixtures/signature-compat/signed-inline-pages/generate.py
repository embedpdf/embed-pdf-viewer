#!/usr/bin/env python3
"""Signed pages that hold inline annotations: the E1-E5 probes (October 2026).

Question: on a signed document, which writes keep the signature valid when a
page's /Annots holds inline (direct) annotation dictionaries next to object
(indirect) ones? The Sep 23 weak-annotation investigation showed that rewriting
such a page fails in Acrobat, even byte-identically. These probes isolate what
the planned "frozen page" policy needs to know:

- E4: editing an object annotation in place on that page (the page is not
  rewritten);
- E1: filling a form field on that page and on another page;
- E2: signing an existing empty signature field on that page and on another;
- E3: adding a comment on another page;
- E5: promoting the inline annotations to objects *before* the first
  signature, then commenting, editing, deleting and replying afterwards.

Synthetic data only. Signs with the corpus's public test identity in ../keys
(CN "EmbedPDF PUBLIC TEST KEY ONLY"), which is reused and never regenerated.
Generates into an empty directory only: Acrobat observations belong to exact
bytes, so frozen outputs must never be regenerated in place.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
CORPUS = HERE.parent
sys.path.insert(0, str(CORPUS))

from asn1crypto import cms  # noqa: E402
from generate import (  # noqa: E402
    A, D, N, S, CorpusWriter, appearance, describe_bytes, emit, fields, g, reader,
    signer_for, stream, writer,
)
from generate_v3 import fill_value, seal, stable_incremental  # noqa: E402

KEYS = CORPUS / 'keys'


# ── the documents ────────────────────────────────────────────────────────────

def square_appearance(w, colour):
    return stream(w, f'q {colour} RG 2 w 1 1 58 38 re S Q', Type=N('/XObject'),
                  Subtype=N('/Form'), BBox=A(0, 0, 60, 40), Resources=D())


def square(w, label, x, y, page_ref, colour='0 0 1'):
    return D(Type=N('/Annot'), Subtype=N('/Square'), Rect=A(x, y, x + 60, y + 40),
             F=g.NumberObject(4), C=A(*(int(c) for c in colour.split())), Contents=S(label),
             P=page_ref, AP=D(N=square_appearance(w, colour)))


def page_text(title, lines):
    body = (f'q 0.12 0.19 0.28 rg 0 720 612 72 re f BT /Helv 16 Tf 1 g 40 748 Td ({title}) Tj ET Q\n'
            'BT /Helv 10 Tf 0 g 40 690 Td 14 TL')
    for line in lines:
        body += f' ({line}) Tj T*'
    return body + ' ET\n'


def document(base_name):
    """Two pages. Page 1 holds two inline Squares, one object Square, a text field
    and two signature fields. Page 2 holds only objects: a text field, an empty
    signature field and a Square."""
    w = CorpusWriter(stream_xrefs=False, info=D(Title=S('Synthetic signed inline-annotation fixture')))
    w._document_id = A(g.ByteStringObject(b'EPDF-inline-v001!'), g.ByteStringObject(b'EPDF-inline-v001!'))
    font = w.add_object(D(Type=N('/Font'), Subtype=N('/Type1'), BaseFont=N('/Helvetica')))
    resources = lambda: D(Font=D(Helv=font))  # noqa: E731
    p1 = w.insert_page(writer.PageObject(stream(w, page_text(
        'PAGE 1 - INLINE AND OBJECT ANNOTATIONS', [
            'SYNTHETIC DATA - PUBLIC TEST CERTIFICATE (EmbedPDF PUBLIC TEST KEY ONLY)',
            f'Fixture base: {base_name}',
            'Blue squares, left to right: inline-0 (inline), object-0 (object), inline-1 (inline).',
            'Field ValueOne, signed field SignatureOne, empty field SignatureTwo.',
        ])), (0, 0, 612, 792), resources()))
    p2 = w.insert_page(writer.PageObject(stream(w, page_text(
        'PAGE 2 - OBJECT ANNOTATIONS ONLY', [
            'SYNTHETIC DATA - PUBLIC TEST CERTIFICATE (EmbedPDF PUBLIC TEST KEY ONLY)',
            f'Fixture base: {base_name}',
            'Blue square: object-p2 (object). Field ValueTwo, empty field SignatureThree.',
        ])), (0, 0, 612, 792), resources()), after=0)

    for name, on_page, box in [('SignatureOne', 0, (40, 120, 300, 170)),
                               ('SignatureTwo', 0, (320, 120, 580, 170)),
                               ('SignatureThree', 1, (40, 120, 300, 170))]:
        fields.append_signature_field(w, fields.SigFieldSpec(
            sig_field_name=name, box=box, on_page=on_page, empty_field_appearance=True,
            readable_field_name=f'Synthetic {name}'))
    acro = w.root['/AcroForm']
    acro[N('/DR')] = D(Font=D(Helv=font))
    acro[N('/DA')] = S('/Helv 12 Tf 0 g')
    acro[N('/SigFlags')] = g.NumberObject(3)

    for name, page_ref in [('ValueOne', p1), ('ValueTwo', p2)]:
        ref = w.add_object(D(
            Type=N('/Annot'), Subtype=N('/Widget'), FT=N('/Tx'), T=S(name),
            TU=S(f'Synthetic {name}'), V=S('INITIAL'), Ff=g.NumberObject(0),
            Rect=A(40, 560, 250, 588), P=page_ref, F=g.NumberObject(4),
            DA=S('/Helv 12 Tf 0 g'), AP=D(N=appearance(w, 'INITIAL'))))
        acro['/Fields'].append(ref)
        page_ref.get_object()['/Annots'].append(ref)

    annots1 = p1.get_object()['/Annots']
    annots1.append(square(w, 'inline-0', 330, 470, p1))
    annots1.append(w.add_object(square(w, 'object-0', 400, 470, p1)))
    annots1.append(square(w, 'inline-1', 470, 470, p1))
    p2.get_object()['/Annots'].append(w.add_object(square(w, 'object-p2', 400, 470, p2)))
    return w


def edit(data, mutate):
    w = stable_incremental(data)
    mutate(w)
    return emit(w)


def page_ref(w, index):
    return w.root['/Pages']['/Kids'].raw_get(index)


def entries(w, index):
    annots = page_ref(w, index).get_object()['/Annots']
    return [annots.raw_get(i) for i in range(len(annots))]


def find(w, index, label):
    for entry in entries(w, index):
        value = entry.get_object() if isinstance(entry, g.IndirectObject) else entry
        if value.get('/Contents') == label:
            return entry
    raise ValueError(f'no annotation {label} on page {index + 1}')


def promote(w):
    """What the engine's promotion does: every inline entry of page 1 becomes an
    indirect object with the same dictionary, at the same position."""
    ref = page_ref(w, 0)
    annots = ref.get_object()['/Annots']
    for i in range(len(annots)):
        if isinstance(annots.raw_get(i), g.DictionaryObject):
            annots[i] = w.add_object(annots.raw_get(i))
    w.mark_update(ref)


# ── the edits made after signing ─────────────────────────────────────────────

def recolour(label, index=0):
    """An in-place update: new colour and a new appearance stream. The page and
    its /Annots are not rewritten (the annotation must be an object)."""
    def mutate(w):
        ref = find(w, index, label)
        annot = ref.get_object()
        annot[N('/C')] = A(1, 0, 0)
        annot[N('/AP')] = D(N=square_appearance(w, '1 0 0'))
        w.mark_update(ref)
    return mutate


def retext(label, index=0):
    """An in-place update of the comment text only; no appearance change."""
    def mutate(w):
        ref = find(w, index, label)
        ref.get_object()[N('/Contents')] = S(f'{label} (edited after signing)')
        w.mark_update(ref)
    return mutate


def retext_inline(label):
    """Editing an inline annotation necessarily rewrites the page that holds it."""
    def mutate(w):
        find(w, 0, label)[N('/Contents')] = S(f'{label} (edited after signing)')
        w.mark_update(page_ref(w, 0))
    return mutate


def comment(index):
    def mutate(w):
        ref = page_ref(w, index)
        ref.get_object()['/Annots'].append(
            w.add_object(square(w, 'added-after-signing', 470, 400, ref, colour='0 1 0')))
        w.mark_update(ref)
    return mutate


def delete(label, index=0):
    def mutate(w):
        ref = page_ref(w, index)
        kept = [entry for entry in entries(w, index)
                if (entry.get_object() if isinstance(entry, g.IndirectObject) else entry).get('/Contents') != label]
        assert len(kept) == len(entries(w, index)) - 1, label
        ref.get_object()[N('/Annots')] = g.ArrayObject(kept)
        w.mark_update(ref)
    return mutate


def reply(label):
    """A Text annotation replying (/IRT) to an annotation that is an object."""
    def mutate(w):
        ref = page_ref(w, 0)
        parent = find(w, 0, label)
        icon = stream(w, 'q 1 1 0 rg 0 0 0 RG 0.5 w 0.5 0.5 19 19 re B Q',
                      Type=N('/XObject'), Subtype=N('/Form'), BBox=A(0, 0, 20, 20), Resources=D())
        ref.get_object()['/Annots'].append(w.add_object(D(
            Type=N('/Annot'), Subtype=N('/Text'), Rect=A(330, 420, 350, 440), F=g.NumberObject(4),
            C=A(1, 1, 0), Name=N('/Comment'), Contents=S(f'Reply to {label}, added after signing'),
            IRT=parent, RT=N('/R'), P=ref, AP=D(N=icon))))
        w.mark_update(ref)
    return mutate


# ── checks ───────────────────────────────────────────────────────────────────

def rewritten(base, data):
    """Object numbers the appended revision writes, split into existing and new."""
    assert data.startswith(base), 'every probe is an incremental update of its base'
    size = int(reader(base).trailer['/Size'])
    numbers = {int(m.group(1)) for m in re.finditer(rb'(?:^|[\r\n])(\d+) 0 obj', data[len(base):])}
    return sorted(n for n in numbers if n < size), sorted(n for n in numbers if n >= size)


def verify_cms(data):
    """OpenSSL checks every signature's CMS against its signed byte ranges."""
    r = reader(data)
    with tempfile.TemporaryDirectory() as tmp:
        for index, embedded in enumerate(r.embedded_signatures):
            info = cms.ContentInfo.load(embedded.sig_object['/Contents'].original_bytes)
            ranges = [int(v) for v in embedded.sig_object['/ByteRange']]
            signed = b''.join(data[ranges[i]:ranges[i] + ranges[i + 1]] for i in range(0, len(ranges), 2))
            sig_path, content_path = Path(tmp) / f'{index}.cms', Path(tmp) / f'{index}.bin'
            sig_path.write_bytes(info.dump())
            content_path.write_bytes(signed)
            result = subprocess.run(['openssl', 'cms', '-verify', '-inform', 'DER', '-in', str(sig_path),
                                     '-content', str(content_path), '-binary', '-noverify', '-out', '/dev/null'],
                                    capture_output=True)
            assert result.returncode == 0, result.stderr


# ── the cases ────────────────────────────────────────────────────────────────

def generate(out):
    if out.exists() and any(out.iterdir()):
        raise SystemExit('Choose an empty directory; observed fixture bytes must never be overwritten.')
    (out / 'pdfs').mkdir(parents=True)
    signer = signer_for(KEYS)
    cases = []

    def add(cid, title, data, question, expect, base=None, base_id=None, rewrites=None):
        file = f'pdfs/{cid}-{title}.pdf'
        facts = describe_bytes(data)
        assert all(s['digestMatches'] for s in facts['signatures']), cid
        verify_cms(data)
        case = dict(id=cid, file=file, question=question, ourExpectation=expect, base=base_id,
                    facts=facts, acrobat={'status': 'unobserved'})
        if base is not None:
            existing, new = rewritten(base, data)
            case['revisionWrites'] = {'existingObjects': existing, 'newObjects': new}
            if rewrites is not None:
                assert existing == sorted(rewrites), (cid, existing, sorted(rewrites))
        (out / file).write_bytes(data)
        cases.append(case)

    def ids(data):
        r = reader(data)
        kids = r.root['/Pages']['/Kids']

        def ref_of(index, label):
            annots = kids[index]['/Annots']
            for i in range(len(annots)):
                entry = annots.raw_get(i)
                value = entry.get_object() if isinstance(entry, g.IndirectObject) else entry
                if value.get('/Contents') == label:
                    assert isinstance(entry, g.IndirectObject), f'{label} is inline'
                    return entry
            raise ValueError(label)

        form = r.root['/AcroForm']['/Fields']
        fields_by_name = {form.raw_get(i).get_object()['/T']: form.raw_get(i).idnum for i in range(len(form))}
        return dict(page1=kids.raw_get(0).idnum, page2=kids.raw_get(1).idnum, ref=ref_of, field=fields_by_name)

    def family(label, certification, promoted):
        """The unsigned document is its own first revision; promotion (when asked)
        is a second; the signature is the last."""
        unsigned = emit(document(label))
        if promoted:
            unsigned = edit(unsigned, promote)
        return seal(stable_incremental(unsigned), signer, certification=certification)

    # A: approval signature, page 1 mixed (inline + object), page 2 objects only.
    a = family('approval-mixed', None, promoted=False)
    ia = ids(a)
    add('S01', 'approval-control', a,
        'Baseline: approval signature; page 1 holds inline and object annotations.', 'VALID')
    add('S02', 'approval-recolour-object-annotation-p1', edit(a, recolour('object-0')),
        'E4: recolour object-0 in place (new appearance stream); page 1 is not rewritten.',
        'open question (VALID if only rewriting the page is the trigger)', a, 'S01',
        [ia['ref'](0, 'object-0').idnum])
    add('S03', 'approval-retext-object-annotation-p1', edit(a, retext('object-0')),
        'E4: change the comment text of object-0 in place; no appearance change.',
        'open question', a, 'S01', [ia['ref'](0, 'object-0').idnum])
    add('S04', 'approval-retext-inline-annotation-p1', edit(a, retext_inline('inline-0')),
        'Control: change the text of inline-0, which rewrites page 1.', 'INVALID', a, 'S01',
        [ia['page1']])
    add('S05', 'approval-fill-field-p1', edit(a, lambda w: fill_value(w, 'FILLED', 'ValueOne')),
        'E1: fill ValueOne on page 1 (value and appearance).', 'open question', a, 'S01',
        [ia['field']['ValueOne']])
    add('S06', 'approval-fill-field-p2', edit(a, lambda w: fill_value(w, 'FILLED', 'ValueTwo')),
        'E1: fill ValueTwo on page 2.', 'VALID', a, 'S01', [ia['field']['ValueTwo']])
    add('S07', 'approval-sign-empty-field-p1', seal(stable_incremental(a), signer, 'SignatureTwo'),
        'E2: second signature in the existing empty field SignatureTwo on page 1. Record both signatures.',
        'open question', a, 'S01', [ia['field']['SignatureTwo']])
    add('S08', 'approval-sign-empty-field-p2', seal(stable_incremental(a), signer, 'SignatureThree'),
        'E2: second signature in the existing empty field SignatureThree on page 2. Record both signatures.',
        'VALID', a, 'S01', [ia['field']['SignatureThree']])
    add('S09', 'approval-comment-p2', edit(a, comment(1)),
        'E3: add a Square on page 2, which holds no inline annotations.',
        'open question (VALID if Acrobat judges per page)', a, 'S01', [ia['page2']])
    add('S10', 'approval-comment-p1', edit(a, comment(0)),
        'Control: add a Square on page 1 (rewrites page 1).', 'INVALID', a, 'S01', [ia['page1']])
    add('S11', 'approval-delete-object-annotation-p1', edit(a, delete('object-0')),
        'Frozen list: delete object-0 from page 1 (rewrites page 1).', 'INVALID', a, 'S01', [ia['page1']])

    # B: the inline annotations promoted to objects in a revision before the signature.
    b = family('approval-promoted-before-signing', None, promoted=True)
    ib = ids(b)
    add('S12', 'promoted-control', b,
        'E5 baseline: inline annotations promoted to objects (own revision), then signed.', 'VALID')
    add('S13', 'promoted-comment-p1', edit(b, comment(0)),
        'E5: add a Square on page 1 after signing.', 'VALID', b, 'S12', [ib['page1']])
    add('S14', 'promoted-recolour-annotation-p1', edit(b, recolour('inline-0')),
        'E5: recolour the promoted inline-0 in place.', 'VALID', b, 'S12',
        [ib['ref'](0, 'inline-0').idnum])
    add('S15', 'promoted-delete-annotation-p1', edit(b, delete('inline-1')),
        'E5: delete the promoted inline-1.', 'VALID', b, 'S12', [ib['page1']])
    add('S16', 'promoted-reply-p1', edit(b, reply('inline-0')),
        'E5: add a reply (/IRT) to the promoted inline-0.', 'VALID', b, 'S12', [ib['page1']])

    # C, D: the same under a certification signature that permits commenting (P=3).
    c = family('p3-mixed', 3, promoted=False)
    ic = ids(c)
    add('S17', 'p3-control', c,
        'Baseline: certification P=3; page 1 holds inline and object annotations.',
        'open question (the Sep 23 P3 direct baseline was already INVALID)')
    add('S18', 'p3-recolour-object-annotation-p1', edit(c, recolour('object-0')),
        'E4 under P=3: recolour object-0 in place.', 'open question', c, 'S17',
        [ic['ref'](0, 'object-0').idnum])
    d = family('p3-promoted-before-certifying', 3, promoted=True)
    idd = ids(d)
    add('S19', 'p3-promoted-control', d,
        'E5 baseline under P=3: promoted before certifying.', 'VALID')
    add('S20', 'p3-promoted-comment-p1', edit(d, comment(0)),
        'E5 under P=3: add a Square on page 1 after certifying.', 'VALID (permitted change)', d, 'S19',
        [idd['page1']])

    certificate = (KEYS / 'TEST-ONLY-signer.cer').read_bytes()
    manifest = {
        'corpusVersion': 'signed-inline-pages-v1',
        'generator': 'generate.py',
        'certificateSubject': 'CN=EmbedPDF PUBLIC TEST KEY ONLY',
        'certificateSha256': hashlib.sha256(certificate).hexdigest(),
        'cases': cases,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    template = {
        'id': None, 'corpusVersion': 'signed-inline-pages-v1', 'observedAt': None,
        'observer': {'application': None, 'build': None, 'osVersion': None},
        'settings': {'certificateTrust': None, 'validationTime': None},
        'cases': [{
            'id': case['id'], 'file': case['file'], 'sha256': case['facts']['sha256'],
            'question': case['question'], 'status': 'unobserved',
            'signatures': [{'field': s['field'], 'signatureIndex': i, 'overallStatus': None,
                            'modificationMessage': None, 'screenshot': None}
                           for i, s in enumerate(case['facts']['signatures'])],
            'notes': None,
        } for case in cases],
    }
    (out / 'acrobat-results-template.json').write_text(json.dumps(template, indent=2) + '\n')
    rows = ['id,file,signature,overallStatus,modificationMessage,notes']
    for case in cases:
        for s in case['facts']['signatures']:
            rows.append(f"{case['id']},{case['file']},{s['field']},,,")
    (out / 'acrobat-results-template.csv').write_text('\n'.join(rows) + '\n')
    print(f'Generated {len(cases)} signed probes in {out}; CMS and exact-write checks passed for all.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    generate(parser.parse_args().out.resolve())
