/**
 * Mounts server modules: registers their permissions, reads their config,
 * runs their setup, and turns each route they add into a guarded server
 * route. Everything a module reaches goes through here, so this is where the
 * host side (`./protocol`) is held.
 */
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import {
  CORE_NAMESPACES,
  EngineError,
  EngineErrorCode,
  InvalidScope,
  PermissionDenied,
  checkCapability,
  checkPluginPermission,
  isProtectableCapability,
  parseScope,
  renderTransform,
  wirePack,
  type DocCapability,
  type DocumentProtection,
  type PageRef,
  type PageRenderOptions,
  type PageRenderRaster,
  type PdfBits,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import { PAGE_RENDER_FAMILIES, pageRenderFamilyOf } from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { IN_PROCESS_BASE_URL, inProcessFetch } from './inProcessFetch';
import type {
  HostedDocRoute,
  HostedModule,
  HostedRequest,
  ModuleConnection,
  ModuleLog,
  ModuleResponse,
  ModuleSession,
} from './protocol';
import {
  holdsCapability,
  requireLayerCapability,
  requireLayerDocAccessOnly,
} from '../app/jwt-plugin';
import type { SignDevTokenInput } from '../auth/JwtVerifier';
import type { PermissionRegistry } from '../auth/permission-registry';
import { abortSignalOf } from '../routes/_helpers';
import type { DerivedRenderService } from '../services/DerivedRenderService';
import type { DocumentService } from '../services/DocumentService';

export interface ModuleHostDeps {
  readonly permissions: PermissionRegistry;
  /**
   * The document plane. Absent on a server without one (no worker pool or
   * database): a module that adds routes then stops the server.
   */
  readonly documentService?: DocumentService;
  /** The deployment's render policy: its output-pixel budget binds module renders too. */
  readonly derivedRenders?: DerivedRenderService;
  /**
   * Signs the module's own tokens. Absent when the server verifies tokens it
   * doesn't sign (JWKS): a module then can't open documents as itself.
   */
  readonly sign?: (input: SignDevTokenInput) => string;
}

/** A module the server has checked, with its permissions registered and its settings read. */
export interface DeclaredModule {
  readonly module: HostedModule;
  readonly config: Readonly<Record<string, string>>;
}

const MODULE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const CONFIG_KEY = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const ROUTE_SEGMENT = /^(:[a-zA-Z][a-zA-Z0-9]*|[a-z0-9][a-z0-9._-]*)$/;
/** How long a module's own token lives, and how much of that is left when a new one is made. */
const MODULE_TOKEN_TTL_SECONDS = 300;
const MODULE_TOKEN_RENEW_SECONDS = 60;

/**
 * Check `modules`, register their permissions and read their settings,
 * before anything else starts. Their permissions take part in tokens and
 * grants on every deployment, with a document plane or without one; a
 * plugin that only adds permissions (one a viewer plugin checks) is a module
 * whose setup adds nothing. A mistake in any of them stops the server from
 * starting.
 */
export function declareModules(
  modules: ReadonlyArray<HostedModule>,
  permissions: PermissionRegistry,
  env: Readonly<Record<string, string | undefined>>,
): DeclaredModule[] {
  const ids = new Set<string>();
  return modules.map((module) => {
    if (ids.has(module.id)) throw moduleError(module.id, 'is installed twice');
    ids.add(module.id);
    if (!MODULE_ID.test(module.id) || CORE_NAMESPACES.has(module.id)) {
      throw moduleError(
        module.id,
        "isn't a module id: lowercase words joined by '-', not a core name",
      );
    }
    for (const word of module.requires?.document ?? []) {
      if (!isCoreCapability(word)) {
        throw moduleError(
          module.id,
          `requires.document holds core document permissions, not "${word}"`,
        );
      }
    }
    try {
      permissions.register(module.id, module.permissions ?? {});
    } catch (err) {
      throw moduleError(module.id, (err as Error).message);
    }
    return { module, config: readConfig(module, env) };
  });
}

/**
 * Run each declared module's setup, in order, and mount the routes it adds,
 * after the core's own. A route needs the document plane; without it, a
 * module that adds one stops the server.
 */
export async function mountModules(
  app: FastifyInstance,
  declared: ReadonlyArray<DeclaredModule>,
  deps: ModuleHostDeps,
): Promise<void> {
  const fetch = inProcessFetch(app);
  for (const { module, config } of declared) {
    await mountModule(app, module, config, { ...deps, fetch });
  }
}

type MountDeps = ModuleHostDeps & { readonly fetch: typeof globalThis.fetch };
/** What a module's routes need: the document plane, present. */
type RouteDeps = MountDeps & { readonly documentService: DocumentService };

async function mountModule(
  app: FastifyInstance,
  module: HostedModule,
  config: Readonly<Record<string, string>>,
  deps: MountDeps,
): Promise<void> {
  const tokens = moduleTokens(module, deps.sign);
  let settingUp = true;
  let routes = 0;
  await module.setup(
    {
      docRoute(route) {
        if (!settingUp) throw moduleError(module.id, 'adds its routes in setup, not after it');
        const { documentService } = deps;
        if (documentService === undefined) {
          throw moduleError(
            module.id,
            'adds routes, which need the document plane: workerEntry, db and objectStore',
          );
        }
        mountDocRoute(app, module, route, tokens, { ...deps, documentService });
        routes += 1;
      },
      log: moduleLog(app, module.id),
    },
    config,
  );
  settingUp = false;
  app.log.info(
    {
      module: module.id,
      routes,
      permissions: Object.keys(module.permissions ?? {}).length,
      requires: module.requires?.document ?? [],
    },
    'module mounted',
  );
}

function isCoreCapability(word: string): boolean {
  try {
    return parseScope(word).kind === 'capability';
  } catch {
    return false;
  }
}

/** `CLOUDPDF_<ID>_<KEY>` for each declared key; an empty variable counts as unset. */
function readConfig(
  module: HostedModule,
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const prefix = `CLOUDPDF_${module.id.toUpperCase().replaceAll('-', '_')}_`;
  const config: Record<string, string> = {};
  const missing: string[] = [];
  for (const [key, entry] of Object.entries(module.config ?? {})) {
    if (!CONFIG_KEY.test(key)) {
      throw moduleError(module.id, `config key "${key}" isn't UPPER_SNAKE_CASE`);
    }
    const set = env[prefix + key];
    const value = set !== undefined && set !== '' ? set : entry.default;
    if (value === undefined) missing.push(prefix + key);
    else config[key] = value;
  }
  if (missing.length > 0) throw moduleError(module.id, `needs ${missing.join(', ')}`);
  return config;
}

/** The document a module's token is for. */
interface TokenTarget {
  readonly tenantId: string;
  readonly docId: string;
  readonly layerName: string;
}

/**
 * The module's own tokens: one per document and layer, carrying `doc.open`
 * and `requires.document`, reused until it nears its end.
 */
function moduleTokens(
  module: HostedModule,
  sign: ModuleHostDeps['sign'],
): (target: TokenTarget) => string {
  const scope = ['doc.open', ...(module.requires?.document ?? [])];
  const issued = new Map<string, { token: string; expiresAt: number }>();
  return (target) => {
    if (sign === undefined) {
      throw moduleError(
        module.id,
        "can't open a document as itself: this server verifies tokens it doesn't sign",
      );
    }
    const key = `${target.tenantId}/${target.docId}/${target.layerName}`;
    const now = Date.now();
    const held = issued.get(key);
    if (held !== undefined && held.expiresAt - now > MODULE_TOKEN_RENEW_SECONDS * 1000) {
      return held.token;
    }
    for (const [k, v] of issued) if (v.expiresAt <= now) issued.delete(k);
    const token = sign({
      sub: `module:${module.id}`,
      tenant_id: target.tenantId,
      doc_id: target.docId,
      layer_name: target.layerName,
      scope,
      jti: randomUUID(),
      ttlSeconds: MODULE_TOKEN_TTL_SECONDS,
    });
    issued.set(key, { token, expiresAt: now + MODULE_TOKEN_TTL_SECONDS * 1000 });
    return token;
  };
}

function mountDocRoute(
  app: FastifyInstance,
  module: HostedModule,
  route: HostedDocRoute,
  tokens: (target: TokenTarget) => string,
  deps: RouteDeps,
): void {
  const permission = `${module.id}.${route.permission}`;
  const declared = deps.permissions.list().find((p) => p.name === permission);
  if (declared?.level !== 'document') {
    throw moduleError(
      module.id,
      `route ${route.method} ${route.path} needs ${permission}, which isn't one of its document permissions`,
    );
  }
  const segments = route.path.split('/');
  if (
    !segments.every((s) => ROUTE_SEGMENT.test(s)) ||
    segments.some((s) => s === ':docId' || s === ':layerName')
  ) {
    throw moduleError(
      module.id,
      `route path "${route.path}" isn't relative words and :params (docId and layerName are the server's)`,
    );
  }

  app.route({
    method: route.method,
    url: `/v1/docs/:docId/layers/:layerName/${module.id}/${route.path}`,
    handler: async (req, reply) => {
      const { docId, layerName, ...params } = req.params as Record<string, string>;
      const access = requireLayerDocAccessOnly(req, docId!, layerName!);
      const pdfBits = await deps.documentService.getEffectivePdfBits(access, docId!, layerName!);
      const ctx = requireLayerCapability(req, docId!, layerName!, 'doc.open', pdfBits);
      if (
        !checkPluginPermission(permission, ctx.jwt.scope, deps.permissions.documentPermissions())
      ) {
        throw new PermissionDenied(permission);
      }
      const opened: Opened = { ctx, docId: docId!, layerName: layerName!, pdfBits };
      const target = { tenantId: ctx.tenantId, docId: docId!, layerName: layerName! };
      const signal = abortSignalOf(reply);
      const callerToken = bearerOf(req);
      const request: HostedRequest = {
        ...target,
        session: moduleSession(opened, deps),
        params,
        query: req.query as HostedRequest['query'],
        body: req.body,
        signal,
        caller: callerToken === null ? null : connection(deps.fetch, async () => callerToken),
        module: connection(deps.fetch, async () => tokens(target)),
        // Stops when the caller goes away, or when the module stops waiting.
        renderRaw: (page, options, renderSignal) =>
          renderRawAsModule(
            module,
            opened,
            page,
            options,
            renderSignal ? AbortSignal.any([signal, renderSignal]) : signal,
            deps,
          ),
      };
      return send(reply, await route.handler(request));
    },
  });
}

/** A document the request may open, and what it took to decide that. */
interface Opened {
  readonly ctx: ReturnType<typeof requireLayerCapability>;
  readonly docId: string;
  readonly layerName: string;
  readonly pdfBits: PdfBits;
}

/** The caller's own bearer token; null for the deployment's API token, which opens no session. */
function bearerOf(req: FastifyRequest): string | null {
  if (req.apiAuth) return null;
  const auth = req.headers['authorization'];
  return typeof auth === 'string' && auth.startsWith('Bearer ')
    ? auth.slice('Bearer '.length).trim()
    : null;
}

function connection(
  fetch: typeof globalThis.fetch,
  token: () => Promise<string>,
): ModuleConnection {
  return { baseUrl: IN_PROCESS_BASE_URL, fetch, token };
}

function moduleSession(opened: Opened, deps: RouteDeps): ModuleSession {
  const { ctx, docId, layerName, pdfBits } = opened;
  let protection: Promise<DocumentProtection | null> | undefined;
  return {
    sub: ctx.sub,
    identity: ctx.jwt.identity,
    async allows(permission) {
      const parsed = parseScope(permission);
      if (parsed.kind === 'plugin') {
        return checkPluginPermission(
          permission,
          ctx.jwt.scope,
          deps.permissions.documentPermissions(),
        );
      }
      if (parsed.kind !== 'capability') {
        throw new InvalidScope(permission, 'ask about one capability or plugin permission');
      }
      // Only a capability a signature can take away needs the document's protection.
      if (isProtectableCapability(parsed.name)) {
        protection ??= deps.documentService.getProtection(ctx, docId, layerName);
      }
      return holdsCapability(ctx, parsed.name, pdfBits, (await protection) ?? null);
    },
  };
}

async function renderRawAsModule(
  module: HostedModule,
  opened: Opened,
  page: PageRef,
  options: PageRenderOptions,
  signal: AbortSignal,
  deps: RouteDeps,
): Promise<PageRenderRaster> {
  const { ctx, docId, layerName, pdfBits } = opened;
  if (options.usage === 'print') {
    throw new EngineError(EngineErrorCode.InvalidArg, "a module's raw render is for the screen");
  }
  // Drawn as the module: everything the picture draws is the module's to hold.
  const held = ['doc.open', ...(module.requires?.document ?? [])];
  const holds = (capability: DocCapability) => checkCapability(capability, held, pdfBits);
  // The local engine's defaults, the module being the reader: it draws what it may read.
  const includeAnnotations = options.includeAnnotations ?? holds('doc.annotate.read');
  const includeFormFields =
    options.includeFormFields ?? (includeAnnotations && holds('doc.forms.read'));
  const family =
    PAGE_RENDER_FAMILIES[pageRenderFamilyOf({ includeAnnotations, includeFormFields })];
  for (const capability of family.needs) {
    if (!holds(capability)) throw new PermissionDenied(capability, `module ${module.id}`);
  }

  const budget = deps.derivedRenders?.maxRenderPixels;
  await deps.documentService.ensureLayerOnPool(ctx, docId, layerName);
  const result = await deps.documentService.readOnPool(
    ctx,
    docId,
    layerName,
    (jobId: WorkerJobId) =>
      wirePack({
        kind: 'pages.render' as const,
        effect: 'read' as const,
        jobId,
        docId,
        layerName,
        page,
        options: {
          ...options,
          includeAnnotations,
          includeFormFields,
          // The deployment's pixel budget binds a module too; it may ask for less.
          ...(budget !== undefined
            ? { maxOutputPixels: Math.min(options.maxOutputPixels ?? budget, budget) }
            : {}),
        },
      }),
    signal,
  );
  if (result.tag !== 'pages.render') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected layer pages.render payload: ${result.tag}`,
    );
  }
  const { raster, area } = result;
  return {
    ...raster,
    transform: renderTransform(area, options.rotation ?? 0, raster.width, raster.height),
  };
}

function send(reply: FastifyReply, response: ModuleResponse): FastifyReply {
  reply.code(response.status ?? 200);
  reply.header('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(response.headers ?? {})) reply.header(name, value);
  if (response.type !== undefined) reply.type(response.type);
  const { body } = response;
  if (body === undefined) return reply.send();
  return reply.send(
    typeof body === 'string' ? body : Buffer.from(body.buffer, body.byteOffset, body.byteLength),
  );
}

function moduleLog(app: FastifyInstance, id: string): ModuleLog {
  const log = app.log.child({ module: id });
  return {
    info: (message, details) => log.info(details ?? {}, message),
    warn: (message, details) => log.warn(details ?? {}, message),
    error: (message, details) => log.error(details ?? {}, message),
  };
}

function moduleError(id: string, reason: string): Error {
  return new Error(`module ${id} ${reason}`);
}
