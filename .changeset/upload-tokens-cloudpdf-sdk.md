---
'@cloudpdf/sdk': minor
---

`import { upload } from '@cloudpdf/sdk/upload'` uploads a PDF from the browser with an upload token from your server: `upload(file, { token, name?, onProgress?, signal?, baseUrl? })`. The entry is about 3 KB gzipped and has no Node imports. It sends the file with XHR, so `onProgress` follows the bytes. `uploads.create` on a server now reports progress as the bytes go too, instead of only at the start and the end. `Uploads` takes the source reader as a second argument.
