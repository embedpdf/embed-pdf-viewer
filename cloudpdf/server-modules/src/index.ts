/**
 * `@cloudpdf/server-modules`: write a server module, a package that runs
 * inside `@cloudpdf/server` with its own routes and permissions.
 *
 * Each request reaches the document through the engine's own document API
 * (the `DocumentHandle` the SDK and the viewer use), twice: as the caller,
 * with exactly their permissions, and as the module, with what it lists in
 * `requires.document`. The server mounts what `defineServerModule` returns.
 */
import { cloudEngine, type CloudEngine, type RawPageSource } from '@cloudpdf/engine';
import type {
  HostedModule,
  HostedRequest,
  ModuleConfigEntry,
  ModuleConnection,
  ModuleLog,
  ModuleRequirements,
  ModuleResponse,
  ModuleSession,
  PermissionDeclaration,
} from '@cloudpdf/server/modules';
import {
  decodePageKey,
  EngineError,
  EngineErrorCode,
  type CallFacts,
  type DocumentHandle,
  type PageHandle,
  type PageRef,
  type PageRenderOptions,
  type PageRenderRaster,
  type RawPageRenderService,
} from '@embedpdf/engine-core/runtime';

export interface ServerModule<ConfigKey extends string = string> {
  /** The namespace: lowercase words joined by `-`, like `protected-display`. */
  readonly id: string;
  /** The permissions the module's routes need, written without the id: `view` is `<id>.view`. */
  readonly permissions?: Readonly<Record<string, PermissionDeclaration>>;
  /** What the module does beyond whoever calls it: the list a workspace admin approves. */
  readonly requires?: ModuleRequirements;
  /**
   * The settings the operator gives the module, read from
   * `CLOUDPDF_<ID>_<KEY>`: `AXINOM_COM_KEY` of `protected-display` is
   * `CLOUDPDF_PROTECTED_DISPLAY_AXINOM_COM_KEY`. A key without a default is
   * required: the server doesn't start without it.
   */
  readonly config?: Readonly<Record<ConfigKey, ModuleConfigEntry>>;
  /** Add the module's routes. Runs once, while the server starts. */
  setup(host: ModuleHost, config: Readonly<Record<ConfigKey, string>>): void | Promise<void>;
}

/** What a module may ask of the server while it sets up. */
export interface ModuleHost {
  /**
   * A route on a document, at
   * `/v1/docs/:docId/layers/:layerName/<module id>/<path>`. The server checks
   * the caller may open the document and holds `<module id>.<permission>`
   * before the handler runs.
   */
  docRoute(route: DocRoute): void;
  readonly log: ModuleLog;
}

export interface DocRoute {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Below the module's prefix, without a leading `/`: `frames/:page`. */
  readonly path: string;
  /** One of the module's document permissions, without the id: `view`. */
  readonly permission: string;
  handler(req: ModuleRequest): Promise<ModuleResponse>;
}

/** A request the server has already authenticated and checked. */
export interface ModuleRequest {
  readonly tenantId: string;
  readonly docId: string;
  readonly layerName: string;
  /** Who is asking, and what they may do. */
  readonly session: ModuleSession;
  /** The route's own path parameters. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  /**
   * The body as the server reads it: bytes for `application/octet-stream`,
   * the parsed value for `application/json`, `undefined` without one.
   */
  readonly body: unknown;
  /** Aborts when the caller goes away before the response is sent. */
  readonly signal: AbortSignal;
  /**
   * The document as the caller: the engine's document API, with exactly
   * their permissions. Their changes are theirs, checked and shown live like
   * any other. Opened on first use, closed when the handler returns. Refused
   * when they called with the deployment's API token, which opens no
   * document session.
   */
  document(): Promise<DocumentHandle>;
  /** What the module does as itself. */
  readonly module: ModuleSelf;
}

/** The module acting as itself: with `doc.open` and what `requires.document` lists, nothing more. */
export interface ModuleSelf {
  /**
   * The document as the module. Opened on first use, closed when the handler
   * returns. Its pages also draw raw pixels: `page(ref).render.raw()`.
   */
  document(): Promise<ModuleDocumentHandle>;
}

/** The document as the module: the engine's document API, whose pages also draw raw pixels. */
export interface ModuleDocumentHandle extends Omit<DocumentHandle, 'page' | 'with'> {
  page(ref: PageRef): ModulePageHandle;
  with(facts: CallFacts): ModuleDocumentHandle;
}

/**
 * A page of the module's document. Its `render` is the local engine's: an
 * image, or the raw pixels with their transform. Everything a raw picture
 * draws needs its permission in `requires.document` (`doc.render`, and
 * `doc.annotate.read` or `doc.forms.read`); by default it draws what the
 * module may read. The layer as it is now, for the screen only.
 */
export interface ModulePageHandle extends Omit<PageHandle, 'render'> {
  readonly render: RawPageRenderService;
}

/** Type a module, and give it to the server: `export default defineServerModule({ … })`. */
export function defineServerModule<ConfigKey extends string = never>(
  module: ServerModule<ConfigKey>,
): HostedModule {
  return {
    id: module.id,
    ...(module.permissions !== undefined ? { permissions: module.permissions } : {}),
    ...(module.requires !== undefined ? { requires: module.requires } : {}),
    ...(module.config !== undefined ? { config: module.config } : {}),
    setup: (host, config) =>
      module.setup(
        {
          docRoute: (route) =>
            host.docRoute({
              method: route.method,
              path: route.path,
              permission: route.permission,
              handler: (hosted) => handle(route, hosted),
            }),
          log: host.log,
        },
        config as Readonly<Record<ConfigKey, string>>,
      ),
  };
}

async function handle(route: DocRoute, hosted: HostedRequest): Promise<ModuleResponse> {
  const engines: CloudEngine[] = [];
  // The module's engine draws raw pixels through the server; the caller's doesn't.
  const renderRaw: RawPageSource = (page, options, signal) =>
    hosted.renderRaw(page, options, signal);
  const request: ModuleRequest = {
    tenantId: hosted.tenantId,
    docId: hosted.docId,
    layerName: hosted.layerName,
    session: hosted.session,
    params: hosted.params,
    query: hosted.query,
    body: hosted.body,
    signal: hosted.signal,
    document: once(() => openDocument(hosted.caller, hosted, engines)),
    module: {
      // Its pages draw raw pixels: this engine was given the server's source.
      document: once(
        async () =>
          (await openDocument(hosted.module, hosted, engines, renderRaw)) as ModuleDocumentHandle,
      ),
    },
  };
  try {
    return await route.handler(request);
  } finally {
    await Promise.all(engines.map((engine) => engine.destroy()));
  }
}

function once<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | undefined;
  return () => (made ??= make());
}

/**
 * The cloud engine over the server's own connection, opened for this
 * request: a document handle like any client's, as the server has it now.
 */
async function openDocument(
  connection: ModuleConnection | null,
  hosted: HostedRequest,
  engines: CloudEngine[],
  renderRaw?: RawPageSource,
): Promise<DocumentHandle> {
  if (connection === null) {
    throw new EngineError(
      EngineErrorCode.Forbidden,
      "the caller used the deployment's API token, which opens no document session",
    );
  }
  const engine = cloudEngine({
    baseUrl: connection.baseUrl,
    fetch: connection.fetch,
    visitorStore: null,
    // Next to the server, every read goes to it directly: a CDN would only add a hop.
    cdn: false,
    ...(renderRaw !== undefined ? { renderRaw } : {}),
  });
  engines.push(engine);
  return engine.open({
    kind: 'id',
    id: hosted.docId,
    layerName: hosted.layerName,
    token: () => connection.token(),
  });
}

export type {
  DocumentHandle,
  ModuleConfigEntry,
  ModuleLog,
  ModuleRequirements,
  ModuleResponse,
  ModuleSession,
  PageRef,
  PageRenderOptions,
  PageRenderRaster,
  PermissionDeclaration,
  RawPageRenderService,
};
export type { PermissionLevel } from '@cloudpdf/server/modules';
// A module refuses a request the way the server does: `InvalidArg` is a 400,
// `NotFound` a 404, each in the server's own error body.
export { EngineError, EngineErrorCode };
// A page's key in a route (`obj:12`) as a `PageRef`; `null` when it isn't one.
export { decodePageKey };
