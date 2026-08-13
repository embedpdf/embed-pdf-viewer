import type { ReactNode } from 'react';

/**
 * React-first shim for the shared corpus's `<Fw>` branches: cloudpdf.com
 * mounts headless docs with the framework axis pinned to React until the
 * URL fan-out + switcher port (DOCS-PLATFORM-ARCHITECTURE.md, phase 3
 * follow-up). Same contract as the EmbedPDF site's pathname-driven Fw.
 */
const ACTIVE_FRAMEWORK = 'react';

export function Fw({ only, children }: { only: string | string[]; children: ReactNode }) {
  const list = Array.isArray(only) ? only : [only];
  if (!list.includes(ACTIVE_FRAMEWORK)) return null;
  return <>{children}</>;
}
