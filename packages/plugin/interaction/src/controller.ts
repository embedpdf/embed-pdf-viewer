import {
  memo,
  PluginError,
  type PageRef,
  type PluginContext,
  type Unsubscribe,
} from '@embedpdf/core';

import type {
  Cursor,
  GestureCancelledEvent,
  GestureEndedEvent,
  GestureStartedEvent,
  InteractionSettings,
  ToolChangedEvent,
  ToolCursors,
  ToolId,
  ToolPointerEvent,
} from './contract';
import {
  samplePointOn,
  type HostTool,
  type HostToolInput,
  type InteractionHandler,
  type InteractionHostCapability,
  type PointerSample,
} from './host-contract';
import { activateTool, popTool, pushTool, setCursor, type InteractionState } from './model';

interface Claim {
  cursor: Cursor;
  priority: number;
}

/** A tool's own pointer methods take a press before every handler a plugin registers. */
const OWN_POINTER_PRIORITY = 1000;

const NO_TAGS: ReadonlySet<string> = new Set();

/**
 * The interaction hub. Tools, handlers, the captured-gesture owner and cursor
 * claims are registries in this closure; the state holds only the active
 * tool, the tool stack and the resolved cursor, so UI can react. Registering
 * or removing a tool wakes readers with `ctx.notify()`.
 *
 * Cursor arbitration, top to bottom: the highest-priority claim (hover
 * feedback) → over a page, the tool's declared cursor → over a gap, the
 * tool's `gapCursor`. The winning keyword is replaced through the active
 * tool's cursors (`setToolCursor`) when they name that keyword.
 */
export function createInteractionController(
  ctx: PluginContext<InteractionState, InteractionSettings>,
  builtinTools: readonly HostTool[],
) {
  const settings = ctx.settings();
  const tools = new Map<ToolId, HostTool>();
  /** The handler each tool with its own pointer methods brings, registered beside the plugins' handlers. */
  const ownHandlers = new Map<HostTool, InteractionHandler>();
  /** Bumped on every tool registry change: the input of the tool list. */
  let toolsVersion = 0;
  const handlers: InteractionHandler[] = [];
  const handlerSources = new Map<InteractionHandler, string>();
  const claims = new Map<string, Claim>();
  const toolCursors = new Map<ToolId, ToolCursors>();
  let owner: InteractionHandler | null = null;
  /** The gesture `owner` took, as its events report it. */
  let gesture: GestureStartedEvent | null = null;
  /** Whether the last dispatched sample hit a page: gaps fall back to `gapCursor`. */
  let overPage = false;

  const toolChanged = ctx.events.source<ToolChangedEvent>();
  const gestureStarted = ctx.events.source<GestureStartedEvent>();
  const gestureEnded = ctx.events.source<GestureEndedEvent>();
  const gestureCancelled = ctx.events.source<GestureCancelledEvent>();
  const cursorChanged = ctx.events.source<{ readonly cursor: Cursor }>();

  ctx.state.onChange(({ previous, next }) => {
    if (previous.cursor !== next.cursor) cursorChanged.emit({ cursor: next.cursor });
  });

  const state = () => ctx.state.get();
  const toolOf = (id: ToolId): HostTool =>
    tools.get(id) ?? { id, cursor: 'default', enables: NO_TAGS };
  const active = (): HostTool => toolOf(state().activeToolId);
  const listTools = memo(
    () => [toolsVersion],
    (_version) => [...tools.values()],
  );

  const resolveCursor = (): Cursor => {
    let top: Claim | null = null;
    for (const claim of claims.values()) if (!top || claim.priority > top.priority) top = claim;
    const tool = active();
    const cursors = toolCursors.get(tool.id);
    if (top) return cursors?.[top.cursor] ?? top.cursor;
    if (!overPage) return tool.gapCursor ?? 'default';
    return cursors?.[tool.cursor] ?? tool.cursor;
  };
  const syncCursor = (): void => ctx.state.update(setCursor, resolveCursor());

  // ── tools ─────────────────────────────────────────────────────────────

  const removeHandler = (handler: InteractionHandler): void => {
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
    handlerSources.delete(handler);
    if (owner === handler) {
      owner = null;
      gesture = null;
    }
  };
  const addHandler = (handler: InteractionHandler, source?: string): Unsubscribe => {
    handlers.push(handler);
    if (source !== undefined) handlerSources.set(handler, source);
    return () => removeHandler(handler);
  };

  /** Take a tool out of the registry, with the handler its pointer methods brought. */
  const removeTool = (tool: HostTool): void => {
    tools.delete(tool.id);
    const handler = ownHandlers.get(tool);
    ownHandlers.delete(tool);
    if (handler) removeHandler(handler);
  };

  /**
   * Put a tool in the registry without waking readers, and return the stored
   * tool (tags filled in). A taken id is refused unless `replace`.
   */
  const addTool = (input: HostToolInput, replace: boolean): HostTool => {
    const taken = tools.get(input.id);
    if (taken && !replace) {
      throw new PluginError(
        'conflict',
        'interaction',
        `tool '${input.id}' is already registered; pass { replace: true } to replace it`,
      );
    }
    if (taken) removeTool(taken);
    const tool: HostTool = input.enables ? (input as HostTool) : { ...input, enables: NO_TAGS };
    tools.set(tool.id, tool);
    const handler = ownPointerHandler(tool);
    if (handler) {
      ownHandlers.set(tool, handler);
      addHandler(handler);
    }
    return tool;
  };

  const toolsChanged = (): void => {
    toolsVersion += 1;
    ctx.notify();
  };

  /** The registration's remover: it removes this registration only, never a later one with its id. */
  const removerOf = (tool: HostTool) => (): void => {
    if (tools.get(tool.id) !== tool) return;
    removeTool(tool);
    toolCursors.delete(tool.id);
    toolsChanged();
  };

  for (const tool of builtinTools) addTool(tool, true);
  // The `tools` setting's tools, registered over the built-in ones; a change of
  // the setting swaps them for the new list.
  let removeSettingTools: Array<() => void> = settings
    .get()
    .tools.map((tool) => removerOf(addTool(tool, true)));
  settings.api.onSettingsChanged(({ changed }) => {
    if (!changed.includes('tools')) return;
    for (const remove of removeSettingTools) remove();
    removeSettingTools = settings.get().tools.map((tool) => removerOf(addTool(tool, true)));
    toolsChanged();
  });
  ctx.state.update(activateTool, settings.get().defaultTool);
  syncCursor();

  // ── routing ───────────────────────────────────────────────────────────

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

  /**
   * Activate a tool through `transition`. Every activation is announced,
   * including activating the active tool again.
   */
  function arm(id: ToolId, transition: (current: InteractionState) => InteractionState): void {
    if (!tools.has(id)) throw new PluginError('not-found', 'interaction', `unknown tool '${id}'`);
    const previousToolId = state().activeToolId;
    owner = null;
    gesture = null;
    claims.clear(); // the previous tool's hover claims go with it; handlers claim again on hover
    ctx.state.update(transition);
    syncCursor();
    toolChanged.emit({ toolId: id, previousToolId });
  }

  const api: InteractionHostCapability = {
    ...settings.api,

    // ── public ────────────────────────────────────────────────────────────
    getActiveTool: active,
    getActiveToolId: () => state().activeToolId,
    getDefaultToolId: () => settings.get().defaultTool,
    listTools,
    getTool: (id) => tools.get(id) ?? null,
    hasTool: (id) => tools.has(id),
    activateTool: (id) => arm(id, (current) => activateTool(current, id)),
    activateDefaultTool: () => {
      const id = settings.get().defaultTool;
      arm(id, (current) => activateTool(current, id));
    },
    pushTool: (id) => arm(id, (current) => pushTool(current, id)),
    popTool: () => {
      const stack = state().toolStack;
      if (stack.length === 0) return;
      arm(stack[stack.length - 1], popTool);
    },
    setToolCursor: (id, cursors) => {
      if (cursors === null) toolCursors.delete(id);
      else toolCursors.set(id, cursors);
      syncCursor();
    },
    registerTool: (tool, options) => {
      const stored = addTool(tool, options?.replace ?? false);
      toolsChanged();
      return removerOf(stored);
    },
    onToolChanged: toolChanged.on,
    onGestureStarted: gestureStarted.on,
    onGestureEnded: gestureEnded.on,
    onGestureCancelled: gestureCancelled.on,

    // ── host ──────────────────────────────────────────────────────────────
    activeToolEnables: (behavior) => active().enables.has(behavior),
    registerHandler: (handler, options) => addHandler(handler, options?.source),
    claimCursor: (token, cursor, priority = 0) => {
      if (cursor === null) claims.delete(token);
      else claims.set(token, { cursor, priority });
      syncCursor();
    },
    getCursor: () => state().cursor,
    hasCursorClaim: () => claims.size > 0,
    onCursorChanged: cursorChanged.on,
    wouldClaimTouch: (sample) => {
      for (const handler of eligible(sample.source)) if (handler.claimsTouch?.(sample)) return true;
      return false;
    },
    dispatchPointer: (sample) => {
      const nowOverPage = sample.page != null;
      if (nowOverPage !== overPage) {
        overPage = nowOverPage;
        syncCursor(); // crossing a page edge resolves the base cursor again
      }
      if (sample.phase === 'down') {
        owner = null;
        gesture = null;
        for (const handler of eligible(sample.source)) {
          if (handler.onDown(sample)) {
            owner = handler;
            gesture = {
              toolId: state().activeToolId,
              page: sample.page?.ref ?? null,
              pointerType: sample.pointerType ?? 'mouse',
            };
            gestureStarted.emit(gesture);
            break;
          }
        }
      } else if (sample.phase === 'move') {
        if (owner) owner.onMove?.(sample);
        else for (const handler of eligible(sample.source)) handler.onHover?.(sample);
      } else {
        const captured = owner;
        const taken = gesture;
        owner = null;
        gesture = null;
        if (!captured || !taken) return;
        if (sample.phase === 'cancel') {
          // Abort, don't commit: navigation took the pointer or the system cancelled it.
          (captured.onCancel ?? captured.onUp)?.call(captured, sample);
          gestureCancelled.emit(taken);
        } else {
          captured.onUp?.(sample);
          gestureEnded.emit(taken);
        }
      }
    },
  };

  return { api };
}

/**
 * The handler a tool's own pointer methods bring, or null for a tool without
 * them: it is live only while that tool is active, and turns samples into
 * {@link ToolPointerEvent}s in page coordinates. A gesture keeps the page it
 * started on, so a drag that leaves the page goes on in that page's
 * coordinates.
 */
function ownPointerHandler(tool: HostTool): InteractionHandler | null {
  if (!tool.onPointerDown && !tool.onHover) return null;
  let home: PageRef | null = null;
  let last: ToolPointerEvent | null = null;

  const eventOf = (page: PageRef, point: ToolPointerEvent['point'], sample: PointerSample) => ({
    page,
    point,
    modifiers: sample.modifiers,
    pointerType: sample.pointerType ?? 'mouse',
  });
  /** The sample on the gesture's page, or the last event when the source can't project it there. */
  const follow = (sample: PointerSample): ToolPointerEvent | null => {
    if (!home) return null;
    const point = samplePointOn(sample, home);
    if (point) last = eventOf(home, point, sample);
    return last;
  };
  const end = (sample: PointerSample): void => {
    const event = follow(sample);
    home = null;
    last = null;
    if (event) tool.onPointerUp?.(event);
  };

  return {
    id: `tool:${tool.id}`,
    priority: OWN_POINTER_PRIORITY,
    enabledFor: (active) => active === tool,
    onDown: (sample) => {
      if (!sample.page || !tool.onPointerDown) return false;
      const event = eventOf(sample.page.ref, sample.page.point, sample);
      if (tool.onPointerDown(event) !== true) return false;
      home = sample.page.ref;
      last = event;
      return true;
    },
    onMove: (sample) => {
      const event = follow(sample);
      if (event) tool.onPointerMove?.(event);
    },
    onUp: end,
    onCancel: end,
    onHover: (sample) => {
      if (sample.page) tool.onHover?.(eventOf(sample.page.ref, sample.page.point, sample));
    },
  };
}
