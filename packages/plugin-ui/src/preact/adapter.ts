import { FunctionComponent } from 'preact';
export { Fragment, createContext } from 'preact';
export { useEffect, useRef, useState, useCallback, useMemo, useContext } from 'preact/hooks';
export type { ComponentChildren as ReactNode, RefObject } from 'preact';

export type CSSProperties = import('preact').JSX.CSSProperties;
export type HTMLAttributes<T = any> = import('preact').JSX.HTMLAttributes<
  T extends EventTarget ? T : never
>;
export type ComponentType<P = any> = FunctionComponent<P>;
