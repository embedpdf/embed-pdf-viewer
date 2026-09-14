# Acrobat v3: decision-blocking role probes

Date: 2026-09-14. Corpus: `role-probes-v3`, cases 53–91. All **39 PDFs and 42
signatures** were independently verified and inspected in Acrobat Reader. The
batch includes ten controls or intermediate states. All material is synthetic;
no private PDF content was copied. The frozen v1/v2 bytes were preserved.

Raw wording, hashes and environment are in [observations.json](observations.json),
run `acrobat-reader-26.2.21869-macos-arm64-2026-09-14-v3-trusted`. The engine
snapshot is [engine-baseline-role-probes-v3.json](engine-baseline-role-probes-v3.json).
Acrobat build 26.2.21869.0 on macOS 26.6, arm64, used the same manually trusted
public test identity as v1/v2. Trust and verification preferences were unchanged.

Twenty-eight PDFs have all signatures accepted; eleven contain an invalid
signature. Cases 69 and 84 have mixed results. These observations do not change
production engine policy or promote any expected engine verdicts.

## Per-case results

“Unchanged” and “permitted changes” describe Acrobat's properties-dialog text.
They are not our interpretation of whether an incremental revision exists.
“Later changes” means an approval signature remains valid while Acrobat
acknowledges changes after it. Every signature in a two-signature file was read
separately. Panel categories are recorded separately from these results.

| Case | Probe                                                                  | Acrobat result                                            |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| 53   | Merged-widget approval control                                         | Valid, unchanged                                          |
| 54   | Identical page and sealed-widget rewrite                               | Valid, unchanged                                          |
| 55   | Same, with phantom Size +2                                             | Valid, unchanged                                          |
| 56   | Same, with changed ID[1]                                               | Valid, unchanged                                          |
| 57   | Same, with Size +2 and changed ID[1]                                   | Valid, unchanged                                          |
| 58   | Separate Kids-widget control                                           | Valid, unchanged                                          |
| 59   | Identical separate sealed-widget rewrite only                          | Valid, unchanged                                          |
| 60   | Separate widget plus identical page, Size +2 and changed ID[1]         | Valid, unchanged                                          |
| 61   | Page dictionary: same values, different key order and whitespace       | Valid, unchanged                                          |
| 62   | Text-field dictionary: same values, different key order and whitespace | Valid, unchanged                                          |
| 63   | P2 certification control                                               | Valid certification, unchanged                            |
| 64   | P2: ReadOnly bit alone                                                 | Valid certification, permitted changes                    |
| 65   | P2: DA alone                                                           | Valid certification, permitted changes                    |
| 66   | P2: TU alone                                                           | Invalid certification                                     |
| 67   | P2: hidden F flag                                                      | Invalid certification                                     |
| 68   | P2: AP regenerated with unchanged value and drawing                    | Valid certification, permitted changes                    |
| 69   | P2: second signature with Lock and TU                                  | First certification invalid; second valid, unchanged      |
| 70   | P2: identical page rewrite                                             | Valid certification, permitted changes                    |
| 71   | P2: identical field rewrite                                            | Valid certification, permitted changes                    |
| 72   | Include-lock control on ValueOne, Ff=0                                 | Valid, unchanged                                          |
| 73   | Locked field: DA alone                                                 | Invalid                                                   |
| 74   | Locked field: TU alone                                                 | Invalid                                                   |
| 75   | Locked field: AP regenerated with unchanged value and drawing          | Valid, unchanged                                          |
| 76   | Locked field: ReadOnly bit alone                                       | Valid, unchanged                                          |
| 77   | Locked field: identical rewrite                                        | Valid, unchanged                                          |
| 78   | Locked/unlocked shared-font control                                    | Valid, unchanged                                          |
| 79   | Unlocked fill plus changed font also used by locked appearance         | Valid, later changes                                      |
| 80   | Locked value changed: intermediate control                             | Invalid                                                   |
| 81   | Locked value and original AP reference restored                        | Valid, unchanged                                          |
| 82   | P2 page content changed: intermediate control                          | Invalid certification                                     |
| 83   | P2 page content restored exactly                                       | Invalid certification on reopen and explicit revalidation |
| 84   | Locked value changed, then second signature: intermediate control      | First invalid; second valid, unchanged                    |
| 85   | Original locked field restored after case 84                           | First valid, unchanged; second valid, later changes       |
| 86   | Approval: text field added                                             | Invalid                                                   |
| 87   | Approval: text field deleted                                           | Invalid                                                   |
| 88   | Approval: Square added with explicit AP                                | Valid, later changes                                      |
| 89   | Approval: unchanged Square control with explicit AP                    | Valid, unchanged; panel still lists Annotations Modified  |
| 90   | Approval: Square deleted                                               | Valid, later changes                                      |
| 91   | Approval: Square colour and explicit AP changed to red                 | Valid, later changes                                      |

## What this lets us decide

**The morning contradiction is still open.** The private reference file was
reopened locally. Signature Properties says “Signature is INVALID.” and “The
document has been altered or corrupted since the Signature was applied.” Its
expanded signature panel did not expose modification-category rows. The identity
is untrusted, unlike our corpus identity; the alteration message was recorded
separately. Independent CMS verification succeeds. The final incremental update
rewrites a page and sealed widget with identical parsed values, increases Size
by two and changes ID[1]. Cases 54–60 reproduce these motifs independently and
together, but all are accepted. These features alone do not explain the private
file's failure. Its name, hash, full transcript and source bytes remain outside
this public corpus and archive; no customer screenshot is included.

**Dictionary equality cannot be raw serialization equality for these probes.**
Cases 61 and 62 have different object-body bytes but equal parsed dictionaries,
and Acrobat calls them unchanged. This supports reporting a structural/value
comparison for those dictionaries in `equality.method`. It does not establish
rules for every PDF scalar representation, cycles, indirect graph identity,
duplicate keys or streams. In particular, v2 case 45 rejected equal rendering
with different decoded page-stream bytes. Dictionary equality and stream
equality need separate evidence and explicit comparison methods.

**P2 permissions depend on the changed property.** ReadOnly, DA and the narrow
same-drawing AP rewrite pass; TU and hidden fail. The combined Lock + TU + second
signature case fails for the first certification. It does not isolate Lock as
the cause. Identical page and field rewrites pass, but Acrobat calls them
permitted changes rather than unchanged. Keep the semantic delta and Acrobat's
presentation wording separate when designing the API.

**A field lock is not treated as “reject every changed field object.”** DA and
TU fail; the AP comment, ReadOnly bit and identical dictionary pass. These are
narrow observations, not permission to accept arbitrary appearance changes or
all Ff bits. Both AP probes append a harmless comment to an existing appearance
stream: the stored value and drawing remain the same. No field or value is
rewritten along with that AP probe.

**Shared appearance resources need a deliberate security policy.** Case 79
changes a Type3 glyph shared by the locked and unlocked appearances, while only
filling the unlocked field. It is accepted. The locked field's dictionary,
value and AP stream do not change, but an effective resource does. There is no
page-content use of this font. Poppler renders the stored locked appearance as
a dash and the unlocked appearance as two dashes; Acrobat displays logical A
and AA during this inspection. Thus this is not evidence that Acrobat visibly
changed the locked field. It does show that the stored shared-resource change
is accepted in this construction. Preserve protection for all owners of a
shared resource until an explicit policy review decides otherwise.

**Restoration is not universal across these restrictions.** The locked-field
restoration in 81 recovers the signature. In 85 it also recovers the first
signature across an intervening second signature; that second signature stays
valid with later changes. Its signature dictionary contains no new FieldMDP
transform, although a prior lock exists. By contrast, exact page-stream
restoration under P2 remains invalid in 83. This supports distinguishing
per-signature state comparison from certification/restriction checks; it does
not reveal Acrobat's internal replay algorithm. A blanket net-state rule and a
blanket “once invalid, always invalid” rule would each contradict this corpus.

**Field lifecycle and annotation lifecycle have different results.** Adding
or removing a text field fails, while adding, deleting or recolouring a Square
is accepted under the tested approval signature. Acrobat explicitly lists
Form Fields Added/Deleted and Annotations Created/Deleted/Modified. An explicit
appearance does not remove the unchanged Square control's panel artefact.

## Observation limits and rechecks

Case 83 initially showed a valid/permitted panel result while its properties
dialog said invalid. Closing and reopening the exact frozen file made the panel
and properties agree on invalid. Clicking Validate Signature again retained
that result. The conflicting first display is preserved in the observation
notes; the final result above is the reopened and explicitly revalidated one.
No page-change category was visible in that recheck. Do not use a transient
badge or category list as a substitute for the properties text.

Case 89 again lists Annotations Modified even though properties report
unchanged. Case 91's stored C and AP both specify red and its independent render
is red; the Acrobat screenshot showed a blue-looking outline with a red marker.
No conclusion about Acrobat's appearance regeneration is drawn from that
display. Its properties verdict and annotation category are recorded directly.

Acrobat screenshots were inspected interactively, but no standalone screenshot
files were saved. Full status, modification and permission messages came from
native properties dialogs; selected panel categories are not exhaustive. An
empty category list means none was transcribed, not proof none exists. There
is no separate Acrobat cryptographic-integrity result in the record; OpenSSL
supplies the independent CMS check. A manually trusted test certificate does
not test AATL, revocation services, timestamps or LTV.

## Verification and maintenance

- All 39 input hashes match the manifest after observation. v1/v2 files and
  manifests remain byte-for-byte unchanged.
- `verify_v3.py` checks intended historical object changes, exact restoration,
  dictionary-value equality despite different serialization, ID/Size probes,
  separate widget ownership, field-lock and certification transforms, shared
  resource ownership, explicit Square appearances and control ancestry.
- All 42 CMS signatures independently verify against their ByteRange content.
- All 39 PDFs rendered without Poppler warnings and were visually reviewed.
- The full corpus passes **92 tests on WASM and 92 on native layerFile** bases.
  All 91 engine case reports agree between runtimes. This tests validation over
  file bases; it is not a cloud-publication or server-memory benchmark.
- Current engine policy version 3 rejects signatures that Acrobat accepts in
  v3 cases 54–57, 59–62, 64, 70–71, 75–77, 79, 81, 85, 88, 90 and 91. In 85
  both signatures differ. The diagnostic baseline records these disagreements;
  passing the corpus tests does not mean the engine already matches Acrobat.
- No production engine rule or promoted policy expectation changed.

Keep all observed inputs frozen. The next implementation review can now choose
narrow dictionary, role and property rules from this evidence, with an explicit
decision on shared-resource protection and separate treatment of P2 restoration.
The private-file mismatch needs a new isolating experiment rather than an
allowance justified by the Size/ID/widget probes.
