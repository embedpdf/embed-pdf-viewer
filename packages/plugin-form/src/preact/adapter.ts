export { Fragment } from 'preact';
export { useEffect, useRef, useState, useCallback, useMemo } from 'preact/hooks';
export type { ComponentChildren as ReactNode } from 'preact';

export type CSSProperties = import('preact').JSX.CSSProperties;
export type HTMLAttributes<T = any> = import('preact').JSX.HTMLAttributes<
  T extends EventTarget ? T : never
>;
export type FormEvent<T extends EventTarget = Element> = import('preact').JSX.TargetedEvent<
  T,
  Event
>;

// Preact-specific select props
export const selectProps = (isMultiple: boolean, selectedValues: string[]) => ({
  value: isMultiple ? undefined : selectedValues[0] || '',
});

export const optionProps = (
  isMultiple: boolean,
  selectedValues: string[],
  optionValue: string,
) => ({
  selected: isMultiple ? selectedValues.includes(optionValue) : undefined,
});
