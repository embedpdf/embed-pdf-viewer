---
'@cloudpdf/server': minor
---

Derives the connected usage-reporting credential from the license key, so a connected deployment is configured with `CLOUDPDF_LICENSE_KEY` alone.

- Computes the reporting credential as `cpr_v1_` + base64url(HMAC-SHA256) over a domain-separated message that binds the signed `cloudpdfLicenseId` license metadata, so the wire credential is one-way (it can never reveal the license key) and never authenticates another license record.
- Retires `CLOUDPDF_LICENSE_REPORTING_TOKEN`. A deployment that still sets it boots normally; the variable is ignored and the server logs a warning asking for its removal.
- Existing connected deployments upgrade by removing the retired variable. During the coordinated verifier cutover on the CloudPDF side a usage report may answer 401; reports retry every five minutes with cumulative counters, so no usage is lost and license validation is unaffected.
- Air-gapped deployments are unchanged and continue to send no telemetry.
- Pins fixed cross-runtime derivation test vectors shared with the CloudPDF control plane.
