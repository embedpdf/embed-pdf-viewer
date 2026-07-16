import type { PluginContext } from '@embedpdf-x/kernel';
import type {
  Cursor,
  InteractionAction,
  InteractionCapability,
  InteractionHandler,
  InteractionState,
  Tool,
  ToolCursorSkin,
  ToolId,
} from './types';

interface Claim {
  cursor: Cursor;
  priority: number;
}

/**
 * The interaction hub. Tools + handlers + the captured-gesture owner + cursor
 * claims live in this closure (runtime registries, not serializable state); the
 * reducer state holds only the active tool id and the resolved cursor, so the UI
 * can react to them. The router (`dispatch`) is the heart: on down, the first
 * eligible handler (by priority) to return true OWNS the gesture; move/up route
 * to it; with no owner, move is hover (cursor feedback).
 *
 * Cursor arbitration, top to bottom: the highest-priority CLAIM (hover feedback
 * — 'move' over an annotation, 'text' over text) → over a page, the tool's
 * declared cursor → over a gap, the tool's `gapCursor` (default the neutral
 * arrow). The winning KEYWORD (claim or base, never gap) is then restyled
 * through the armed tool's skin when it maps that keyword. One resolver, so an
 * image cursor can never shadow hover feedback or outlive the page under the
 * pointer.
 */
export function createInteractionCapability(
  ctx: PluginContext<InteractionState, InteractionAction>,
  builtinTools: Tool[],
): InteractionCapability {
  const tools = new Map<ToolId, Tool>();
  for (const t of builtinTools) tools.set(t.id, t);
  const handlers: InteractionHandler[] = [];
  const claims = new Map<string, Claim>();
  const cursorSkins = new Map<ToolId, ToolCursorSkin>();
  const toolCbs = new Set<() => void>();
  let owner: InteractionHandler | null = null;
  // Whether the last dispatched sample hit a page — the base cursor only
  // applies where the tool can act; over gaps it falls back to `gapCursor`.
  let overPage = false;

  const toolOf = (id: ToolId): Tool =>
    tools.get(id) ?? { id, cursor: 'default', enables: new Set() };
  const active = (): Tool => toolOf(ctx.getState().activeToolId);

  const resolveCursor = (): Cursor => {
    let top: Claim | null = null;
    for (const c of claims.values()) if (!top || c.priority > top.priority) top = c;
    const tool = active();
    const skin = cursorSkins.get(tool.id);
    // The cursor keeps its MEANING (a keyword — the winning claim's, else the
    // tool's declared base); the skin may restyle that keyword in the armed
    // tool's identity (an I-beam + tool icon over text). Unmapped keywords
    // render as-is — a foreign affordance drops the tool identity — and gaps
    // resolve before the skin: identity only where the action is possible.
    if (top) return skin?.[top.cursor] ?? top.cursor;
    if (!overPage) return tool.gapCursor ?? 'default';
    return skin?.[tool.cursor] ?? tool.cursor;
  };
  const syncCursor = (): void => {
    const next = resolveCursor();
    if (next !== ctx.getState().cursor) ctx.dispatch({ type: 'SET_CURSOR', cursor: next });
  };

  const eligible = (): InteractionHandler[] => {
    const tool = active();
    return handlers.filter((h) => h.enabledFor(tool)).sort((a, b) => b.priority - a.priority);
  };

  return {
    activeTool: active,
    activeToolId: () => ctx.getState().activeToolId,
    cursor: () => ctx.getState().cursor,
    tools: () => [...tools.values()],

    activateTool: (id) => {
      if (!tools.has(id)) throw new Error(`[interaction] unknown tool '${id}'`);
      owner = null;
      claims.clear(); // drop the previous tool's hover claims; handlers re-claim on next hover
      ctx.dispatch({ type: 'SET_TOOL', toolId: id });
      syncCursor();
      toolCbs.forEach((cb) => cb());
    },

    onToolChange: (cb) => {
      toolCbs.add(cb);
      return () => toolCbs.delete(cb);
    },

    registerTool: (tool) => {
      tools.set(tool.id, tool);
      return () => {
        tools.delete(tool.id);
        cursorSkins.delete(tool.id);
      };
    },

    setToolCursor: (id, skin) => {
      if (skin === null) cursorSkins.delete(id);
      else cursorSkins.set(id, skin);
      syncCursor();
    },

    registerHandler: (handler) => {
      handlers.push(handler);
      return () => {
        const i = handlers.indexOf(handler);
        if (i >= 0) handlers.splice(i, 1);
        if (owner === handler) owner = null;
      };
    },

    setCursor: (token, cursor, priority = 0) => {
      if (cursor === null) claims.delete(token);
      else claims.set(token, { cursor, priority });
      syncCursor();
    },

    dispatch: (sample) => {
      const nowOverPage = sample.page != null;
      if (nowOverPage !== overPage) {
        overPage = nowOverPage;
        syncCursor(); // crossing a page edge re-resolves the base cursor
      }
      if (sample.phase === 'down') {
        owner = null;
        for (const h of eligible()) {
          if (h.onDown(sample)) {
            owner = h;
            break;
          }
        }
      } else if (sample.phase === 'move') {
        if (owner) owner.onMove?.(sample);
        else for (const h of eligible()) h.onHover?.(sample);
      } else {
        owner?.onUp?.(sample);
        owner = null;
      }
    },
  };
}
