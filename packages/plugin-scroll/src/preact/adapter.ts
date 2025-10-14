export { Fragment } from 'preact';
export { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks';
export type { ComponentChildren as ReactNode } from 'preact';

export type HTMLAttributes<T = any> = import('preact').JSX.HTMLAttributes<
  T extends EventTarget ? T : never
>;
