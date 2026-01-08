import { Fragment } from 'preact';
import { useEffect, useRef, useState, useMemo } from 'preact/hooks';

export { Fragment, useEffect, useRef, useState, useMemo };
export type CSSProperties = import('preact').JSX.CSSProperties;
export type HTMLAttributes<T = any> = import('preact').JSX.HTMLAttributes<
  T extends EventTarget ? T : never
>;
