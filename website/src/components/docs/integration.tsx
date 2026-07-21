'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { AngularIcon, JsMark, ReactIcon, SvelteIcon, VueIcon } from '@/components/site/icons';
import {
  DOCS_INTEGRATION_LABELS,
  docsIntegrationFromPath,
  docsIntegrationHref,
  INTEGRATION_COOKIE,
  PRODUCT_INTEGRATIONS,
  type DocsIntegration,
} from '@/lib/docs-integrations';
import { docsProductFromPath } from '@/lib/docs-products';

const INTEGRATION_ICONS: Record<DocsIntegration, ReactNode> = {
  vanilla: <JsMark small />,
  react: <ReactIcon size={15} />,
  vue: <VueIcon size={15} />,
  svelte: <SvelteIcon size={15} />,
  angular: <AngularIcon size={15} />,
};

/** One shared sibling-route switcher for Viewer and Headless documentation. */
export function IntegrationSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const product = docsProductFromPath(pathname);
  const active = docsIntegrationFromPath(pathname);

  if ((product !== 'viewer' && product !== 'headless') || !active) return null;

  const integrations = PRODUCT_INTEGRATIONS[product];

  return (
    <div className="mb-6 flex flex-col gap-2">
      <span className="font-display text-ep-soft px-3 text-[11px] font-extrabold uppercase tracking-[0.11em]">
        Integration
      </span>
      <div className="grid grid-cols-2 gap-1.5 px-3">
        {integrations.map((integration) => (
          <button
            key={integration}
            onClick={() => {
              document.cookie = `${INTEGRATION_COOKIE}=${integration};path=/;max-age=31536000;samesite=lax`;
              router.push(docsIntegrationHref(pathname, integration));
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-sans text-[13px] font-semibold transition-colors ${
              integration === active
                ? 'bg-ep-mist text-ep-blue700 border-[#BFD8FB]'
                : 'text-ep-soft hover:bg-ep-tint hover:text-ep-navy border-transparent'
            } ${integration === 'vanilla' ? 'col-span-2' : ''}`}
          >
            {INTEGRATION_ICONS[integration]}
            {DOCS_INTEGRATION_LABELS[integration]}
          </button>
        ))}
      </div>
    </div>
  );
}
