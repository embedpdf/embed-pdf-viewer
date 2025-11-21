export { Fragment } from 'preact';
export { useEffect, useRef, useState, useCallback, useMemo } from 'preact/hooks';
export type { ComponentChildren as ReactNode } from 'preact';

export type HTMLAttributes<T = any> = import('preact').JSX.HTMLAttributes<
  T extends EventTarget ? T : never
>;
export type ChangeEvent<T = Element> = import('preact').JSX.TargetedEvent<
  T extends EventTarget ? T : never
>;
