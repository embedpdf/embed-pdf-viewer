#!/usr/bin/env python3
"""Synthetic signature compatibility probes; never reads a customer document.

Uses pyHanko's low-level writer deliberately: normal signing APIs enforce policy
and update metadata, preventing isolated negative tests. Pinned versions matter.
Existing corpus directories must never be regenerated in place: observations
belong to a particular SHA-256, not merely to a scenario name.
"""

import argparse
import asyncio
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from asn1crypto import keys, x509 as asn1x509
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from pyhanko.pdf_utils import crypt, generic as g, writer
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import fields
from pyhanko.sign.signers import SimpleSigner
from pyhanko.sign.signers.pdf_byterange import SignatureObject
from pyhanko.sign.signers.pdf_cms import PdfCMSSignedAttributes
from pyhanko_certvalidator.registry import SimpleCertificateStore

HERE = Path(__file__).resolve().parent
SIGNING_TIME = datetime(2026, 9, 13, 12, 0, tzinfo=timezone.utc)
TEST_PASSWORD = "synthetic-owner-only"
N = g.pdf_name
S = g.pdf_string


def D(**entries):
    return g.DictionaryObject({N("/" + key): value for key, value in entries.items()})


def A(*values):
    return g.ArrayObject([g.NumberObject(v) if isinstance(v, (int, float)) else v for v in values])


class CorpusWriter(writer.PdfFileWriter):
    def _update_meta(self):
        # No incidental /Info or XMP edits: cases opt into them explicitly.
        pass


class CorpusIncrementalWriter(IncrementalPdfFileWriter):
    def _update_meta(self):
        pass


class VerbatimObject(g.PdfObject):
    """An exact object-body rewrite, including existing ciphertext if any."""
    def __init__(self, body):
        self.body = body

    def write_to_stream(self, stream, handler=None, container_ref=None):
        stream.write(self.body)


def signer_for(key_dir):
    key_path = key_dir / "TEST-ONLY-private-key.pem"
    cert_path = key_dir / "TEST-ONLY-signer.pem"
    if not key_path.exists():
        key_dir.mkdir(parents=True, exist_ok=True)
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "EmbedPDF PUBLIC TEST KEY ONLY")])
        cert = (
            x509.CertificateBuilder().subject_name(name).issuer_name(name)
            .public_key(key.public_key()).serial_number(81201)
            .not_valid_before(datetime(2025, 1, 1, tzinfo=timezone.utc))
            .not_valid_after(datetime(2050, 1, 1, tzinfo=timezone.utc))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(
                digital_signature=True, content_commitment=True, key_encipherment=False,
                data_encipherment=False, key_agreement=False, key_cert_sign=True,
                crl_sign=True, encipher_only=False, decipher_only=False,
            ), critical=True)
            .sign(key, hashes.SHA256())
        )
        key_path.write_bytes(key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ))
        cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        (key_dir / "TEST-ONLY-signer.cer").write_bytes(cert.public_bytes(serialization.Encoding.DER))
    key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    return SimpleSigner(
        signing_cert=asn1x509.Certificate.load(cert.public_bytes(serialization.Encoding.DER)),
        signing_key=keys.PrivateKeyInfo.load(key.private_bytes(
            serialization.Encoding.DER, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )),
        cert_registry=SimpleCertificateStore(),
    )


def reader(data):
    r = PdfFileReader(io.BytesIO(data))
    if r.encrypted:
        r.decrypt("")
    return r


def incremental(data):
    w = CorpusIncrementalWriter(io.BytesIO(data))
    if w.prev.encrypted:
        w.encrypt(TEST_PASSWORD)
    return w


def emit(w):
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


def stream(w, data, **entries):
    return w.add_object(g.StreamObject(D(**entries), stream_data=data.encode("ascii")))


def appearance(w, text, font=None):
    font = font or w.root["/AcroForm"]["/DR"]["/Font"].raw_get("/Helv")
    return stream(
        w, f"q 0.97 g 0 0 210 28 re f 0.2 G 0 0 210 28 re S "
        f"BT /F1 12 Tf 0 g 8 9 Td ({text}) Tj ET Q",
        Type=N("/XObject"), Subtype=N("/Form"), BBox=A(0, 0, 210, 28),
        Resources=D(Font=D(F1=font)),
    )


def field_ref(w, name):
    for ref in w.root["/AcroForm"]["/Fields"]:
        if ref.get_object()["/T"] == name:
            return ref
    raise ValueError(f"missing synthetic field {name}")


def new_document(profile="approval", encrypted=False, shared_page_font=False):
    w = CorpusWriter(stream_xrefs=False, info=D(Title=S("Synthetic signature compatibility fixture")))
    w._document_id = A(g.ByteStringObject(b"EPDF-corpus-v001!"), g.ByteStringObject(b"EPDF-corpus-v001!"))
    font = w.add_object(D(Type=N("/Font"), Subtype=N("/Type1"), BaseFont=N("/Helvetica")))
    contents = stream(w,
        "q 0.12 0.19 0.28 rg 0 720 612 72 re f "
        "BT /Helv 19 Tf 1 g 40 748 Td (SIGNATURE COMPATIBILITY TEST) Tj ET Q\n"
        "BT /Helv 12 Tf 0 g 40 688 Td (SYNTHETIC DATA - PUBLIC TEST CERTIFICATE) Tj "
        f"0 -24 Td (Policy profile: {profile}) Tj "
        "0 -24 Td (All names, values and signatures are fictional.) Tj "
        "0 -24 Td (Reference amount: 1000) Tj "
        "0 -40 Td (First value) Tj 0 -72 Td (Second value) Tj "
        "0 -102 Td (First signature) Tj 0 -98 Td (Second signature) Tj ET\n"
    )
    page = w.insert_page(writer.PageObject(contents, (0, 0, 612, 792), D(Font=D(Helv=font))))
    for name, rect in [("SignatureOne", (40, 330, 340, 390)), ("SignatureTwo", (40, 232, 340, 292))]:
        fields.append_signature_field(w, fields.SigFieldSpec(
            sig_field_name=name, box=rect, empty_field_appearance=True,
            readable_field_name=f"Synthetic {name}",
        ))
    acro = w.root["/AcroForm"]
    acro[N("/DR")] = D(Font=D(Helv=font))
    acro[N("/DA")] = S("/Helv 12 Tf 0 g")
    acro[N("/SigFlags")] = g.NumberObject(3)
    for name, y in [("ValueOne", 535), ("ValueTwo", 463)]:
        ref = w.add_object(D(
            Type=N("/Annot"), Subtype=N("/Widget"), FT=N("/Tx"), T=S(name),
            TU=S(f"Synthetic {name}"), V=S("INITIAL"), Rect=A(40, y, 250, y + 28),
            P=page, F=g.NumberObject(4), DA=S("/Helv 12 Tf 0 g"),
            AP=D(N=appearance(w, "INITIAL")),
        ))
        acro["/Fields"].append(ref)
        page.get_object()["/Annots"].append(ref)
    note = w.add_object(D(
        Type=N("/Annot"), Subtype=N("/Square"), Rect=A(395, 500, 480, 550),
        F=g.NumberObject(4), C=A(0, 0, 1), Contents=S("Synthetic annotation"), P=page,
    ))
    page.get_object()["/Annots"].append(note)
    extra = w.add_object(D(Label=S("Synthetic custom catalog data"), Version=g.NumberObject(1)))
    w.root[N("/FixtureData")] = extra
    w.root[N("/PageMode")] = N("/UseOutlines")
    if shared_page_font:
        shared = type3_font(w)
        acro["/DR"]["/Font"][N("/Shared")] = shared
        page.get_object()["/Resources"]["/Font"][N("/Shared")] = shared
        # This resource is visibly used by the signed page, not merely listed.
        contents.get_object()._data += b"BT /Shared 20 Tf 395 440 Td (A) Tj ET\n"
    if encrypted:
        # Deliberate R=4 AES-128 coverage for legacy producer interoperability.
        sh = crypt.StandardSecurityHandler.build_from_pw_legacy(
            rev=crypt.StandardSecuritySettingsRevision.RC4_OR_AES128,
            id1=w.document_id[0].original_bytes,
            desired_owner_pass=TEST_PASSWORD, desired_user_pass="", use_aes128=True,
        )
        w._assign_security_handler(sh)
    return w


def seal(w, signer, name="SignatureOne", certification=None, lock=None, tooltip=False, prop_build=False):
    ref = field_ref(w, name)
    field = ref.get_object()
    sig = SignatureObject(timestamp=SIGNING_TIME, subfilter=fields.SigSeedSubFilter.PADES,
                          reason="Synthetic interoperability fixture", bytes_reserved=16384)
    sig_ref = w.add_object(sig)
    field[N("/V")] = sig_ref
    field[N("/AP")] = D(N=appearance(w, "PUBLIC TEST SIGNATURE"))
    if tooltip:
        field[N("/TU")] = S("Synthetic tooltip changed when signing")
    references = []
    root_link = g.IndirectObject(w.root_ref.idnum, w.root_ref.generation, w)
    if certification is not None:
        references.append(D(
            Type=N("/SigRef"), TransformMethod=N("/DocMDP"), Data=root_link,
            TransformParams=D(Type=N("/TransformParams"), P=g.NumberObject(certification), V=N("/1.2")),
        ))
        w.root[N("/Perms")] = D(DocMDP=sig_ref)
        w.update_root()
    if lock:
        spec = fields.FieldMDPSpec(fields.FieldMDPAction.INCLUDE, lock)
        field[N("/Lock")] = spec.as_sig_field_lock()
        references.append(spec.as_transform_params())
        references[-1] = D(Type=N("/SigRef"), TransformMethod=N("/FieldMDP"),
                           Data=root_link, TransformParams=references[-1])
    if references:
        sig[N("/Reference")] = A(*references)
    if prop_build:
        leaf = w.add_object(D(Comment=S("Synthetic build information"), Independent=g.BooleanObject(True)))
        app = w.add_object(D(Name=N("/SyntheticFixtureWriter"), Information=leaf))
        sig[N("/Prop_Build")] = w.add_object(D(App=app))
    w.mark_update(ref)
    out = io.BytesIO()
    job = sig.fill(w, "sha256", output=out)
    digest, _ = next(job)
    cms = asyncio.run(signer.async_sign(
        digest.document_digest, "sha256", use_pades=True,
        signed_attr_settings=PdfCMSSignedAttributes(signing_time=SIGNING_TIME),
    ))
    job.send(cms)
    job.close()
    return out.getvalue()


def raw_body(data, number):
    matches = list(re.finditer(rb"(?:^|[\r\n])" + str(number).encode() + rb" 0 obj\s*([\s\S]*?)\nendobj", data))
    if not matches:
        raise ValueError(f"object {number} missing in synthetic input")
    return matches[-1].group(1)


def append_raw(data, objects):
    """Exact no-op rewrites and precise controls; only accepts generated PDFs."""
    r = reader(data)
    trailer = r.trailer.flatten()
    previous = int(re.findall(rb"startxref\s+(\d+)", data)[-1])
    out = io.BytesIO(data)
    out.seek(0, 2)
    offsets = {}
    for num, body in sorted(objects.items()):
        offsets[num] = out.tell()
        out.write(f"{num} 0 obj\n".encode() + body + b"\nendobj\n")
    start = out.tell()
    out.write(b"xref\n")
    for num, offset in offsets.items():
        out.write(f"{num} 1\n{offset:010} 00000 n \n".encode())
    trailer[N("/Prev")] = g.NumberObject(previous)
    trailer[N("/Size")] = g.NumberObject(max(int(trailer["/Size"]), max(objects) + 1))
    out.write(b"trailer\n")
    trailer.write_to_stream(out)
    out.write(f"\nstartxref\n{start}\n%%EOF\n".encode())
    return out.getvalue()


def roles(data):
    r = reader(data)
    result = {"info": r.trailer.raw_get("/Info").idnum,
              "catalog-extra": r.root.raw_get("/FixtureData").idnum}
    page_ref = r.root["/Pages"]["/Kids"].raw_get(0)
    page = page_ref.get_object()
    result["page"] = page_ref.idnum
    result["content"] = page.raw_get("/Contents").idnum
    result["annotation"] = page["/Annots"].raw_get(-1).idnum
    for ref in r.root["/AcroForm"]["/Fields"]:
        result[str(ref.get_object()["/T"])] = ref.idnum
    if r.encrypted:
        result["encrypt"] = r.trailer.raw_get("/Encrypt").idnum
    return result


def edit(data, fn):
    w = incremental(data)
    fn(w)
    return emit(w)


def field_edit(w, key, value, name="ValueOne"):
    ref = field_ref(w, name)
    ref.get_object()[N(key)] = value
    w.mark_update(ref)


def fill(w, name="ValueOne", readonly=False, shared=False):
    ref = field_ref(w, name)
    field = ref.get_object()
    text = "A" if shared else "FILLED"
    font = None
    resource_name = "/Shared" if name == "ValueOne" else "/SharedTwo"
    if shared:
        font = type3_font(w)
        # Each fill adds its own font without removing the earlier field's
        # default resource or changing what that field's /DA resolves to.
        w.root["/AcroForm"]["/DR"]["/Font"][N(resource_name)] = font
        w.update_container(w.root["/AcroForm"])
    field[N("/V")] = S(text)
    field[N("/AP")] = D(N=appearance(w, text, font))
    if readonly:
        field[N("/Ff")] = g.NumberObject(1)
        field[N("/DA")] = S(f"{resource_name} 12 Tf 0.1 0.2 0.3 rg" if shared else "/Helv 12 Tf 0.1 0.2 0.3 rg")
    w.mark_update(ref)


def type3_font(w):
    # A real embedded vector glyph. Its indirect CharProcs descendant tests
    # the same graph join as subset TrueType fonts, with no font asset copied.
    glyph = stream(w, "600 0 0 0 600 700 d1 60 w 1 J 70 30 m 300 660 l 530 30 l S 160 240 m 440 240 l S")
    procs = w.add_object(D(A=glyph))
    return w.add_object(D(
        Type=N("/Font"), Subtype=N("/Type3"), FontBBox=A(0, 0, 600, 700),
        FontMatrix=g.ArrayObject([g.FloatObject(0.001), g.NumberObject(0), g.NumberObject(0),
                                 g.FloatObject(0.001), g.NumberObject(0), g.NumberObject(0)]),
        CharProcs=procs, Encoding=D(Type=N("/Encoding"), Differences=A(65, N("/A"))),
        FirstChar=g.NumberObject(65), LastChar=g.NumberObject(65), Widths=A(600), Resources=D(),
    ))


def combined(base, signer):
    def reemit(w, data, names):
        ids = roles(data)
        for name in names:
            if name in ids:
                num = ids[name]
                w.objects[(0, num)] = VerbatimObject(raw_body(data, num))
    w = incremental(base)
    fill(w, readonly=True, shared=True)
    reemit(w, base, ["info", "encrypt"])
    first = emit(w)
    w = incremental(first)
    fill(w, name="ValueTwo", shared=True)
    reemit(w, first, ["info", "encrypt"])
    second = emit(w)
    w = incremental(second)
    reemit(w, second, ["info", "encrypt", "catalog-extra"])
    return seal(w, signer, "SignatureTwo", lock=["ValueOne", "ValueTwo"], tooltip=True, prop_build=True)


def describe_bytes(data):
    r = reader(data)
    sigs = []
    for s in r.embedded_signatures:
        br = [int(v) for v in s.sig_object["/ByteRange"]]
        signed = data[br[0]:br[0] + br[1]] + data[br[2]:br[2] + br[3]]
        expected = next(a["values"][0].native for a in s.signer_info["signed_attrs"]
                        if a["type"].native == "message_digest")
        sigs.append({"field": s.field_name, "signedRevision": s.signed_revision,
                     "byteRange": br, "digestMatches": hashlib.sha256(signed).digest() == expected})
    return {"sha256": hashlib.sha256(data).hexdigest(), "byteLength": len(data),
            "revisionCount": r.total_revisions, "encrypted": r.encrypted, "signatures": sigs}


def generate(out):
    if out.exists() and any(out.iterdir()):
        raise SystemExit("Choose an empty output directory; frozen observations must not be overwritten.")
    out.mkdir(parents=True, exist_ok=True)
    signer = signer_for(HERE / "keys")
    base = seal(new_document(), signer)
    ids = roles(base)
    cases = []

    def add(case_id, title, data, question, control="01", profile="approval", priority=2, **extra):
        filename = f"{case_id}-{title}.pdf"
        (out / filename).write_bytes(data)
        facts = describe_bytes(data)
        cases.append({"id": case_id, "file": filename, "question": question,
                      "control": control, "profile": profile, "priority": priority,
                      "facts": facts, "acrobat": {"status": "unobserved"}, **extra})

    add("01", "approval-control", base, "Is the unchanged approval signature accepted?", control=None, priority=1)
    for cid, role, title in [
        ("02", "info", "info-identical"), ("03", "catalog-extra", "catalog-extra-identical"),
        ("04", "page", "page-identical"), ("05", "SignatureOne", "sealed-widget-identical"),
        ("06", "ValueOne", "text-field-identical"), ("07", "annotation", "annotation-identical"),
    ]:
        num = ids[role]
        data = append_raw(base, {num: raw_body(base, num)})
        add(cid, title, data, f"Does an exact rewrite of {role} count as a modification?", priority=1,
            mutation={"kind": "identical-object-rewrite", "objectNumber": num, "role": role})
    add("08", "fill-and-appearance", edit(base, fill), "Is ordinary /V + /AP filling accepted?", priority=1)
    add("09", "readonly-only", edit(base, lambda w: field_edit(w, "/Ff", g.NumberObject(1))),
        "Is setting ReadOnly alone accepted without a new signature or field lock?", priority=1)
    add("10", "move-field-rectangle", edit(base, lambda w: field_edit(w, "/Rect", A(300, 535, 510, 563))),
        "Is moving an unlocked field accepted as a property change?")
    add("11", "hide-field", edit(base, lambda w: field_edit(w, "/F", g.NumberObject(6))),
        "Is hiding an unlocked field accepted as a property change?")
    def add_validation_action(w):
        action = w.add_object(D(S=N("/JavaScript"), JS=S("event.rc = true;")))
        field_edit(w, "/AA", D(V=action))
    add("12", "field-additional-action", edit(base, add_validation_action),
        "Is adding a no-op validation action accepted? Do not enable privileged JavaScript.")
    add("13", "rename-field", edit(base, lambda w: field_edit(w, "/T", S("RenamedValue"))),
        "Is changing field identity rejected?")
    content = raw_body(base, ids["content"])
    assert b"1000" in content
    changed = append_raw(base, {ids["content"]: content.replace(b"1000", b"9000")})
    add("14", "page-content-changed", changed, "Is a visible change to signed page content rejected?", priority=1)
    restored = append_raw(changed, {ids["content"]: content})
    add("15", "page-content-restored", restored,
        "Does restoring the signed page after an intervening edit restore acceptance?", control="14", priority=1)
    add("16", "shared-appearance-font", edit(base, lambda w: fill(w, shared=True)),
        "Is an appearance font with indirect descendants shared with AcroForm /DR accepted?", control="08", priority=1)
    second = seal(incremental(base), signer, "SignatureTwo")
    add("17", "second-signature-control", second, "Are two ordinary approvals accepted?", priority=1)
    add("18", "second-signature-tooltip", seal(incremental(base), signer, "SignatureTwo", tooltip=True),
        "Is /TU changed on the field being signed accepted?", control="17", priority=1)
    add("19", "second-signature-lock", seal(incremental(base), signer, "SignatureTwo", lock=["ValueOne"]),
        "Is /Lock installed with a second signature accepted?", control="17", priority=1)
    add("20", "signature-build-subtree", seal(incremental(base), signer, "SignatureTwo", prop_build=True),
        "Are indirect /Prop_Build descendants accepted?", control="17")
    add("21", "combined-workflow", combined(base, signer),
        "Are staged fills, ReadOnly, shared fonts, Info rewrite, and a later locked signature accepted?", priority=1)
    encrypted = seal(new_document(encrypted=True), signer)
    add("22", "aes128-control", encrypted, "Is the AES-128 empty-user-password control accepted?", control=None, profile="approval-aes128", priority=1)
    encnum = roles(encrypted)["encrypt"]
    add("23", "aes128-encrypt-identical", append_raw(encrypted, {encnum: raw_body(encrypted, encnum)}),
        "Does an identical /Encrypt rewrite remain accepted?", control="22", profile="approval-aes128", priority=1,
        mutation={"kind": "identical-object-rewrite", "objectNumber": encnum, "role": "encrypt"})
    add("24", "aes128-combined-workflow", combined(encrypted, signer),
        "Is the combined workflow also accepted with legacy encryption?", control="22", profile="approval-aes128", priority=1)
    for cid, permission in [("25", 1), ("26", 2)]:
        certified = seal(new_document(profile=f"DocMDP-P{permission}"), signer, certification=permission)
        add(cid, f"p{permission}-fill", edit(certified, fill),
            f"What does form filling do under certification P={permission}?", control=None, profile=f"DocMDP-P{permission}")
    certified = seal(new_document(profile="DocMDP-P3"), signer, certification=3)
    annotation = roles(certified)["annotation"]
    original_annotation = raw_body(certified, annotation)
    changed_annotation = original_annotation.replace(b"/C [ 0 0 1 ]", b"/C [ 1 0 0 ]")
    assert changed_annotation != original_annotation
    add("27", "p3-annotation", append_raw(certified, {annotation: changed_annotation}),
        "Is changing a square annotation permitted under P=3?", control=None, profile="DocMDP-P3")
    locked = seal(new_document(profile="approval-FieldMDP"), signer, lock=["ValueOne"])
    add("28", "locked-field-fill", edit(locked, fill),
        "Is filling a locked field rejected despite otherwise being ordinary filling?", control=None, profile="approval-FieldMDP")
    assert base.count(b"Reference amount: 1000") == 1
    add("29", "signed-byte-tamper", base.replace(b"Reference amount: 1000", b"Reference amount: 9000"),
        "Does the setup identify a broken cryptographic digest?", priority=1, intentionallyInvalidDigest=True)
    shared_base = seal(new_document(shared_page_font=True), signer)
    def change_shared_glyph(w):
        font = w.root["/AcroForm"]["/DR"]["/Font"]["/Shared"]
        glyph_ref = font["/CharProcs"].raw_get("/A")
        glyph = glyph_ref.get_object()
        glyph._data = b"600 0 0 0 600 700 d1 60 w 70 60 m 530 60 l S"
        # A parsed stream also retains its original encoded bytes. Discard
        # that cache so this revision actually writes the changed glyph.
        glyph._encoded_data = None
        w.mark_update(glyph_ref)
        ref = field_ref(w, "ValueOne")
        ref.get_object()[N("/V")] = S("A")
        ref.get_object()[N("/AP")] = D(N=appearance(w, "A", w.root["/AcroForm"]["/DR"]["/Font"].raw_get("/Shared")))
        w.mark_update(ref)
    add("30", "font-shared-with-page", edit(shared_base, change_shared_glyph),
        "Does a fill fail validation when its changed font also changes signed page content?", control=None, priority=1)
    if len(cases) != 30:
        raise AssertionError("case count changed; update corpus version and documentation")
    for case in cases:
        expected = not case.get("intentionallyInvalidDigest", False)
        assert all(s["digestMatches"] == expected for s in case["facts"]["signatures"]), case["id"]
    manifest = {
        "schemaVersion": 1, "corpusVersion": "role-probes-v1", "source": "synthetic-from-scratch",
        "generator": {"pyhanko": "0.37.0", "cryptography": "50.0.1", "signingTime": SIGNING_TIME.isoformat()},
        "requestedObserver": {"application": "Adobe Acrobat (edition not yet recorded)",
                              "build": "26.2.21869.0", "architecture": "arm64", "processor": "Apple M1 Max",
                              "osVersion": None, "agm": "8.0.3", "coolType": "11.0.0", "jp2k": "5.0.0.59456"},
        "certificateSha256": hashlib.sha256((HERE / "keys/TEST-ONLY-signer.cer").read_bytes()).hexdigest(),
        "cases": cases,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Generated {len(cases)} synthetic cases in {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    generate(args.out.resolve())
