---
'@embedpdf/engine-services': minor
---

Form writes stamp field attribution in the field's `/EMBD_Metadata` (`features/forms/internal/fieldAttribution.ts`): `create` stamps the creator, a value write that changes the value and a script's value effect stamp the filler, a reset clears it. The stamp is written inside the change's capture, so undo puts the previous one back. The form read reports the six attribution members; widget rows report none.
