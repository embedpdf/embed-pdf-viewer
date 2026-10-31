/**
 * The host side of a server module: what the server mounts, and what it
 * hands each of a module's routes. Plain data and functions, nothing of
 * Fastify, the database or the worker pool, so the same seam can later carry
 * a module that runs as its own server.
 *
 * Module authors don't write this by hand: `defineServerModule` from
 * `@cloudpdf/server-modules` turns their module into one, and gives each
 * request the engine's document API over the connections below.
 *
 * The module's id is its namespace: its permissions are `<id>.<action>`, its
 * routes live under `…/<id>/`, and its config is read from `CLOUDPDF_<ID>_*`.
 */
import type {
  DocCapability,
  Identity,
  PageRef,
  PageRenderOptions,
  PageRenderRaster,
} from '@embedpdf/engine-core/runtime';

import type { PermissionDeclaration } from '../auth/permission-registry';

export interface HostedModule {
  /** The namespace: lowercase words joined by `-`, like `protected-display`. */
  readonly id: string;
  /** The permissions the module's routes need, written without the id: `view` is `<id>.view`. */
  readonly permissions?: Readonly<Record<string, PermissionDeclaration>>;
  /** What the module does beyond whoever calls it. */
  readonly requires?: ModuleRequirements;
  /**
   * The settings the operator gives the module, read from
   * `CLOUDPDF_<ID>_<KEY>`. A key without a default is required: the server
   * doesn't start without it.
   */
  readonly config?: Readonly<Record<string, ModuleConfigEntry>>;
  /** Add the module's routes. Runs once, while the server starts. */
  setup(host: HostedModuleHost, config: Readonly<Record<string, string>>): void | Promise<void>;
}

export interface ModuleRequirements {
  /**
   * The core's document permissions the module holds itself, beyond its
   * caller: `doc.render` to draw pages its viewers may not, `doc.text.copy`
   * to read text they may only look at. The module's own token carries these
   * and `doc.open`, on the document of each request, and nothing more. This
   * list is what a workspace admin approves.
   */
  readonly document?: ReadonlyArray<DocCapability>;
}

export interface ModuleConfigEntry {
  readonly description: string;
  /** Used when the variable isn't set. Without one, the setting is required. */
  readonly default?: string;
  /** A secret: never logged. */
  readonly secret?: boolean;
}

/** What a module may ask of the server while it sets up. */
export interface HostedModuleHost {
  /**
   * A route on a document, at
   * `/v1/docs/:docId/layers/:layerName/<module id>/<path>`. The server checks
   * the caller may open the document and holds `<module id>.<permission>`
   * before the handler runs.
   */
  docRoute(route: HostedDocRoute): void;
  readonly log: ModuleLog;
}

export interface HostedDocRoute {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Below the module's prefix, without a leading `/`: `frames/:page`. */
  readonly path: string;
  /** One of the module's document permissions, without the id: `view`. */
  readonly permission: string;
  handler(req: HostedRequest): Promise<ModuleResponse>;
}

/** A request the server has already authenticated and checked. */
export interface HostedRequest {
  readonly tenantId: string;
  readonly docId: string;
  readonly layerName: string;
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
   * The server's API as the caller, with their own token. `null` when they
   * called with the deployment's API token, which opens no document session.
   */
  readonly caller: ModuleConnection | null;
  /**
   * The server's API as the module: a token for this document that carries
   * `doc.open` and `requires.document`.
   */
  readonly module: ModuleConnection;
  /**
   * One page as raw pixels, drawn as the module: what the local engine's
   * `page(ref).render.raw(options)` gives, with the same options and
   * defaults, the module being the one whose permissions count. Everything
   * the picture draws needs its permission in `requires.document`:
   * `doc.render`, and `doc.annotate.read` or `doc.forms.read` for
   * annotations or form fields. The layer as it is now; for the screen only.
   */
  renderRaw(
    page: PageRef,
    options: PageRenderOptions,
    signal?: AbortSignal,
  ): Promise<PageRenderRaster>;
}

/** The server's own API, from inside it. */
export interface ModuleConnection {
  readonly baseUrl: string;
  /**
   * Sends a request through the server's own routes and checks, without
   * leaving its process. A live event stream is refused: it never ends.
   */
  readonly fetch: typeof globalThis.fetch;
  /** The bearer token to send. */
  token(): Promise<string>;
}

/** Who is asking. */
export interface ModuleSession {
  /** The token's subject. */
  readonly sub: string;
  readonly identity: Identity;
  /**
   * Whether the caller holds a permission: a core capability
   * (`doc.annotate.modify`), as the core's own routes would decide it, or an
   * installed plugin permission (`protected-display.view`).
   */
  allows(permission: string): Promise<boolean>;
}

export interface ModuleResponse {
  /** Default 200. */
  readonly status?: number;
  /** The `Content-Type` of `body`. */
  readonly type?: string;
  readonly body?: Uint8Array | string;
  /** Default `Cache-Control: no-store`; a module that wants caching says so here. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ModuleLog {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}
