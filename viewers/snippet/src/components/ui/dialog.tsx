/** @jsxImportSource preact */
import { h, ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icon';
import { Button } from './button';

export interface DialogProps {
  /** Controlled visibility — `true` shows, `false` hides */
  open: boolean;
  /** Dialog title */
  title?: string;
  /** Dialog content */
  children: ComponentChildren;
  /** Callback when dialog should close */
  onClose?: () => void;
  /** Callback when exit animation completes (for cleanup) */
  onExited?: () => void;
  /** Optional className for the dialog content */
  className?: string;
  /** Whether to show close button */
  showCloseButton?: boolean;
  /** Maximum width of the dialog */
  maxWidth?: string;
}

export function Dialog({
  open,
  title,
  children,
  onClose,
  onExited,
  className,
  showCloseButton = true,
  maxWidth = '32rem',
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(open);
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle mount/unmount with animation
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      // Small delay to ensure the element is rendered before animation starts
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else if (shouldRender) {
      setIsAnimating(false);
      // Wait for animation to complete before unmounting
      const timer = setTimeout(() => {
        setShouldRender(false);
        onExited?.();
      }, 200); // Match the transition duration
      return () => clearTimeout(timer);
    }
  }, [open, shouldRender, onExited]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose?.();
    }
  };

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (shouldRender) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [shouldRender]);

  if (!shouldRender) return null;

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 transition-opacity duration-200 md:flex md:items-center md:justify-center ${
        isAnimating && open ? 'bg-bg-overlay' : 'bg-transparent'
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`bg-bg-surface md:border-border-subtle relative flex h-full w-full flex-col transition-all duration-200 md:h-auto md:w-[28rem] md:max-w-[90vw] md:rounded-lg md:border md:shadow-lg ${
          isAnimating && open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="border-border-subtle flex flex-shrink-0 items-center justify-between border-b px-6 py-4">
            {title && <h2 className="text-fg-primary text-lg font-semibold">{title}</h2>}
            {showCloseButton && (
              <Button onClick={onClose} className="hover:bg-interactive-hover p-1">
                <Icon icon="x" className="h-5 w-5" />
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 md:max-h-[80vh] md:flex-none">
          {children}
        </div>
      </div>
    </div>
  );
}
