'use client';

import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement, useEffect, useState } from 'react';

/**
 * The deployment axis: managed SaaS vs self-hosted. Both audiences read
 * this site, so — unlike the engine axis, which resolves per site at
 * build time — deployment is a reader preference resolved at runtime.
 * Persisted like the SDK language (localStorage + a manual StorageEvent
 * so every instance on the page follows), until the shared docs kit's
 * axis system moves it into a cookie for flash-free SSR.
 */

export type DeploymentMode = 'saas' | 'self-hosted';

const STORAGE_KEY = 'cloudpdf-deployment';

const MODES: Array<{ mode: DeploymentMode; label: string }> = [
  { mode: 'saas', label: 'Managed SaaS' },
  { mode: 'self-hosted', label: 'Self-hosted' },
];

function isDeploymentMode(value: unknown): value is DeploymentMode {
  return value === 'saas' || value === 'self-hosted';
}

type PanelProps = { mode: DeploymentMode; children: ReactNode };

/** One deployment's content. Rendered only through `<DeploymentTabs>`. */
export function DeploymentTab({ children }: PanelProps) {
  return <>{children}</>;
}

export function DeploymentTabs({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DeploymentMode>('saas');

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY && isDeploymentMode(event.newValue)) {
        setActive(event.newValue);
      }
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (isDeploymentMode(stored)) setActive(stored);

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function select(mode: DeploymentMode) {
    localStorage.setItem(STORAGE_KEY, mode);
    // Same-tab listeners don't fire `storage`; dispatch so every
    // DeploymentTabs instance on the page switches together.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: mode }));
  }

  const panels = Children.toArray(children).filter(
    (child): child is ReactElement<PanelProps> =>
      isValidElement(child) && isDeploymentMode((child.props as PanelProps).mode),
  );
  const activePanel =
    panels.find((panel) => panel.props.mode === active) ?? panels[0] ?? null;

  return (
    <div className="mt-5">
      <div className="border-cp-border inline-flex rounded-[11px] border bg-[#F1F5FC] p-1">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => select(mode)}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 font-sans text-[13px] font-bold transition-colors ${
              active === mode
                ? 'text-cp-navy bg-white shadow-[0_1px_2px_rgba(10,26,77,0.1)]'
                : 'text-cp-muted hover:text-cp-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="[&>:first-child]:mt-4">{activePanel}</div>
    </div>
  );
}
