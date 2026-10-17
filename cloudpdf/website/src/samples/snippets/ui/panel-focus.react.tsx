import { useRef } from 'react';
import { useSurfaceFocus } from '@embedpdf/react/shell';

export function SearchPanel() {
  const field = useRef<HTMLInputElement>(null);
  // The cursor goes in the field when the panel asks for it, its text selected.
  useSurfaceFocus('search', field, { select: true });
  return <input ref={field} placeholder="Search" />;
}
