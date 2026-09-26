# Morning isolation round 2: both identities trusted

Observed on 2026-09-14 in Acrobat Reader build 26.2.21869.0, macOS 26.6,
arm64. All nine supplied cases were explicitly revalidated in Signature
Properties after confirming that Dev signer was trusted. The corpus identity
was also trusted. H and I2 were closed, reopened and validated again; both
results repeated.

**G and H are valid and unchanged. A, B2–F2 and I2 are invalid.** In particular,
the orphan append also fails on the ebook signed by pyHanko with the trusted
corpus key. This is not a failure confined to the viewer's signing output.

The [JSON observation record](ACROBAT-RESULTS-2026-09-14.json) preserves exact
properties wording, input hashes, signer identity, the trust preflight and
independent CMS verification. A and G refer to the unchanged files in the
round-1 directory. All round-1 observations remain untouched.

| Case | Input                                          | Acrobat result after explicit validation | Change categories |
| ---- | ---------------------------------------------- | ---------------------------------------- | ----------------- |
| A    | Original rejected file, Dev signer now trusted | INVALID; altered/corrupted               | None displayed    |
| B2   | Corrected identical page rewrite               | INVALID; altered/corrupted               | None displayed    |
| C2   | Corrected identical widget rewrite             | INVALID; altered/corrupted               | None displayed    |
| D2   | Corrected page and widget rewrite              | INVALID; altered/corrupted               | None displayed    |
| E2   | Corrected unrelated font dictionary rewrite    | INVALID; altered/corrupted               | None displayed    |
| F2   | Corrected new orphan object                    | INVALID; altered/corrupted               | None displayed    |
| G    | Viewer-signed control, Dev signer now trusted  | VALID; unchanged                         | None displayed    |
| H    | Ebook signed by pyHanko with corpus key        | VALID; unchanged                         | None displayed    |
| I2   | H plus an orphan object, corpus append style   | INVALID; altered/corrupted               | None displayed    |

## Literal properties messages

All seven rejected cases display:

> Signature is INVALID.
>
> The document has been altered or corrupted since the Signature was applied.

G displays:

> Signature is VALID, signed by Dev signer.
>
> The document has not been modified since this signature was applied.

H displays:

> Signature is VALID, signed by EmbedPDF PUBLIC TEST KEY ONLY.
>
> The document has not been modified since this signature was applied.

All nine explicitly report:

> Source of Trust obtained from manually imported trusted identity.
>
> The signer's identity is valid.
>
> Path validation checks were successful.
>
> Revocation checking is not performed for Certificates that you have directly trusted.

Their common permission message is:

> The certifier has specified that Form Fill-in, Signing and Commenting are allowed for this document. No other changes are permitted.

“Certifier” is the literal UI word; it does not establish the presence of a
DocMDP transform. The Dev signatures show signing time
`2026/09/13 12:55:37 +03'00'`. H and I2 show
`2026/09/14 10:57:09 +03'00'` and `Reason:  morning isolation`. Properties say
validation occurred as of each signature's signing time. The complete text is
retained per file in JSON.

No modification-category rows appeared in any expanded Signatures panel. The
panel's `Field: signature_1 on page 2` line is a field location, not a change
category. The same absence of categories persisted on the H/I2 rechecks.

## Trust preflight

At the beginning of this run, G still reported UNKNOWN and Certificate Viewer
said “This certificate is not trusted.” The import/edit dialog had its trust
permissions unset. The user completed the trust configuration, after which a
fresh open and explicit validation of G reported VALID with a valid signer
identity. The table above contains only results after that confirmation.

The assistant did not change certificate trust or other security preferences.
The final detailed trust checkboxes were not re-inspected; the properties
messages directly confirm that both signer identities were trusted during the
recorded checks. No privileged-content setting was needed for observation.

## Interpretation

**Missing trust does not explain A's rejection.** A remains invalid with a
valid, trusted signer, while G becomes valid and unchanged. The same trust
state applies to all corrected Dev-signed variants.

**The missing final newline is not a sufficient explanation for the corrected
set.** All nine inputs used in this run end with a line ending and preserve
their appropriate signed control prefix. B2–F2 still fail. This does not
retroactively validate the defective round-1 constructions or identify why
Acrobat rejected those older files.

**The failure does not require the viewer's signing revision.** H is accepted,
but I2 fails after the independent pyHanko signing output. That rules out a
viewer-specific signing revision as a necessary trigger for this observed
failure. It also does not support the broader claim that every document
signed by the product must fail after later edits.

**The shared ebook and incremental-update handling are now the leading area
to investigate.** In the README's decision tree, this follows the “I2 invalid
too” branch. The narrower evidence-based conclusion is that failure occurs
with both signing outputs on this ebook. The exact cause remains unisolated:
the common append construction and its interaction with the ebook's existing
structure remain possible factors. The experiment does not by itself prove
that the ebook base is malformed.

The next useful control would apply the exact same orphan append to a small
signed corpus base, and compare I2 with an orphan append on H produced by a
different incremental writer. Keep these as new inputs with new identifiers.
No new fixtures or production policy changes were made during this run.

## Independent checks and preservation

- All nine CMS signatures pass independent OpenSSL detached-content
  verification, excluding certificate-chain trust.
- Each signer family has identical CMS and signed ByteRange content across
  its corresponding inputs.
- A and B2–F2 preserve the full signed G bytes; I2 preserves the full signed H
  bytes. All nine files have final line endings.
- The embedded certificates match the supplied Dev certificate or existing
  corpus certificate. The Dev certificate DER SHA-256 is
  `7ded18c2d91b5c0b6b13f37b0859f7e13829ba53e1921ab81652e4f69e34a64f`.
- All PDF hashes and manifests match the inputs supplied before this run.
  No PDF was edited, saved or regenerated.
- Screenshots were inspected interactively; no standalone observation
  screenshots were saved. No separate Acrobat cryptographic-integrity message
  was inferred from its modification verdict.
- The reported bare-EOF engine scanner issue was not tested or changed here.
  This run records Acrobat behavior and independent cryptographic/input checks.
