#!/usr/bin/env python3
"""Independent CMS, revision, field/widget and appearance checks for frozen v4."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from asn1crypto import cms
from pyhanko.pdf_utils import generic as g
from generate import HERE, describe_bytes, reader
from verify_v3 import changed_keys, field, field_ref, normalized, page


def widget_ref(r, name):
    f = field(r, name)
    return f['/Kids'].raw_get(0) if '/Kids' in f else field_ref(r, name)


def drawing_objects(r, root):
    """Every indirect object reachable from the new appearance stream."""
    seen = set()
    stack = [root]
    while stack:
        ref = stack.pop()
        if ref.idnum in seen:
            continue
        seen.add(ref.idnum)
        stack.extend(references(ref.get_object()))
    return seen


def references(obj):
    if isinstance(obj, g.IndirectObject):
        return [obj]
    if isinstance(obj, g.DictionaryObject):
        return [ref for key in obj for ref in references(obj.raw_get(key))]
    if isinstance(obj, g.ArrayObject):
        return [ref for item in obj for ref in references(item)]
    return []


def verify(directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    assert manifest['corpusVersion'] == 'role-probes-v4'
    assert [c['id'] for c in manifest['cases']] == [str(i) for i in range(92, 103)]
    data = {c['id']: (directory / c['file']).read_bytes() for c in manifest['cases']}
    checked = []
    signature_checks = []
    with tempfile.TemporaryDirectory(prefix='epdf-v4-cms-') as temporary:
        temp = Path(temporary)
        for case in manifest['cases']:
            cid = case['id']
            pdf = data[cid]
            assert describe_bytes(pdf) == case['facts'], cid
            r = reader(pdf)
            old = r.get_historical_resolver(0)
            assert [s.signed_revision for s in r.embedded_signatures] == [0], cid
            assert [s.field_name for s in r.embedded_signatures] == ['SignatureOne'], cid
            if case['control']:
                assert pdf.startswith(data[case['control']]), (cid, 'control ancestry')
                assert r.total_revisions == 2, cid
            else:
                assert r.total_revisions == 1, cid
            ids = [[v.original_bytes for v in r.get_historical_resolver(i).trailer_view['/ID']]
                   for i in range(r.total_revisions)]
            assert all(i == ids[0] for i in ids), (cid, 'ID preserved')

            fs = r.root['/AcroForm']['/Fields']
            assert [str(ref.get_object()['/T']) for ref in fs] == ['SignatureOne', 'SignatureTwo', 'ValueOne', 'ValueTwo'], cid
            assert '/V' not in field(r, 'SignatureTwo'), (cid, 'SignatureTwo stays unsigned')
            widgets = {widget_ref(r, str(ref.get_object()['/T'])).idnum for ref in fs}
            assert widgets == {a.idnum for a in page(r)['/Annots']}, cid
            separate = cid in ('98', '99')
            assert ('/Kids' in field(r, 'SignatureTwo')) == separate, cid
            if cid in ('96', '97'):
                assert '/AP' not in widget_ref(old, 'SignatureTwo').get_object(), cid
            else:
                assert widget_ref(old, 'SignatureTwo').get_object()['/AP']['/N'].data, cid

            if case['profile'] == 'DocMDP-P2':
                transform = r.embedded_signatures[0].sig_object['/Reference'][0]
                assert transform['/TransformMethod'] == '/DocMDP'
                assert transform['/TransformParams']['/P'] == 2
            else:
                assert '/Reference' not in r.embedded_signatures[0].sig_object, cid
                assert '/Perms' not in r.root, cid

            probe = case.get('appearanceProbe')
            if probe:
                name = probe['field']
                wref = widget_ref(r, name)
                before = widget_ref(old, name).get_object()
                after = wref.get_object()
                # The widget changes /AP and nothing else; a separate widget's field is untouched.
                assert changed_keys(before, after) == {'/AP'}, (cid, changed_keys(before, after))
                assert set(after['/AP'].keys()) == {'/N'}, cid
                if probe['widget'] == 'separate':
                    assert normalized(field(old, name)) == normalized(field(r, name)), cid
                root = after['/AP'].raw_get('/N')
                drawn = drawing_objects(r, root)
                written = {ref.idnum for ref in r.xrefs.explicit_refs_in_revision(1)}
                # Written in the last revision: the widget, and the drawing, all of it new.
                assert written == drawn | {wref.idnum}, (cid, written, drawn)
                assert all(n >= int(old.trailer_view['/Size']) for n in drawn), (cid, 'drawing is new objects')
                ap = root.get_object()
                if probe['drawing'] == 'wrapper':
                    inner = ap['/Resources']['/XObject']['/EPDFWRAP']
                    assert b'/EPDFWRAP Do' in ap.data and '/EPDFOrigContentRect' in ap, cid
                    assert inner['/Resources']['/XObject']['/FXX1']['/Subtype'] == '/Image', cid
                    assert len(drawn) == 4, cid
                else:
                    assert ap['/Resources'] == {} and b' S Q' in ap.data and len(drawn) == 1, cid
            else:
                assert r.total_revisions == 1, cid

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
            checked.append({'id': cid, 'structureVerified': True})
    result = {'corpusVersion': manifest['corpusVersion'], 'caseCount': len(checked),
              'openssl': subprocess.check_output(['openssl', 'version'], text=True).strip(),
              'structureChecks': checked, 'signatureChecks': signature_checks}
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path, default=HERE / 'v4')
    verify(parser.parse_args().directory.resolve())
