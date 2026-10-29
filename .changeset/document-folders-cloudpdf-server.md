---
'@cloudpdf/server': minor
---

Organize documents in folders. Folders nest up to 100 levels with names
unique among siblings, ignoring case. A move takes documents and folders
together or not at all and never makes a loop, even when two moves race;
only empty folders delete. Documents are filed at upload and listed per
folder, and a document being deleted leaves its folder. Migration 046 adds
the `folders` table and `documents.folder_id`. Errors thrown with
structured context now return it as `details`.
