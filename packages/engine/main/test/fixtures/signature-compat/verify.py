#!/usr/bin/env python3
"""Validate corpus bytes and scenario structure independently of EmbedPDF.

OpenSSL verifies each CMS against the exact detached ByteRange bytes. No trust
store changes or network requests are made. The tamper control must fail.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from asn1crypto import cms
from generate import HERE, describe_bytes, raw_body, reader, roles


def named_field(r, name):
    return next(ref.get_object() for ref in r.root["/AcroForm"]["/Fields"]
                if ref.get_object()["/T"] == name)


def verify(directory):
    manifest = json.loads((directory / "manifest.json").read_text())
    records = []
    with tempfile.TemporaryDirectory(prefix="epdf-cms-check-") as temp:
        temp = Path(temp)
        for case in manifest["cases"]:
            data = (directory / case["file"]).read_bytes()
            assert describe_bytes(data) == case["facts"], case["id"]
            r = reader(data)
            assert len(r.root["/AcroForm"]["/Fields"]) == 4
            for ref in r.root["/AcroForm"]["/Fields"]:
                field = ref.get_object()
                if field["/FT"] == "/Tx":
                    assert "/AP" in field and len(field["/AP"]["/N"].data) > 0
            for index, signature in enumerate(r.embedded_signatures):
                br = [int(x) for x in signature.sig_object["/ByteRange"]]
                detached = data[:br[1]] + data[br[2]:br[2] + br[3]]
                (temp / "cms.der").write_bytes(cms.ContentInfo.load(bytes(signature.pkcs7_content)).dump())
                (temp / "signed.bin").write_bytes(detached)
                checked = subprocess.run([
                    "openssl", "cms", "-verify", "-binary", "-inform", "DER",
                    "-in", str(temp / "cms.der"), "-content", str(temp / "signed.bin"),
                    "-noverify", "-out", str(temp / "verified.bin"),
                ], capture_output=True, text=True)
                expected = not case.get("intentionallyInvalidDigest", False)
                assert (checked.returncode == 0) == expected, (case["id"], checked.stderr)
                records.append({"id": case["id"], "signatureIndex": index,
                                "detachedCmsValid": checked.returncode == 0})
            mutation = case.get("mutation")
            if mutation:
                # The exact previous object body remains identical after rewrite.
                previous_eof = max(s["byteRange"][2] + s["byteRange"][3]
                                   for s in case["facts"]["signatures"])
                numbers = mutation.get("objectNumbers", [mutation.get("objectNumber")])
                for num in numbers:
                    assert raw_body(data[:previous_eof], num) == raw_body(data, num)
            if case["id"] in ("21", "24"):
                assert r.total_revisions == 4
                assert [s.signed_revision for s in r.embedded_signatures] == [0, 3]
                first = named_field(r, "ValueOne")
                second = named_field(r, "ValueTwo")
                assert first["/Ff"] == 1 and first["/V"] == second["/V"] == "A"
                for field, resource in [(first, "/Shared"), (second, "/SharedTwo")]:
                    font = r.root["/AcroForm"]["/DR"]["/Font"].raw_get(resource)
                    appearance_font = field["/AP"]["/N"]["/Resources"]["/Font"].raw_get("/F1")
                    assert font.idnum == appearance_font.idnum
                signing = named_field(r, "SignatureTwo")
                assert signing["/TU"] == "Synthetic tooltip changed when signing"
                locked_fields = signing["/Lock"]["/Fields"]
                assert [locked_fields[i] for i in range(len(locked_fields))] == ["ValueOne", "ValueTwo"]
                assert signing["/V"].raw_get("/Prop_Build").idnum > 0
                for revision in range(1, 4):
                    resolver = r.get_historical_resolver(revision)
                    assert resolver.root["/AcroForm"]["/Fields"]
            if case["id"] == "16":
                font = r.root["/AcroForm"]["/DR"]["/Font"].raw_get("/Shared")
                appearance_font = named_field(r, "ValueOne")["/AP"]["/N"]["/Resources"]["/Font"].raw_get("/F1")
                assert font.idnum == appearance_font.idnum
                assert font.get_object().raw_get("/CharProcs").idnum > 0
            if case["id"] in ("22", "23", "24"):
                assert r.trailer["/Encrypt"]["/V"] == 4 and r.trailer["/Encrypt"]["/R"] == 4
            if case["id"] in ("25", "26", "27"):
                signature = r.embedded_signatures[0].sig_object
                transform = signature["/Reference"][0]
                assert transform["/TransformMethod"] == "/DocMDP"
                assert transform["/TransformParams"]["/P"] == int(case["id"]) - 24
                assert r.root["/Perms"]["/DocMDP"] == signature
            if case["id"] == "28":
                transform = r.embedded_signatures[0].sig_object["/Reference"][0]
                assert transform["/TransformMethod"] == "/FieldMDP"
                assert transform["/TransformParams"]["/Action"] == "/Include"
                assert transform["/TransformParams"]["/Fields"][0] == "ValueOne"
            if case["id"] == "15":
                base = (directory / next(c["file"] for c in manifest["cases"] if c["id"] == "01")).read_bytes()
                assert raw_body(base, roles(base)["content"]) == raw_body(data, roles(data)["content"])
            if case["id"] == "30":
                font_ref = r.root["/AcroForm"]["/DR"]["/Font"].raw_get("/Shared")
                page = r.root["/Pages"]["/Kids"][0]
                assert page["/Resources"]["/Font"].raw_get("/Shared").idnum == font_ref.idnum
                field = named_field(r, "ValueOne")
                assert field["/V"] == "A"
                assert field["/AP"]["/N"]["/Resources"]["/Font"].raw_get("/F1").idnum == font_ref.idnum
                glyph = font_ref.get_object()["/CharProcs"]["/A"]
                assert glyph.data == b"600 0 0 0 600 700 d1 60 w 70 60 m 530 60 l S"
                old_font = r.get_historical_resolver(0).root["/AcroForm"]["/DR"]["/Font"]["/Shared"]
                assert old_font["/CharProcs"]["/A"].data != glyph.data
    result = {"openssl": subprocess.check_output(["openssl", "version"], text=True).strip(),
              "caseCount": len(manifest["cases"]), "signatureChecks": records}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=HERE / "v1")
    verify(parser.parse_args().directory.resolve())
