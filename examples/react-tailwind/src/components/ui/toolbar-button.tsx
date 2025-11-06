import { ReactNode } from 'react';

type ToolbarButtonProps = {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: ReactNode;
  'aria-label': string;
  title?: string;
  className?: string;
};

export function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  children,
  'aria-label': ariaLabel,
  title,
  className = '',
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-2 transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } ${
        disabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-gray-600' : ''
      } ${className}`}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      aria-disabled={disabled}
      title={title || ariaLabel}
    >
      {children}
    </button>
  );
}
