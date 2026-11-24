---
'@embedpdf/plugin-form': minor
---

A field placed, created or copied without a group shows in no group at once, where the engine now leaves it: a new field is in no group unless its draft names one, whatever the session's own group is (`identity.groupId`). An app whose session has a group, and that relied on new fields landing in it, names the group in the draft: `form.create({ kind: 'text', name: 'note', groupId: 'legal', widgets })`. A field an update takes out of its group (`groupId: null`) shows in none at once too.
