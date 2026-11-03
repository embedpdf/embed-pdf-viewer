---
'@cloudpdf/server': minor
---

`buildApp` takes the deployment's license as `license`: the runtime `createLicenseRuntime` made, and nothing else. It replaces `licenseGate`. Any other object, including a copy of a runtime, stops the build with an error naming `createLicenseRuntime`. The runtime is sealed: its methods can't be replaced, and `buildApp` enforces the license from the runtime behind it. `createLicenseRuntime` takes only `db`, `env`, `secretResolver` and `startTimer`, and passes nothing else on, so license verification always uses the identity compiled into the package.
