import { useState } from 'react';
import { useAnnotationEvent } from '@embedpdf/react/annotation';

export function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useAnnotationEvent(
    (annotation) => annotation.onSelectionChanged,
    ({ refs }) => setSidebarOpen(refs.length > 0),
  );

  return sidebarOpen ? <aside>{/* … */}</aside> : null;
}
