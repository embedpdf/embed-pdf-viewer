#!/usr/bin/env python3
"""Follow-up probes for the observed v1 surprises; no customer input or v1 writes."""
import argparse
import hashlib
import json
from pathlib import Path

from generate import (
    A, D, HERE, N, S, SIGNING_TIME, appearance, append_raw, describe_bytes, edit,
    field_edit, field_ref, g, incremental, new_document, raw_body, roles,
    seal, signer_for, stream, type3_font,
)

DASH = b"600 0 0 0 600 700 d1 60 w 70 60 m 530 60 l S"


def page_of(w):
    return w.root["/Pages"]["/Kids"][0]


def document(profile="approval", font_mode=None, initial_a=False, square=False):
    w = new_document(profile=profile, shared_page_font=font_mode is not None)
    page = page_of(w)
    if square:
        annotation = page["/Annots"][-1]
        annotation[N("/AP")] = D(N=stream(
            w, "q 0 0 1 RG 1 w 0.5 0.5 84 49 re S Q",
            Type=N("/XObject"), Subtype=N("/Form"), BBox=A(0, 0, 85, 50), Resources=D(),
        ))
    else:
        # Eliminate the missing-appearance Square annotation from the new bases.
        page["/Annots"].pop()
    if font_mode == "page-only":
        del w.root["/AcroForm"]["/DR"]["/Font"][N("/Shared")]
    if initial_a:
        use_field_font(w, page["/Resources"]["/Font"].raw_get("/Shared"))
    return w


def rewrite_glyph(w, font_ref):
    glyph_ref = font_ref.get_object()["/CharProcs"].raw_get("/A")
    glyph = glyph_ref.get_object()
    glyph._data = DASH
    glyph._encoded_data = None
    w.mark_update(glyph_ref)


def use_field_font(w, font_ref, set_value=True):
    ref = field_ref(w, "ValueOne")
    field = ref.get_object()
    if set_value:
        field[N("/V")] = S("A")
    field[N("/AP")] = D(N=appearance(w, "A", font_ref))
    w.mark_update(ref)


def change_font(w, fill=False, clone=False, keep_value=False):
    font_ref = page_of(w)["/Resources"]["/Font"].raw_get("/Shared")
    if clone:
        # Equal initial font content, distinct font/CharProcs/glyph objects.
        font_ref = type3_font(w)
    rewrite_glyph(w, font_ref)
    if fill:
        use_field_font(w, font_ref, set_value=not keep_value)


def change_page(data):
    number = roles(data)["content"]
    body = raw_body(data, number)
    assert body.count(b"Reference amount: 1000") == 1
    return append_raw(data, {number: body.replace(b"Reference amount: 1000", b"Reference amount: 9000")})


def restore_page(data, base, equivalent=False):
    number = roles(base)["content"]
    if not equivalent:
        return append_raw(data, {number: raw_body(base, number)})
    def restore(w):
        ref = page_of(w).raw_get("/Contents")
        content = ref.get_object()
        content._data = content.data.replace(b"Reference amount: 9000", b"Reference amount: 1000") + b"% same visible page, different stream bytes\n"
        content._encoded_data = None
        w.mark_update(ref)
    return edit(data, restore)


def generate(out):
    if out.exists() and any(out.iterdir()):
        raise SystemExit("Choose an empty directory; observed corpus bytes must remain frozen.")
    out.mkdir(parents=True, exist_ok=True)
    signer = signer_for(HERE / "keys")
    cases = []
    def add(cid, title, data, question, control=None, profile="approval", **extra):
        file = f"{cid}-{title}.pdf"
        (out / file).write_bytes(data)
        facts = describe_bytes(data)
        assert all(s["digestMatches"] for s in facts["signatures"]), cid
        cases.append(dict(id=cid, file=file, question=question, control=control,
                          profile=profile, facts=facts, acrobat={"status": "unobserved"}, **extra))

    base = seal(document(), signer)
    add("31", "no-annotation-control", base, "Does removing the Square remove the baseline annotation category?")
    add("32", "explicit-annotation-appearance-control", seal(document(square=True), signer),
        "Does an explicit Square appearance remove the baseline annotation category?")
    page_only = seal(document(font_mode="page-only"), signer)
    add("33", "page-font-only-control", page_only, "Is the unchanged page-only Type3 font control accepted?")
    add("34", "page-font-only-changed", edit(page_only, change_font),
        "Does changing a font used only by page content invalidate the signature?", "33")
    shared = seal(document(font_mode="shared"), signer)
    add("35", "shared-page-font-control", shared, "Is the unchanged page/default-form shared font accepted?")
    add("36", "shared-font-without-fill", edit(shared, change_font),
        "Does registering the font in form defaults affect a glyph-only rewrite?", "35")
    add("37", "cloned-font-for-fill", edit(shared, lambda w: change_font(w, fill=True, clone=True)),
        "Is filling with a separate changed font accepted while the page font remains unchanged?", "35")
    initial_a = seal(document(font_mode="shared", initial_a=True), signer)
    add("38", "shared-font-initial-a-control", initial_a,
        "Is the unchanged page/field/default shared font accepted with initial field value A?")
    add("39", "shared-font-appearance-without-value-change",
        edit(initial_a, lambda w: change_font(w, fill=True, keep_value=True)),
        "Does a shared glyph and appearance rewrite remain accepted without changing the field value?", "38")
    p2 = seal(document(profile="DocMDP-P2", font_mode="shared"), signer, certification=2)
    add("40", "p2-shared-font-control", p2, "Is the unchanged P2 shared-font control accepted?", profile="DocMDP-P2")
    add("41", "p2-shared-font-fill", edit(p2, lambda w: change_font(w, fill=True)),
        "Does explicit P2 certification reject the shared-font page change?", "40", profile="DocMDP-P2")
    changed = change_page(base)
    restored = restore_page(changed, base)
    add("42", "page-restored-then-signed", seal(incremental(restored), signer, "SignatureTwo"),
        "Are both signatures accepted when the restored state receives a second signature?", "31")
    signed_change = seal(incremental(changed), signer, "SignatureTwo")
    add("43", "changed-page-second-signature", signed_change,
        "How are both signatures judged when the changed page is signed?", "31")
    add("44", "signed-changed-page-restored", restore_page(signed_change, base),
        "Does restoration recover the first signature while invalidating the second?", "43")
    add("45", "page-restored-equivalent-stream", restore_page(changed, base, equivalent=True),
        "Is a visually identical restoration with different decoded stream bytes accepted?", "31")
    changed_shared = change_page(shared)
    def restore_with_font(w):
        ref = page_of(w).raw_get("/Contents")
        content = ref.get_object()
        content._data = content.data.replace(b"Reference amount: 9000", b"Reference amount: 1000")
        content._encoded_data = None
        w.mark_update(ref)
        change_font(w)
    add("46", "page-restored-resource-still-changed", edit(changed_shared, restore_with_font),
        "Does restoring the page stream leave a shared-font page change detectable?", "35")
    ids = roles(base)
    rewrite_numbers = [ids["page"], ids["SignatureOne"]]
    add("47", "page-and-sealed-widget-identical",
        append_raw(base, {num: raw_body(base, num) for num in rewrite_numbers}),
        "Are identical page and sealed-widget rewrites accepted together?", "31",
        mutation={"kind": "identical-object-rewrites", "objectNumbers": rewrite_numbers})
    locked = seal(document(profile="approval-FieldMDP"), signer, lock=["ValueOne"])
    add("48", "locked-field-control", locked, "Is the unchanged locked-field control accepted?", profile="approval-FieldMDP")
    add("49", "locked-field-moved", edit(locked, lambda w: field_edit(w, "/Rect", A(300, 535, 510, 563))),
        "Is moving a locked field rejected?", "48", profile="approval-FieldMDP")
    add("50", "p2-field-moved", edit(p2, lambda w: field_edit(w, "/Rect", A(300, 535, 510, 563))),
        "Is moving an unlocked field accepted under explicit P2 certification?", "40", profile="DocMDP-P2")
    add("51", "locked-field-hidden", edit(locked, lambda w: field_edit(w, "/F", g.NumberObject(6))),
        "Is hiding a locked field rejected?", "48", profile="approval-FieldMDP")
    add("52", "shared-font-filled-without-annotation", edit(shared, lambda w: change_font(w, fill=True)),
        "Does the original shared-font acceptance reproduce without the Square annotation?", "35")
    assert len(cases) == 22
    manifest = dict(schemaVersion=1, corpusVersion="role-probes-v2", source="synthetic-from-scratch",
                    generator=dict(pyhanko="0.37.0", cryptography="50.0.1", signingTime=SIGNING_TIME.isoformat()),
                    certificateSha256=hashlib.sha256((HERE / "keys/TEST-ONLY-signer.cer").read_bytes()).hexdigest(),
                    cases=cases)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Generated {len(cases)} probes and controls in {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    generate(parser.parse_args().out.resolve())
