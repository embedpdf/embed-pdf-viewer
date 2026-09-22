import {
  defaultsFor,
  propsFor,
  uprightRotation,
  type AnnotationPropsPatch,
  type Subtype,
} from '@embedpdf/core-annotation';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import {
  buildToolRegistry,
  isTouchDirect,
  type AnnotationToolInput,
  type ResolvedTool,
} from './definitions';
import type { AnnotationConfig, AnnotationTool } from '../contract';
import type { AnnotationContext } from '../services/context';
import type { AnnotationStore } from '../services/store';

/**
 * The resolved tool table (built-ins + config overrides). A tool is a named
 * authoring preset: it maps its id → a routing subtype, a `defaults` key
 * (`preset`), a `propsFor` kind, and — for stamps — a source spec. The config
 * tools are kept so `registerTool` can re-resolve `extends` against the same
 * base pool.
 */
export function createToolRegistry(
  ctx: Pick<AnnotationContext, 'tryGet'>,
  config: AnnotationConfig,
  store: AnnotationStore,
) {
  const configTools = config.tools ?? [];
  const registry = buildToolRegistry(configTools);

  const get = (id: string): ResolvedTool | undefined => registry.get(id);
  const values = (): ResolvedTool[] => [...registry.values()];

  /** The hub's active tool, resolved through this registry (undefined when
   *  no interaction plugin is present or the id is not an annotation tool). */
  const activeTool = (): ResolvedTool | undefined => {
    const ix = ctx.tryGet(InteractionToken);
    return ix ? registry.get(ix.getActiveToolId()) : undefined;
  };
  /** The active tool's upright counter-rotation for a click at `displayRotation`
   *  (0 when the tool doesn't ask for upright, or the display isn't rotated). */
  const uprightRotFor = (displayRotation?: number): number => {
    if (!displayRotation) return 0;
    const tool = activeTool();
    return tool?.upright ? uprightRotation(displayRotation) : 0;
  };

  const toolProjections = new WeakMap<ResolvedTool, AnnotationTool>();
  const projectTool = (t: ResolvedTool): AnnotationTool => {
    let hit = toolProjections.get(t);
    if (!hit) {
      hit = {
        id: t.id,
        subtype: t.subtype,
        preset: t.preset,
        cursor: t.cursor,
        enables: [...t.enables],
        ...(t.defaults ? { defaults: t.defaults } : {}),
        ...(t.flags ? { flags: t.flags } : {}),
        upright: t.upright,
      };
      toolProjections.set(t, hit);
    }
    return hit;
  };

  const api = {
    listTools: () => values().map(projectTool),
    getTool: (id: string) => {
      const t = registry.get(id);
      return t ? projectTool(t) : null;
    },
    registerTool: (def: AnnotationToolInput) => {
      // Re-resolve against the same base pool so `extends` can reach built-ins /
      // config tools, then register just this one with the hub + seed its defaults.
      const resolved = buildToolRegistry([...configTools, def]).get(def.id);
      if (!resolved) throw new Error(`[annotation] could not resolve tool '${def.id}'`);
      registry.set(resolved.id, resolved);
      const un = ctx.tryGet(InteractionToken)?.registerTool(
        {
          id: resolved.id,
          cursor: resolved.cursor,
          enables: resolved.enables,
          touchDirect: isTouchDirect(resolved.enables),
        },
        { replace: true },
      );
      if (resolved.defaults)
        store.commit({ t: 'setDefaults', subtype: resolved.preset, patch: resolved.defaults });
      return () => {
        registry.delete(resolved.id);
        un?.();
      };
    },
    getToolDefaults: (toolId: string) =>
      defaultsFor(store.model(), registry.get(toolId)?.preset ?? toolId),
    setToolDefaults: (toolId: string, patch: AnnotationPropsPatch) => {
      store.commit({ t: 'setDefaults', subtype: registry.get(toolId)?.preset ?? toolId, patch });
    },
    // A tool's editable-prop schema comes from its kind: a callout edits free-text
    // props, an arrow edits line props. The registry holds that mapping.
    listPropSpecs: (toolId: string) => propsFor(registry.get(toolId)?.propsKind ?? toolId),
    listResolvedTools: () => values(),
    getResolvedTool: (id: string) => registry.get(id) ?? null,
    getToolSubtype: (id: string) => registry.get(id)?.subtype ?? (id as Subtype),
  };

  return { get, values, activeTool, uprightRotFor, api };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
