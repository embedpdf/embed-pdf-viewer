import { isRef, unref, toRaw, type Ref } from 'vue';
import type { Rect, Position } from '@embedpdf/models';
import type { DragResizeConfig } from '../../shared/plugin-interaction-primitives';

export type MaybeRef<T> = T | Ref<T>;

export const norm = <T>(v: MaybeRef<T>): T => toRaw(isRef(v) ? unref(v) : (v as T));

export const toNum = (n: unknown, fallback = 0): number => {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
};

export const rectDTO = (r: any): Rect => ({
  origin: { x: toNum(r?.origin?.x), y: toNum(r?.origin?.y) },
  size: { width: toNum(r?.size?.width), height: toNum(r?.size?.height) },
});

export const vertsDTO = (arr: any[] = []): Position[] =>
  arr.map((p) => ({ x: toNum(p?.x), y: toNum(p?.y) }));

export const boolDTO = (b: unknown): boolean | undefined =>
  b === undefined ? undefined : Boolean(b);

export const numDTO = (n: unknown): number | undefined => (n === undefined ? undefined : toNum(n));

export const constraintsDTO = (
  c: MaybeRef<DragResizeConfig['constraints']> | undefined,
): DragResizeConfig['constraints'] | undefined => (c ? norm(c) : undefined);
