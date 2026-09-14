#!/usr/bin/env python3
"""Check v2 hypotheses against parsed historical revisions, independently of engine policy."""
import argparse
import hashlib
import json
from pathlib import Path

from generate import HERE, reader


def field(resolver, name="ValueOne"):
    return next(ref.get_object() for ref in resolver.root["/AcroForm"]["/Fields"]
                if ref.get_object()["/T"] == name)


def page(resolver):
    return resolver.root["/Pages"]["/Kids"][0]


def font(resolver):
    return page(resolver)["/Resources"]["/Font"].raw_get("/Shared")


def glyph(ref):
    return ref.get_object()["/CharProcs"]["/A"].data


def appearance_font(resolver):
    return field(resolver)["/AP"]["/N"]["/Resources"]["/Font"].raw_get("/F1")


def verify(directory):
    manifest = json.loads((directory / "manifest.json").read_text())
    assert manifest["corpusVersion"] == "role-probes-v2"
    assert [c["id"] for c in manifest["cases"]] == [str(i) for i in range(31, 53)]
    data = {c["id"]: (directory / c["file"]).read_bytes() for c in manifest["cases"]}
    checks = []
    for case in manifest["cases"]:
        cid = case["id"]
        pdf = data[cid]
        assert hashlib.sha256(pdf).hexdigest() == case["facts"]["sha256"]
        r = reader(pdf)
        old = r.get_historical_resolver(0)
        if case["control"]:
            assert pdf.startswith(data[case["control"]]), (cid, "not an append-only extension of control")
        annots = page(r)["/Annots"]
        squares = [a for a in annots if a.get_object()["/Subtype"] == "/Square"]
        if cid == "32":
            assert len(squares) == 1 and squares[0].get_object()["/AP"]["/N"].data
        else:
            assert len(squares) == 0
        widget_ids = {a.idnum for a in annots if a.get_object()["/Subtype"] == "/Widget"}
        fields = r.root["/AcroForm"]["/Fields"]
        assert widget_ids == {f.idnum for f in fields} and len(fields) == 4
        if cid in ("33", "34"):
            assert "/Shared" not in r.root["/AcroForm"]["/DR"]["/Font"]
            assert appearance_font(r).idnum != font(r).idnum
        if cid in ("35", "36", "37", "38", "39", "40", "41", "46", "50", "52"):
            assert r.root["/AcroForm"]["/DR"]["/Font"].raw_get("/Shared").idnum == font(r).idnum
        if cid in ("34", "36", "39", "41", "46", "52"):
            assert glyph(font(r)) != glyph(font(old)), cid
            assert b"70 60 m 530 60 l" in glyph(font(r))
            assert b"/Shared 20 Tf 395 440 Td (A) Tj" in page(r)["/Contents"].data
        if cid in ("34", "36"):
            assert field(r)["/V"] == field(old)["/V"] == "INITIAL"
            assert field(r)["/AP"]["/N"].data == field(old)["/AP"]["/N"].data
        if cid == "37":
            assert glyph(font(r)) == glyph(font(old))
            assert appearance_font(r).idnum != font(r).idnum
            assert b"70 60 m 530 60 l" in glyph(appearance_font(r))
            assert field(r)["/V"] == "A"
        if cid in ("38", "39"):
            assert field(r)["/V"] == field(old)["/V"] == "A"
            assert appearance_font(r).idnum == font(r).idnum
        if cid in ("41", "52"):
            assert field(old)["/V"] == "INITIAL" and field(r)["/V"] == "A"
            assert appearance_font(r).idnum == font(r).idnum
        if cid in ("40", "41", "50"):
            signature = r.embedded_signatures[0].sig_object
            transform = signature["/Reference"][0]
            assert transform["/TransformMethod"] == "/DocMDP" and transform["/TransformParams"]["/P"] == 2
            assert r.root["/Perms"]["/DocMDP"] == signature
        if cid in ("42", "43", "44", "45", "46"):
            assert b"Reference amount: 9000" in page(r.get_historical_resolver(1))["/Contents"].data
            current = page(r)["/Contents"].data
            if cid == "43":
                assert b"Reference amount: 9000" in current
            else:
                assert b"Reference amount: 1000" in current
            if cid in ("42", "44", "46"):
                assert current == page(old)["/Contents"].data
            if cid == "45":
                assert current != page(old)["/Contents"].data
                assert current.split(b"% same visible page")[0] == page(old)["/Contents"].data
            if cid in ("42", "43", "44"):
                assert [s.signed_revision for s in r.embedded_signatures] == ([0, 3] if cid == "42" else [0, 2])
        if cid in ("48", "49", "51"):
            transform = r.embedded_signatures[0].sig_object["/Reference"][0]
            assert transform["/TransformMethod"] == "/FieldMDP"
            params = transform["/TransformParams"]
            assert params["/Action"] == "/Include" and params["/Fields"][0] == "ValueOne"
        if cid in ("49", "50"):
            rect = field(r)["/Rect"]
            assert [int(rect[i]) for i in range(4)] == [300, 535, 510, 563]
            assert field(r)["/V"] == field(old)["/V"]
        if cid == "51":
            assert field(r)["/F"] == 6 and field(old)["/F"] == 4
        checks.append({"id": cid, "structureVerified": True})
    print(json.dumps({"corpusVersion": manifest["corpusVersion"], "checks": checks}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=HERE / "v2")
    verify(parser.parse_args().directory.resolve())
