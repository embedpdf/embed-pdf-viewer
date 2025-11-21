import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  active?: boolean;
  tooltip?: string;
};

const variantStyles: Record<ButtonVariant, string> = {
  default: 'hover:bg-gray-100 hover:ring hover:ring-[#1a466b]',
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50',
  secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50',
  ghost: 'text-gray-700 hover:bg-gray-100 disabled:opacity-50',
};

export function Button({
  children,
  onClick,
  variant = 'default',
  active = false,
  disabled = false,
  className = '',
  tooltip,
  ...props
}: ButtonProps) {
  // For default variant with active state (toolbar buttons)
  if (variant === 'default') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`flex h-[32px] w-auto min-w-[32px] items-center justify-center rounded-md p-[5px] transition-colors ${
          active
            ? 'border-none bg-blue-50 text-blue-500 shadow ring ring-blue-500'
            : variantStyles.default
        } ${disabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:ring-0' : 'cursor-pointer'} ${className}`}
        title={tooltip}
        {...props}
      >
        {children}
      </button>
    );
  }

  // For other variants (dialog buttons)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${variantStyles[variant]} ${className}`}
      title={tooltip}
      {...props}
    >
      {children}
    </button>
  );
}
