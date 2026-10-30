---
'@cloudpdf/sdk': minor
---

`new CloudPDFClient({ token })` reaches CloudPDF SaaS: `baseUrl` is only needed for your own CloudPDF server. `CloudPDFEnvironment.Saas` names the SaaS address. Proxy uploads go to the same address, with the client's token.
