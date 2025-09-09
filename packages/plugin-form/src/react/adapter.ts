export { Fragment, useEffect, useRef, useCallback, useState, useMemo } from 'react';
export type { ReactNode, HTMLAttributes, CSSProperties, FormEvent } from 'react';

// React-specific select props
export const selectProps = (isMultiple: boolean, selectedValues: string[]) => ({
  value: isMultiple ? selectedValues : selectedValues[0] || '',
});

export const optionProps = (
  isMultiple: boolean,
  selectedValues: string[],
  optionValue: string,
) => ({
  // React doesn't need any extra props for options in multi-select
});
