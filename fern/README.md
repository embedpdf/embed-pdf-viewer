# CloudPDF SDK generation

Fern generates seven SDKs from `cloudpdf/contract/openapi.json`. Generated
source is scratch output under `sdks/` and is not committed to this repository.
The GitHub workflow currently uploads each language as an artifact; it does not
publish packages or write to the future language repositories.

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
