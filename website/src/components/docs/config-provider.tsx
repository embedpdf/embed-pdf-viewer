'use client';

import { usePathname } from 'next/navigation';
import type { PageMapItem } from 'nextra';
import { normalizePages } from 'nextra/normalize-pages';
import { createContext, useContext, type ReactNode } from 'react';

import { Sidebar } from './sidebar';

type NormalizeResult = ReturnType<typeof normalizePages>;

const ConfigContext = createContext<NormalizeResult | null>(null);

export function useConfig(): NormalizeResult {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return ctx;
}

export function ConfigProvider({
  pageMap,
  children,
}: {
  pageMap: PageMapItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const normalized = normalizePages({ list: pageMap, route: pathname });

  return (
    <ConfigContext.Provider value={normalized}>
      <div className="mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,78px)]">
        <div className="flex items-start gap-[clamp(28px,4vw,60px)]">
          <Sidebar />
          <main className="min-w-0 flex-1 pb-20 pt-2">{children}</main>
        </div>
      </div>
    </ConfigContext.Provider>
  );
}
