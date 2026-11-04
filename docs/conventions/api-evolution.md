# API evolution and caching

How the CloudPDF HTTP API changes within a major version without breaking
clients that are already deployed, and how every cached response stays
correct while it does.

Clients and servers update on their own schedules. An app pins an npm package
or a generated SDK for years, while `engine.cloudpdf.com` updates
continuously. A self-hosted `@cloudpdf/server` can also be older than the
client talking to it. So compatibility runs in both directions, and nothing
may depend on both sides being the same version.

## Rules

1. Within a major version, the contract only grows: new endpoints, new
   optional request fields, new response fields.
2. Clients read tolerantly: an unknown field is ignored, and an unknown kind or
   value falls back to its catch-all instead of failing the response.
3. Every request says which version the client speaks, and every response says
   which version the server is.
4. A cached response's URL names everything its bytes depend on, and nothing
   else may change those bytes.
5. A breaking change is the last resort. It is made as a version change on the
   server, which answers older clients the way they expect.

## What a change is

| Change                                                  | Allowed in a major?   | How                                                                                                                                              |
| :------------------------------------------------------ | :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| Add an endpoint                                         | Yes                   | A client checks the server's version before calling it.                                                                                          |
| Add an optional request field                           | Yes                   | The server accepts requests without it. Older servers refuse it (request schemas are strict), so a client sends it only to a server that has it. |
| Add a response field                                    | Yes                   | Older clients drop it.                                                                                                                           |
| Add a value to a set (an enum, a union's kinds)         | Only with a catch-all | The set documents what older clients read an unknown value as, like an annotation's `unsupported` kind. A set without one is closed.             |
| Rename, remove or retype a field; change what one means | No                    | First choice: expand and contract. Add the new field beside the old one and send both until the next major. Otherwise, a version change.         |
| Change what the server computes, in the same shape      | Yes                   | Not a contract change: raise that kind's engine value (see [Cached responses](#cached-responses)).                                               |

## Reading tolerantly

The client parses every response with the wire schemas in
`@embedpdf/engine-core/wire`, so these rules are about those schemas:

- **A schema a response is parsed with never uses `.strict()`.** Zod's default
  drops unknown fields, which is what an older client needs. Request schemas
  stay strict on the server, so a misspelled field fails loudly.
- **A union read from the server has a catch-all kind**, and an unknown
  discriminator parses as that kind instead of failing the whole response.
- **An enum read from the server either names its fallback value or is
  closed.** Adding a value to a closed enum is a breaking change.

## Versions on the wire

- **The client sends `EmbedPDF-Version: <major>.<minor>`** on every request:
  the contract version it was built against. The engine and viewer packages
  release together under one version (the Changesets `fixed` group), so this
  is that release's major and minor. The generated SDKs send the contract version they were
  generated from. A request without the header (a plain `curl`) is answered as
  the server's own version.
- **The server sends `EmbedPDF-Server-Version: <major>.<minor>`** on every
  response. A client that needs something newer than the server it talks to
  stops with an error that names both versions, before it sends anything the
  server can't read.
- **A server supports every earlier version of its major.** Additive changes
  need nothing for that. A breaking change needs a version change.

### Version changes

The server keeps one ordered list of version changes. Each entry says:

- the version it arrived in;
- how to turn the current response into the one before it;
- how to turn the earlier request into the current one.

For a client that speaks an older version, the server applies the entries from
newest down to that version. Each entry has a test that sends the old request
and checks the old response. The list starts empty in 3.0.0 and only grows
when expand and contract can't do the job.

## Cached responses

A read is either **live** or **cached**:

- **Live** reads (`/head` and every read without `@`) answer with
  `Cache-Control: no-store`. Writes are never cached.
- **Cached** reads have a versioned URL, `…@<token>`, and answer
  `immutable` for a year. A CDN in front of the server shares them between
  viewers.

The token of a cached read has four parts:

| Part         | What it says                                     | Who sets it                                                | When it changes                                         |
| :----------- | :----------------------------------------------- | :--------------------------------------------------------- | :------------------------------------------------------ |
| **Versions** | which document data the response reads           | the server's counters, published in the manifest           | when that data changes                                  |
| **Engine**   | how the server computes it                       | the server: one opaque value per resource kind, in `/head` | when the server deliberately changes that kind's output |
| **Shape**    | which structure the client reads                 | the client: one number per resource kind, compiled into it | when that kind's structure changes                      |
| **Request**  | what was asked: a query, a size, an image format | the caller                                                 | per request                                             |

The client copies versions and engine values and never computes them. The
server checks them: a version or engine value that is no longer current
answers `NotFound` ("no longer current") with `no-store`, and the client reads
`/head` again (and the manifest, when `docVersion` moved) and builds a new
URL. The server answers the shape it is asked for, through the version
changes when it is older than the current one, and never refuses a shape of
its own major.

Each part changes for its own reason, per resource kind. A release that changes
nothing about renders leaves every cached render where it is. A change to
search rules refills cached searches, not images.

### Versions

The manifest's counters, named by scope:

- **One page:** `contentVersion` (the page's content, so its text too),
  `annotationVersion`, `widgetVersion`. A read of one page pins that page's
  counters.
- **The whole document:** `contentsVersion`, `annotationsVersion`,
  `formsVersion`, `metadataVersion`, `outlineVersion`, `attachmentsVersion`,
  `actionsVersion`, `fontsVersion`, and `docVersion` for anything at all. A read
  across every page pins the document-wide counter, the plural of the page one:
  `contentsVersion` moves when any page's `contentVersion` moves or a page is
  inserted or deleted.
- **Page order:** `layoutVersion`. A read whose answer depends on page order
  pins it too.

### Engine values

An engine value answers one question for a kind: besides the document, what
did the server compute this with? The same page, asked for the same way, gives
different bytes when the server's fonts change or its rules for reading page
text do. The URL has to name that, or a CDN keeps serving the old bytes.

`/head` carries `engine`, one opaque string per resource kind. The values are
the same for every document on a server; `/head` carries them because a client
reads it before any cached read.

```jsonc
{
  "id": "doc_123",
  "docVersion": 42,
  // …
  "engine": {
    "render": "9f2c41aa",
    "annotationAppearances": "9f2c41aa",
    "widgetAppearances": "9f2c41aa",
    "fonts": "e41b07c2",
    "text": "c7e01b3d",
    "search": "4be09a12",
    "annotations": "51d3fe08",
    "annotationsAll": "51d3fe08",
    "layout": "0a6e2c91",
    // … one entry for every kind in Resource kinds
  },
}
```

The client puts its kind's value in the token as `engine`, beside the
versions, the shape and the request. A page drawn with its annotations, and
the same page's text:

```text
/v1/docs/doc_123/render/annotations/pages/14/data@annotationVersion=3,contentVersion=7,engine=9f2c41aa,format=webp,shape=1,viewport.kind=width,viewport.width=800
/v1/docs/doc_123/text/pages/14/data@contentVersion=7,engine=c7e01b3d,shape=1
```

Engine values live in `/head` and not in the manifest because the manifest is
itself a cached read, keyed by `docVersion`: a server change would not reach a
manifest that is already cached.

#### How the server derives them

The server keeps one number per rule it computes with, and lists which rules
each kind reads:

```ts
// One number per rule. Raise a rule's number in the pull request that changes
// what the rule gives for the same document and the same request.
const RULES = {
  drawing: 1, // how pages, annotations and fields are drawn
  pageText: 2, // 2: lines end in \n, no U+FFFE
  searchFold: 2, // 2: invisible characters ignored
  contents: 2, // 2: contents and rich text read with \n
};

// What each kind is computed with, besides the document. `fonts` is the
// fingerprint of the server's fonts, which changes with `CLOUDPDF_FONTS`.
const INPUTS = {
  render: ['drawing', 'fonts'],
  annotationAppearances: ['drawing', 'fonts'],
  widgetAppearances: ['drawing', 'fonts'],
  fonts: ['fonts'],
  text: ['pageText'],
  search: ['pageText', 'searchFold'],
  annotations: ['contents'],
  annotationsAll: ['contents'],
  // every other kind: none, so its value never changes
};

const current = { ...RULES, fonts: fontsFingerprint };
engine[kind] = digest(
  (INPUTS[kind] ?? []).map((input) => `${input}=${current[input]}`),
);
```

Kinds with the same inputs share a value. A rule's number sits beside the code
it versions, the way `SEARCH_FOLD_VERSION` sits beside the search fold, so the
change and its number are in the same diff. The server's release version is
never an input: a deploy or a restart that raises no rule keeps every cached
response.

#### When a value changes

| What happened                                                  | Values that change                                    | What stays cached                     |
| :------------------------------------------------------------- | :---------------------------------------------------- | :------------------------------------ |
| An operator adds a font to `CLOUDPDF_FONTS`                    | `fonts`: render, both appearance kinds, the font list | text, search, annotations, the rest   |
| Page text is read differently (lines end in `\n`, no `U+FFFE`) | `pageText`: text, search                              | pictures, annotations, the rest       |
| `contents` and rich text are read with `\n`                    | `contents`: annotations, annotationsAll               | everything else                       |
| Search ignores more characters                                 | `searchFold`: search                                  | everything else                       |
| A runtime upgrade fixes a glyph people notice                  | `drawing`: render, both appearance kinds              | text, search, the font list, the rest |
| A runtime upgrade with no visible difference                   | none                                                  | everything                            |
| A deploy or a restart that raises no rule                      | none                                                  | everything                            |

During a rolling deploy, each replica answers only its own values. A client
that reaches the other replica gets "no longer current", reads `/head` again
and builds a new URL, as after any change. A self-hosted server's values are
its own: they are opaque, and nothing compares them with another server's.

#### What engine values are not for

- **Document edits** move the versions.
- **A change to a response's structure** moves that kind's shape.
- **Which release the client is** goes in `EmbedPDF-Version`, never in a
  cached URL.

#### Who raises one

The engineer who changes what the server gives, in the pull request that
changes it, the way a database migration is added. Review asks one question:
for the same document and the same request, does this change what the server
returns? If it does, raise the rule's number. A change that only makes the
server faster, or that no cached response shows, raises nothing.

### Shapes

One number per resource kind, all `1` in 3.0.0, raised only when that kind's
structure changes. An image's encoding (`png`, `webp`) is a request parameter,
not a shape.

## Resource kinds

| Kind                    | Route                                                                  | Versions                                                            | Request                                     |
| :---------------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------------ | :------------------------------------------ |
| `manifest`              | `/manifest@`                                                           | `docVersion`                                                        |                                             |
| `layout`                | `/layout@`                                                             | `layoutVersion`                                                     |                                             |
| `text`                  | `/text/pages/:page/data@`                                              | `contentVersion`                                                    |                                             |
| `geometry`              | `/geometry/pages/:page/data@`                                          | `contentVersion`                                                    |                                             |
| `render`                | `/render/{pages,annotations/pages,fields/pages,all/pages}/:page/data@` | `contentVersion` (+ `annotationVersion`, `widgetVersion` by family) | size, crop, rotation, image format, quality |
| `annotationAppearances` | `/annotations/pages/:page/appearances@`                                | `annotationVersion`                                                 | modes, size, rotation, image format         |
| `widgetAppearances`     | `/form/pages/:page/appearances@`                                       | `widgetVersion`                                                     | modes, size, rotation, image format         |
| `annotations`           | `/annotations/pages/:page/items@`                                      | `annotationVersion`                                                 |                                             |
| `annotationsAll`        | `/annotations/items@`                                                  | `annotationsVersion`                                                |                                             |
| `annotationsExport`     | `/annotations/export@`                                                 | `annotationsVersion`, `layoutVersion`                               | include, selection                          |
| `form`                  | `/form@`                                                               | `formsVersion`                                                      |                                             |
| `formExport`            | `/form/export@`                                                        | `formsVersion`, `layoutVersion`                                     | selection                                   |
| `metadata`              | `/metadata@`, `/metadata/custom@`                                      | `metadataVersion`                                                   |                                             |
| `outline`               | `/outline@`                                                            | `outlineVersion`, `layoutVersion`                                   |                                             |
| `attachments`           | `/attachments@`, `/attachment-files/…/data@`                           | `attachmentsVersion`                                                |                                             |
| `actions`               | `/actions@`                                                            | `actionsVersion`                                                    |                                             |
| `fonts`                 | `/fonts@`                                                              | `fontsVersion`                                                      |                                             |
| `search`                | `/layers/:layer/search/:tier/data@`                                    | `contentsVersion`, `layoutVersion`                                  | query, options, `from`, `skip`, limits      |
| `analysis`              | `/layers/:layer/signatures/analysis@`                                  | `docVersion`                                                        | since, level, policy, detail                |
| `download`              | `/layers/:layer/download@`                                             | `docVersion`                                                        | mode                                        |

Routes are under `/v1/docs/:docId`, and each document route has a
`/layers/:layer/…` twin with the same token. Every row's token also carries
`engine` (that kind's value from `/head`) and `shape` (the client's number for
that kind). A new cached read adds a row here.

## Where the code is today

This section lists where the code doesn't follow the rules above yet. Delete
each entry when its work lands, and the section with the last one.

| Gap                                                                                                                                                                                            | Where                                                                                         |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| No version headers: the client says nothing about its version, the server nothing about its own                                                                                                | `cloudpdf/engine` `HttpClient`, `cloudpdf/server` routes                                      |
| Five schemas that responses are parsed with are `.strict()`: `WidgetAppearanceSchema`, `FormFieldValueSchema`, `LineLeaderSchema`, `LineDimensionCaptionSchema`, `ShapeDimensionCaptionSchema` | `engine-core` `annotation/kinds/widget.shared.ts`, `forms/schema.ts`, `dto/Measure.schema.ts` |
| An unknown annotation subtype fails the whole list: `AnnotationSchema` is a `z.discriminatedUnion` with no fallback to `unsupported`                                                           | `engine-core` `annotation/kinds/index.ts`                                                     |
| The cached manifest carries `serverFonts`, so a font change can leave a cached manifest handing out a value the server no longer accepts                                                       | `DocumentManifest.serverFonts`, `/manifest@`                                                  |
| Search pins a client-computed `epoch` instead of `contentsVersion` and `layoutVersion`; `SEARCH_FOLD_VERSION` reaches no URL                                                                   | `engine-core` `search/epoch.ts`, `wire/tokens.ts`                                             |
| `format` means three things: a shape number (`LAYOUT_FORMAT = 2`), a shape string the server rejects on mismatch (`ranges1`), and an image encoding (renders)                                  | `engine-core` `wire/tokens.ts`, `wire/tokenSchemas.ts`                                        |
| Engine values exist for four kinds (`serverFonts`), shapes for two                                                                                                                             | `engine-core` `wire/tokenSchemas.ts`                                                          |

### Work, before 3.0.0

Everything here is fixed into the 3.0 client, so it lands before 3.0.0:

1. **Tokens** (`engine-core` `wire/tokenSchemas.ts`, `wire/tokens.ts`): every
   token gets `engine` and `shape`. Layout's `format` and search's `format`
   become `shape`. Search's `epoch` becomes `contentsVersion` and
   `layoutVersion`. `serverFonts` becomes each kind's `engine`.
2. **`/head` and the manifest**: `/head` gains the `engine` map; the manifest
   gains `contentsVersion` and loses `serverFonts`.
3. **Server**: computes `contentsVersion` from the page counters it already
   keeps, and each engine value from its rules and inputs (see
   [How the server derives them](#how-the-server-derives-them), with
   `SEARCH_FOLD_VERSION` as the search fold's number); checks `engine` the way
   it checks versions; answers the asked shape; sends `EmbedPDF-Server-Version`.
4. **Client** (`@cloudpdf/engine`): copies versions and engine values, sends
   its shapes and `EmbedPDF-Version`, and stops with a clear error on a server
   older than it needs.
5. **Tolerant reading**: the five schemas above lose `.strict()` where they
   parse responses; an unknown annotation subtype parses as `unsupported`; the
   enums in responses are each given a fallback or marked closed.
6. **Contract and SDKs**: the header goes into the OpenAPI contract, and
   `pnpm api:sync` regenerates the SDKs to send it.
7. **Conformance** (both engines): a stale engine value answers "no longer
   current"; a response with an unknown field, an unknown annotation subtype
   and an unknown fallback enum value still parses; a request without
   `EmbedPDF-Version` is answered as the server's version.

The version-change machinery is not part of this work. It is built with the
first breaking change that needs it.
