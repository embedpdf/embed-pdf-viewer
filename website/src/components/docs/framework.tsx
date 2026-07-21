'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { AngularIcon, ReactIcon, SvelteIcon, VueIcon } from '@/components/site/icons';
import {
  DEFAULT_FRAMEWORK,
  FRAMEWORK_COOKIE,
  FRAMEWORK_LABELS,
  FRAMEWORKS,
  frameworkFromPath,
  frameworkHref,
  type Framework,
} from '@/lib/frameworks';

/**
 * The pathname is the single source of truth for the active framework
 * (DOCS-ARCHITECTURE.md pillar 2): /docs/headless/<fw>/… — no provider
 * threading, correct during SSR, and every component derives it the same way.
 */
export function useFramework(): Framework {
  const pathname = usePathname();
  return frameworkFromPath(pathname) ?? DEFAULT_FRAMEWORK;
}

/** Renders children only on the given frameworks' pages. Rare by design —
 * prose should be framework-neutral; heavy use means the page belongs in the
 * explicit per-framework fork set (install/SSR). */
export function Fw({ only, children }: { only: Framework | Framework[]; children: ReactNode }) {
  const fw = useFramework();
  const list = Array.isArray(only) ? only : [only];
  if (!list.includes(fw)) return null;
  return <>{children}</>;
}

const FW_ICONS: Record<Framework, ReactNode> = {
  react: <ReactIcon size={15} />,
  vue: <VueIcon size={15} />,
  svelte: <SvelteIcon size={15} />,
  angular: <AngularIcon size={15} />,
};

/** Sibling-route navigation + persisted choice. Only rendered on headless pages. */
export function FrameworkSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const active = frameworkFromPath(pathname);
  if (!active) return null;

  const bareRoute = pathname.replace(`/headless/${active}`, '/headless');

  return (
    <div className="mb-6 flex flex-col gap-2">
      <span className="font-display text-ep-soft px-3 text-[11px] font-extrabold uppercase tracking-[0.11em]">
        Framework
      </span>
      <div className="grid grid-cols-2 gap-1.5 px-3">
        {FRAMEWORKS.map((fw) => (
          <button
            key={fw}
            onClick={() => {
              document.cookie = `${FRAMEWORK_COOKIE}=${fw};path=/;max-age=31536000;samesite=lax`;
              router.push(frameworkHref(bareRoute, fw));
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-sans text-[13px] font-semibold transition-colors ${
              fw === active
                ? 'bg-ep-mist text-ep-blue700 border-[#BFD8FB]'
                : 'text-ep-soft hover:bg-ep-tint hover:text-ep-navy border-transparent'
            }`}
          >
            {FW_ICONS[fw]}
            {FRAMEWORK_LABELS[fw]}
          </button>
        ))}
      </div>
    </div>
  );
}
