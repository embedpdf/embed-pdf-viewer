# Licensing

Everything in this repository is licensed under the
[Apache License 2.0](LICENSE), with one exception: **`cloudpdf/server`** — the
self-hostable CloudPDF server — is **Fair Source**, under the
[Fair Core License, Version 1.0, ALv2 Future License](cloudpdf/server/LICENSE.md)
(FCL-1.0-ALv2).

| Code                                                                                                  | Where                          | License                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| EmbedPDF SDK (`@embedpdf/*`)                                                                          | `packages/`                    | Apache-2.0                                      |
| CloudPDF client libraries (`@cloudpdf/engine`, `@cloudpdf/viewer*`, `@cloudpdf/admin`, `…/admin-api`) | `cloudpdf/`                    | Apache-2.0                                      |
| CloudPDF server (`@cloudpdf/server`)                                                                  | `cloudpdf/server/`             | FCL-1.0-ALv2                                    |
| Websites                                                                                              | `website/`, `cloudpdf/website` | Apache-2.0 code; content per their `LICENSE.md` |
| Examples & tooling                                                                                    | `examples/`, `tooling/`        | Apache-2.0                                      |

The rule behind the line: **libraries are Apache-2.0; the deployable server
product is Fair Source.** Client SDKs, contracts, engines, viewers, plugins —
anything you link into your own software — carry no strings. The server is the
product we sell, so it ships fair-source instead of proprietary.

## What the FCL means for you

- **Free to use, modify, and self-host.** Internal use of any kind — including
  commercial — is a Permitted Purpose. Running the CloudPDF server behind your
  own applications requires no agreement with us.
- **No competing service.** You may not offer the server itself (or a
  substantially similar product) to third parties.
- **License keys are off-limits.** Paid features are gated by license keys; the
  FCL forbids removing or circumventing that gate.
- **It becomes Apache-2.0 automatically.** Each release converts to the Apache
  License 2.0 two years after it is made available — per release, so an old
  enough version is plain open source.

The licensor is CloudPDF LTD.

## Website content

The websites' application code is Apache-2.0 like the rest of the repository;
their _content_ is zoned — see [`website/LICENSE.md`](website/LICENSE.md) and
[`cloudpdf/website/LICENSE.md`](cloudpdf/website/LICENSE.md):

- documentation prose: CC-BY-4.0;
- code samples in the docs: MIT-0 (copy freely, no attribution needed);
- articles, blog posts, and brand assets: all rights reserved.

## Trademarks

"EmbedPDF", "CloudPDF", the logos, and the design-system assets are brand
property of CloudPDF LTD. Neither Apache-2.0 (§6) nor the FCL grants trademark
rights.

## Authority

For any package, the authoritative declaration is its own `LICENSE` /
`LICENSE.md` file and the `license` field of its `package.json`. Directory
placement decides nothing. (`@cloudpdf/server`'s `package.json` reads
`SEE LICENSE IN LICENSE.md` because FCL-1.0-ALv2 is not yet an SPDX
identifier.)
