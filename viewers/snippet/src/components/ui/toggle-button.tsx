import { h, ComponentChildren } from 'preact';

interface ToggleButtonProps {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: ComponentChildren;
  className?: string;
}

/**
 * A toggle button for toolbar-style controls (bold, italic, alignment, etc.)
 */
export function ToggleButton({
  active = false,
  disabled = false,
  onClick,
  title,
  children,
  className = '',
}: ToggleButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-9 w-9 rounded border px-2 py-1 text-sm transition-colors ${
        active
          ? 'border-accent bg-accent text-fg-on-accent'
          : 'border-border-default bg-bg-input text-fg-primary hover:bg-interactive-hover'
      } disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
