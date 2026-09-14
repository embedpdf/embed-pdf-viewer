# Review: judge signatures by role

This is the initial review, written before observing the synthetic corpus in
Acrobat. The completed 2026-09-13 run and changes to the working hypotheses are
recorded in [FINDINGS.md](FINDINGS.md).

The direction is sound: retain the actual revision/object evidence, then judge
it using object roles, effective permissions and field locks. Synthetic probes
are the right next step. The reported Acrobat result supports investigating
specific allowances, but does not establish the entire proposed rule table.

## Changes needed before making policy more permissive

1. **Keep explicit field-property allowances.** Replacing a whitelist with
   “anything except structural keys” also admits actions (`/A`, `/AA`), moving
   fields (`/Rect`), hiding them (`/F`), option changes (`/Opt`), and unrelated
   semantic flags in `/Ff`. Evidence for ReadOnly, `/TU`, `/DA` and `/AP` does not
   establish these other cases. In particular, the proposal says a field cannot
   change its place on the page while its code permits `/Rect`.
2. **Classify all uses on both sides.** A resource can belong to an allowed
   appearance and also to signed page content or a locked field. A favorable
   role cannot override another protected use. “Catalog-owned” is too broad as
   an automatic allowance: catalog paths also lead to security-sensitive data.
3. **Do not equate claimed with permitted.** In the current `StepContext`, a rule
   can claim an edge while recording a forbidden finding. Subtree joining based
   on `isClaimed()` therefore needs a precise invariant; this is not automatically
   a policy-neutral cleanup. Constrain signature-value subtree admission too,
   including reused old objects and additional inbound references.
4. **Make the effective policy explicit.** The proposed identical-rewrite table
   has no policy-level input, yet its tests say the same operations are forbidden
   under `lta`. Specify role, operation, policy level and field locks together.
   Moving a fallback rule later must not let earlier housekeeping handlers bypass
   those requirements.
5. **Separate observed results from hypotheses.** Acceptance of a final document
   does not prove acceptance of each intermediate unsigned revision. Rejection
   of a combined page/widget rewrite does not identify which object caused it.
   Avoid finding text that says Acrobat rejects an isolated case until that case
   has actually been tested. Keep unknown cases conservative and label them as
   such.

## Suggested order

1. Freeze and independently verify the synthetic corpus.
2. Record Acrobat observations per signature, including trust and environment.
3. Fix narrowly demonstrated accounting gaps with shared-resource negative tests.
4. Add only the measured property/role allowances, with tests for policy levels
   and locks. Review any security implications even when Acrobat accepts a case.
5. Promote reviewed observations into engine regression expectations and bump
   the policy version for actual judgment changes.

The native file-base and WASM paths should share this policy. Keep classification
at the owning engine/core boundary; do not introduce a separate server-specific
copy of Acrobat compatibility rules.

The corpus now has a completed Acrobat observation run. Production policy
remains unchanged; promote individual expectations only after reviewing the
evidence and applicable policy and lock constraints.
