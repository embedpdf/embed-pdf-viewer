# CloudPDF SDK generation

Fern generates seven SDKs from `cloudpdf/contract/openapi.json`. Generated
source is scratch output under `sdks/` and is not committed to this repository.
Every GitHub run uploads each language as an artifact. Release runs may also
open generated-source pull requests in the language repositories after the
versioned `cloudpdf-server` image has been verified. No package registry is
published by this workflow.

## SDK repositories

| Generator  | Repository                         |
| ---------- | ---------------------------------- |
| TypeScript | `embedpdf/cloudpdf-sdk-typescript` |
| Python     | `embedpdf/cloudpdf-sdk-python`     |
| PHP        | `embedpdf/cloudpdf-sdk-php`        |
| C# / .NET  | `embedpdf/cloudpdf-sdk-dotnet`     |
| Go         | `embedpdf/cloudpdf-sdk-go`         |
| Java       | `embedpdf/cloudpdf-sdk-java`       |
| Ruby       | `embedpdf/cloudpdf-sdk-ruby`       |

## Public package identities

CloudPDF is treated as an indivisible brand name in generated documentation,
namespaces, modules, and root client types. Registry identifiers still follow
each ecosystem's casing and scoping conventions.

| SDK        | Package identity                         | Primary client                           |
| ---------- | ---------------------------------------- | ---------------------------------------- |
| TypeScript | `@cloudpdf/sdk`                          | `CloudPDFClient`                         |
| Python     | `cloudpdf`                               | `CloudPDFClient` / `AsyncCloudPDFClient` |
| PHP        | `cloudpdf/sdk`                           | `CloudPDF\CloudPDFClient`                |
| .NET       | `CloudPDF`                               | `CloudPDF.CloudPDFClient`                |
| Go         | `github.com/embedpdf/cloudpdf-sdk-go/v3` | idiomatic `NewClient`                    |
| Java       | `com.cloudpdf:sdk`                       | `com.cloudpdf.api.CloudPDFClient`        |
| Ruby       | `cloudpdf`                               | `CloudPDF::Client`                       |

Fern derives some human-readable branding and identifiers from its lowercase
organization slug. The required post-generation metadata step therefore
structurally normalizes generated README titles, descriptions, and visible code
without rewriting link destinations. It also corrects PHP's non-configurable
base exception casing, removes Fern's stale PHP formatter caches, and separates
Ruby's lowercase gem and require identity (`cloudpdf`) from its public module
(`CloudPDF`). Generator configuration controls all other public code
identifiers.

Validation recursively checks generated text and paths. Every case-insensitive
brand match must use the registry form `cloudpdf` or the public form `CloudPDF`;
Markdown link destinations and binary files are excluded. The PHP build also
proves Composer PSR-4 loading by constructing both renamed exception classes.
The Ruby build installs the generated gem into an isolated `GEM_HOME` and
requires `cloudpdf`, proving the packaged require graph rather than only the
source checkout.

The normal pull-request and `main` triggers are read-only validation. The
release workflow calls the same generation workflow with repository sync
enabled only after the multi-architecture server manifest exists and passes
inspection. Each generated repository PR includes an `SDK CI` workflow and can
optionally use GitHub native auto-merge after repository requirements pass.
TypeScript, Python, .NET, and Ruby also receive the guarded release workflow
described below.

Repository sync uses a GitHub App rather than a personal access token. Install
one app on the seven repositories with **Contents: read/write**, **Pull
requests: read/write**, and **Workflows: read/write** (required because generated
PRs install `.github/workflows/sdk-ci.yml`), then configure these secrets in the
source repository:

- `SDK_RELEASE_APP_ID`
- `SDK_RELEASE_APP_PRIVATE_KEY`

Set the repository variable `SDK_REPOSITORY_SYNC_ENABLED=true` after the app is
installed. Leave `SDK_AUTO_MERGE` unset for review-first PRs; set it to `true`
only after the destination repositories have the desired branch rules and
required `Build and validate` status check.

The sync is idempotent per canonical version. A failed post-release sync can be
retried with the **SDK Generate** workflow dispatch after the corresponding
`ghcr.io/embedpdf/cloudpdf-server:<version>` image exists.
When a version branch already exists, the sync replaces it only if its remote
SHA still matches the value observed before generation; a concurrent update is
rejected instead of overwritten.

## Registry publishing

The first publishing wave is repository-owned for TypeScript, Python, .NET,
and Ruby. Their `.github/workflows/sdk-release.yml` workflows build the actual
package, verify `cloudpdf-generation.json` against the ecosystem manifest,
protect an immutable `v<ecosystem-version>` tag, publish with GitHub OIDC, and
create a matching GitHub release. Canonical prereleases become GitHub
prereleases; npm additionally publishes them under the `next` dist-tag.

Publishing is disabled by default. Before the first release, create a GitHub
environment named `release` in each SDK repository and configure the registry
to trust this exact environment and workflow:

| Registry | Project | Repository | Additional setup |
| -------- | ------- | ---------- | ---------------- |
| npm | `@cloudpdf/sdk` | `cloudpdf-sdk-typescript` | Trusted publisher for `sdk-release.yml`; allow `npm publish` |
| PyPI | `cloudpdf` | `cloudpdf-sdk-python` | Existing or pending trusted publisher for `sdk-release.yml` |
| NuGet | `CloudPDF` | `cloudpdf-sdk-dotnet` | Trusted publishing policy for `sdk-release.yml`; repository variable `NUGET_USER` set to the NuGet profile name |
| RubyGems | `cloudpdf` | `cloudpdf-sdk-ruby` | Existing or pending trusted publisher for `sdk-release.yml` |

Use required reviewers on the `release` environments during rollout. Leave
`SDK_AUTO_PUBLISH_ENABLED` unset and manually dispatch **SDK Release** once in
each repository. After all four packages install successfully, remove the
manual approval if desired and set the repository variable
`SDK_AUTO_PUBLISH_ENABLED=true`; subsequent generated-source merges then
publish automatically.

The tag is created before registry authentication so a missing trusted
publisher cannot publish untracked bytes. Fix the registry configuration and
rerun the same commit: the workflow accepts the existing tag, skips an already
published registry version, and fills in a missing GitHub release. A tag may be
reused after workflow-only changes, but any different package source requires a
new SDK version.

npm trusted publishing normally requires the package to exist already. If the
reserved `@cloudpdf/sdk` name has no published bootstrap version, perform its
first publish with a short-lived granular token, then configure the trusted
publisher and remove the token. PyPI and RubyGems support pending publishers
for the first release; NuGet's existing `CloudPDF` package can use a trusted
publishing policy directly.

## Version policy

`cloudpdf/contract/package.json` is the canonical CloudPDF version. Generation
fails if it differs from OpenAPI `info.version`. Stable releases use the same
version in every ecosystem. During the `next` prerelease train, the canonical
version is translated only where an ecosystem requires a different syntax:

| SDK              | `3.0.0-next.0` becomes                                           |
| ---------------- | ---------------------------------------------------------------- |
| TypeScript / npm | `3.0.0-next.0`                                                   |
| Python / PyPI    | `3.0.0a0`                                                        |
| PHP / Composer   | `3.0.0-alpha.0`                                                  |
| C# / NuGet       | `3.0.0-next.0`                                                   |
| Go module tag    | `v3.0.0-next.0` (the generated module version is `3.0.0-next.0`) |
| Java / Maven     | `3.0.0-alpha.0`                                                  |
| Ruby / RubyGems  | `3.0.0.alpha.0`                                                  |

For .NET, the NuGet package keeps `3.0.0-next.0`; the generated CLR
`AssemblyVersion` and `FileVersion` use the required numeric form `3.0.0.0`.

The mapping is intentionally strict: it accepts stable SemVer or
`MAJOR.MINOR.PATCH-next.NUMBER`. This makes an unsupported release convention a
visible decision instead of letting package versions drift silently.

Inspect the current mapping with:

```sh
node fern/scripts/sdk-version.mjs all
```

Generate one language locally with the pinned CLI and mapped version:

```sh
LANGUAGE=python
SDK_VERSION=$(node fern/scripts/sdk-version.mjs "$LANGUAGE")
npx --yes fern-api@5.91.0 generate \
  --group "$LANGUAGE" \
  --local \
  --version "$SDK_VERSION" \
  --force \
  --no-prompt \
  --generate-tests
```

`--generate-tests` is also what makes Fern emit the complete standalone SDK
project in local mode (package manifest, build configuration, source, README,
and tests) instead of only the embeddable generated source tree.

The GitHub matrix validates the package identity and mapped version, then runs
a publication-free build check for every language before uploading the source
artifact. Go's generated WireMock integration tests are compiled but not run;
all other checks build the package or run the generator's local test task where
it is self-contained.

Each artifact includes `cloudpdf-generation.json` with the canonical and mapped
SDK versions, the exact OpenAPI SHA-256, source commit state, Fern CLI version,
and language generator version.

The repository sync replaces generated source on its version branch while
keeping each destination repository's `.github` directory repository-owned.
The checked-in overlays install and update the repository CI and release
workflows without putting registry credentials in the generation workflow.
