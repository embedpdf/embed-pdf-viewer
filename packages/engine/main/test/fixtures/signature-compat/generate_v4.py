#!/usr/bin/env python3
"""v4 probes: a new appearance on an unsigned signature field after a signature.

Never reads private PDFs or writes v1-v3. Incremental mutations preserve ID[1].
Generate into an empty candidate directory, verify, then freeze those bytes.

Each probe gives a signature field a new appearance in a revision after the
first signature, without signing it: its field (or its separate widget) changes
/AP and nothing else, and the drawing is all new objects. Two drawings:

- wrapper: what EmbedPDF writes for a picture drawn into a signature field
  (`doc.forms.setSignatureAppearance()`): an outer form XObject that places an
  inner form XObject, `/EPDFWRAP`, which paints an image through an ExtGState.
- plain: one form XObject with a vector stroke, as any writer might draw.

The negative control gives the signed field the same drawing.
"""
import argparse
import hashlib
import json
from pathlib import Path

from generate import A, D, HERE, N, SIGNING_TIME, describe_bytes, field_ref, g, signer_for
from generate_v2 import page_of
from generate_v3 import edit, fresh, seal

UNSIGNED = 'SignatureTwo'
SIGNED = 'SignatureOne'
# The picture: 30 x 10 pixels in three vertical bands (red, green, blue).
IMAGE_WIDTH, IMAGE_HEIGHT = 30, 10
BANDS = [(220, 40, 40), (40, 160, 70), (40, 70, 200)]


def flate_stream(w, data, **entries):
    obj = g.StreamObject(D(**entries), stream_data=data)
    obj.compress()
    return w.add_object(obj)


def band_pixels():
    row = b''.join(bytes(BANDS[x * len(BANDS) // IMAGE_WIDTH]) for x in range(IMAGE_WIDTH))
    return row * IMAGE_HEIGHT


def widget_ref_of(w, name):
    ref = field_ref(w, name)
    field = ref.get_object()
    return field['/Kids'].raw_get(0) if '/Kids' in field else ref


def widget_size(w, name):
    rect = [float(v) for v in widget_ref_of(w, name).get_object()['/Rect']]
    return abs(rect[2] - rect[0]), abs(rect[3] - rect[1])


def wrapper_drawing(w, width, height):
    """EmbedPDF's layout: the picture fitted with `contain`, centred in the box."""
    image = flate_stream(w, band_pixels(), Type=N('/XObject'), Subtype=N('/Image'),
                         Width=g.NumberObject(IMAGE_WIDTH), Height=g.NumberObject(IMAGE_HEIGHT),
                         ColorSpace=N('/DeviceRGB'), BitsPerComponent=g.NumberObject(8))
    state = w.add_object(D(BM=N('/Normal'), CA=g.NumberObject(1), ca=g.NumberObject(1)))
    inner = flate_stream(
        w, f'q\n1 w 0 J 0 j\n/FXE1 gs q {IMAGE_WIDTH} 0 0 {IMAGE_HEIGHT} 0 0 cm /FXX1 Do Q\nQ\n'.encode(),
        Type=N('/XObject'), Subtype=N('/Form'), BBox=A(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT),
        Resources=D(ExtGState=D(FXE1=state), XObject=D(FXX1=image)))
    scale = min(width / IMAGE_WIDTH, height / IMAGE_HEIGHT)
    tx = (width - IMAGE_WIDTH * scale) / 2
    ty = (height - IMAGE_HEIGHT * scale) / 2
    return flate_stream(
        w, f'q {scale:g} 0 0 {scale:g} {tx:g} {ty:g} cm /EPDFWRAP Do Q'.encode(),
        Type=N('/XObject'), Subtype=N('/Form'), BBox=A(0, 0, int(width), int(height)),
        EPDFOrigContentRect=A(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT), Group=D(S=N('/Transparency')),
        Resources=D(XObject=D(EPDFWRAP=inner)))


def plain_drawing(w, width, height):
    points = ' '.join(f'{x} {45 if i % 2 == 0 else 15} l' for i, x in enumerate(range(60, 280, 40)))
    data = f'q 0 0 0.55 RG 2 w 1 J 1 j 20 15 m {points} S Q'.encode()
    return w.add_object(g.StreamObject(D(Type=N('/XObject'), Subtype=N('/Form'),
                                         BBox=A(0, 0, int(width), int(height)), Resources=D()),
                                       stream_data=data))


def draw_into(name, drawing):
    """The field's own widget (merged or separate) gets /AP << /N new >>; nothing else changes."""
    def mutate(w):
        widget_ref = widget_ref_of(w, name)
        widget_ref.get_object()[N('/AP')] = D(N=drawing(w, *widget_size(w, name)))
        w.mark_update(widget_ref)
    return mutate


def separate_widget(w, name):
    """Split a merged field into a field and one /Kids widget, as fresh(separate=True) does for SignatureOne."""
    ref = field_ref(w, name)
    parent = ref.get_object()
    widget = D(Parent=ref)
    for key in ('/Type', '/Subtype', '/Rect', '/P', '/F', '/AP'):
        if key in parent:
            widget[N(key)] = parent.raw_get(key)
            del parent[N(key)]
    widget_ref = w.add_object(widget)
    parent[N('/Kids')] = A(widget_ref)
    annots = page_of(w)['/Annots']
    for index, existing in enumerate(annots):
        if existing.idnum == ref.idnum:
            annots[index] = widget_ref


def unsigned_base(profile='approval', separate=False, without_appearance=False):
    w = fresh(profile=profile)
    if without_appearance:
        del field_ref(w, UNSIGNED).get_object()[N('/AP')]
    if separate:
        separate_widget(w, UNSIGNED)
    return w


def generate(out):
    if out.exists() and any(out.iterdir()):
        raise SystemExit('Choose an empty directory; frozen corpus bytes must never be overwritten.')
    out.mkdir(parents=True, exist_ok=True)
    signer = signer_for(HERE / 'keys')
    cases = []

    def add(cid, title, data, question, control=None, profile='approval', **extra):
        file = f'{cid}-{title}.pdf'
        (out / file).write_bytes(data)
        facts = describe_bytes(data)
        assert all(s['digestMatches'] for s in facts['signatures']), cid
        cases.append(dict(id=cid, file=file, question=question, control=control,
                          profile=profile, facts=facts, acrobat={'status': 'unobserved'}, **extra))

    base = seal(unsigned_base(), signer)
    add('92', 'approval-control', base,
        'Unchanged approval signature; SignatureTwo is unsigned and keeps its empty appearance.')
    add('93', 'approval-unsigned-wrapper-appearance', edit(base, draw_into(UNSIGNED, wrapper_drawing)),
        'Is EmbedPDF\'s wrapper drawing as a new appearance on the unsigned SignatureTwo accepted?', '92',
        appearanceProbe={'field': UNSIGNED, 'drawing': 'wrapper', 'widget': 'merged'})
    add('94', 'approval-unsigned-plain-appearance', edit(base, draw_into(UNSIGNED, plain_drawing)),
        'Is a plain vector drawing as a new appearance on the unsigned SignatureTwo accepted?', '92',
        appearanceProbe={'field': UNSIGNED, 'drawing': 'plain', 'widget': 'merged'})
    add('95', 'approval-signed-field-wrapper-appearance', edit(base, draw_into(SIGNED, wrapper_drawing)),
        'Negative control: is the same new appearance on the signed SignatureOne rejected?', '92',
        appearanceProbe={'field': SIGNED, 'drawing': 'wrapper', 'widget': 'merged'})

    bare = seal(unsigned_base(without_appearance=True), signer)
    add('96', 'approval-no-appearance-control', bare,
        'Unchanged approval signature; SignatureTwo is unsigned and has no /AP at all.')
    add('97', 'approval-unsigned-appearance-added', edit(bare, draw_into(UNSIGNED, wrapper_drawing)),
        'Is a first appearance (/AP added where there was none) on the unsigned SignatureTwo accepted?', '96',
        appearanceProbe={'field': UNSIGNED, 'drawing': 'wrapper', 'widget': 'merged'})

    split = seal(unsigned_base(separate=True), signer)
    add('98', 'approval-separate-widget-control', split,
        'Unchanged approval signature; the unsigned SignatureTwo has a separate /Kids widget.')
    add('99', 'approval-unsigned-separate-widget-appearance', edit(split, draw_into(UNSIGNED, wrapper_drawing)),
        'Is a new appearance on the separate widget of the unsigned SignatureTwo accepted (field untouched)?', '98',
        appearanceProbe={'field': UNSIGNED, 'drawing': 'wrapper', 'widget': 'separate'})

    p2 = seal(unsigned_base(profile='DocMDP-P2'), signer, certification=2)
    add('100', 'p2-control', p2, 'Unchanged P2 certification; SignatureTwo is unsigned.', profile='DocMDP-P2')
    add('101', 'p2-unsigned-wrapper-appearance', edit(p2, draw_into(UNSIGNED, wrapper_drawing)),
        'Under P2, is the wrapper drawing as a new appearance on the unsigned SignatureTwo accepted?', '100',
        profile='DocMDP-P2', appearanceProbe={'field': UNSIGNED, 'drawing': 'wrapper', 'widget': 'merged'})
    add('102', 'p2-unsigned-plain-appearance', edit(p2, draw_into(UNSIGNED, plain_drawing)),
        'Under P2, is a plain drawing as a new appearance on the unsigned SignatureTwo accepted?', '100',
        profile='DocMDP-P2', appearanceProbe={'field': UNSIGNED, 'drawing': 'plain', 'widget': 'merged'})

    cases.sort(key=lambda c: int(c['id']))
    assert [c['id'] for c in cases] == [str(i) for i in range(92, 103)]
    manifest = dict(schemaVersion=1, corpusVersion='role-probes-v4', source='synthetic-from-scratch',
        generator=dict(pyhanko='0.37.0', cryptography='50.0.1', signingTime=SIGNING_TIME.isoformat()),
        certificateSha256=hashlib.sha256((HERE / 'keys/TEST-ONLY-signer.cer').read_bytes()).hexdigest(),
        cases=cases)
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Generated {len(cases)} probes and controls in {out}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    generate(parser.parse_args().out.resolve())
