import { Fragment } from 'preact';
import { useEffect, useRef, useState, useMemo, useCallback } from 'preact/hooks';

export { Fragment, useEffect, useRef, useState, useMemo, useCallback };
export type CSSProperties = import('preact').JSX.CSSProperties;
export type HTMLAttributes<T = any> = import('preact').JSX.HTMLAttributes<
  T extends EventTarget ? T : never
>;
