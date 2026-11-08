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
   value falls back to its catch-all instead of failing the response. A known
   kind with a malformed body still fails.
3. Every request to the server says which version the client speaks, and every
   response says which version the server is.
4. A cached response's URL alone decides its content. The URL names everything
   the content depends on, the server computes it from exactly the document
   state the URL names, and nothing else changes it, not even the client's
   version header.
5. A breaking change is the last resort. It is made as a version change on the
   server, which answers older clients the way they expect.

## What a change is

| Change                                                              | Allowed in a major?         | How                                                                                                                                                                                                                                                   |
| :------------------------------------------------------------------ | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add an endpoint                                                     | Yes                         | A client checks the server's version before calling it.                                                                                                                                                                                               |
| Add an optional request field                                       | Yes                         | The server accepts requests without it. Older servers refuse it (request schemas are strict), so a client sends it only to a server that has it.                                                                                                      |
| Add a request header                                                | Yes, behind a version check | A browser asks the server's CORS configuration before it sends a header the server hasn't allowed, and an older server's doesn't list the new one, so the browser blocks the whole request. A client sends a new header only to a server that has it. |
| Add a response field                                                | Yes                         | Older clients drop it. On a cached kind, also raise that kind's `FIELDS` number (see [Engine values](#engine-values)), so bodies with the field get new URLs.                                                                                         |
| Add a value to a set (an enum, a union's kinds)                     | Only with a catch-all       | The set documents what older clients read an unknown value as, like an annotation's `unsupported` kind. A set without one is closed.                                                                                                                  |
| Rename, remove or retype a field; change what one means             | No                          | First choice: expand and contract. Add the new field beside the old one and send both until the next major. Otherwise, a version change.                                                                                                              |
| Change documented behavior, in the same shape                       | No                          | A client written against the docs can break on a new unit, a new default or another line break just as on a renamed field. The same shape doesn't make it compatible, and neither does an engine value.                                               |
| Fix or improve what the server computes, within documented behavior | Yes                         | Not a contract change: raise the rule it changes (see [Engine values](#engine-values)).                                                                                                                                                               |

## Reading tolerantly

The client parses every response with the wire schemas in
`@embedpdf/engine-core/wire`, so these rules are about those schemas:

- **No schema a response is parsed with uses `.strict()`, nested objects
  included.** Zod's default drops unknown fields, which is what an older
  client needs. A test enforces it rather than a list of names: real responses
  from the conformance runs, with an unknown field added to every object in
  them, still parse. Request schemas stay strict on the server, so a
  misspelled field fails loudly.
- **A union read from the server has a catch-all kind**, and an unknown
  discriminator parses as that kind instead of failing the whole response. A
  known discriminator with a malformed body still fails: the catch-all is for
  kinds the client doesn't know yet, not for broken data.
- **An enum read from the server either names its fallback value or is
  closed.** Adding a value to a closed enum is a breaking change.
- **The schema says which.** In `@embedpdf/engine-core/wire`, `closed()`
  marks a closed set (an enum, a literal or a union's kinds),
  `readsUnknownAs()` an enum with a fallback and `withCatchAll()` a union with
  a catch-all kind. `readingProblems()` in `@embedpdf/engine-core/conformance`
  names every object that refuses unknown fields and every set that says
  neither; the contract's tests run it on every response.
- **The generated SDKs read the same way.** Every union with a catch-all is a
  named component in the contract, so each SDK makes one type of it, and its
  description tells a client author what an unknown kind reads as. Each SDK's
  generation check reads fixture responses with an unknown field, an unknown
  enum value and an unknown kind in every such union.
  `fern/tolerant-reading/open-unions.json` lists the unions: the checks read
  it, and so does the Python SDK's patch after generation, since
  fern-python-sdk refuses an unknown kind. The contract's tests fail when a
  union with a catch-all has no name, no row there or no fixture case.

## Versions on the wire

- **The client sends `EmbedPDF-Version: <major>.<minor>`** on every request
  to the server itself: the contract version it was built against. The engine,
  viewer, server and SDK packages release together under one version (the
  Changesets `fixed` group), so this is that release's major and minor
  (`API_VERSION` in `@embedpdf/engine-core/wire`). The generated SDKs send the
  version they were generated from (a literal header in the contract's
  `x-fern-global-headers`). A request without the header (a plain `curl`) is
  answered as the server's own version. The header chooses how the server
  answers live reads and writes; cached responses never depend on it. So a
  request through a CDN leaves it out: a CDN serves cached reads, and there
  the header would cost every URL a CORS preflight.
- **The server sends `EmbedPDF-Server-Version: <major>.<minor>`** on every
  response. A cached response carries the version of the server that produced
  it, which can be older or newer than the server answering now, so a client
  reads the server's version from `/head`, which is live.
- **A client feature that needs a newer server names the minimum version it
  needs.** The client checks it against `/head` before using the feature.
  Against an older server, that feature fails with an error that names both
  versions, and everything else keeps working.
- **A server answers every version of its major and refuses another.** An
  older minor is answered through the version changes: additive changes need
  none, a breaking change needs one. A newer minor is answered as the server's
  own version. A client of another major gets a 400 that names both versions,
  and so does a header that isn't `<major>.<minor>`. The server decides, not
  the client, so a server of a later major that can still answer older clients
  may do so.
- **The headers are in the server's CORS configuration**:
  `embedpdf-version` among the allowed request headers,
  `embedpdf-server-version` among the exposed response headers, and
  `embedpdf-engine` (see [Cached responses](#cached-responses)) exposed too.
  Without that, browsers refuse every cross-origin request that sends the
  header. They are in 3.0.0's list, so every 3.x client can send them to every
  3.x server.

### Version changes

The server keeps one ordered list of version changes. Each entry says:

- the version it arrived in;
- how to turn the earlier request into the current one;
- how to turn the current response into the earlier one.

For a client that speaks an older version, the server upgrades the request
through the entries from oldest to newest, handles it as current, then
downgrades the response through the same entries from newest to oldest. Each
entry has a test that sends the old request and checks the old response. The
list starts empty in 3.0.0 and only grows when expand and contract can't do the
job.

Version changes apply to live reads and writes only. A cached kind's structure
is chosen by the shape in its URL instead (see [Shapes](#shapes)), so the
version header never reaches a cached response.

## Cached responses

A read is either **live** or **cached**:

- **Live** reads (`/head` and every read without `@`) answer with
  `Cache-Control: no-store`. Writes are never cached.
- **Cached** reads have a versioned URL, `…@<token>`, and answer
  `immutable` for a year. A CDN in front of the server shares them between
  viewers.

The token of a cached read has four parts:

| Part         | What it says                                     | Who sets it                                                | When it changes                                                            |
| :----------- | :----------------------------------------------- | :--------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Versions** | which document data the response reads           | the server's counters, published in the manifest           | when that data changes                                                     |
| **Engine**   | what the server computes it with                 | the server: one opaque value per resource kind, in `/head` | when what the server returns for that kind changes: a rule, fonts, a field |
| **Shape**    | which structure the client reads                 | the client: one number per resource kind, compiled into it | when that kind's structure changes in a way older clients can't read       |
| **Request**  | what was asked: a query, a size, an image format | the caller                                                 | per request                                                                |

The client copies versions and engine values and never computes them. The
server checks both, and the two fail differently:

- **A version that is no longer current** answers `NotFound` ("no longer
  current") with `no-store`. The document has moved on, and the server can't
  compute a state it no longer has. The client reads `/head` again (and the
  manifest, when `docVersion` moved), builds a new URL and retries once.
- **An engine value the server doesn't have** is answered with the server's
  own output for the same versions and request, with `no-store` and that
  kind's current value in `EmbedPDF-Engine`. Nothing is cached under a value
  that doesn't describe the body, and the request doesn't fail. The client
  reads `/head` again before its next cached read of that kind. This is what
  happens during a rolling deploy that changes a value: a client that read
  `/head` from one replica and reaches another still gets an answer, uncached,
  until the replicas agree.

The server answers the shape it is asked for and never refuses a shape of its
own major.

Each part changes for its own reason, per resource kind. A release that changes
nothing about renders leaves every cached render where it is. A change to
search rules refills cached searches, not images.

### Computing at the pins

Every cached response is computed from exactly the state its pins name, and
nothing is cached otherwise. The server checks the pins before the read and
again after it, before the body goes out or into the server's own render store.
The check after the read also catches a write the editing session has applied
but not yet committed, so it can't compare only the committed counters. A pin
that fails either check answers "no longer current". One helper does this for
every cached route, so a new route can't skip it. A body filed under the wrong
pin stays wrong for a year, in every CDN that holds it.

### Versions

The manifest's counters, named by scope:

- **One page:** `contentVersion` (the page's content, so its text too),
  `annotationVersion`, `widgetVersion`. A read of one page pins that page's
  counters.
- **The whole document:** `contentsVersion`, `annotationsVersion`,
  `formsVersion`, `metadataVersion`, `outlineVersion`, `attachmentsVersion`,
  `actionsVersion`, `fontsVersion`, `viewportsVersion` (the pages' scales,
  which the layout carries), and `docVersion` for anything at all. A read
  across every page pins the document-wide counter, the plural of the page one:
  `contentsVersion` moves when any page's `contentVersion` moves or a page is
  inserted or deleted.
- **Page order:** `layoutVersion`. A read whose answer depends on page order
  pins it too.

Every counter is stored and raised in the same transaction as the write that
changes it, like `annotations_version` today. None is derived from the others:
a sum of page counters can repeat after a page is deleted, and a maximum misses
an edit to any page but the newest.

### Engine values

An engine value answers one question for a kind: besides the document, what
did the server compute this with? The same page, asked for the same way, gives
a different response when the server's fonts change, its rules for reading
page text do, or the kind gains a field. The URL has to name that, or a CDN
keeps serving the old response.

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
    "annotationAppearances": "3e7d5b10",
    "widgetAppearances": "b2a46c7e",
    "fonts": "e41b07c2",
    "text": "c7e01b3d",
    "search": "4be09a12",
    "annotations": "51d3fe08",
    "annotationsAll": "d8c3a95f",
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

The server keeps one number per rule it computes with, one number per kind for
the fields that kind returns, and lists which rules each kind reads
(`cloudpdf/server/src/services/EngineValues.ts`):

```ts
// One number per rule. Raise a rule's number in the pull request that changes
// what the rule gives for the same document and the same request.
const RULES = {
  drawing: DRAWING_VERSION, // how pages, annotations and fields are drawn
  pageText: PAGE_TEXT_VERSION, // engine-core text/charmap.ts (toPageText)
  searchFold: SEARCH_FOLD_VERSION, // engine-core search/fold.ts
  lineBreaks: LINE_BREAKS_VERSION, // engine-core text/lineBreaks.ts (contents, rich text)
};

// One number per kind. Raise it in the pull request that adds a field to the
// kind's responses.
const FIELDS = {
  render: 1,
  text: 1,
  annotations: 1,
  // … one entry for every kind in Resource kinds
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
  annotations: ['lineBreaks'],
  annotationsAll: ['lineBreaks'],
  // every other kind: none
};

const current = { ...RULES, fonts: fontsFingerprint };
engine[kind] = digest([
  `${kind}=${FIELDS[kind]}`,
  ...(INPUTS[kind] ?? []).map((input) => `${input}=${current[input]}`),
]);
```

A rule's number sits beside the code it versions, the way
`SEARCH_FOLD_VERSION` sits beside the search fold, so the change and its
number are in the same diff. The server's release version is never an input:
a deploy or a restart that raises nothing keeps every cached response.

#### When a value changes

| What happened                                                    | Values that change                                    | What stays cached                     |
| :--------------------------------------------------------------- | :---------------------------------------------------- | :------------------------------------ |
| An operator adds a font to `CLOUDPDF_FONTS`                      | `fonts`: render, both appearance kinds, the font list | text, search, annotations, the rest   |
| Page text is read differently (lines end in `\n`, no `U+FFFE`)   | `pageText`: text, search                              | pictures, annotations, the rest       |
| `contents` and rich text are read with `\n`                      | `lineBreaks`: annotations, annotationsAll             | everything else                       |
| Search ignores more characters                                   | `searchFold`: search                                  | everything else                       |
| Annotations gain a response field                                | `FIELDS.annotations`: annotations                     | everything else                       |
| A runtime upgrade changes any pixel of the test PDFs             | `drawing`: render, both appearance kinds              | text, search, the font list, the rest |
| A runtime upgrade renders the test PDFs pixel for pixel the same | none                                                  | everything                            |
| A deploy or a restart that raises nothing                        | none                                                  | everything                            |

The first two rows describe changes that happened before 3.0.0. After it, a
change like them is a change to documented behavior, which the next section
covers.

A self-hosted server's values are its own: they are opaque, and nothing
compares them with another server's.

#### What engine values are not for

- **Document edits** move the versions.
- **A change to a response's structure** that older clients can't read moves
  that kind's shape.
- **A change to documented behavior** (a unit, a default, how line breaks are
  written) is a breaking change. A new engine value keeps caches correct, but
  doesn't make the change compatible.
- **Which release the client is** goes in `EmbedPDF-Version`, never in a
  cached URL.

#### Who raises one

The engineer who changes what the server gives, in the pull request that
changes it, the way a database migration is added. Review asks one question:
for the same document and the same request, could a reader tell the new
response from the old one? If so, raise the number. Byte differences no reader
can tell apart, like another compression level, raise nothing, and neither
does a change that only makes the server faster.

For the renderer, the answer comes from a check rather than a judgment: render
the test PDFs with the old and the new runtime and compare them pixel for
pixel. Any difference raises `drawing`. Tiles of one page are separate URLs,
so an old tile and a new one can end up side by side; a difference too small
to see on one tile can still show where two meet.

### Shapes

One number per resource kind, all `1` in 3.0.0, raised only when that kind's
structure changes in a way older clients can't read. A new field is not that
(it raises the kind's `FIELDS` number). The server answers every shape of its
major, so raising a shape comes with a transform that turns the current
structure into the old shape's: a version change chosen by the shape in the
URL instead of the header. An image's encoding (`png`, `webp`) is a request
parameter, not a shape.

## Resource kinds

| Kind                    | Route                                                                  | Versions                                                            | Request                                     |
| :---------------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------------ | :------------------------------------------ |
| `manifest`              | `/manifest@`                                                           | `docVersion`                                                        |                                             |
| `layout`                | `/layout@`                                                             | `layoutVersion`, `viewportsVersion`                                 |                                             |
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
| `signatures`            | `/layers/:layer/signatures@`                                           | `docVersion`                                                        |                                             |
| `analysis`              | `/layers/:layer/signatures/analysis@`                                  | `docVersion`                                                        | since, level, policy, detail                |
| `download`              | `/layers/:layer/download@`                                             | `docVersion`                                                        | mode                                        |

Routes are under `/v1/docs/:docId`, and each document route has a
`/layers/:layer/…` twin with the same token. Every row's token also carries
`engine` (that kind's value from `/head`) and `shape` (the client's number for
that kind). A new cached read adds a row here.

## What's left

### Work, before 3.0.0

Everything here is fixed into the 3.0 client or the 3.0.0 server, so it lands
before 3.0.0. Every cached read is computed at its pins (one helper,
`readAtPins`), every token carries its engine value and shape, search pins
`contentsVersion` and `layoutVersion`, every request and response carries its
version header, and every response is read tolerantly; what is left:

1. **Conformance** (both engines): two servers with different
   `CLOUDPDF_FONTS` behind one round-robin address answer every request, and
   nothing is cached under a value that doesn't describe it; a request without
   `EmbedPDF-Version` is answered as the server's version.

### After 3.0.0

- The version-change machinery, built with the first breaking change that
  needs it.
- The client's minimum-version check, built with the first feature that needs
  a newer server. Every 3.x server sends its version, so a later client can
  check any of them.
- The runtime's release check renders the test PDFs with the old and the new
  runtime and lists the pages that differ, which decides `drawing`.
- CI keeps the 3.0.0 server image as an older server for the client's suite,
  and the 3.0.0 client for the server's, so both directions are tested against
  a real release.
