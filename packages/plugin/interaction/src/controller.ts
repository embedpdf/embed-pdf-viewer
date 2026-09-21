import { PluginError, type ControllerContext, type PageRef } from '@embedpdf/core';
import type {
  ActivateToolOptions,
  Cursor,
  GestureEvent,
  InteractionHandler,
  PointerSample,
  Tool,
  ToolChangedEvent,
  ToolCursorSkin,
  ToolId,
} from './contract';
import type { InteractionHostCapability } from './host-contract';
import type { InteractionAction, InteractionState } from './model';

interface Claim {
  cursor: Cursor;
  priority: number;
}

/**
 * The interaction hub. Tools, handlers, the captured-gesture owner and cursor
 * claims are runtime registries in this closure; the model holds only the
 * active tool, the tool stack and the resolved cursor, so UI can react.
 *
 * Cursor arbitration, top to bottom: the highest-priority CLAIM (hover
 * feedback) → over a page, the tool's declared cursor → over a gap, the
 * tool's `gapCursor`. The winning keyword is restyled through the armed
 * tool's skin when it maps that keyword.
 */
export function createInteractionController(
  ctx: ControllerContext<InteractionState, InteractionAction>,
  builtinTools: readonly Tool[],
  configTools: readonly Tool[],
) {
  const tools = new Map<ToolId, Tool>();
  for (const t of [...builtinTools, ...configTools]) tools.set(t.id, t);
  const handlers: InteractionHandler[] = [];
  const handlerSources = new Map<InteractionHandler, string>();
  const claims = new Map<string, Claim>();
  const cursorSkins = new Map<ToolId, ToolCursorSkin>();
  let owner: InteractionHandler | null = null;
  /** Whether the last dispatched sample hit a page — gaps fall back to `gapCursor`. */
  let overPage = false;

  const toolChanged = ctx.events.source<ToolChangedEvent>();
  const gestureStarted = ctx.events.source<GestureEvent>();
  const gestureEnded = ctx.events.source<GestureEvent>();
  const gestureCancelled = ctx.events.source<GestureEvent>();
  const cursorChanged = ctx.events.source<{ readonly cursor: Cursor }>();

  const state = () => ctx.getState();
  const toolOf = (id: ToolId): Tool =>
    tools.get(id) ?? { id, cursor: 'default', enables: new Set() };
  const active = (): Tool => toolOf(state().activeToolId);

  const resolveCursor = (): Cursor => {
    let top: Claim | null = null;
    for (const c of claims.values()) if (!top || c.priority > top.priority) top = c;
    const tool = active();
    const skin = cursorSkins.get(tool.id);
    if (top) return skin?.[top.cursor] ?? top.cursor;
    if (!overPage) return tool.gapCursor ?? 'default';
    return skin?.[tool.cursor] ?? tool.cursor;
  };
  const syncCursor = (): void => {
    const next = resolveCursor();
    if (next === state().cursor) return;
    ctx.dispatch({ type: 'SET_CURSOR', cursor: next });
    cursorChanged.emit({ cursor: next });
  };

  /** Lens scoping: a handler registered with a `source` only sees samples stamped with it. */
  const eligible = (source?: string): InteractionHandler[] => {
    const tool = active();
    return handlers
      .filter((h) => {
        const hs = handlerSources.get(h);
        return hs === undefined || source === undefined || hs === source;
      })
      .filter((h) => h.enabledFor(tool))
      .sort((a, b) => b.priority - a.priority);
  };

  const gestureOf = (handler: InteractionHandler, sample: PointerSample): GestureEvent => ({
    handlerId: handler.id,
    page: sample.page?.ref ?? null,
    pointerType: sample.pointerType ?? 'mouse',
  });

  function arm(id: ToolId, action: InteractionAction, options?: ActivateToolOptions): void {
    if (!tools.has(id)) throw new PluginError('not-found', 'interaction', `unknown tool '${id}'`);
    const previousToolId = state().activeToolId;
    owner = null;
    claims.clear(); // the previous tool's hover claims die with it; handlers re-claim on hover
    ctx.dispatch(action);
    syncCursor();
    toolChanged.emit({ toolId: id, previousToolId, tool: toolOf(id), payload: options?.payload });
  }

  const api: InteractionHostCapability = {
    // ── public ────────────────────────────────────────────────────────────
    getActiveTool: active,
    getActiveToolId: () => state().activeToolId,
    getDefaultToolId: () => state().defaultToolId,
    listTools: () => [...tools.values()],
    getTool: (id) => tools.get(id) ?? null,
    hasTool: (id) => tools.has(id),
    activeToolEnables: (behavior) => active().enables.has(behavior),
    activateTool: (id, options) => arm(id, { type: 'SET_TOOL', toolId: id }, options),
    activateDefaultTool: () =>
      arm(state().defaultToolId, { type: 'SET_TOOL', toolId: state().defaultToolId }),
    pushTool: (id, options) => arm(id, { type: 'PUSH_TOOL', toolId: id }, options),
    popTool: () => {
      const stack = state().toolStack;
      if (stack.length === 0) return;
      arm(stack[stack.length - 1], { type: 'POP_TOOL' });
    },
    setToolCursor: (id, skin) => {
      if (skin === null) cursorSkins.delete(id);
      else cursorSkins.set(id, skin);
      syncCursor();
    },
    registerTool: (tool, options) => {
      if (tools.has(tool.id) && !options?.replace) {
        throw new PluginError(
          'conflict',
          'interaction',
          `tool '${tool.id}' is already registered; pass { replace: true } to replace it`,
        );
      }
      tools.set(tool.id, tool);
      return () => {
        // Own this registration only: a later replacement is not ours to remove.
        if (tools.get(tool.id) !== tool) return;
        tools.delete(tool.id);
        cursorSkins.delete(tool.id);
      };
    },
    onToolChanged: toolChanged.on,
    onGestureStarted: gestureStarted.on,
    onGestureEnded: gestureEnded.on,
    onGestureCancelled: gestureCancelled.on,

    // ── host ──────────────────────────────────────────────────────────────
    registerHandler: (handler, options) => {
      handlers.push(handler);
      if (options?.source !== undefined) handlerSources.set(handler, options.source);
      return () => {
        const i = handlers.indexOf(handler);
        if (i >= 0) handlers.splice(i, 1);
        handlerSources.delete(handler);
        if (owner === handler) owner = null;
      };
    },
    claimCursor: (token, cursor, priority = 0) => {
      if (cursor === null) claims.delete(token);
      else claims.set(token, { cursor, priority });
      syncCursor();
    },
    getCursor: () => state().cursor,
    onCursorChanged: cursorChanged.on,
    wouldClaimTouch: (sample) => {
      for (const h of eligible(sample.source)) if (h.claimsTouch?.(sample)) return true;
      return false;
    },
    dispatchPointer: (sample) => {
      const nowOverPage = sample.page != null;
      if (nowOverPage !== overPage) {
        overPage = nowOverPage;
        syncCursor(); // crossing a page edge re-resolves the base cursor
      }
      if (sample.phase === 'down') {
        owner = null;
        for (const h of eligible(sample.source)) {
          if (h.onDown(sample)) {
            owner = h;
            gestureStarted.emit(gestureOf(h, sample));
            break;
          }
        }
      } else if (sample.phase === 'move') {
        if (owner) owner.onMove?.(sample);
        else for (const h of eligible(sample.source)) h.onHover?.(sample);
      } else if (sample.phase === 'cancel') {
        // Abort, don't commit: navigation took the pointer or the system cancelled it.
        const o = owner;
        owner = null;
        if (o) {
          (o.onCancel ?? o.onUp)?.call(o, sample);
          gestureCancelled.emit(gestureOf(o, sample));
        }
      } else {
        const o = owner;
        owner = null;
        if (o) {
          o.onUp?.(sample);
          gestureEnded.emit(gestureOf(o, sample));
        }
      }
    },
  };

  return { api };
}

export type { PageRef };
