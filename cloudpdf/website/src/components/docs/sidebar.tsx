'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useConfig } from './config-provider';
import { MethodBadge } from './method-badge';

type TreeItem = {
  name: string;
  route?: string;
  title: ReactNode;
  /**
   * Page frontmatter; API reference pages carry their HTTP `method`
   * and — for API-token-only operations — `audience: operator` here.
   */
  frontMatter?: { method?: string; audience?: string };
  children?: TreeItem[];
};

/**
 * A section is operator surface when every page in it is — on managed
 * CloudPDF those sections (Deployment, Tenants) belong to the platform.
 */
function isOperatorSection(item: TreeItem): boolean {
  const pages = (item.children ?? []).filter((child) => child.route);
  return pages.length > 0 && pages.every((child) => child.frontMatter?.audience === 'operator');
}

function SidebarLink({ item, pathname }: { item: TreeItem; pathname: string }) {
  if (!item.route) return null;
  const active = pathname === item.route;
  const method = item.frontMatter?.method;

  return (
    <Link
      href={item.route}
      className={`-ml-[1.5px] flex items-center gap-2.5 border-l-[1.5px] py-2 pl-[15px] pr-3 font-sans text-[14.5px] font-medium leading-[1.3] no-underline transition-colors ${
        active
          ? 'border-cp-blue text-cp-blue font-bold'
          : 'text-cp-muted hover:text-cp-navy border-transparent hover:border-[#C2CEE6]'
      }`}
    >
      {method ? <MethodBadge method={method} /> : null}
      <span className="min-w-0 flex-1">{item.title}</span>
    </Link>
  );
}

function SidebarTree({ items, pathname }: { items: TreeItem[]; pathname: string }) {
  return (
    <>
      {items.map((item) => {
        const hasChildren = Boolean(item.children && item.children.length > 0);

        if (hasChildren) {
          return (
            <div
              key={item.name}
              className="mt-7 border-t border-[#EAEFF7] pt-6 first:mt-0 first:border-t-0 first:pt-0"
            >
              <p className="font-display text-cp-navy flex items-baseline gap-2 px-3 pb-3 text-[12px] font-extrabold uppercase tracking-[0.11em]">
                {item.title}
                {isOperatorSection(item) ? (
                  <span className="border-cp-border text-cp-muted rounded border bg-[#F6F8FC] px-1.5 py-px text-[9px] font-bold normal-case tracking-[0.03em]">
                    Self-hosted
                  </span>
                ) : null}
              </p>
              <div className="ml-3 flex flex-col border-l-[1.5px] border-[#E7EDF6]">
                <SidebarTree items={item.children ?? []} pathname={pathname} />
              </div>
            </div>
          );
        }

        return <SidebarLink key={item.route ?? item.name} item={item} pathname={pathname} />;
      })}
    </>
  );
}

export function Sidebar() {
  const { docsDirectories, activeType } = useConfig();
  const pathname = usePathname();

  // Hide the sidebar on standalone pages such as the /docs landing.
  if (activeType === 'page') return null;
  if (!docsDirectories || docsDirectories.length === 0) return null;

  return (
    <aside className="sticky top-[84px] hidden h-[calc(100vh-84px)] w-[268px] shrink-0 overflow-y-auto pb-16 pr-3.5 pt-[52px] [scrollbar-color:#D5DEEF_transparent] [scrollbar-width:thin] md:block">
      <nav className="flex flex-col">
        <SidebarTree items={docsDirectories as TreeItem[]} pathname={pathname} />
      </nav>
    </aside>
  );
}
