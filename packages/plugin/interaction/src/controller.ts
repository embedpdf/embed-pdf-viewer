import { memo, PluginError, type PluginContext } from '@embedpdf/core';

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
import { activateTool, popTool, pushTool, setCursor, type InteractionState } from './model';

interface Claim {
  cursor: Cursor;
  priority: number;
}

/**
 * The interaction hub. Tools, handlers, the captured-gesture owner and cursor
 * claims are registries in this closure; the state holds only the active
 * tool, the tool stack and the resolved cursor, so UI can react. Registering
 * or removing a tool wakes readers with `ctx.notify()`.
 *
 * Cursor arbitration, top to bottom: the highest-priority claim (hover
 * feedback) → over a page, the tool's declared cursor → over a gap, the
 * tool's `gapCursor`. The winning keyword is restyled through the armed
 * tool's skin when it maps that keyword.
 */
export function createInteractionController(
  ctx: PluginContext<InteractionState>,
  builtinTools: readonly Tool[],
  configTools: readonly Tool[],
) {
  const tools = new Map<ToolId, Tool>();
  for (const tool of [...builtinTools, ...configTools]) tools.set(tool.id, tool);
  /** Bumped on every tool registry change: the input of the tool list. */
  let toolsVersion = 0;
  const toolsChanged = (): void => {
    toolsVersion += 1;
    ctx.notify();
  };
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

  ctx.state.onChange(({ previous, next }) => {
    if (previous.cursor !== next.cursor) cursorChanged.emit({ cursor: next.cursor });
  });

  const state = () => ctx.state.get();
  const toolOf = (id: ToolId): Tool =>
    tools.get(id) ?? { id, cursor: 'default', enables: new Set() };
  const active = (): Tool => toolOf(state().activeToolId);
  const listTools = memo(
    () => [toolsVersion],
    (_version) => [...tools.values()],
  );

  const resolveCursor = (): Cursor => {
    let top: Claim | null = null;
    for (const claim of claims.values()) if (!top || claim.priority > top.priority) top = claim;
    const tool = active();
    const skin = cursorSkins.get(tool.id);
    if (top) return skin?.[top.cursor] ?? top.cursor;
    if (!overPage) return tool.gapCursor ?? 'default';
    return skin?.[tool.cursor] ?? tool.cursor;
  };
  const syncCursor = (): void => ctx.state.update(setCursor, resolveCursor());

  /** Lens scoping: a handler registered with a `source` only sees samples stamped with it. */
  const eligible = (source?: string): InteractionHandler[] => {
    const tool = active();
    return handlers
      .filter((handler) => {
        const handlerSource = handlerSources.get(handler);
        return handlerSource === undefined || source === undefined || handlerSource === source;
      })
      .filter((handler) => handler.enabledFor(tool))
      .sort((left, right) => right.priority - left.priority);
  };

  const gestureOf = (handler: InteractionHandler, sample: PointerSample): GestureEvent => ({
    handlerId: handler.id,
    page: sample.page?.ref ?? null,
    pointerType: sample.pointerType ?? 'mouse',
  });

  /**
   * Arm a tool through `transition`. Every activation is announced, including
   * re-arming the armed tool, because the payload it carries may be new.
   */
  function arm(
    id: ToolId,
    transition: (current: InteractionState) => InteractionState,
    options?: ActivateToolOptions,
  ): void {
    if (!tools.has(id)) throw new PluginError('not-found', 'interaction', `unknown tool '${id}'`);
    const previousToolId = state().activeToolId;
    owner = null;
    claims.clear(); // the previous tool's hover claims die with it; handlers re-claim on hover
    ctx.state.update(transition);
    syncCursor();
    toolChanged.emit({ toolId: id, previousToolId, tool: toolOf(id), payload: options?.payload });
  }

  const api: InteractionHostCapability = {
    // ── public ────────────────────────────────────────────────────────────
    getActiveTool: active,
    getActiveToolId: () => state().activeToolId,
    getDefaultToolId: () => state().defaultToolId,
    listTools,
    getTool: (id) => tools.get(id) ?? null,
    hasTool: (id) => tools.has(id),
    activeToolEnables: (behavior) => active().enables.has(behavior),
    activateTool: (id, options) => arm(id, (current) => activateTool(current, id), options),
    activateDefaultTool: () => {
      const id = state().defaultToolId;
      arm(id, (current) => activateTool(current, id));
    },
    pushTool: (id, options) => arm(id, (current) => pushTool(current, id), options),
    popTool: () => {
      const stack = state().toolStack;
      if (stack.length === 0) return;
      arm(stack[stack.length - 1], popTool);
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
      toolsChanged();
      return () => {
        // Own this registration only: a later replacement is not ours to remove.
        if (tools.get(tool.id) !== tool) return;
        tools.delete(tool.id);
        cursorSkins.delete(tool.id);
        toolsChanged();
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
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
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
      for (const handler of eligible(sample.source)) if (handler.claimsTouch?.(sample)) return true;
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
        for (const handler of eligible(sample.source)) {
          if (handler.onDown(sample)) {
            owner = handler;
            gestureStarted.emit(gestureOf(handler, sample));
            break;
          }
        }
      } else if (sample.phase === 'move') {
        if (owner) owner.onMove?.(sample);
        else for (const handler of eligible(sample.source)) handler.onHover?.(sample);
      } else if (sample.phase === 'cancel') {
        // Abort, don't commit: navigation took the pointer or the system cancelled it.
        const captured = owner;
        owner = null;
        if (captured) {
          (captured.onCancel ?? captured.onUp)?.call(captured, sample);
          gestureCancelled.emit(gestureOf(captured, sample));
        }
      } else {
        const captured = owner;
        owner = null;
        if (captured) {
          captured.onUp?.(sample);
          gestureEnded.emit(gestureOf(captured, sample));
        }
      }
    },
  };

  return { api };
}
