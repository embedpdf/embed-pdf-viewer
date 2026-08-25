---
'@cloudpdf/server': minor
---

WS3 Phase B — encode renders inside the engine worker (default on). Page
renders, appearance batches, and warm-path thumbnails now cross the
engine boundary as compressed WebP/PNG (kilobytes) instead of raw rgba
rasters (megabytes); route contracts and artifact bytes are unchanged
(byte-identical outputs, same sharp). `CLOUDPDF_ENCODE_IN_ENGINE=0` is a
one-release escape hatch restoring the exact pre-Phase-B pipeline — sharp
loads lazily on the first encoded request, so with the hatch on the
workers never initialize libvips at all. The engine-host protocol version
is 2: a custom `engineHostEntry` pointing at a pre-B dist now fails the
boot handshake instead of rejecting every encoded render.
