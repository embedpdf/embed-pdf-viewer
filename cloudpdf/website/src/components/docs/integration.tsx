'use client';

import { usePathname, useRouter } from 'next/navigation';

import { IntegrationLogo } from '@/components/site/integration-logo';
import {
  DOCS_INTEGRATION_LABELS,
  docsIntegrationFromPath,
  docsIntegrationHref,
  fanoutProductFromPath,
  INTEGRATION_COOKIE,
  PRODUCT_INTEGRATIONS,
} from '@/lib/docs-integrations';

/** One shared sibling-route switcher for Viewer and Headless documentation. */
export function IntegrationSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const product = fanoutProductFromPath(pathname);
  const active = docsIntegrationFromPath(pathname);

  if (!product || !active) return null;

  const integrations = PRODUCT_INTEGRATIONS[product];

  return (
    <div className="mb-6 flex flex-col gap-2">
      <span className="font-display text-cp-muted px-3 text-[11px] font-extrabold uppercase tracking-[0.11em]">
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
                ? 'text-cp-blue border-[#BFD8FB] bg-[#EAF2FF]'
                : 'text-cp-muted hover:text-cp-navy border-transparent hover:bg-[#F6F8FC]'
            } ${integration === 'vanilla' ? 'col-span-2' : ''}`}
          >
            <IntegrationLogo integration={integration} size={15} />
            {DOCS_INTEGRATION_LABELS[integration]}
          </button>
        ))}
      </div>
    </div>
  );
}
