#!/usr/bin/env python3
"""Decision-blocking v3 probes. Never reads private PDFs or writes v1/v2.

Incremental mutations preserve ID[1] unless the case explicitly changes it.
Generate into an empty candidate directory, verify, then freeze those bytes.
"""
import argparse
import asyncio
import hashlib
import io
import json
import re
from pathlib import Path

from generate import (
    A, D, HERE, N, S, SIGNING_TIME, appearance, describe_bytes, emit,
    field_edit, field_ref, fields, g, incremental, raw_body, reader, roles,
    signer_for, stream, type3_font,
)
from generate_v2 import document, page_of, rewrite_glyph
from pyhanko.sign.signers.pdf_byterange import SignatureObject
from pyhanko.sign.signers.pdf_cms import PdfCMSSignedAttributes


def stable_incremental(data):
    w = incremental(data)
    w._document_id = g.ArrayObject([
        g.ByteStringObject(value.original_bytes) for value in w.prev.trailer['/ID']
    ])
    return w


def edit(data, fn):
    w = stable_incremental(data)
    fn(w)
    return emit(w)


def fresh(profile='approval', separate=False, square=False, shared_locked=False):
    w = document(profile=profile, square=square)
    for name in ('ValueOne', 'ValueTwo'):
        field_ref(w, name).get_object()[N('/Ff')] = g.NumberObject(0)
    if separate:
        ref = field_ref(w, 'SignatureOne')
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
    if shared_locked:
        font = type3_font(w)
        w.root['/AcroForm']['/DR']['/Font'][N('/Shared')] = font
        for name in ('ValueOne', 'ValueTwo'):
            field = field_ref(w, name).get_object()
            field[N('/V')] = S('A')
            field[N('/DA')] = S('/Shared 12 Tf 0 g')
            field[N('/AP')] = D(N=appearance(w, 'A', font))
    return w


def seal(w, signer, name='SignatureOne', certification=None, lock=None, tooltip=False):
    """Independent low-level signer; appearance belongs to the actual widget."""
    ref = field_ref(w, name)
    field = ref.get_object()
    sig = SignatureObject(timestamp=SIGNING_TIME, subfilter=fields.SigSeedSubFilter.PADES,
                          reason='Synthetic interoperability fixture', bytes_reserved=16384)
    sig_ref = w.add_object(sig)
    field[N('/V')] = sig_ref
    widget_ref = field['/Kids'].raw_get(0) if '/Kids' in field else ref
    widget_ref.get_object()[N('/AP')] = D(N=appearance(w, 'PUBLIC TEST SIGNATURE'))
    w.mark_update(widget_ref)
    if tooltip:
        field[N('/TU')] = S('Synthetic tooltip changed when signing')
    references = []
    root_link = g.IndirectObject(w.root_ref.idnum, w.root_ref.generation, w)
    if certification is not None:
        references.append(D(Type=N('/SigRef'), TransformMethod=N('/DocMDP'), Data=root_link,
                            TransformParams=D(Type=N('/TransformParams'), P=g.NumberObject(certification), V=N('/1.2'))))
        w.root[N('/Perms')] = D(DocMDP=sig_ref)
        w.update_root()
    if lock:
        spec = fields.FieldMDPSpec(fields.FieldMDPAction.INCLUDE, lock)
        field[N('/Lock')] = spec.as_sig_field_lock()
        references.append(D(Type=N('/SigRef'), TransformMethod=N('/FieldMDP'), Data=root_link,
                            TransformParams=spec.as_transform_params()))
    if references:
        sig[N('/Reference')] = A(*references)
    w.mark_update(ref)
    out = io.BytesIO()
    job = sig.fill(w, 'sha256', output=out)
    digest, _ = next(job)
    cms = asyncio.run(signer.async_sign(digest.document_digest, 'sha256', use_pades=True,
        signed_attr_settings=PdfCMSSignedAttributes(signing_time=SIGNING_TIME)))
    job.send(cms)
    job.close()
    return out.getvalue()


def append_revision(data, objects, size_extra=0, change_id=False):
    r = reader(data)
    trailer = r.trailer.flatten()
    previous = int(re.findall(rb'startxref\s+(\d+)', data)[-1])
    out = io.BytesIO(data)
    out.seek(0, 2)
    offsets = {}
    for num, body in sorted(objects.items()):
        offsets[num] = out.tell()
        out.write(f'{num} 0 obj\n'.encode() + body + b'\nendobj\n')
    start = out.tell()
    out.write(b'xref\n')
    for num, offset in offsets.items():
        out.write(f'{num} 1\n{offset:010} 00000 n \n'.encode())
    trailer[N('/Prev')] = g.NumberObject(previous)
    trailer[N('/Size')] = g.NumberObject(max(int(trailer['/Size']), max(objects) + 1) + size_extra)
    if change_id:
        trailer[N('/ID')] = A(g.ByteStringObject(r.trailer['/ID'][0].original_bytes),
                              g.ByteStringObject(b'V3-CHANGED-ID-01!'))
    out.write(b'trailer\n')
    trailer.write_to_stream(out)
    out.write(f'\nstartxref\n{start}\n%%EOF\n'.encode())
    return out.getvalue()


def reordered_body(obj):
    out = io.BytesIO()
    out.write(b'<<\n\t')
    for key in reversed(list(obj.keys())):
        key.write_to_stream(out)
        out.write(b'\t  ')
        obj.raw_get(key).write_to_stream(out)
        out.write(b'\n   ')
    out.write(b'>>')
    return out.getvalue()


def regenerate_appearance(w, name='ValueOne'):
    field = field_ref(w, name).get_object()
    ap_ref = field['/AP'].raw_get('/N')
    ap = ap_ref.get_object()
    ap._data = ap.data + b'\n% regenerated appearance, same logical value and drawing\n'
    ap._encoded_data = None
    w.mark_update(ap_ref)


def fill_value(w, value='CHANGED', name='ValueOne'):
    field = field_ref(w, name).get_object()
    field[N('/V')] = S(value)
    field[N('/AP')] = D(N=appearance(w, value))
    w.mark_update(field_ref(w, name))


def add_text_field(w):
    page_ref = w.root['/Pages']['/Kids'].raw_get(0)
    ref = w.add_object(D(Type=N('/Annot'), Subtype=N('/Widget'), FT=N('/Tx'),
        T=S('ValueThree'), TU=S('Synthetic added field'), V=S('NEW FIELD'),
        Rect=A(365, 600, 575, 628), P=page_ref, F=g.NumberObject(4),
        DA=S('/Helv 12 Tf 0 g'), AP=D(N=appearance(w, 'NEW FIELD'))))
    w.root['/AcroForm']['/Fields'].append(ref)
    w.update_container(w.root['/AcroForm'])
    page_of(w)['/Annots'].append(ref)
    w.mark_update(page_ref)


def delete_text_field(w):
    removed = field_ref(w, 'ValueTwo').idnum
    acro = w.root['/AcroForm']
    acro[N('/Fields')] = A(*[ref for ref in acro['/Fields'] if ref.idnum != removed])
    page = page_of(w)
    page[N('/Annots')] = A(*[ref for ref in page['/Annots'] if ref.idnum != removed])
    w.update_container(acro)
    w.mark_update(w.root['/Pages']['/Kids'].raw_get(0))


def square_appearance(w, red=False):
    colour = '1 0 0' if red else '0 0 1'
    return stream(w, f'q {colour} RG 1 w 0.5 0.5 84 49 re S Q',
                  Type=N('/XObject'), Subtype=N('/Form'), BBox=A(0, 0, 85, 50), Resources=D())


def square_edit(w, operation):
    page_ref = w.root['/Pages']['/Kids'].raw_get(0)
    page = page_ref.get_object()
    if operation == 'add':
        ref = w.add_object(D(Type=N('/Annot'), Subtype=N('/Square'), Rect=A(395, 500, 480, 550),
            F=g.NumberObject(4), C=A(0, 0, 1), Contents=S('Synthetic added annotation'),
            P=page_ref, AP=D(N=square_appearance(w))))
        page['/Annots'].append(ref)
        w.mark_update(page_ref)
    else:
        ref = next(a for a in page['/Annots'] if a.get_object()['/Subtype'] == '/Square')
        if operation == 'delete':
            page[N('/Annots')] = A(*[a for a in page['/Annots'] if a.idnum != ref.idnum])
            w.mark_update(page_ref)
        else:
            annot = ref.get_object()
            annot[N('/C')] = A(1, 0, 0)
            annot[N('/AP')] = D(N=square_appearance(w, red=True))
            w.mark_update(ref)


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

    base = seal(fresh(), signer)
    add('53', 'approval-control', base, 'Unchanged merged-widget approval control.')
    ids = roles(base)
    pair = {num: raw_body(base, num) for num in [ids['page'], ids['SignatureOne']]}
    for cid, title, extra_size, new_id in [
        ('54', 'identical-page-widget-control', 0, False),
        ('55', 'identical-page-widget-phantom-size', 2, False),
        ('56', 'identical-page-widget-changed-id', 0, True),
        ('57', 'identical-page-widget-size-and-id', 2, True),
    ]:
        add(cid, title, append_revision(base, pair, extra_size, new_id),
            'Does identical rewriting change judgment with this isolated Size/ID combination?', '53',
            mutation={'kind': 'identical-object-rewrites', 'objectNumbers': list(pair)},
            trailerProbe={'sizeExtra': extra_size, 'changedId1': new_id})
    separate = seal(fresh(separate=True), signer)
    add('58', 'separate-widget-control', separate, 'Unchanged signature with a separate Kids widget.')
    r = reader(separate)
    widget = field_ref(r, 'SignatureOne').get_object()['/Kids'].raw_get(0).idnum
    for cid, title, nums, size_extra, new_id in [
        ('59', 'separate-sealed-widget-identical', [widget], 0, False),
        ('60', 'separate-widget-page-size-and-id', [roles(separate)['page'], widget], 2, True),
    ]:
        add(cid, title, append_revision(separate, {n: raw_body(separate, n) for n in nums}, size_extra, new_id),
            'Does separate widget ownership change the identical-rewrite result?', '58',
            mutation={'kind': 'identical-object-rewrites', 'objectNumbers': nums},
            trailerProbe={'sizeExtra': size_extra, 'changedId1': new_id})
    for cid, role in [('61', 'page'), ('62', 'ValueOne')]:
        num = ids[role]
        obj = g.IndirectObject(num, 0, reader(base)).get_object()
        body = reordered_body(obj)
        assert body != raw_body(base, num)
        add(cid, f'value-identical-{role.lower()}-reserialized', append_revision(base, {num: body}),
            'Are reordered keys and changed whitespace accepted when dictionary values are identical?', '53',
            serializationProbe={'objectNumber': num})

    p2 = seal(fresh(profile='DocMDP-P2'), signer, certification=2)
    add('63', 'p2-control', p2, 'Unchanged P2 certification control.', profile='DocMDP-P2')
    for cid, title, key, value in [
        ('64', 'readonly', '/Ff', g.NumberObject(1)),
        ('65', 'default-appearance', '/DA', S('/Helv 12 Tf 1 0 0 rg')),
        ('66', 'tooltip', '/TU', S('Synthetic changed tooltip')),
        ('67', 'hidden', '/F', g.NumberObject(6)),
    ]:
        add(cid, f'p2-{title}', edit(p2, lambda w, k=key, v=value: field_edit(w, k, v)),
            f'Is {key} alone accepted under P2?', '63', profile='DocMDP-P2', propertyProbe=key)
    add('68', 'p2-appearance-same-value', edit(p2, regenerate_appearance),
        'Is a regenerated AP stream with unchanged V and drawing accepted under P2?', '63', profile='DocMDP-P2')
    add('69', 'p2-second-signature-lock-tooltip', seal(stable_incremental(p2), signer, 'SignatureTwo', lock=['ValueOne'], tooltip=True),
        'Are Lock and TU installed with a second signature accepted under P2?', '63', profile='DocMDP-P2')
    for cid, role in [('70', 'page'), ('71', 'ValueOne')]:
        num = roles(p2)[role]
        add(cid, f'p2-identical-{role.lower()}', append_revision(p2, {num: raw_body(p2, num)}),
            f'Is an identical {role} rewrite accepted under P2?', '63', profile='DocMDP-P2',
            mutation={'kind': 'identical-object-rewrite', 'objectNumber': num})

    locked = seal(fresh(profile='approval-FieldMDP'), signer, lock=['ValueOne'])
    add('72', 'locked-field-control', locked, 'Unchanged ValueOne Include lock; Ff is zero.', profile='approval-FieldMDP')
    for cid, title, key, value in [
        ('73', 'default-appearance', '/DA', S('/Helv 12 Tf 1 0 0 rg')),
        ('74', 'tooltip', '/TU', S('Synthetic changed tooltip')),
        ('76', 'readonly', '/Ff', g.NumberObject(1)),
    ]:
        add(cid, f'locked-{title}', edit(locked, lambda w, k=key, v=value: field_edit(w, k, v)),
            f'Is {key} alone accepted on an explicitly locked field?', '72', profile='approval-FieldMDP', propertyProbe=key)
    add('75', 'locked-appearance-same-value', edit(locked, regenerate_appearance),
        'Is AP regeneration accepted on the locked field when V and drawing stay the same?', '72', profile='approval-FieldMDP')
    num = roles(locked)['ValueOne']
    add('77', 'locked-field-identical', append_revision(locked, {num: raw_body(locked, num)}),
        'Is an identical locked-field rewrite accepted?', '72', profile='approval-FieldMDP',
        mutation={'kind': 'identical-object-rewrite', 'objectNumber': num})
    shared = seal(fresh(profile='approval-FieldMDP-shared-font', shared_locked=True), signer, lock=['ValueOne'])
    add('78', 'locked-shared-font-control', shared,
        'Unchanged A values with a font shared by locked and unlocked appearances, never page content.', profile='approval-FieldMDP')
    def fill_shared(w):
        font = field_ref(w, 'ValueTwo').get_object()['/AP']['/N']['/Resources']['/Font'].raw_get('/F1')
        rewrite_glyph(w, font)
        field = field_ref(w, 'ValueTwo').get_object()
        field[N('/V')] = S('AA')
        field[N('/AP')] = D(N=appearance(w, 'AA', font))
        w.mark_update(field_ref(w, 'ValueTwo'))
    add('79', 'unlocked-fill-changes-locked-font', edit(shared, fill_shared),
        'Does an unlocked fill hide a changed glyph used by a locked appearance?', '78', profile='approval-FieldMDP')

    changed_lock = edit(locked, fill_value)
    add('80', 'locked-value-changed-control', changed_lock, 'Intermediate forbidden-fill control before restoration.', '72', profile='approval-FieldMDP')
    restore_objects = {num: raw_body(locked, num)}
    add('81', 'locked-value-restored', append_revision(changed_lock, restore_objects),
        'Does exact field/value/AP restoration recover a locked-field violation?', '80', profile='approval-FieldMDP')
    content = roles(p2)['content']
    original_content = raw_body(p2, content)
    changed_page = append_revision(p2, {content: original_content.replace(b'Reference amount: 1000', b'Reference amount: 9000')})
    add('82', 'p2-page-changed-control', changed_page, 'Intermediate prohibited page-content change under P2.', '63', profile='DocMDP-P2')
    add('83', 'p2-page-restored', append_revision(changed_page, {content: original_content}),
        'Does exact page-content restoration recover P2 certification?', '82', profile='DocMDP-P2')
    signed_change = seal(stable_incremental(changed_lock), signer, 'SignatureTwo')
    add('84', 'locked-change-second-signature-control', signed_change,
        'Judge each signature before restoring the changed locked value.', '80', profile='approval-FieldMDP')
    add('85', 'locked-signed-change-restored', append_revision(signed_change, restore_objects),
        'Does restoration recover the first signature and invalidate the second under a pre-existing lock?', '84', profile='approval-FieldMDP')

    add('86', 'approval-text-field-added', edit(base, add_text_field), 'Is adding a text field accepted under approval?', '53')
    add('87', 'approval-text-field-deleted', edit(base, delete_text_field), 'Is removing a text field from both Fields and Annots accepted?', '53')
    add('88', 'approval-square-added', edit(base, lambda w: square_edit(w, 'add')), 'Is adding an explicit-appearance Square accepted under approval?', '53')
    square = seal(fresh(square=True), signer)
    add('89', 'approval-square-control', square, 'Unchanged explicit-appearance Square control.')
    add('90', 'approval-square-deleted', edit(square, lambda w: square_edit(w, 'delete')), 'Is removing a Square accepted under approval?', '89')
    add('91', 'approval-square-colour-modified', edit(square, lambda w: square_edit(w, 'colour')), 'Is changing C and its explicit AP to red accepted under approval?', '89')

    cases.sort(key=lambda c: int(c['id']))
    assert [c['id'] for c in cases] == [str(i) for i in range(53, 92)]
    manifest = dict(schemaVersion=1, corpusVersion='role-probes-v3', source='synthetic-from-scratch',
        generator=dict(pyhanko='0.37.0', cryptography='50.0.1', signingTime=SIGNING_TIME.isoformat()),
        certificateSha256=hashlib.sha256((HERE / 'keys/TEST-ONLY-signer.cer').read_bytes()).hexdigest(),
        cases=cases)
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Generated {len(cases)} probes and controls in {out}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    generate(parser.parse_args().out.resolve())
