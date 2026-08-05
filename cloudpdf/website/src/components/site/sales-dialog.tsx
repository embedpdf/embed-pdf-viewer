'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { SalesInquiryForm, type ProductInterest } from './sales-inquiry-form';

interface SalesDialogOptions {
  placement: string;
  productInterest?: ProductInterest;
}

interface SalesDialogRequest extends SalesDialogOptions {
  instance: number;
}

interface SalesDialogContextValue {
  openSalesDialog(options: SalesDialogOptions): void;
}

const SalesDialogContext = createContext<SalesDialogContextValue | null>(null);

export function SalesDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<SalesDialogRequest | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const openSalesDialog = useCallback((options: SalesDialogOptions) => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRequest({ ...options, instance: Date.now() });
  }, []);

  const finishClose = useCallback(() => {
    setRequest(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (request && !dialog.open) {
      dialog.showModal();
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dialogRef.current?.close();
    }
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [request]);

  return (
    <SalesDialogContext.Provider value={{ openSalesDialog }}>
      {children}
      <dialog
        aria-labelledby="sales-dialog-title"
        className="sales-dialog m-auto max-h-[calc(100dvh-24px)] w-[min(920px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-[#D7E3F5] bg-white p-0 text-left shadow-[0_30px_100px_rgba(7,32,76,0.3)]"
        onCancel={() => setRequest(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        onClose={finishClose}
        ref={dialogRef}
      >
        {request ? (
          <div className="flex max-h-[calc(100dvh-24px)] flex-col" key={request.instance}>
            <div className="relative shrink-0 border-b border-[#E4EBF6] bg-[linear-gradient(135deg,#F3F8FF_0%,#F7F3FF_100%)] px-5 py-5 pr-16 sm:px-7 sm:py-6 sm:pr-20">
              <p className="text-cp-blue text-xs font-extrabold uppercase tracking-[0.12em]">
                Talk to our team
              </p>
              <h2
                className="font-display text-cp-navy mt-1 text-xl font-extrabold sm:text-2xl"
                id="sales-dialog-title"
              >
                Find the right CloudPDF setup.
              </h2>
              <p className="text-cp-muted mt-1 max-w-2xl text-sm leading-6">
                Share what you are building and we will help with architecture, deployment, and
                pricing.
              </p>
              <button
                aria-label="Close contact sales form"
                className="text-cp-navy hover:bg-cp-surface absolute right-4 top-4 grid size-10 cursor-pointer place-items-center rounded-xl text-2xl leading-none transition sm:right-6 sm:top-5"
                onClick={() => dialogRef.current?.close()}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              <SalesInquiryForm
                defaultProductInterest={request.productInterest}
                sourceContext={request.placement}
              />
            </div>
          </div>
        ) : null}
      </dialog>
    </SalesDialogContext.Provider>
  );
}

export function useSalesDialog(): SalesDialogContextValue {
  const context = useContext(SalesDialogContext);
  if (!context) {
    throw new Error('useSalesDialog must be used within SalesDialogProvider');
  }
  return context;
}
