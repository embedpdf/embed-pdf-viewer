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
 * Artifact format v2: [0x4c 'L', 0x02, ...utf8 JSON {"annots":[...]}].
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

/** Serialize session annotation state into the v2 artifact format. */
function serializeAnnots(annots) {
  const json = Buffer.from(JSON.stringify({ annots }), 'utf8');
  const view = new Uint8Array(2 + json.byteLength);
  view[0] = ARTIFACT_MAGIC;
  view[1] = ARTIFACT_VERSION;
  view.set(json, 2);
  return view;
}

/** Parse a v2 artifact back into annotation state; anything else -> []. */
function parseAnnots(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buf.byteLength < 2 || buf[0] !== ARTIFACT_MAGIC || buf[1] !== ARTIFACT_VERSION) return [];
  try {
    const parsed = JSON.parse(buf.subarray(2).toString('utf8'));
    return Array.isArray(parsed.annots) ? parsed.annots : [];
  } catch {
    return [];
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
    const annots = parseAnnots(view);
    return {
      layerKind: kind,
      layerByte0: view.byteLength > 0 ? view[0] : null,
      annots,
      seq: nextSeq(annots),
    };
  }
  if (kind === 'artifact-file') {
    const bytes = msg.layer.path ? readFileSync(msg.layer.path) : Buffer.alloc(0);
    const annots = parseAnnots(bytes);
    return {
      layerKind: 'artifact',
      layerByte0: bytes.byteLength > 0 ? bytes[0] : null,
      annots,
      seq: nextSeq(annots),
    };
  }
  return { layerKind: 'fresh', layerByte0: null, annots: [], seq: 1 };
}

function pageState(pon, generation = 0, hasWeak = false) {
  return {
    pageObjectNumber: pon,
    revision: { docSessionId: 'stub-session', pageObjectNumber: pon, generation },
    weakAnnotationState: { kind: 'known', hasAnyWeakAnnotations: hasWeak },
  };
}

// Pure geometry for one page. Mirrors `PageLayout`: durable PON, display
// `index`, and a letter-sized media/crop box. No annotation liveness here —
// that rides on annotation reads, not the geometry list.
function pageLayout(pon, index, rotation = 0) {
  const box = [0, 0, 612, 792];
  return {
    index,
    pageObjectNumber: pon,
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

/** Full AnnotationDTO for a stored session annotation. */
function annotationDto(a, index) {
  return {
    subtype: 'unsupported',
    ref: {
      kind: 'objectNumber',
      pageObjectNumber: a.pon,
      annotObjectNumber: OBJECT_NUMBER_BASE + a.seq,
    },
    pageObjectNumber: a.pon,
    index,
    identityQuality: 'durable',
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
    rect: { left: 0, top: 0, right: 10, bottom: 10 },
    contents: a.contents ?? null,
    author: null,
    created: null,
    modified: null,
    rawSubtypeCode: 0,
    rawSubtypeName: null,
  };
}

/** Legacy canned annotation for lenient fallbacks (ref did not resolve). */
function cannedAnnotation(pon, index = 0) {
  return annotationDto(
    { pon, seq: pon + index, nm: `stub-${pon}-${index}`, contents: null },
    index,
  );
}

/** Annotations of one page, in session order, as DTOs. */
function pageAnnotationDtos(meta, pon) {
  const annots = (meta.annots ?? []).filter((a) => a.pon === pon);
  return annots.map((a, index) => annotationDto(a, index));
}

/** Resolve an AnnotationRef against session state; null when absent. */
function resolveRef(meta, ref) {
  const annots = meta.annots ?? [];
  if (ref.kind === 'objectNumber') {
    return annots.find((a) => OBJECT_NUMBER_BASE + a.seq === ref.annotObjectNumber) ?? null;
  }
  if (ref.kind === 'nm') {
    return annots.find((a) => a.pon === ref.pageObjectNumber && a.nm === ref.nm) ?? null;
  }
  const page = annots.filter((a) => a.pon === ref.pageObjectNumber);
  return page[ref.index] ?? null;
}

function mutationMeta(pon, generation, changedValue, hasWeak = false) {
  const state = pageState(pon, generation, hasWeak);
  return {
    affectedPages: [state],
    cacheDelta: null,
    changed: [{ kind: 'objectNumber', value: changedValue }],
    weakRefsInvalidated: false,
    shouldRefetch: null,
  };
}

/**
 * The layer artifact for a mutation result: the session's CURRENT state,
 * serialized. Undefined for base (non-layer) mutations, like the real host.
 */
function layerArtifact(msg, sessionMeta) {
  if (!msg.layerName) return undefined;
  const view = serializeAnnots(sessionMeta?.annots ?? []);
  return { bytes: view.buffer, size: view.byteLength };
}

/**
 * Deterministic RGBA raster sized by the requested scale (8px per unit),
 * so lattice points produce distinguishable — and genuinely sharp-encodable
 * — bitmaps. Shape mirrors `PageRaster`: { width, height, data }.
 */
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

function rejectAnnotationNotFound(msg) {
  parentPort.postMessage({
    kind: 'reject',
    jobId: msg.jobId,
    error: {
      name: 'EngineError',
      message: `annotation not found: ${JSON.stringify(msg.ref ?? msg.refs)}`,
      code: 'NotFound',
    },
  });
}

/**
 * Durable refs (objectNumber / nm) only ever come from annotations the
 * session actually knows about — an unresolved one means the annotation is
 * GONE (e.g. deleted by another replica before this session reloaded), and
 * the real engine answers NotFound. Index refs keep the lenient canned
 * fallback: direct-seed tests use them against artifacts with no state.
 */
function isStrictRef(ref) {
  return ref.kind === 'objectNumber' || ref.kind === 'nm';
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
      openDocs.set(sessionKey(msg), { pageCount, ...layerMeta(msg) });
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: { tag: 'open', docId: msg.docId, security: openSecurity() },
      });
      return;
    }
    case 'open.layerFileBase': {
      // Server doc routes pass a materialised file path so native
      // PDFium can range-read the base. The stub reads only to recover
      // the test page-count byte.
      const bytes = msg.basePath ? readFileSync(msg.basePath) : Buffer.alloc(0);
      const pageCount = bytes.byteLength > 0 ? bytes[0] : 0;
      openDocs.set(sessionKey(msg), { pageCount, ...layerMeta(msg) });
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: { tag: 'open', docId: msg.docId, security: openSecurity() },
      });
      return;
    }
    case 'document.checkPasswordPermissions': {
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
            created: null,
            modified: null,
            trapped: 'unknown',
            custom: {},
          },
        },
      });
      return;
    }
    case 'annotations.listRawAll': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pages = [];
      for (let i = 0; i < meta.pageCount; i++) {
        pages.push({
          pageState: pageState(i + 1),
          annotations: pageAnnotationDtos(meta, i + 1),
        });
      }
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'annotations.listRawAll',
          snapshot: { pages },
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
      const pon = msg.pageObjectNumber;
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
          // No pageState: content reads carry geometry/text only; liveness
          // (revision/weak state) rides on annotation reads + the manifest.
          snapshot: {
            text,
            charCount: text.length,
          },
        },
      });
      return;
    }
    case 'annotations.listFullPage': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = msg.pageObjectNumber;
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
      parentPort.postMessage({
        kind: 'resolve',
        jobId: msg.jobId,
        result: {
          tag: 'annotations.listFullPage',
          snapshot: {
            pageState: pageState(pon),
            annotations: pageAnnotationDtos(meta, pon),
          },
        },
      });
      return;
    }
    case 'annotations.create': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = msg.pageObjectNumber;
      meta.annots = meta.annots ?? [];
      meta.seq = meta.seq ?? 1;
      const a = {
        pon,
        seq: meta.seq++,
        nm: `stub-${pon}-${meta.seq - 1}`,
        contents: msg.draft?.contents ?? null,
      };
      meta.annots.push(a);
      const index = meta.annots.filter((x) => x.pon === pon).length - 1;
      const objectNumber = OBJECT_NUMBER_BASE + a.seq;
      resolveMutation(msg, {
        tag: 'annotations.create',
        result: {
          created: annotationDto(a, index),
          meta: mutationMeta(pon, 0, objectNumber, false),
        },
        artifact: layerArtifact(msg, meta),
      });
      return;
    }
    case 'annotations.update': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = msg.ref.pageObjectNumber;
      const found = resolveRef(meta, msg.ref);
      if (found) {
        if (msg.patch && 'contents' in msg.patch) found.contents = msg.patch.contents ?? null;
        const index = (meta.annots ?? []).filter((x) => x.pon === pon).indexOf(found);
        resolveMutation(msg, {
          tag: 'annotations.update',
          result: {
            updated: annotationDto(found, index),
            meta: mutationMeta(pon, 0, OBJECT_NUMBER_BASE + found.seq, false),
          },
          artifact: layerArtifact(msg, meta),
        });
        return;
      }
      if (isStrictRef(msg.ref)) {
        rejectAnnotationNotFound(msg);
        return;
      }
      // Lenient fallback for INDEX refs: seeded layers have no session
      // state — keep the old canned behavior so direct-seed tests stay valid.
      const ann = cannedAnnotation(pon, msg.ref.index);
      resolveMutation(msg, {
        tag: 'annotations.update',
        result: {
          updated: ann,
          meta: mutationMeta(pon, 0, ann.ref.annotObjectNumber, false),
        },
        artifact: layerArtifact(msg, meta),
      });
      return;
    }
    case 'annotations.delete': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = msg.ref.pageObjectNumber;
      const found = resolveRef(meta, msg.ref);
      if (found) {
        meta.annots = (meta.annots ?? []).filter((x) => x !== found);
        resolveMutation(msg, {
          tag: 'annotations.delete',
          result: {
            deleted: { kind: 'objectNumber', value: OBJECT_NUMBER_BASE + found.seq },
            meta: mutationMeta(pon, 1, OBJECT_NUMBER_BASE + found.seq, false),
          },
          artifact: layerArtifact(msg, meta),
        });
        return;
      }
      if (isStrictRef(msg.ref)) {
        rejectAnnotationNotFound(msg);
        return;
      }
      resolveMutation(msg, {
        tag: 'annotations.delete',
        result: {
          deleted: { kind: 'objectNumber', value: OBJECT_NUMBER_BASE + pon },
          meta: mutationMeta(pon, 1, OBJECT_NUMBER_BASE + pon, false),
        },
        artifact: layerArtifact(msg, meta),
      });
      return;
    }
    case 'annotations.move': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = msg.pageObjectNumber;
      const annots = meta.annots ?? [];
      const moving = msg.refs.map((ref) => resolveRef(meta, ref)).filter(Boolean);
      if (moving.length === msg.refs.length && moving.length > 0) {
        // Reorder within the page: remove the moved annots, reinsert at
        // toIndex (in the page-local index space), like the real mutator.
        const page = annots.filter((a) => a.pon === pon && !moving.includes(a));
        const others = annots.filter((a) => a.pon !== pon);
        page.splice(msg.toIndex, 0, ...moving);
        meta.annots = [...others, ...page];
        resolveMutation(msg, {
          tag: 'annotations.move',
          result: {
            moved: moving.map((a, i) => annotationDto(a, msg.toIndex + i)),
            meta: mutationMeta(pon, 1, OBJECT_NUMBER_BASE + moving[0].seq, false),
          },
          artifact: layerArtifact(msg, meta),
        });
        return;
      }
      resolveMutation(msg, {
        tag: 'annotations.move',
        result: {
          moved: msg.refs.map((_, i) => cannedAnnotation(pon, msg.toIndex + i)),
          meta: mutationMeta(pon, 1, OBJECT_NUMBER_BASE + pon, false),
        },
        artifact: layerArtifact(msg, meta),
      });
      return;
    }
    case 'pages.move': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const current = meta.pageOrder ?? Array.from({ length: meta.pageCount }, (_, i) => i + 1);
      const moving = new Set(msg.pageObjectNumbers);
      const remaining = current.filter((pon) => !moving.has(pon));
      const next = [
        ...remaining.slice(0, msg.destIndex),
        ...msg.pageObjectNumbers,
        ...remaining.slice(msg.destIndex),
      ];
      meta.pageOrder = next;
      // A move returns geometry, not liveness: the new layout + null cache
      // (the server fills in the real coherence pins on commit).
      const result = {
        layout: layoutSnapshot(meta),
        cache: null,
      };
      resolveMutation(msg, {
        tag: 'pages.move',
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
      for (const pon of msg.pageObjectNumbers) {
        meta.pageRotations[pon] = msg.rotation;
      }
      resolveMutation(msg, {
        tag: 'pages.rotate',
        result: { layout: layoutSnapshot(meta), cache: null },
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
      if (msg.pageObjectNumbers.length >= current.length) {
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
      const deleting = new Set(msg.pageObjectNumbers);
      meta.pageOrder = current.filter((pon) => !deleting.has(pon));
      resolveMutation(msg, {
        tag: 'pages.delete',
        result: { layout: layoutSnapshot(meta), cache: null },
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
    case 'annotations.renderAppearances': {
      const meta = openDocs.get(sessionKey(msg));
      if (!meta) {
        rejectNotOpen(msg);
        return;
      }
      const pon = msg.pageObjectNumber;
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
      const scale = typeof options.scale === 'number' && options.scale > 0 ? options.scale : 1;
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
              pageState: pageState(pon),
              appearances: [
                {
                  ref: { kind: 'objectNumber', pageObjectNumber: pon, annotObjectNumber: 9001 },
                  mode: 'normal',
                  rect: { left: 0, bottom: 0, right: 8, top: 8 },
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
            pageObjectNumber: msg.pageIndex + 1,
            pageCount,
            raster,
          },
        },
        [raster.data],
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
        result: { tag: 'attachments.list', items: [] },
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
