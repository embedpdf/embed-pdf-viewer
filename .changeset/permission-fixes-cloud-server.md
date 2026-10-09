---
'@cloudpdf/server': patch
---

Security fixes:
- **Pictures with annotations need `doc.annotate.read`,** at the origin and in CDN grants. They draw no form fields.
- **The event stream sends each connection only what its token may read.** Annotations need `doc.annotate.read`; widgets and form fields need `doc.forms.read`. A row with nothing left goes out marked `withheld`, with only its pins.
- **Moving annotations checks each one inside the write,** so moving a widget takes `doc.forms.modify`.
