import { ReactNode, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

type ToolbarButtonProps = {
  onClick?: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: ReactNode;
  'aria-label'?: string;
  title?: string;
  className?: string;
};

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  (
    {
      onClick,
      isActive = false,
      disabled = false,
      children,
      'aria-label': ariaLabel,
      title,
      className = '',
    },
    ref,
  ) => {
    const baseClasses = isActive
      ? 'border-none bg-blue-50 text-blue-500 shadow ring ring-blue-500'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 hover:ring hover:ring-[#1a466b]';

    const disabledClasses = disabled
      ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-gray-600 hover:ring-0'
      : '';

    const mergedClasses = twMerge(
      'rounded p-1.5 transition-colors',
      baseClasses,
      disabledClasses,
      className,
    );

    return (
      <button
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        className={mergedClasses}
        aria-label={ariaLabel}
        aria-pressed={isActive}
        aria-disabled={disabled}
        title={title || ariaLabel}
      >
        {children}
      </button>
    );
  },
);

ToolbarButton.displayName = 'ToolbarButton';
