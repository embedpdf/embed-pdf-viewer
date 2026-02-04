import { JSX } from 'preact';
export { Fragment } from 'preact';
export { useEffect, useRef, useState, useMemo, useCallback } from 'preact/hooks';
export type { ComponentChildren as ReactNode } from 'preact';

export type HTMLAttributes<T = any> = import('preact').JSX.HTMLAttributes<
  T extends EventTarget ? T : never
>;
export type CSSProperties = import('preact').JSX.CSSProperties;

// Second type parameter added to match React's signature for cross-framework compatibility
export type MouseEvent<T = Element, _E = unknown> = JSX.TargetedMouseEvent<
  T extends EventTarget ? T : never
>;
export type PointerEvent<T = Element, _E = unknown> = JSX.TargetedPointerEvent<
  T extends EventTarget ? T : never
>;
export type ChangeEvent<T = Element, _E = unknown> = JSX.TargetedInputEvent<
  T extends EventTarget ? T : never
>;
export type TouchEvent<T = Element, _E = unknown> = JSX.TargetedTouchEvent<
  T extends EventTarget ? T : never
>;
