'use client';
import { useEffect, useRef } from 'react';

export default function Page() {
  const ref = useRef(null);
  useEffect(() => {
    // Client only: the engine is a browser thing; Next pre-renders this page.
    import('@embedpdf/bundler-probe').then((m) => m.runProbe(ref.current));
  }, []);
  return (
    <pre id="probe" ref={ref}>
      running…
    </pre>
  );
}
