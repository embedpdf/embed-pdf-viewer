export { Fragment } from 'preact';
export {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
  useContext,
} from 'preact/hooks';
export type { ComponentChildren as ReactNode } from 'preact';

export type CSSProperties = import('preact').JSX.CSSProperties;
export type HTMLAttributes<T = any> = import('preact').JSX.HTMLAttributes<
  T extends EventTarget ? T : never
>;
