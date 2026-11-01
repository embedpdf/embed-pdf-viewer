---
'@cloudpdf/server': patch
---

A signature moves only the layer it was made in. Completing a signature writes the new version as that layer's own: only its `base_sha` moves, and the document (`documents.base_sha`, the upload) and every other layer stay as they were.

Before, a signature moved the whole document, so on a per-visitor link the next visitor opened the signer's filled-in, signed copy, and layers still on the old version could no longer sign (`StaleBase`).

- **Every layer can sign**, over its own base. A layer that signs again signs over its previous version.
- **Versions belong to their layer:** a layer's versions are numbered along its own chain and stored under the layer, and they're deleted with it.
- **`/layers/:layerName/head`** reports the layer's own base.
- **Migration 044** gives each existing signed version its layer, puts a document a signature moved back on its upload, and starts layers that stored nothing on the upload too.
- **No document-wide signal any more:** the base-changed bus channel is gone. Other replicas reload the signing layer because its version moved.
