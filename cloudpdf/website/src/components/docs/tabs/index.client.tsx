'use client';

import type { FC, ReactElement, ReactNode } from 'react';
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { CheckIcon, CopyIcon } from '@/components/site/icons';

/**
 * Signals to nested `Pre` components that they live inside a Tabs shell, so
 * they render bare (no own chrome) and sit seamlessly inside the cp-cb box.
 */
export const TabsContext = createContext(false);

export function useInTabs() {
  return useContext(TabsContext);
}

type TabItem = string | ReactElement;

type TabObjectItem = {
  label: TabItem;
  disabled?: boolean;
};

function isTabObjectItem(item: unknown): item is TabObjectItem {
  return !!item && typeof item === 'object' && 'label' in item;
}

type TabsProps = {
  items: (TabItem | TabObjectItem)[];
  children: ReactNode;
  storageKey?: string;
  defaultIndex?: number;
};

export const Tabs: FC<TabsProps> = ({ items, children, storageKey, defaultIndex = 0 }) => {
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storageKey) return;

    function onStorage(event: StorageEvent) {
      if (event.key === storageKey) {
        setSelectedIndex(Number(event.newValue));
      }
    }

    const stored = Number(localStorage.getItem(storageKey));
    if (!Number.isNaN(stored)) {
      setSelectedIndex(stored);
    }

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  function selectTab(index: number) {
    if (storageKey) {
      const newValue = String(index);
      localStorage.setItem(storageKey, newValue);
      // Same-tab listeners don't fire `storage`, so dispatch it manually to
      // sync every package-manager block on the page.
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue }));
      return;
    }
    setSelectedIndex(index);
  }

  async function copy() {
    const text = panelRef.current?.textContent ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const panels = Children.toArray(children).filter(isValidElement);
  const activeIndex = Math.min(selectedIndex, panels.length - 1);

  return (
    <TabsContext.Provider value={true}>
      <div className="mt-[22px] overflow-hidden rounded-[14px] border border-[#21305F] bg-[#0E1A40] shadow-[0_22px_48px_-26px_rgba(8,24,72,0.5)]">
        <div className="flex items-center gap-1 border-b border-[#1E2C5A] bg-[#0A1638] px-2 py-[7px]">
          {items.map((item, index) => {
            const disabled = isTabObjectItem(item) && item.disabled;
            const label = isTabObjectItem(item) ? item.label : item;
            const active = index === activeIndex;
            return (
              <button
                key={index}
                type="button"
                disabled={disabled}
                onClick={() => selectTab(index)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] px-[11px] py-[7px] font-sans text-[12px] font-semibold leading-none transition ${
                  active
                    ? 'bg-[#1E2C5A] text-white'
                    : disabled
                      ? 'pointer-events-none text-[#5E72A8]'
                      : 'text-[#8FA5D9] hover:bg-white/5 hover:text-[#C7DEFF]'
                }`}
              >
                {label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={copy}
            aria-label="Copy code"
            className={`ml-auto inline-flex items-center justify-center rounded-[7px] p-[7px] transition hover:bg-white/5 ${
              copied ? 'text-[#6FE0A0]' : 'text-[#6E82BC] hover:text-[#B7C6EA]'
            }`}
          >
            {copied ? (
              <CheckIcon width={15} height={15} strokeWidth={2.6} />
            ) : (
              <CopyIcon width={15} height={15} />
            )}
          </button>
        </div>

        <div ref={panelRef}>{panels[activeIndex]}</div>
      </div>
    </TabsContext.Provider>
  );
};

type TabProps = {
  children: ReactNode;
};

export const Tab: FC<TabProps> = ({ children }) => {
  return <>{children}</>;
};
