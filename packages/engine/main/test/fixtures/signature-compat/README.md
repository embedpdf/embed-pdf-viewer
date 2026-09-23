# Signature compatibility corpus

Ninety-one synthetic PDFs for investigating how validators classify changes after a
signature. Every PDF was created from scratch. No customer PDF, extracted page,
metadata, certificate, font, signature, or object body was copied into this pack.

**All 52 v1/v2 PDFs were observed in Acrobat Reader on 2026-09-13**, covering 61
signatures with the test identity trusted. The original v1 corpus contains 30
PDFs; the v2 follow-up adds 22 probes and controls. See [FINDINGS.md](FINDINGS.md)
for the initial run and [FINDINGS-V2.md](FINDINGS-V2.md) for the follow-up;
[observations.json](observations.json)
preserves the displayed messages, exact PDF hashes, and environment. Production
signature policy is unchanged by this corpus.

The `role-probes-v3` batch adds **39 PDFs (53-91), containing 42 signatures**.
It isolates the remaining rewrite, serialization, P2, field-lock, restoration,
and field/annotation-lifecycle questions. All 39 PDFs and 42 signatures were
observed in the same Acrobat environment on 2026-09-14. Use `acrobat-results-template-v3.json`
or its CSV companion to record a new run. See [FINDINGS-V3.md](FINDINGS-V3.md)
for the new observations and their limits.

## Weak annotation follow-up (2026-09-23)

The separate [weak annotation investigation](weak-annotations/README.md) preserves
88 PDF files, 12 hash-linked Acrobat screenshots, raw observations, engine
reports and reproduction tools. It tests direct annotation dictionaries, lazy
`/NM` naming, identical rewrites and explicit DocMDP P=3. The direct P3 baseline
was already invalid before editing; the report keeps this separate from failures
caused by subsequent mutations. These diagnostics are not promoted policy
expectations and do not change the 91-case v1/v2/v3 corpus above.

## Start here in Acrobat

1. Open `v1/01-approval-control.pdf` and `v1/22-aes128-control.pdf`. Neither has
   changes after signing. Open the Signatures panel and inspect signature
   properties. The encrypted file opens with an empty password.
2. Check `v1/29-signed-byte-tamper.pdf`. Its signed bytes were deliberately
   damaged. It must fail integrity validation even if the signer is trusted.
3. Compare cases 02-07 with 01, then 09, 16, 18, 19, 21, 23 and 24. These target
   the proposed role rules. For every file with two signatures, record **both**
   signatures separately. Case 24 is the encrypted four-revision workflow.
4. Continue with the remaining controls, especially 10-15 and 30. Cases 14 and
   15 distinguish an intervening page edit from its later restoration.

Use the original fixture bytes. Do not fill, save, optimize, or re-sign them in
Acrobat while recording results: that would create a different test input. If
you intentionally create a variant, keep it separately with a new identifier
and hash.

### The test certificate

These signatures use a deliberately public, self-signed test identity. A trust
warning on its own does not tell us whether Acrobat accepts later changes.
Record the exact trust and modification messages separately.

If trust prevents you from reaching the useful validation details, use an
isolated Acrobat test profile/account and trust this certificate for signature
validation there. Do not install it into the system keychain or enable
privileged JavaScript, dynamic content, or network access. The public certificate
is `keys/TEST-ONLY-signer.cer`; the repository also contains its intentionally
public private key solely to generate further synthetic fixtures.

Certificate SHA-256 (DER bytes):

```text
0f13f8fc08b2c73b9142fdd9fa9bffcc7c939e134dde6a6bb7ce4d7d91b22d74
```

Adobe documents the certificate dialog under Signature Properties > Show
Signer's Certificate > Trust > Add to Trusted Certificates. Verify the
fingerprint before changing trust. See Adobe's
[certificate import instructions](https://helpx.adobe.com/acrobat/desktop/protect-documents/encrypt-with-certificates/import-via-digital-sign.html)
and [separate trust options](https://helpx.adobe.com/ca/acrobat/desktop/e-sign-documents/manage-digital-signatures/set-certificate-trust.html).

Case 12 contains only a synthetic validation action, `event.rc = true;`, to test
whether adding `/AA` is classified as an allowed field-property change. It has
no external action. No security setting needs to be relaxed to test it.

## Promoting expectations

`policy-expectations.json` is generated from the review table in `promote_expectations.py`, never
edited by hand and never derived from an engine answer. Every entry names the observation run it
rests on, the engine policy it was reviewed against, and how the expected verdict relates to what
Acrobat displayed (`matches-observed-behavior`, `intentional-stricter-policy`, or an
`engine-specific-definition` of "unchanged"). The corpus test enforces the entries and, for an
intentional difference, also checks that Acrobat did accept the case. A case without an entry is
compared against the frozen `engine-baseline-*.json` snapshots instead.

```text
python promote_expectations.py
```

## Record observations

Use `acrobat-results-template.json` for a complete run, or
`acrobat-results-template.csv` as a simpler per-signature worksheet. You can also
report results conversationally, for example:

```text
02 / SignatureOne
Overall status: [exact Acrobat wording]
Changes after signing: [exact wording, including any categories]
Signer trust: [exact wording]
```

The JSON template already records the supplied observer details:

- Build 26.2.21869.0, arm64, Apple M1 Max
- AGM 8.0.3, CoolType 11.0.0, JP2K 5.0.0.59456
- These are template defaults; record the exact edition and operating system for
  each run. The first completed run used Acrobat Reader on macOS 26.6 (25G72).

Also record the test date, certificate trust configuration, validation-time and
revocation preferences, and relevant JavaScript settings. Leave unavailable
details unknown. If a dialog does not expose an integrity or modification result,
record that rather than inferring it from the overall badge. Adobe's
[validation preferences](https://helpx.adobe.com/ca/acrobat/desktop/e-sign-documents/manage-digital-signatures/set-preferences.html)
explain the relevant settings.

Screenshots of these synthetic files can accompany a run. Do not include
customer screenshots. The files' SHA-256 hashes in each version's `manifest.json` identify
exactly what was tested.

## What the cases cover

| Cases | Question                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------- |
| 01    | Unchanged approval signature                                                                         |
| 02-07 | Identical rewrites of Info, a custom catalog object, page, sealed widget, text field, and annotation |
| 08-13 | Ordinary filling; ReadOnly, rectangle, visibility, action, and identity changes in isolation         |
| 14-15 | Changed page content, then restoration in another revision                                           |
| 16    | Appearance font shared with AcroForm defaults, including indirect descendants                        |
| 17-20 | Second signature alone, tooltip change, field lock, and indirect signature build data                |
| 21    | Four revisions: first signature, two staged fills, second signature                                  |
| 22-24 | AES-128 control, identical Encrypt rewrite, and encrypted combined workflow                          |
| 25-28 | P1 and P2 filling, P3 annotation change, and a locked-field violation                                |
| 29    | Deliberate damage to signed bytes                                                                    |
| 30    | A font changed by a form fill is also used by signed page content                                    |

The combined cases reproduce structural motifs from the reported workflow, not
the original producer's exact output. They include ReadOnly, changed default
appearance, regenerated appearances with shared font descendants, identical
housekeeping rewrites, and a second signature with tooltip, lock and build data.
Both have four revisions and signatures sealing revisions 0 and 3.

The shared font is a synthetic Type3 font. TrueType subsets, CID fonts, further
field/widget arrangements, every policy/property combination, and additional
encryption formats need separate future cases. The original v1 P1/P2/P3 and lock
probes contain their signed control revision inside each file. Later batches
add dedicated P2 and lock controls. The corpus does not test certificate services, AATL,
revocation, trusted timestamps, or LTV.

The v2 cases (31–52) isolate annotation presentation, page-only and shared fonts,
appearance changes without value changes, explicit P2 certification, restoration
across two signatures, equivalent rendering with different stream bytes, combined
identical rewrites, and locked-field geometry and visibility. Seven unchanged
controls establish the new bases. See the per-case table in `FINDINGS-V2.md`.

## v3: decision-blocking probes

| Cases | Question                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| 53-57 | Merged signature widget: identical page/widget rewrite, phantom Size +2, changed ID[1], and both                           |
| 58-60 | Separate Kids widget: signed control, widget-only rewrite, and combined page/widget/Size/ID probe                          |
| 61-62 | Value-identical page and text-field dictionaries with reversed key order and different whitespace                          |
| 63-71 | P2 control; ReadOnly, DA, TU, hidden flag, AP regeneration, second signature with Lock + TU, identical page/field rewrites |
| 72-77 | Include lock on ValueOne; DA, TU, AP regeneration, ReadOnly, and identical rewrite                                         |
| 78-79 | A font shared between locked and unlocked appearances, with no page-content use                                            |
| 80-85 | Intermediate negative controls and exact restorations under FieldMDP, P2, and a second signature                           |
| 86-91 | Text-field addition/removal and Square addition/removal/colour modification, with explicit appearances                     |

Each family has a signed control. Restoration cases include the intermediate
changed state; cases 84 and 85 require two separate signature observations.
Case 69 also requires both signatures. The extra ID-only case separates a
changed ID from an oversized Size. Phantom Size entries are intentional
trailer edge cases, not a claim that this is preferred conforming output.

Cases 68 and 75 rewrite the existing appearance stream with an additional PDF
comment: the logical value and drawing remain unchanged. They do not test an
arbitrary visible appearance change. Case 79 changes the actual shared Type3
glyph and fills only ValueTwo. Its locked ValueOne dictionary, V, and AP stream
remain untouched; its effective appearance resource changes. Compare Acrobat's
visible values with the independently rendered stored appearances.

The v3 generator uses only synthetic source material and the existing public
test key. The private morning file and its observation record are outside the
public corpus and distributable archive. Do not copy their objects or pages
into a fixture.

Run the dedicated structural and independent CMS verifier for v3:

```sh
/tmp/epdf-signature-fixtures/bin/python packages/engine/main/test/fixtures/signature-compat/verify_v3.py
```

`engine-baseline-role-probes-v3.json` records the current engine's results for
these 39 inputs. All 91 case reports agree between WASM and native `layerFile`.
The report is diagnostic evidence, not a policy oracle. No promoted policy
expectations were added with v3.

## Automated checks and policy decisions

Keep three layers separate:

1. `v1/manifest.json`, `v2/manifest.json`, and `v3/manifest.json`: immutable input facts, including hashes, revision counts,
   signature fields, ByteRanges and expected digest integrity.
2. `observations.json`: raw Acrobat runs. Separate completed runs cover v1, v2 and v3.
   Append future runs after reviewing the filled template; preserve actual
   wording and environment. Generation-time `acrobat.status` fields in the frozen
   manifest describe its initial state; this file owns later observations.
3. `policy-expectations.json`: reviewed engine modification expectations,
   initially empty. Each entry references the exact PDF hash and observation
   run, with a rationale. Observing Acrobat accept something does not
   automatically make it safe to permit in the engine.

A policy entry has this shape (illustrative values, not an observed result):

```json
{
  "id": "CASE_ID",
  "sha256": "EXACT_PDF_SHA256",
  "observationRunId": "RECORDED_RUN_ID",
  "rationale": "Why this observation supports this policy for this case",
  "modifications": ["permitted", "unchanged"]
}
```

The modification array follows signature order. Add reviewed expectations
together with the corresponding engine fix; never populate them from a current
engine report just to make tests pass. An intentional departure from Acrobat
should be explicit in the rationale.

`engine-baseline-v3.json` preserves the working-tree engine results captured
alongside the first Acrobat run. WASM and native file-base reports agreed on all
30 cases. It is a diagnostic snapshot, not a set of required future verdicts.
`engine-baseline-role-probes-v2.json` records the 22 follow-up cases; the policy
version in that report is still 3. Both runtimes agreed on all 52 cases.

From the repository root, with engine packages and runtime payloads built:

```sh
pnpm --filter @embedpdf/core-signature exec vitest run test/compatibility-corpus.test.ts
EPDF_SIGNATURE_CORPUS_RUNTIME=native pnpm --filter @embedpdf/core-signature exec vitest run test/compatibility-corpus.test.ts
```

The default run uses WASM. The native run opens `layerFile` document bases, as
used by server-side file workflows. CI runs both and compares their results.
This exercises validation through both runtimes; it does not replace tests for
cloud transport, signing publication, storage, or server memory use.

Set `EPDF_SIGNATURE_CORPUS_REPORT=/absolute/path/report.json` to capture current
engine verdicts and findings. These reports are diagnostics, not Acrobat
observations. Each run has 91 fixture tests plus one evidence-provenance test.

For an independent check using Python and OpenSSL:

```sh
python3 -m venv /tmp/epdf-signature-fixtures
/tmp/epdf-signature-fixtures/bin/pip install -r packages/engine/main/test/fixtures/signature-compat/requirements.txt
/tmp/epdf-signature-fixtures/bin/python packages/engine/main/test/fixtures/signature-compat/verify.py
/tmp/epdf-signature-fixtures/bin/python packages/engine/main/test/fixtures/signature-compat/verify.py packages/engine/main/test/fixtures/signature-compat/v2
/tmp/epdf-signature-fixtures/bin/python packages/engine/main/test/fixtures/signature-compat/verify_v2.py
/tmp/epdf-signature-fixtures/bin/python packages/engine/main/test/fixtures/signature-compat/verify_v3.py
```

OpenSSL checks all 103 detached signatures against their exact ByteRange
content across the three corpora; only case 29 must fail. Its `-noverify` flag skips certificate-chain
trust, not the cryptographic signature/content verification.

## Extend without losing evidence

Prefer one changed property per probe and pair it with a control. Keep combined
workflows as separate integration cases. Cover all inbound references to shared
resources, including signed pages and locked fields, and test intermediate
revisions as well as the final document.

`generate.py` uses pinned pyHanko and cryptography versions independently of
EmbedPDF's writer. It refuses to overwrite a nonempty output directory:

```sh
/tmp/epdf-signature-fixtures/bin/python packages/engine/main/test/fixtures/signature-compat/generate.py --out /tmp/epdf-signature-candidate
/tmp/epdf-signature-fixtures/bin/python packages/engine/main/test/fixtures/signature-compat/generate_v2.py --out /tmp/epdf-signature-candidate-v2
/tmp/epdf-signature-fixtures/bin/python packages/engine/main/test/fixtures/signature-compat/generate_v3.py --out /tmp/epdf-signature-candidate-v3
```

Generation is not byte-deterministic: pyHanko normally mints a random `/ID[1]`
for each incremental write, and AES encryption uses random IVs. Re-running a
generator therefore cannot reproduce the frozen bytes. The v3 writer explicitly
preserves `/ID[1]` except in its dedicated ID probes, but that does not change the
immutability rule. Keep all observed `v1`, `v2`, and `v3` bytes frozen. A new
generation needs a new corpus version, reviewed manifest and fresh observations;
never carry an old observation over to a different hash.

Before accepting a new fixture, verify its intended object changes independently,
check cryptography, and render it. Include controls for forbidden changes so the
corpus cannot become a collection of only examples we want to accept.

ISO 32000 already defines DocMDP and FieldMDP. This project can build a useful
empirical compatibility profile around detailed classification questions; it
should distinguish normative requirements from observed vendor behavior. See
the PDF Association's [digital-signature clauses and errata](https://pdf-issues.pdfa.org/32000-2-2020/clause12.html).

See `PLAN-REVIEW.md` for the initial proposal review, `FINDINGS.md` for the first
observations, `FINDINGS-V2.md` for the first follow-up, and `FINDINGS-V3.md` for
the decision-blocking probes.
