---
'@cloudpdf/server': minor
---

Delete a folder with everything in it via `recursive=true`: the folder and
every folder under it go in one transaction, and every document in them stops
opening, leaves every list and stops answering its share links at once, while
their stored files are removed in the background. The sweeper now also
finishes deletes left behind, such as one interrupted by a crash, after
`deletingGraceMs` (default one minute). The filesystem object store no longer
fails a write when a delete elsewhere in the same tenant prunes the
directories the write has just made.
