# CloudPDF SDK generation

Fern generates seven SDKs from `cloudpdf/contract/openapi.json`. TypeScript is
generated and committed at `cloudpdf/sdk`; it is published with the monorepo's
normal Changesets release. The other six SDKs are scratch output under `sdks/`
and are synchronized to their ecosystem repositories after the versioned
`cloudpdf-server` image has been verified. The generation workflow itself does
not publish any package registry.

## SDK repositories

| Generator  | Source residency                             |
| ---------- | -------------------------------------------- |
| TypeScript | `embedpdf/embed-pdf-viewer` → `cloudpdf/sdk` |
| Python     | `embedpdf/cloudpdf-sdk-python`               |
| PHP        | `embedpdf/cloudpdf-sdk-php`                  |
| C# / .NET  | `embedpdf/cloudpdf-sdk-dotnet`               |
| Go         | `embedpdf/cloudpdf-sdk-go`                   |
| Java       | `embedpdf/cloudpdf-sdk-java`                 |
| Ruby       | `embedpdf/cloudpdf-sdk-ruby`                 |

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
(`CloudPDF`). Fern's Ruby generator 1.21.1 currently emits a nonexistent helper
for binary multipart fields; the same strict post-generation step replaces it
with the generated runtime's `add_file` API and restores the required `file`
field and example. Generation fails loudly if that upstream shape changes.
Generator configuration controls all other public code identifiers.

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
All six external SDK repositories also receive the guarded release workflow
described below. TypeScript instead uses the monorepo's existing release
workflow.

Repository sync uses a GitHub App rather than a personal access token. Install
one app on the six external repositories with **Contents: read/write**, **Pull
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

Publishing follows source residency. `@cloudpdf/sdk` belongs to the workspace:
it is in the Changesets fixed group with `@cloudpdf/contract` and is published
by `.github/workflows/release.yml` through `pnpm ci:publish`. The six external
SDKs use their `.github/workflows/sdk-release.yml` workflows to build the actual package, verify
`cloudpdf-generation.json` against the ecosystem manifest, protect an
immutable `v<ecosystem-version>` tag, verify the public package index, and
create a matching GitHub release. Canonical prereleases become GitHub
prereleases; npm additionally publishes them under the `next` dist-tag.

The monorepo's npm job, plus Python, .NET, and Ruby, exchange GitHub OIDC identities for
short-lived registry credentials. Composer and Go releases are the Git tags
themselves: Packagist and the Go module proxy index those immutable tags. Java
builds PGP-signed JAR, source, Javadoc, and POM artifacts and uploads their
checksummed bundle through the Maven Central Portal API.

Publishing is disabled by default. Before the first release, create a GitHub
environment named `release` in each external SDK repository and configure the
registry to trust this exact environment and workflow. Configure npm against
the monorepo release workflow:

| Registry      | Project                                  | Repository            | Additional setup                                                                                                                       |
| ------------- | ---------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| npm           | `@cloudpdf/sdk`                          | `embed-pdf-viewer`    | Trusted publisher for `.github/workflows/release.yml`; allow the monorepo npm publish job                                              |
| PyPI          | `cloudpdf`                               | `cloudpdf-sdk-python` | Existing or pending trusted publisher for `sdk-release.yml`; environment `release`                                                     |
| Packagist     | `cloudpdf/sdk`                           | `cloudpdf-sdk-php`    | Submit the GitHub repository once and enable Packagist's GitHub auto-update hook                                                       |
| NuGet         | `CloudPDF`                               | `cloudpdf-sdk-dotnet` | Trusted publishing policy for `sdk-release.yml`; environment `release`; repository variable `NUGET_USER` set to the NuGet profile name |
| Go proxy      | `github.com/embedpdf/cloudpdf-sdk-go/v3` | `cloudpdf-sdk-go`     | None; the workflow pushes the SemVer tag and prompts `proxy.golang.org` to index it                                                    |
| Maven Central | `com.cloudpdf:sdk`                       | `cloudpdf-sdk-java`   | Verified `com.cloudpdf` namespace, Portal user token, and PGP signing key as described below                                           |
| RubyGems      | `cloudpdf`                               | `cloudpdf-sdk-ruby`   | Existing or pending trusted publisher for `sdk-release.yml`; environment `release`                                                     |

Required reviewers on `release` are optional. They provide an independent
authorization boundary, but a self-approval before the job starts does not
validate build output. Leave `SDK_AUTO_PUBLISH_ENABLED` unset and manually
dispatch **SDK Release** once in each external repository and publish the npm
package with the normal monorepo release. After all seven packages install
successfully, set the external repository variable
`SDK_AUTO_PUBLISH_ENABLED=true`; subsequent generated-source merges then
publish automatically.

For Java, generate a Maven Central Portal user token and configure these
`release` environment secrets in `cloudpdf-sdk-java`:

- `MAVEN_CENTRAL_USERNAME`
- `MAVEN_CENTRAL_PASSWORD`
- `MAVEN_GPG_PRIVATE_KEY`
- `MAVEN_GPG_PASSPHRASE`

The first two values are the generated Portal token credentials, not the
interactive Central account password. Export the private signing key as ASCII
armor and publish its public key to a Maven Central-supported keyserver before
the first release. The workflow keeps the private key in memory, builds a local
Maven repository, requires every artifact to have a signature, and submits an
automatic Central deployment. Maven Central performs the authoritative
signature validation.

The tag is created before registry authentication or external publication. Fix
the registry configuration and rerun the same commit: the workflow accepts the
existing tag, skips an already published registry version, and fills in a
missing GitHub release. A tag may be reused after workflow-only changes, but
any different package source requires a new SDK version.

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

Generate SDKs locally through the orchestrator, which pins the CLI and maps
every version:

```sh
# Converge: regenerate only the SDKs whose stamp no longer matches the contract
node fern/scripts/generate-sdks.mjs

# One language, unconditionally
node fern/scripts/generate-sdks.mjs --only python --force

# Report staleness without generating anything
node fern/scripts/generate-sdks.mjs --check
```

Freshness is judged from each tree's `cloudpdf-generation.json` stamp (OpenAPI
SHA-256, mapped SDK version, pinned CLI and generator versions), so a
`generators.yml` configuration edit that does not bump a generator version
still needs `--force`. Every regenerated language runs the same
generate → record → validate sequence as the GitHub matrix — extracting
snippets from a raw `fern generate` tree is not equivalent, because the
metadata step also normalizes branding and patches generated references.
The orchestrator passes `--generate-tests`, which is also what makes Fern emit
the complete standalone SDK project in local mode (package manifest, build
configuration, source, README, and tests) instead of only the embeddable
generated source tree.

After a contract change, one command converges everything — stale SDKs, the
snippet manifest, the generated reference pages, and their checks:

```sh
pnpm api:sync
```

The GitHub matrix validates the package identity and mapped version, then runs
a publication-free build check for every language before uploading the source
artifact. Go's generated WireMock integration tests are compiled but not run;
all other checks build the package or run the generator's local test task where
it is self-contained.

Each artifact includes `cloudpdf-generation.json` with the canonical and mapped
SDK versions, the exact OpenAPI SHA-256, source commit state, Fern CLI version,
and language generator version.

The TypeScript SDK is a committed workspace package, so a Changesets version PR
regenerates it after resolving the new canonical version. Run that same path
locally with:

```bash
pnpm run cloudpdf:sdk:generate
```

The command is the TypeScript-only forced mode of
`fern/scripts/generate-sdks.mjs`: it pins Fern CLI 5.91.0, generates
`cloudpdf/sdk`, records normalized metadata, and validates every
version-bearing file. Changesets is the sole owner of `CHANGELOG.md`; the
orchestrator snapshots and restores it because Fern currently writes a release
heading even when the file is in `.fernignore`. `ci:publish` repeats the
TypeScript validation before npm publishing, independently of the SDK
freshness workflow.

The repository sync replaces generated source on its version branch while
keeping each destination repository's `.github` directory repository-owned.
The checked-in overlays install and update the repository CI and release
workflows without putting registry credentials in the generation workflow.
