---
'@cloudpdf/sdk': minor
---

Action trees now use shared generated types for their payload-carrying union (destinations, URIs, named actions, Hide targets, ResetForm state, file specs) instead of repeating the same models for every annotation and form response path. Recursive `/Next` chain elements remain `unknown[]` — a Fern limitation of the emitted recursive schema, not missing data.
