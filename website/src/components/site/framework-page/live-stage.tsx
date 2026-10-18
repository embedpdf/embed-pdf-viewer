'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type LiveOption = {
  id: string;
  label: string;
  /** A short fact shown in the switch, such as the line count. */
  meta: string;
  tone: 'blue' | 'purple';
  /** The highlighted code, rendered on the server. */
  code: ReactNode;
  /** The live demo: a lazy client component, rendered only once needed. */
  preview: ReactNode;
  caption: ReactNode;
};

/**
 * Two options in one fixed-size stage: a switch, then the code and the
 * running demo side by side at the same height whichever option shows, so
 * nothing jumps. A demo boots its engine only when the stage is near the
 * screen and its option has been picked once; after that it stays mounted
 * (hidden, not removed), so switching back is instant.
 */
export function LiveStage({ options }: { options: LiveOption[] }) {
  const [active, setActive] = useState(options[0].id);
  const [near, setNear] = useState(false);
  const [opened, setOpened] = useState<Set<string>>(() => new Set([options[0].id]));
  const stageRef = useRef<HTMLDivElement>(null);
  const base = useId();

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pick = (id: string) => {
    // A click on the switch means the stage is on screen, observer or not.
    setNear(true);
    setActive(id);
    setOpened((current) => (current.has(id) ? current : new Set(current).add(id)));
  };

  const current = options.find((option) => option.id === active) ?? options[0];

  return (
    <div ref={stageRef}>
      <div className="mb-8 flex justify-center">
        <div
          role="tablist"
          aria-label="Choose an option"
          className="border-ep-border inline-flex gap-1 rounded-full border bg-white p-1 shadow-[0_1px_2px_rgba(7,32,76,0.05),0_8px_24px_-14px_rgba(7,32,76,0.18)]"
        >
          {options.map((option) => {
            const selected = option.id === active;
            const tone =
              option.tone === 'blue'
                ? 'bg-ep-blue shadow-[0_6px_16px_-6px_rgba(8,118,253,0.6)]'
                : 'bg-ep-purple shadow-[0_6px_16px_-6px_rgba(151,71,255,0.6)]';
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                id={`${base}-tab-${option.id}`}
                aria-selected={selected}
                aria-controls={`${base}-panel-${option.id}`}
                onClick={() => pick(option.id)}
                data-ring="none"
                className={`font-display focus-visible:outline-ep-blue inline-flex items-center gap-2.5 whitespace-nowrap rounded-full py-2.5 pl-5 pr-2.5 text-[15px] font-bold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 max-[560px]:pl-4 max-[560px]:text-[14px] max-[480px]:px-4 ${
                  selected ? `${tone} text-white` : 'text-ep-slate hover:text-ep-navy'
                }`}
              >
                {option.label}
                <span
                  className={`rounded-full px-2 py-0.5 font-sans text-[11.5px] font-semibold max-[480px]:hidden ${
                    selected ? 'bg-white/20 text-white' : 'bg-ep-mist text-ep-soft'
                  }`}
                >
                  {option.meta}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 min-[1101px]:h-[600px] min-[1101px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[1101px]:grid-rows-[minmax(0,1fr)]">
        {/* The running demo first on small screens, where it matters most. */}
        <div className="border-ep-border relative h-[min(560px,75svh)] min-w-0 overflow-hidden rounded-2xl border bg-white shadow-[0_24px_56px_-28px_rgba(7,32,76,0.35)] min-[1101px]:order-2 min-[1101px]:h-full">
          {options.map((option) => (
            <div
              key={option.id}
              role="tabpanel"
              id={`${base}-panel-${option.id}`}
              aria-labelledby={`${base}-tab-${option.id}`}
              aria-hidden={option.id !== active}
              // Hidden with opacity, not only visibility: a descendant can set
              // `visibility: visible` and show through a hidden parent (the
              // render layer's tiles do), while opacity hides the whole subtree.
              className={`absolute inset-0 ${
                option.id === active
                  ? 'visible z-10 opacity-100'
                  : 'pointer-events-none invisible z-0 opacity-0'
              }`}
            >
              {near && opened.has(option.id) ? option.preview : null}
            </div>
          ))}
        </div>
        <div className="h-[380px] min-w-0 min-[1101px]:order-1 min-[1101px]:h-full">
          {options.map((option) => (
            <div key={option.id} hidden={option.id !== active} className="h-full">
              {option.code}
            </div>
          ))}
        </div>
      </div>

      <div className="text-ep-muted mx-auto mt-7 max-w-[760px] text-center font-sans text-[15.5px] leading-[1.6] [text-wrap:balance] [&_code]:text-[0.9em] [&_code]:text-[#0758B8]">
        <span className="font-display mr-2 inline-flex translate-y-[-1px] items-center gap-1.5 rounded-full bg-[rgba(34,197,94,0.12)] px-2.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-[0.08em] text-[#15803D]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
          Live
        </span>
        {current.caption}
      </div>
    </div>
  );
}
