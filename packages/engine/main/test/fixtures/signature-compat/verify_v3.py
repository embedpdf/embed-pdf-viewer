#!/usr/bin/env python3
"""Independent CMS, revision, field/widget and mutation checks for frozen v3."""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

from asn1crypto import cms
from pyhanko.pdf_utils import generic as g
from generate import HERE, describe_bytes, raw_body, reader


def field_ref(r, name='ValueOne'):
    return next(ref for ref in r.root['/AcroForm']['/Fields'] if ref.get_object()['/T'] == name)


def field(r, name='ValueOne'):
    return field_ref(r, name).get_object()


def page_ref(r):
    return r.root['/Pages']['/Kids'].raw_get(0)


def page(r):
    return page_ref(r).get_object()


def normalized(obj):
    # Structural identity retains object/generation references and exact stream
    # bytes. It deliberately does not ask either validator for its verdict.
    if isinstance(obj, g.IndirectObject):
        return ('ref', obj.idnum, obj.generation)
    if isinstance(obj, g.StreamObject):
        return ('stream', obj.data, tuple(sorted((str(k), normalized(v)) for k, v in obj.items())))
    if isinstance(obj, g.DictionaryObject):
        return ('dict', tuple(sorted((str(k), normalized(v)) for k, v in obj.items())))
    if isinstance(obj, g.ArrayObject):
        return ('array', tuple(normalized(v) for v in obj))
    if isinstance(obj, g.ByteStringObject):
        return ('bytes', bytes(obj))
    if isinstance(obj, g.TextStringObject):
        return ('text', str(obj))
    if isinstance(obj, g.NameObject):
        return ('name', str(obj))
    return (type(obj).__name__, str(obj))


def changed_keys(a, b):
    return {str(k) for k in set(a) | set(b)
            if normalized(a.raw_get(k)) != normalized(b.raw_get(k))} if set(a) == set(b) else {
                str(k) for k in set(a) | set(b)
                if k not in a or k not in b or normalized(a.raw_get(k)) != normalized(b.raw_get(k))}


def ap(r, name='ValueOne'):
    f = field(r, name)
    widget = f['/Kids'][0] if '/Kids' in f else f
    return widget['/AP']['/N']


def appearance_font(r, name='ValueOne'):
    return ap(r, name)['/Resources']['/Font'].raw_get('/F1')


def squares(r):
    return [a.get_object() for a in page(r)['/Annots'] if a.get_object()['/Subtype'] == '/Square']


def verify(directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    assert manifest['corpusVersion'] == 'role-probes-v3'
    assert [c['id'] for c in manifest['cases']] == [str(i) for i in range(53, 92)]
    data = {c['id']: (directory / c['file']).read_bytes() for c in manifest['cases']}
    checked = []
    signature_checks = []
    with tempfile.TemporaryDirectory(prefix='epdf-v3-cms-') as temporary:
        temp = Path(temporary)
        for case in manifest['cases']:
            cid = case['id']
            pdf = data[cid]
            assert describe_bytes(pdf) == case['facts'], cid
            r = reader(pdf)
            old = r.get_historical_resolver(0)
            if case['control']:
                assert pdf.startswith(data[case['control']]), (cid, 'control ancestry')
            # ID changes must occur only in the three dedicated variants.
            for index in range(r.total_revisions):
                historical = r.get_historical_resolver(index)
                ids = [v.original_bytes for v in historical.trailer_view['/ID']]
                original_ids = [v.original_bytes for v in old.trailer_view['/ID']]
                assert ids[0] == original_ids[0], cid
                assert (ids[1] != original_ids[1]) == (cid in ('56', '57', '60') and index > 0), cid

            expected_fields = 5 if cid == '86' else 3 if cid == '87' else 4
            fs = r.root['/AcroForm']['/Fields']
            assert len(fs) == expected_fields, cid
            widget_ids = set()
            for ref in fs:
                f = ref.get_object()
                widgets = list(f['/Kids']) if '/Kids' in f else [ref]
                for widget_ref in widgets:
                    widget = widget_ref.get_object()
                    widget_ids.add(widget_ref.idnum)
                    assert widget['/Subtype'] == '/Widget'
                    assert widget.raw_get('/P').idnum == page_ref(r).idnum
                    if widget_ref.idnum != ref.idnum:
                        assert widget.raw_get('/Parent').idnum == ref.idnum
                        assert '/V' not in widget and '/FT' not in widget and '/AP' not in f
                    assert widget['/AP']['/N'].data
                    if f['/FT'] == '/Tx':
                        # All text probes retain an actual stored appearance.
                        assert str(f['/V']).encode('ascii') in widget['/AP']['/N'].data
            assert widget_ids == {a.idnum for a in page(r)['/Annots'] if a.get_object()['/Subtype'] == '/Widget'}, cid

            expected_squares = 1 if cid in ('88', '89', '91') else 0
            assert len(squares(r)) == expected_squares, cid
            for square in squares(r):
                assert square['/AP']['/N'].data

            for index, signature in enumerate(r.embedded_signatures):
                br = [int(x) for x in signature.sig_object['/ByteRange']]
                assert br[0] == 0 and br[2] + br[3] <= len(pdf)
                (temp / 'cms.der').write_bytes(cms.ContentInfo.load(bytes(signature.pkcs7_content)).dump())
                (temp / 'signed.bin').write_bytes(pdf[:br[1]] + pdf[br[2]:br[2] + br[3]])
                result = subprocess.run(['openssl', 'cms', '-verify', '-binary', '-inform', 'DER',
                    '-in', str(temp / 'cms.der'), '-content', str(temp / 'signed.bin'),
                    '-noverify', '-out', str(temp / 'verified.bin')], capture_output=True, text=True)
                assert result.returncode == 0, (cid, result.stderr)
                signature_checks.append({'id': cid, 'signatureIndex': index, 'detachedCmsValid': True})

            mutation = case.get('mutation')
            if mutation:
                nums = mutation.get('objectNumbers', [mutation.get('objectNumber')])
                for num in nums:
                    assert raw_body(data[case['control']], num) == raw_body(pdf, num), cid
                actual = {ref.idnum for ref in r.xrefs.explicit_refs_in_revision(r.total_revisions - 1)}
                assert actual == set(nums), (cid, actual, nums)
            if 'trailerProbe' in case:
                probe = case['trailerProbe']
                assert int(r.trailer['/Size']) - int(old.trailer_view['/Size']) == probe['sizeExtra'], cid
                if probe['sizeExtra']:
                    # The phantom object numbers have no xref entries or bodies.
                    for num in range(int(old.trailer_view['/Size']), int(r.trailer['/Size'])):
                        assert f'{num} 0 obj'.encode() not in pdf
            if 'serializationProbe' in case:
                num = case['serializationProbe']['objectNumber']
                assert raw_body(pdf, num) != raw_body(data['53'], num)
                a = g.IndirectObject(num, 0, old).get_object()
                b = g.IndirectObject(num, 0, r).get_object()
                assert normalized(a) == normalized(b), cid
                assert list(a.keys()) == list(reversed(list(b.keys()))), cid
            if case['profile'] == 'DocMDP-P2':
                sig = r.embedded_signatures[0].sig_object
                transform = sig['/Reference'][0]
                assert transform['/TransformMethod'] == '/DocMDP'
                assert transform['/TransformParams']['/P'] == 2
                assert normalized(r.root['/Perms'].raw_get('/DocMDP')) == normalized(old.root['/Perms'].raw_get('/DocMDP'))
            if case['profile'] == 'approval-FieldMDP':
                transform = r.embedded_signatures[0].sig_object['/Reference'][0]
                assert transform['/TransformMethod'] == '/FieldMDP'
                params = transform['/TransformParams']
                assert params['/Action'] == '/Include' and list(params['/Fields']) == ['ValueOne']
            if 'propertyProbe' in case:
                assert changed_keys(field(old), field(r)) == {case['propertyProbe']}, cid
                assert field(r)['/V'] == field(old)['/V']
                assert normalized(ap(r)) == normalized(ap(old))
                actual = {ref.idnum for ref in r.xrefs.explicit_refs_in_revision(1)}
                assert actual == {field_ref(r).idnum}, (cid, actual)
            if cid in ('68', '75'):
                assert normalized(field(old)) == normalized(field(r))
                assert field(r)['/V'] == 'INITIAL'
                assert ap(r).data == ap(old).data + b'\n% regenerated appearance, same logical value and drawing\n'
                actual = {ref.idnum for ref in r.xrefs.explicit_refs_in_revision(1)}
                assert actual == {field(r)['/AP'].raw_get('/N').idnum}, (cid, actual)
            if cid == '69':
                assert [s.signed_revision for s in r.embedded_signatures] == [0, 1]
                assert field(r, 'SignatureTwo')['/TU'] == 'Synthetic tooltip changed when signing'
                assert list(field(r, 'SignatureTwo')['/Lock']['/Fields']) == ['ValueOne']
            if cid in ('78', '79'):
                assert '/Shared' not in page(r)['/Resources']['/Font']
                assert appearance_font(r).idnum == appearance_font(r, 'ValueTwo').idnum
                assert normalized(field(old)) == normalized(field(r))
                assert ap(old).data == ap(r).data
                assert field(r)['/V'] == 'A'
                old_glyph = appearance_font(old).get_object()['/CharProcs']['/A'].data
                new_glyph = appearance_font(r).get_object()['/CharProcs']['/A'].data
                assert (old_glyph != new_glyph) == (cid == '79')
                if cid == '79':
                    assert field(r, 'ValueTwo')['/V'] == 'AA'
                    assert b'70 60 m 530 60 l' in new_glyph
            if cid in ('80', '81', '84', '85'):
                assert field(old)['/V'] == 'INITIAL'
                assert field(r.get_historical_resolver(1))['/V'] == 'CHANGED'
                if cid in ('81', '85'):
                    assert normalized(field(r)) == normalized(field(old)), cid
                    assert ap(r).data == ap(old).data
                else:
                    assert field(r)['/V'] == 'CHANGED'
                if cid in ('84', '85'):
                    assert [s.signed_revision for s in r.embedded_signatures] == [0, 2]
            if cid in ('82', '83'):
                original = page(old)['/Contents'].data
                assert page(r.get_historical_resolver(1))['/Contents'].data == original.replace(b'Reference amount: 1000', b'Reference amount: 9000')
                if cid == '83':
                    assert page(r)['/Contents'].data == original
            if cid == '86':
                assert field(r, 'ValueThree')['/V'] == 'NEW FIELD'
            if cid == '87':
                assert 'ValueTwo' not in {str(ref.get_object()['/T']) for ref in fs}
                assert 'ValueTwo' in {str(ref.get_object()['/T']) for ref in old.root['/AcroForm']['/Fields']}
            if cid == '91':
                assert changed_keys(squares(old)[0], squares(r)[0]) == {'/C', '/AP'}
                assert list(squares(r)[0]['/C']) == [1, 0, 0]
                assert b'1 0 0 RG' in squares(r)[0]['/AP']['/N'].data
            checked.append({'id': cid, 'structureVerified': True})
    result = {'corpusVersion': manifest['corpusVersion'], 'caseCount': len(checked),
              'openssl': subprocess.check_output(['openssl', 'version'], text=True).strip(),
              'structureChecks': checked, 'signatureChecks': signature_checks}
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path, default=HERE / 'v3')
    verify(parser.parse_args().directory.resolve())
