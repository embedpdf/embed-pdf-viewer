# Morning variants: Acrobat observations

Observed on 2026-09-14 in Acrobat Reader build 26.2.21869.0, macOS 26.6,
arm64. All seven supplied files were opened and explicitly revalidated through
Signature Properties. The order was G, A, B, C, D, E, F, then G again.

**All six appended variants are rejected, including E and F. The unchanged
control G is reported unchanged, with overall validity unknown because the
signer is untrusted.** No modification-category rows were displayed for any
file in the expanded Signatures panel.

The complete per-file properties text, hashes, environment and independent CMS
checks are in [the JSON observation record](ACROBAT-RESULTS-2026-09-14.json).

| Variant | Supplied construction                            | Properties status              | Modification text                | Change categories |
| ------- | ------------------------------------------------ | ------------------------------ | -------------------------------- | ----------------- |
| A       | Original rejected revision                       | Signature is INVALID.          | Altered/corrupted sentence below | None displayed    |
| B       | Identical page rewrite only                      | Signature is INVALID.          | Altered/corrupted sentence below | None displayed    |
| C       | Identical sealed-widget rewrite only             | Signature is INVALID.          | Altered/corrupted sentence below | None displayed    |
| D       | Page + widget, original Size and ID              | Signature is INVALID.          | Altered/corrupted sentence below | None displayed    |
| E       | Identical unrelated font dictionary rewrite only | Signature is INVALID.          | Altered/corrupted sentence below | None displayed    |
| F       | New unreferenced object only                     | Signature is INVALID.          | Altered/corrupted sentence below | None displayed    |
| G       | Unchanged signed control                         | Signature validity is UNKNOWN. | Unchanged sentence below         | None displayed    |

## Exact properties wording

For A–F:

> Signature is INVALID.
>
> The document has been altered or corrupted since the Signature was applied.

For G, both before and after inspecting A–F:

> Signature validity is UNKNOWN.
>
> The document has not been modified since this signature was applied.

All seven use the same signer, displayed as **Dev signer**. All show this trust
message:

> The signer's identity is unknown because it has not been included in your list of trusted certificates and none of its parent certificates are trusted certificates.

This is a different identity from the trusted public corpus certificate. No
trust settings were changed. G's UNKNOWN status must not be recorded as a
fully trusted VALID result, and A–F's explicit alteration failures must not be
reduced to the trust warning.

All seven also display:

> The certifier has specified that Form Fill-in, Signing and Commenting are allowed for this document. No other changes are permitted.
>
> Signing time is from the clock on the signer's computer.
>
> Path validation checks were successful.
>
> Revocation checking was not performed.

The displayed signing time is `2026/09/13 12:55:37 +03'00'`. The properties
dialog says the signature was validated as of that signing time. The panel
identifies `Field: signature_1 on page 2`. That is the field-location line,
not a modification category. The complete message text is retained in JSON;
the word “certifier” above is literal UI wording, not an inferred DocMDP fact.

## What the result establishes

**Page and widget rewrites are not necessary to reproduce the rejection on
this input.** E fails without rewriting either, and F fails without rewriting
any existing object. The isolated property experiments therefore point to a
cause shared more broadly by the appended variants.

This supports investigating the signed base and revision handling together.
It does **not yet prove that the ebook base alone is defective**: the existing
signature/revision structure and the common appended xref/trailer construction
are still possible factors. The results do not establish a general rule that
identical page or sealed-widget rewrites are forbidden.

Keeping the existing conservative handling while this case is unresolved is a
separate engine-policy choice. No production validation rule or corpus policy
expectation was changed during this observation run.

## Verification and limits

- Every PDF's SHA-256 matched the supplied manifest before and after testing.
- A–F preserve G's entire 928,910-byte signed file as their exact prefix.
- All seven contain the same CMS and the same signed ByteRange content:
  `[0, 910019, 926405, 2505]`.
- All seven pass independent OpenSSL detached CMS verification. That check
  excludes certificate-chain trust; it does not reproduce Acrobat's
  modification classification.
- “None displayed” describes the inspected expanded Signatures panel. It does
  not assert that Acrobat has no internal change categories.
- Screenshots were inspected interactively; no standalone screenshot files
  were saved. No PDF was edited, saved or regenerated.

The next isolating comparison is to append the same orphan-object operation
using an independent writer, preserving the existing signed prefix, and compare
its xref/trailer construction with F. That separates a common append-format
factor from a problem triggered by updates to this signed base. It should use
a new fixture identifier and preserve A–G unchanged.
