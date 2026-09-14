#!/usr/bin/env python3
"""Verify frozen probe bytes, mutation scope, and detached CMS without trust changes."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile

from asn1crypto import cms
from pyhanko.pdf_utils.reader import PdfFileReader


def field_ref(resolver):
    return next(ref for ref in resolver.root['/AcroForm']['/Fields']
                if ref.get_object()['/T'] == 'SharedAmountField')


def describe(resolver):
    page = resolver.root['/Pages']['/Kids'][0]
    font_ref = page['/Resources']['/Font'].raw_get('/SharedAmount')
    font = font_ref.get_object()
    field = field_ref(resolver).get_object()
    ap = field['/AP']['/N']
    assert font_ref.idnum == ap['/Resources']['/Font'].raw_get('/F1').idnum
    assert font_ref.idnum == resolver.root['/AcroForm']['/DR']['/Font'].raw_get('/SharedAmount').idnum
    assert field['/V'] == '9000'
    assert b'(9000)' in ap.data
    contents = [ref.get_object().data for ref in page['/Contents']]
    assert b'(9000)' in contents[-1]
    return dict(contents=contents, unicode=font['/ToUnicode'].data,
                glyph=font['/CharProcs']['/nine'].data, ap=ap.data,
                glyphNumber=font['/CharProcs'].raw_get('/nine').idnum,
                fieldNumber=field_ref(resolver).idnum,
                appearanceNumber=field['/AP'].raw_get('/N').idnum)


def verify(directory):
    manifest = json.loads((directory/'manifest.json').read_text())
    base = (directory/manifest['cases'][0]['file']).read_bytes()
    records = []
    detached_control = None
    cms_control = None
    with tempfile.TemporaryDirectory(prefix='shared-font-amount-verify-') as temp:
        temp = Path(temp)
        for case in manifest['cases']:
            data = (directory/case['file']).read_bytes()
            assert hashlib.sha256(data).hexdigest() == case['facts']['sha256']
            assert len(data) == case['facts']['byteLength']
            assert data.startswith(base), 'The original signed file must be an exact prefix.'
            reader = PdfFileReader(io.BytesIO(data))
            assert len(reader.embedded_signatures) == 1
            signature = reader.embedded_signatures[0]
            assert '/Reference' not in signature.sig_object, 'One unrestricted approval signature.'
            assert signature.signed_revision == 1
            before = describe(reader.get_historical_resolver(signature.signed_revision))
            now = describe(reader)
            assert before['contents'] == now['contents']
            assert before['unicode'] == now['unicode']
            assert before['ap'] == now['ap']
            assert len(reader.root['/AcroForm']['/Fields']) == 2
            expected = set()
            if case['id'] != 'SFA-01':
                assert before['glyph'] != now['glyph']
                expected = {now['glyphNumber']}
                if case['id'] == 'SFA-02':
                    assert before['appearanceNumber'] != now['appearanceNumber']
                    expected.update([now['fieldNumber'], now['appearanceNumber']])
                else:
                    assert before['appearanceNumber'] == now['appearanceNumber']
                changed = {ref.idnum for ref in reader.xrefs.explicit_refs_in_revision(2)}
                assert changed == expected, (changed, expected)
                old_id = reader.get_historical_resolver(1).trailer_view['/ID']
                assert [x.original_bytes for x in old_id] == [x.original_bytes for x in reader.trailer['/ID']]
            br = [int(x) for x in signature.sig_object['/ByteRange']]
            assert br == case['facts']['signatures'][0]['byteRange']
            assert br[0] == 0 and br[2] + br[3] == len(base)
            detached = data[:br[1]] + data[br[2]:br[2]+br[3]]
            der = cms.ContentInfo.load(bytes(signature.pkcs7_content)).dump()
            if detached_control is None:
                detached_control, cms_control = detached, der
            assert detached == detached_control and der == cms_control
            (temp/'cms.der').write_bytes(der)
            (temp/'signed.bin').write_bytes(detached)
            checked = subprocess.run(['openssl', 'cms', '-verify', '-binary', '-inform', 'DER',
                '-in', str(temp/'cms.der'), '-content', str(temp/'signed.bin'), '-noverify',
                '-out', str(temp/'verified.bin')], capture_output=True, text=True)
            assert checked.returncode == 0, checked.stderr
            records.append(dict(id=case['id'], sha256=case['facts']['sha256'],
                originalSignedBytesPreserved=True, detachedCmsValid=True,
                pageContentUnchanged=True, toUnicodeUnchanged=True, fieldValue='9000',
                sharedPageAndFormFont=True, appearanceCommandsUnchanged=True,
                changedObjectNumbers=sorted(expected)))
    print(json.dumps(dict(openssl=subprocess.check_output(['openssl','version'],text=True).strip(),
        note='CMS verification does not assess trust or permission of later changes.', cases=records),indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    verify(parser.parse_args().directory.resolve())
