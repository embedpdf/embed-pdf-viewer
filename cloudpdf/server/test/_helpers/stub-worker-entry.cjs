/**
 * Minimal stub worker for tests of WorkerThreadPool routing and the
 * layer mutation pipeline.
 *
 * The pool dispatches WorkerRequests of various kinds; this stub
 * implements only the surface that server tests touch:
 *
 *   - `open.fatMem` / `open.layer*` -> opens a session (layer sessions
 *     seed their annotation state from the artifact they open FROM)
 *   - annotation mutations -> mutate per-session state and serialize it
 *     into the returned layer artifact
 *   - `layer.close` -> closes ONE layer session (reload seam)
 *   - `close` -> closes every session of the doc
 *   - `shutdown` -> exits after acking
 *
 * STATE CONTRACT (mirrors the real engine): a layer session is a
 * materialization of the artifact it was opened from, and the artifact a
 * mutation returns is a serialization of the session's current state. This
 * is what lets multi-replica tests observe lost updates exactly the way
 * the native engine would produce them.
 *
 * Artifact format v2: [0x4c 'L', 0x02, ...utf8 JSON {"annots":[...],"last":N}].
 * `last` is the layer's last object number: like the engine, the session
 * starts from the artifact's (or OBJECT_NUMBER_BASE), raises it to a
 * write's `objectNumberFloor - 1`, makes one object of its own per write,
 * and reports it with the open and with each artifact.
 * Artifacts seeded by tests with arbitrary bytes parse as "no annotations"
 * (legacy fallback), and `layerByte0` still echoes the raw first byte so
 * versioned-read tests keep their `artifact:<byte>` text probes.
 *
 * Mutations whose ref does not resolve against session state fall back to
 * the old canned behavior (synthesized result, state untouched) so tests
 * that seed layer rows directly keep working. Everything else gets a
 * generic "not-implemented" reject so that routing tests fail loudly
 * instead of silently passing on stale fixtures.
 */
const { parentPort } = require('node:worker_threads');
const { readFileSync } = require('node:fs');

// Per-open session state, keyed like the real WorkerHost sessions map.
// Layer sessions carry { annots, seq } in addition to page geometry.
const openDocs = new Map();

const ARTIFACT_MAGIC = 0x4c; // 'L'
const ARTIFACT_VERSION = 0x02;
const OBJECT_NUMBER_BASE = 10_000;

function openSecurity() {
  return {
    encryptionState: 'none',
    encryptionRequiresPassword: false,
    securityHandlerRevision: null,
    pdfPermissionsBits: 0xffffffff,
    pdfPermissionsAllAllowed: true,
    pdfOpenedAs: 'none',
    securityProbedAt: Date.now(),
  };
}

function passwordSecurity(msg) {
  if (msg.password === 'owner') {
    return {
      encryptionState: 'encrypted',
      encryptionRequiresPassword: false,
      securityHandlerRevision: 6,
      pdfPermissionsBits: 0xfffffffc,
      pdfPermissionsAllAllowed: true,
      pdfOpenedAs: 'owner',
      securityProbedAt: Date.now(),
    };
  }
  return {
    encryptionState: 'encrypted',
    encryptionRequiresPassword: false,
    securityHandlerRevision: 6,
    pdfPermissionsBits: 0xfffff0c0,
    pdfPermissionsAllAllowed: false,
    pdfOpenedAs: 'user',
    securityProbedAt: Date.now(),
  };
}

function sessionKey(msg) {
  return msg.layerName ? `${msg.docId}::layer:${msg.layerName}` : msg.docId;
}

// Page addresses arrive as `PageRef`s (`{ kind: 'objectNumber', objectNumber }`),
// the wire vocabulary of every `/pages/{pageKey}` route and page body.
function ponOf(page) {
  return page.objectNumber;
}
function pageRef(pon) {
  return { kind: 'objectNumber', objectNumber: pon };
}
function ponsOf(msg) {
  return msg.pages.map(ponOf);
}

/** Serialize session annotation state into the v2 artifact format. */
function serializeAnnots(annots, last) {
  const json = Buffer.from(JSON.stringify({ annots, last }), 'utf8');
  const view = new Uint8Array(2 + json.byteLength);
  view[0] = ARTIFACT_MAGIC;
  view[1] = ARTIFACT_VERSION;
  view.set(json, 2);
  return view;
}

/** Parse a v2 artifact back into annotation state and last object number; anything else -> none. */
function parseArtifact(bytes) {
  const none = { annots: [], last: OBJECT_NUMBER_BASE };
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buf.byteLength < 2 || buf[0] !== ARTIFACT_MAGIC || buf[1] !== ARTIFACT_VERSION) return none;
  try {
    const parsed = JSON.parse(buf.subarray(2).toString('utf8'));
    const annots = Array.isArray(parsed.annots) ? parsed.annots : [];
    const last = Number.isInteger(parsed.last) ? parsed.last : OBJECT_NUMBER_BASE;
    return { annots, last: Math.max(last, OBJECT_NUMBER_BASE + nextSeq(annots) - 1) };
  } catch {
    return none;
  }
}

function nextSeq(annots) {
  let max = 0;
  for (const a of annots) if (a.seq > max) max = a.seq;
  return max + 1;
}

/**
 * Layer-source metadata for a layer open: the byte0 echo used by the
 * versioned-read text probes, plus the parsed annotation state the
 * session materializes from.
 */
function layerMeta(msg) {
  const kind = msg.layer?.kind ?? 'fresh';
  if (kind === 'artifact' || kind === 'raw-delta') {
    const view = msg.layer.bytes ? Buffer.from(msg.layer.bytes) : Buffer.alloc(0);
    const { annots, last } = parseArtifact(view);
    return {
      layerKind: kind,
      layerByte0: view.byteLength > 0 ? view[0] : null,
      annots,
      seq: nextSeq(annots),
      last,
    };
  }
  if (kind === 'artifact-file') {
    const bytes = msg.layer.path ? readFileSync(msg.layer.path) : Buffer.alloc(0);
    const { annots, last } = parseArtifact(bytes);
    return {
      layerKind: 'artifact',
      layerByte0: bytes.byteLength > 0 ? bytes[0] : null,
      annots,
      seq: nextSeq(annots),
      last,
    };
  }
  return { layerKind: 'fresh', layerByte0: null, annots: [], seq: 1, last: OBJECT_NUMBER_BASE };
}

// Pure geometry for one page. Mirrors `PageLayout`: durable PON, display
// `index`, and a letter-sized media/crop box. No annotation liveness here —
// that rides on annotation reads, not the geometry list.
function pageLayout(pon, index, rotation = 0) {
  const box = [0, 0, 612, 792];
  return {
    index,
    ref: { kind: 'objectNumber', objectNumber: pon },
    label: null,
    width: 612,
    height: 792,
    rotation,
    userUnit: 1,
    boxes: { media: box, crop: box },
  };
}

// Build a `PageListSnapshot` ({ pageCount, pages: PageLayout[] }) from the
// session's current page order (falling back to 1..pageCount) and the
// per-page rotations set by pages.rotate.
function layoutSnapshot(meta) {
  const order = meta.pageOrder ?? Array.from({ length: meta.pageCount }, (_, i) => i + 1);
  return {
    pageCount: order.length,
    pages: order.map((pon, index) => pageLayout(pon, index, meta.pageRotations?.[pon] ?? 0)),
  };
}

/** Full Annotation for a stored session annotation. */
function annotationDto(a) {
  return {
    subtype: 'unsupported',
    ref: annotationRef(a),
    page: pageRef(a.pon),
    hasAppearance: true,
    appearanceState: null,
    nm: a.nm,
    flags: {
      invisible: false,
      hidden: false,
      print: true,
      noZoom: false,
      noRotate: false,
      noView: false,
      readOnly: false,
      locked: false,
      toggleNoView: false,
      lockedContents: false,
    },
    rect: { x: 0, y: 0, width: 10, height: 10 },
    contents: a.contents ?? null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    rawSubtypeCode: 0,
    rawSubtypeName: null,
  };
}

/** Legacy canned annotation for lenient fallbacks (ref did not resolve). */
function cannedAnnotation(pon, index = 0) {
  return annotationDto({ pon, seq: pon + index, nm: `stub-${pon}-${index}`, contents: null });
}

function annotationRef(a) {
  return { kind: 'objectNumber', page: pageRef(a.pon), objectNumber: OBJECT_NUMBER_BASE + a.seq };
}

/** Where `position` falls in `rows` (the rows that stay), like the real engine. */
function positionIn(rows, position, find) {
  if (position === 'start') return 0;
  if (position === 'end') return rows.length;
  const anchor = 'before' in position ? position.before : position.after;
  const at = rows.indexOf(find(anchor));
  if (at < 0) throw stubError('NotFound', `no neighbour ${JSON.stringify(anchor)}`);
  return 'before' in position ? at : at + 1;
}

/** Annotations of one page, in session order, as DTOs. */
function pageAnnotationDtos(meta, pon) {
  const annots = (meta.annots ?? []).filter((a) => a.pon === pon);
  return annots.map((a) => annotationDto(a));
}

/** Resolve an AnnotationRef against session state; null when absent. */
function resolveRef(meta, ref) {
  const annots = meta.annots ?? [];
  if (ref.kind === 'objectNumber') {
    return annots.find((a) => OBJECT_NUMBER_BASE + a.seq === ref.objectNumber) ?? null;
  }
  const page = annots.filter((a) => a.pon === ponOf(ref.page));
  return page[ref.baseIndex] ?? null;
}

function mutationMeta(pon, changedValue) {
  return {
    affectedPages: [pageRef(pon)],
    cacheDelta: null,
    changed: [{ kind: 'objectNumber', page: pageRef(pon), objectNumber: changedValue }],
  };
}

/**
 * The layer artifact for a mutation result: the session's CURRENT state,
 * serialized. Undefined for base (non-layer) mutations, like the real host.
 */
function layerArtifact(msg, sessionMeta) {
  if (!msg.layerName) return undefined;
  const meta = sessionMeta ?? {};
  const annots = meta.annots ?? [];
  // The write's own objects, numbered past its floor: one, or 100 for a
  // create whose contents ask for more than any estimate.
  const own = changeOps(msg).some((op) => op.data?.contents === '__MANY_OBJECTS__') ? 100 : 1;
  meta.last =
    Math.max(
      meta.last ?? OBJECT_NUMBER_BASE,
      (msg.objectNumberFloor ?? 0) - 1,
      OBJECT_NUMBER_BASE + nextSeq(annots) - 1,
    ) + own;
  const view = serializeAnnots(annots, meta.last);
  return { bytes: view.buffer, size: view.byteLength, lastObjectNumber: meta.last };
}

/**
 * Deterministic RGBA raster sized by the requested scale (8px per unit),
 * so lattice points produce distinguishable — and genuinely sharp-encodable
 * — bitmaps. Shape mirrors `PageRaster`: { width, height, data }.
 */
// The `*.renderEncoded` kinds use real sharp (a server
// dependency), so worker-side encodes are byte-identical to what the
// API-side SharpImageEncoder produced before in-engine encoding — existing tests that
// assert response/artifact bytes keep passing across the flag.
const sharp = require('sharp');

async function encodeStubRaster(raster, encode) {
  const image = sharp(Buffer.from(raster.data), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  });
  const stream =
    encode.format === 'webp'
      ? image.webp(
          encode.quality === undefined
            ? {}
            : { quality: Math.min(100, Math.max(1, Math.round(encode.quality * 100))) },
        )
      : image.png();
  const bytes = new Uint8Array(await stream.toBuffer());
  return {
    contentType: encode.format === 'webp' ? 'image/webp' : 'image/png',
    width: raster.width,
    height: raster.height,
    bytes,
  };
}

function rejectEncodeError(msg, err) {
  parentPort.postMessage({
    kind: 'reject',
    jobId: msg.jobId,
    error: { name: 'EngineError', message: String((err && err.message) || err), code: 'Unknown' },
  });
}

function stubRaster(options) {
  const scale =
    options && options.viewport && options.viewport.kind === 'scale' && options.viewport.scale
      ? options.viewport.scale
      : 1;
  const width = Math.max(1, Math.round(8 * scale));
  const height = Math.max(1, Math.round(8 * scale));
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0x88;
    data[i + 1] = 0xaa;
    data[i + 2] = 0xcc;
    data[i + 3] = 0xff;
  }
  return { width, height, data: data.buffer };
}

function resolveMutation(msg, payload) {
  parentPort.postMessage(
    {
      kind: 'resolve',
      jobId: msg.jobId,
      result: payload,
    },
    payload.artifact ? [payload.artifact.bytes] : [],
  );
}

function rejectNotOpen(msg) {
  parentPort.postMessage({
    kind: 'reject',
    jobId: msg.jobId,
    error: { name: 'EngineError', message: `not open: ${msg.docId}`, code: 'DocNotOpen' },
  });
}

function rejectPasswordIncorrect(msg) {
  parentPort.postMessage({
    kind: 'reject',
    jobId: msg.jobId,
    error: {
      name: 'EngineError',
      message: 'incorrect document password',
      code: 'DocPasswordIncorrect',
    },
  });
}

/**
 * Object-number refs only ever come from annotations the session actually
 * knows about — an unresolved one means the annotation is GONE (e.g. deleted
 * by another replica before this session reloaded), and the real engine
 * answers NotFound. Base-index refs keep the lenient canned fallback: they
 * name a file's inline annotations, which a direct-seed layer has no state for.
 */
function isStrictRef(ref) {
  return ref.kind === 'objectNumber';
}

/** The refusals a change keeps as its answer (engine-core `isKeptRefusal`). */
const KEPT_REFUSALS = new Set([
  'InvalidArg',
  'NotFound',
  'Forbidden',
  'ProtectedDocument',
  'MalformedPdf',
  'PayloadTooLarge',
  'ObjectNumberUnavailable',
  'LayerFull',
  'ChangeConflict',
  'UndoUnavailable',
]);

function stubError(code, message) {
  return Object.assign(new Error(message), { code });
}

function serializedOf(err) {
  return { name: 'EngineError', code: err.code ?? 'Unknown', message: err.message };
}

/** Every op of a server request's changes. */
function changeOps(msg) {
  return (msg.changes ?? []).flatMap((entry) => entry.change.ops ?? []);
}

/**
 * One annotation op of a change, on the session's state, as the real
 * mutator answers it: its item, or a thrown refusal.
 */
function applyStubOp(meta, op, opId) {
  const stamp = { opId, undoable: false };
  switch (op.type) {
    case 'annotations.create': {
      const pon = ponOf(op.page);
      meta.annots = meta.annots ?? [];
      meta.seq = meta.seq ?? 1;
      const a = {
        pon,
        seq: meta.seq++,
        nm: `stub-${pon}-${meta.seq - 1}`,
        contents: op.data?.contents ?? null,
      };
      meta.annots.push(a);
      return {
        type: op.type,
        page: op.page,
        annotation: annotationDto(a),
        meta: { ...mutationMeta(pon, OBJECT_NUMBER_BASE + a.seq), ...stamp },
      };
    }
    case 'annotations.update': {
      const pon = ponOf(op.ref.page);
      const found = resolveRef(meta, op.ref);
      if (found) {
        if (op.patch && 'contents' in op.patch) found.contents = op.patch.contents ?? null;
        return {
          type: op.type,
          page: op.ref.page,
          annotation: annotationDto(found),
          appearance: { action: 'regenerated', changed: true },
          meta: { ...mutationMeta(pon, OBJECT_NUMBER_BASE + found.seq), ...stamp },
        };
      }
      if (isStrictRef(op.ref)) throw annotationNotFound(op.ref);
      // Lenient fallback for base-index refs: seeded layers have no session
      // state, so a canned annotation keeps direct-seed tests valid.
      const ann = cannedAnnotation(pon, op.ref.baseIndex);
      return {
        type: op.type,
        page: op.ref.page,
        annotation: ann,
        appearance: { action: 'regenerated', changed: true },
        meta: { ...mutationMeta(pon, ann.ref.objectNumber), ...stamp },
      };
    }
    case 'annotations.delete': {
      const pon = ponOf(op.ref.page);
      const found = resolveRef(meta, op.ref);
      if (found) {
        meta.annots = (meta.annots ?? []).filter((x) => x !== found);
        return {
          type: op.type,
          page: op.ref.page,
          meta: { ...mutationMeta(pon, OBJECT_NUMBER_BASE + found.seq), ...stamp },
        };
      }
      if (isStrictRef(op.ref)) throw annotationNotFound(op.ref);
      return {
        type: op.type,
        page: op.ref.page,
        meta: { ...mutationMeta(pon, OBJECT_NUMBER_BASE + pon), ...stamp },
      };
    }
    case 'annotations.reorder': {
      const pon = ponOf(op.page);
      const annots = meta.annots ?? [];
      const moving = op.refs.map((ref) => resolveRef(meta, ref)).filter(Boolean);
      if (moving.length === op.refs.length && moving.length > 0) {
        // Restack within the page: take the moved annots out, put them back
        // next to the neighbour, like the real engine.
        const page = annots.filter((a) => a.pon === pon && !moving.includes(a));
        const others = annots.filter((a) => a.pon !== pon);
        page.splice(
          positionIn(page, op.position, (ref) => resolveRef(meta, ref)),
          0,
          ...moving,
        );
        meta.annots = [...others, ...page];
        return {
          type: op.type,
          page: op.page,
          order: page.map(annotationRef),
          meta: { ...mutationMeta(pon, OBJECT_NUMBER_BASE + moving[0].seq), ...stamp },
        };
      }
      return {
        type: op.type,
        page: op.page,
        order: op.refs,
        meta: { ...mutationMeta(pon, OBJECT_NUMBER_BASE + pon), ...stamp },
      };
    }
    default:
      throw stubError('NotImplemented', `stub worker: op '${op.type}' not implemented`);
  }
}

function annotationNotFound(ref) {
  return stubError('NotFound', `annotation not found: ${JSON.stringify(ref)}`);
}

parentPort.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.kind) {
    case 'open.fatMem': {
      // First byte of the payload encodes the page count for tests.
      // Real workers ignore the bytes' meaning here; this is a stub
      // convenience.
      const view = msg.bytes ? new Uint8Array(msg.bytes) : new Uint8Array(0);
      const pageCount = view.byteLength > 0 ? view[0] : 0;
      openDocs.set(sessionKey(msg), { pageCount });
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: { tag: 'open', docId: msg.docId, security: openSecurity() },
      });
      return;
    }
    case 'open.layerMemBase': {
      // Layer sessions are addressed by docId + layerName. The first
      // byte of the base payload still encodes page count for tests.
      const view = msg.baseBytes ? new Uint8Array(msg.baseBytes) : new Uint8Array(0);
      const pageCount = view.byteLength > 0 ? view[0] : 0;
      const meta = { pageCount, ...layerMeta(msg) };
      openDocs.set(sessionKey(msg), meta);
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'open',
          docId: msg.docId,
          security: openSecurity(),
          lastObjectNumber: meta.last,
        },
      });
      return;
    }
    case 'open.layerFileBase': {
      // Server doc routes pass a materialised file path so native
      // PDFium can range-read the base. The stub reads only to recover
      // the test page-count byte.
      const bytes = msg.basePath ? readFileSync(msg.basePath) : Buffer.alloc(0);
      const pageCount = bytes.byteLength > 0 ? bytes[0] : 0;
      const meta = { pageCount, ...layerMeta(msg) };
      openDocs.set(sessionKey(msg), meta);
      const resolveOpen = () =>
        parentPort.postMessage({
          kind: 'resolve',
          jobId: msg.jobId,
          result: {
            tag: 'open',
            docId: msg.docId,
            security: openSecurity(),
            lastObjectNumber: meta.last,
          },
        });
      // Deterministic singleflight seam for the API-password integration
      // test: keep the canonical open in flight long enough for a second
      // caller with a different password to join it.
      if (msg.docId === 'docapisingleflight') setTimeout(resolveOpen, 100);
      else resolveOpen();
      return;
    }
    case 'document.checkPasswordPermissions': {
      if (msg.password === 'api-wrong-password') {
        rejectPasswordIncorrect(msg);
        return;
      }
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'document.checkPasswordPermissions',
          security: passwordSecurity(msg),
        },
      });
      return;
    }
    case 'document.probeSecurityFile': {
      // Byte1 of the file steers the probe: 0x01 = user-password required
      // (the thumbnail `locked` path); anything else = open document.
      const probeBytes = msg.path ? readFileSync(msg.path) : Buffer.alloc(0);
      const requiresPassword = probeBytes.byteLength > 1 && probeBytes[1] === 0x01;
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'document.probeSecurityFile',
          security: requiresPassword
            ? {
                encryptionState: 'encrypted',
                encryptionRequiresPassword: true,
                securityHandlerRevision: 6,
                pdfPermissionsBits: null,
                pdfPermissionsAllAllowed: null,
                pdfOpenedAs: null,
                securityProbedAt: Date.now(),
              }
            : {
                encryptionState: 'none',
                encryptionRequiresPassword: false,
                securityHandlerRevision: null,
                pdfPermissionsBits: 0xffffffff,
                pdfPermissionsAllAllowed: true,
                pdfOpenedAs: 'none',
                securityProbedAt: Date.now(),
              },
        },
      });
      return;
    }
    case 'pages.list': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'pages.list',
          snapshot: layoutSnapshot(meta),
        },
      });
      return;
    }
    case 'actions.read': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      // Deterministic catalog-actions snapshot: byte-identical for the base
      // session and every pristine layer session (the plane-sharing rule).
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'actions.read',
          snapshot: { nameTreeScripts: [], openAction: null },
        },
      });
      return;
    }
    case 'metadata.read': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'metadata.read',
          metadata: {
            title: `stub-doc-${msg.docId}`,
            author: null,
            subject: null,
            keywords: null,
            producer: 'stub-worker',
            creator: null,
            createdAt: null,
            modifiedAt: null,
            trapped: 'unknown',
          },
        },
      });
      return;
    }
    case 'metadata.readCustom': {
      if (!openDocs.get(sessionKey(msg))) {
        rejectNotOpen(msg);
        return;
      }
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: { tag: 'metadata.readCustom', custom: {} },
      });
      return;
    }
    case 'annotations.list': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pons = msg.pages
        ? msg.pages.map(ponOf)
        : Array.from({ length: meta.pageCount }, (_, i) => i + 1);
      const missing = pons.find((pon) => pon < 1 || pon > meta.pageCount);
      if (missing !== undefined) {
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: `no page with object number ${missing}`,
            code: 'NotFound',
          },
        });
        return;
      }
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'annotations.list',
          list: {
            annotations: pons.flatMap((pon) => pageAnnotationDtos(meta, pon)),
            pages: pons.map(pageRef),
          },
        },
      });
      return;
    }
    case 'pages.text': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = ponOf(msg.page);
      if (pon < 1 || pon > meta.pageCount) {
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: `no page with object number ${pon}`,
            code: 'NotFound',
          },
        });
        return;
      }
      const layerSuffix =
        meta.layerKind && meta.layerKind !== 'fresh'
          ? ` ${meta.layerKind}:${meta.layerByte0 ?? 'empty'}`
          : '';
      const text = `stub text for ${msg.docId} page ${pon}${layerSuffix}`;
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'pages.text',
          // Content reads carry geometry/text only; the manifest carries the pins.
          snapshot: {
            text,
            charCount: text.length,
          },
        },
      });
      return;
    }
    case 'document.applyChanges': {
      // Boundary-kill test hook: a create with contents '__STALL__' never
      // replies, deterministically parking the engine apply so a test can
      // kill the host mid-operation.
      if (changeOps(msg).some((op) => op.data?.contents === '__STALL__')) return;
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      // Each change on its own, as the real host runs it: a refusal is its
      // answer and takes its ops back; anything else fails the job.
      const outcomes = [];
      let wrote = false;
      for (const entry of msg.changes) {
        const before = { annots: [...(meta.annots ?? [])], seq: meta.seq };
        try {
          if (!entry.change.ops) {
            throw stubError('NotImplemented', 'stub worker: undo is not implemented');
          }
          const items = entry.change.ops.map((op) => applyStubOp(meta, op, entry.opId));
          const pages = new Map();
          for (const item of items) for (const page of item.meta.affectedPages) pages.set(page.objectNumber, page);
          outcomes.push({
            opId: entry.opId,
            status: 'applied',
            result: {
              items,
              meta: {
                affectedPages: [...pages.values()],
                cacheDelta: null,
                opId: entry.opId,
                undoable: false,
              },
            },
            record: null,
          });
          wrote = true;
        } catch (err) {
          meta.annots = before.annots;
          meta.seq = before.seq;
          if (!err.code || !KEPT_REFUSALS.has(err.code)) {
            parentPort.postMessage({ kind: 'reject', jobId: msg.jobId, error: serializedOf(err) });
            return;
          }
          outcomes.push({ opId: entry.opId, status: 'refused', error: serializedOf(err) });
        }
      }
      resolveMutation(msg, {
        tag: 'document.applyChanges',
        outcomes,
        ...(wrote ? { artifact: layerArtifact(msg, meta) } : {}),
      });
      return;
    }
    case 'pages.reorder': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const current = meta.pageOrder ?? Array.from({ length: meta.pageCount }, (_, i) => i + 1);
      const movingPons = ponsOf(msg);
      const moving = new Set(movingPons);
      const remaining = current.filter((pon) => !moving.has(pon));
      const at = positionIn(remaining, msg.position, ponOf);
      const next = [...remaining.slice(0, at), ...movingPons, ...remaining.slice(at)];
      meta.pageOrder = next;
      // A reorder returns geometry, not liveness: the new layout + empty meta
      // (the server fills in the real coherence pins on commit).
      const result = {
        pages: movingPons.map(pageRef),
        layout: layoutSnapshot(meta),
        meta: { affectedPages: [], cacheDelta: null },
      };
      resolveMutation(msg, {
        tag: 'pages.reorder',
        result,
        artifact: layerArtifact(msg, meta),
      });
      return;
    }
    case 'pages.rotate': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      // Rotation is presentation metadata: same pages, same order, new
      // per-page rotation values (the real mutator's exact contract).
      meta.pageRotations = meta.pageRotations ?? {};
      for (const pon of ponsOf(msg)) {
        meta.pageRotations[pon] = msg.rotation;
      }
      resolveMutation(msg, {
        tag: 'pages.rotate',
        result: { layout: layoutSnapshot(meta), meta: { affectedPages: [], cacheDelta: null } },
        artifact: layerArtifact(msg, meta),
      });
      return;
    }
    case 'pages.delete': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const current = meta.pageOrder ?? Array.from({ length: meta.pageCount }, (_, i) => i + 1);
      const deletingPons = ponsOf(msg);
      if (deletingPons.length >= current.length) {
        // Mirrors PagesMutator: a document must keep at least one page.
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: 'pages.delete would remove every page',
            code: 'InvalidArg',
          },
        });
        return;
      }
      const deleting = new Set(deletingPons);
      meta.pageOrder = current.filter((pon) => !deleting.has(pon));
      resolveMutation(msg, {
        tag: 'pages.delete',
        result: { layout: layoutSnapshot(meta), meta: { affectedPages: [], cacheDelta: null } },
        artifact: layerArtifact(msg, meta),
      });
      return;
    }
    case 'pages.render': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const raster = stubRaster(msg.options);
      parentPort.postMessage(
        { kind: 'resolve', jobId: msg.jobId, result: { tag: 'pages.render', raster } },
        [raster.data],
      );
      return;
    }
    case 'pages.renderEncoded': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const raster = stubRaster(msg.options);
      encodeStubRaster(raster, msg.encode).then(
        (image) => {
          parentPort.postMessage(
            { kind: 'resolve', jobId: msg.jobId, result: { tag: 'pages.renderEncoded', image } },
            [image.bytes.buffer],
          );
        },
        (err) => rejectEncodeError(msg, err),
      );
      return;
    }
    case 'annotations.renderAppearances': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = ponOf(msg.page);
      if (pon < 1 || pon > meta.pageCount) {
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: `no page with object number ${pon}`,
            code: 'NotFound',
          },
        });
        return;
      }
      // One synthetic appearance sized 8×scale — enough for the multipart
      // path and the budget guard to be observable from tests.
      const options = msg.options || {};
      const viewportScale =
        options.viewport && options.viewport.kind === 'scale' ? options.viewport.scale : undefined;
      const scale = typeof viewportScale === 'number' && viewportScale > 0 ? viewportScale : 1;
      const side = Math.max(1, Math.round(8 * scale));
      // Mirror deviceRaster's PRE-ALLOCATION budget guard.
      if (options.maxOutputPixels !== undefined && side * side > options.maxOutputPixels) {
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: `render output ${side}x${side} exceeds the ${options.maxOutputPixels}-pixel budget — request a smaller scale`,
            code: 'InvalidArg',
          },
        });
        return;
      }
      const data = new Uint8Array(side * side * 4).fill(0x77);
      parentPort.postMessage(
        {
          kind: 'resolve',
          jobId: msg.jobId,
          result: {
            tag: 'annotations.renderAppearances',
            result: {
              page: pageRef(pon),
              appearances: [
                {
                  ref: { kind: 'objectNumber', page: pageRef(pon), objectNumber: 9001 },
                  mode: 'normal',
                  state: null,
                  rect: { x: 0, y: 0, width: 8, height: 8 },
                  raster: { width: side, height: side, data: data.buffer },
                },
              ],
            },
          },
        },
        [data.buffer],
      );
      return;
    }
    case 'annotations.renderAppearancesEncoded': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = ponOf(msg.page);
      if (pon < 1 || pon > meta.pageCount) {
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: `no page with object number ${pon}`,
            code: 'NotFound',
          },
        });
        return;
      }
      const options = msg.options || {};
      const viewportScale =
        options.viewport && options.viewport.kind === 'scale' ? options.viewport.scale : undefined;
      const scale = typeof viewportScale === 'number' && viewportScale > 0 ? viewportScale : 1;
      const side = Math.max(1, Math.round(8 * scale));
      if (options.maxOutputPixels !== undefined && side * side > options.maxOutputPixels) {
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: `render output ${side}x${side} exceeds the ${options.maxOutputPixels}-pixel budget — request a smaller scale`,
            code: 'InvalidArg',
          },
        });
        return;
      }
      const data = new Uint8Array(side * side * 4).fill(0x77);
      const raster = { width: side, height: side, data: data.buffer };
      encodeStubRaster(raster, msg.encode).then(
        (image) => {
          parentPort.postMessage(
            {
              kind: 'resolve',
              jobId: msg.jobId,
              result: {
                tag: 'annotations.renderAppearancesEncoded',
                result: {
                  page: pageRef(pon),
                  appearances: [
                    {
                      ref: { kind: 'objectNumber', page: pageRef(pon), objectNumber: 9001 },
                      mode: 'normal',
                      state: null,
                      rect: { x: 0, y: 0, width: 8, height: 8 },
                      image,
                    },
                  ],
                },
              },
            },
            [image.bytes.buffer],
          );
        },
        (err) => rejectEncodeError(msg, err),
      );
      return;
    }
    case 'document.renderPageFile': {
      // Ad-hoc file render (the warm path): no session involved. Byte0 of
      // the file encodes the page count, mirroring the open stubs.
      const bytes = msg.path ? readFileSync(msg.path) : Buffer.alloc(0);
      const pageCount = bytes.byteLength > 0 ? bytes[0] : 0;
      if (msg.pageIndex >= pageCount) {
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: `no page at index ${msg.pageIndex}`,
            code: 'NotFound',
          },
        });
        return;
      }
      const raster = stubRaster(msg.options);
      parentPort.postMessage(
        {
          kind: 'resolve',
          jobId: msg.jobId,
          result: {
            tag: 'document.renderPageFile',
            page: pageRef(msg.pageIndex + 1),
            pageCount,
            raster,
          },
        },
        [raster.data],
      );
      return;
    }
    case 'document.renderPageFileEncoded': {
      const bytes = msg.path ? readFileSync(msg.path) : Buffer.alloc(0);
      const pageCount = bytes.byteLength > 0 ? bytes[0] : 0;
      if (msg.pageIndex >= pageCount) {
        parentPort.postMessage({
          kind: 'reject',
          jobId: msg.jobId,
          error: {
            name: 'EngineError',
            message: `no page at index ${msg.pageIndex}`,
            code: 'NotFound',
          },
        });
        return;
      }
      const raster = stubRaster(msg.options);
      encodeStubRaster(raster, msg.encode).then(
        (image) => {
          parentPort.postMessage(
            {
              kind: 'resolve',
              jobId: msg.jobId,
              result: {
                tag: 'document.renderPageFileEncoded',
                page: pageRef(msg.pageIndex + 1),
                pageCount,
                image,
              },
            },
            [image.bytes.buffer],
          );
        },
        (err) => rejectEncodeError(msg, err),
      );
      return;
    }
    case 'attachments.list': {
      // Base-session capable (plane-scoped shared reads): no layerName resolves the
      // doc's base session, mirroring the real WorkerHost.
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: { tag: 'attachments.list', attachments: [] },
      });
      return;
    }
    case 'layer.close':
      // The reload seam: close exactly ONE layer session, leaving the
      // base session, sibling layers, and the pool binding intact.
      // Idempotent — closing an absent session is a no-op ack.
      openDocs.delete(sessionKey(msg));
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: { tag: 'close', docId: msg.docId },
      });
      return;
    case 'close':
      for (const key of Array.from(openDocs.keys())) {
        if (key === msg.docId || key.startsWith(`${msg.docId}::layer:`)) {
          openDocs.delete(key);
        }
      }
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: { tag: 'close', docId: msg.docId },
      });
      return;
    case 'abort':
      // Pool sends this to interrupt an in-flight job; we have no
      // long-running jobs in this stub, so we ignore it.
      return;
    case 'shutdown':
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: { tag: 'shutdown' },
      });
      setTimeout(() => process.exit(0), 5);
      return;
    default:
      parentPort.postMessage({
        kind: 'reject',
        jobId: msg.jobId,
        error: {
          name: 'EngineError',
          message: `stub worker: kind '${msg.kind}' not implemented`,
          code: 'Unknown',
        },
      });
  }
});

parentPort.postMessage({ kind: 'ready' });
