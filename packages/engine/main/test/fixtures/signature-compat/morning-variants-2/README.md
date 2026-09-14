# Morning isolation, round 2

E and F failing means the cause is not what was rewritten. Two candidates remain: the signer's
trust state (Dev signer is untrusted; the corpus key is trusted), and the signing revision our
viewer wrote. These files separate them. All bases are the public ebook; no personal data.

| file                                                         | what it is                                                                      | question                                                                                                             |
| :----------------------------------------------------------- | :------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------- |
| `dev-signer.cer`                                             | the Dev signer certificate extracted from the morning file's CMS                | import and trust it (signatures + certified documents, like the corpus key), then re-validate A-F and G from round 1 |
| `morning-F2-orphan-object-corpus-append-style.pdf`           | F rebuilt with the corpus generator's own append code (LF line endings)         | does the append style matter?                                                                                        |
| `morning-H-ebook-signed-with-corpus-key.pdf`                 | the same ebook signed by pyHanko with the TRUSTED corpus key; no later revision | control                                                                                                              |
| `morning-I2-corpus-key-signed-plus-orphan-corpus-append.pdf` | H + one unreferenced object, corpus append style                                | same, LF style                                                                                                       |

Reading the outcome: if A-F become valid after trusting Dev signer, the morning result was a trust
effect. If I and I2 are valid while A-F stay invalid with Dev signer trusted, the cause is in the
signing revision our viewer wrote. If I and I2 are invalid too, the cause is the ebook base itself.

## Correction to round 1

Round-1 variants B-F ended with a bare `%%EOF` (no line ending after it). Our own engine then
sees no closed final revision (`chainValid: false`) and refuses to analyze them; Acrobat may reject
them for the same defect, so their failures do not isolate anything.
A (the original) and G have no such line. B2-E2 rebuild B-E with the corpus generator's append
code (first appended byte immediately after the signed `%%EOF\r\n`); F2 does the same for F.

Please validate: A, G (round 1) after trusting `dev-signer.cer`; then B2, C2, D2, E2, F2 (Dev
signer) and H, I2 (corpus key).

## Completed observation

The [2026-09-14 trusted round-2 results](ACROBAT-RESULTS-2026-09-14.md) and
[complete JSON record](ACROBAT-RESULTS-2026-09-14.json) cover these nine cases.
G and H are valid and unchanged; A, B2–F2 and I2 remain invalid with both
identities trusted. H/I2 were reopened and revalidated with the same results.
The results document distinguishes the observations from the causal hypotheses
above. All PDF inputs, manifests and round-1 records were preserved.
