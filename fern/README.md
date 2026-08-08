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

The normal pull-request and `main` triggers are read-only validation. The
release workflow calls the same generation workflow with repository sync
enabled only after the multi-architecture server manifest exists and passes
inspection. Each generated repository PR includes an `SDK CI` workflow and can
optionally use GitHub native auto-merge after repository requirements pass.

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
This lets future registry publishing workflows live with their ecosystem
credentials without being overwritten by SDK regeneration.
