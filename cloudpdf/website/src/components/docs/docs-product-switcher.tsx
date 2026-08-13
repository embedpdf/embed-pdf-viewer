'use client';

import {
  BoltBadgeIcon,
  DocsProductSwitcher as KitSwitcher,
  EngineIcon,
  PuzzleBadgeIcon,
  ServerBadgeIcon,
  type DocsProductItem,
} from '@embedpdf/docs-kit';
import { usePathname } from 'next/navigation';

/**
 * CloudPDF's product binding over the kit switcher. React-first: hrefs point
 * at plain routes until the framework fan-out port. The API reference stays
 * in the top navbar — this dropdown is the four product documentations.
 */
const PRODUCTS: DocsProductItem[] = [
  {
    key: 'viewer',
    label: 'Viewer',
    href: '/docs/viewer/getting-started',
    icon: <BoltBadgeIcon />,
    tintClass: 'bg-[#E3EFFF] text-[#1677FF]',
  },
  {
    key: 'headless',
    label: 'Headless',
    href: '/docs/headless/getting-started',
    icon: <PuzzleBadgeIcon />,
    tintClass: 'bg-[#EEE5FF] text-[#7C3AED]',
  },
  {
    key: 'engine',
    label: 'Engine',
    href: '/docs/engine/getting-started',
    icon: <EngineIcon />,
    tintClass: 'bg-[#DFF5F1] text-[#087F73]',
  },
  {
    key: 'server',
    label: 'Server',
    href: '/docs/server/getting-started',
    icon: <ServerBadgeIcon />,
    tintClass: 'bg-[#FFF1E3] text-[#C2571B]',
  },
];

export function DocsProductSwitcher() {
  const pathname = usePathname();
  const activeKey = pathname.split('/')[2] ?? null;

  return <KitSwitcher products={PRODUCTS} activeKey={activeKey} />;
}
