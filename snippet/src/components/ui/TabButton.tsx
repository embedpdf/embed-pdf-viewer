import { h, ComponentChildren, JSX } from 'preact';
import { twMerge } from 'tailwind-merge';

type TabButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ComponentChildren;
  onClick?: h.JSX.MouseEventHandler<HTMLButtonElement> | undefined;
  active?: boolean;
  disabled?: boolean;
  className?: string;
};

export function TabButton({
  children,
  onClick,
  active = false,
  disabled = false,
  className = '',
  ...props
}: TabButtonProps) {
  // Base classes - twMerge will handle conflicts (rounded-md vs rounded-none, p-[5px] vs px-2 py-1)
  const baseClasses =
    'flex h-[32px] w-auto min-w-[32px] items-center justify-center rounded-md p-[5px] transition-colors hover:bg-gray-100 hover:ring hover:ring-[#1a466b] cursor-pointer rounded-none px-2 py-1 text-sm hover:bg-transparent border-b-2 hover:border-b-gray-500 hover:ring-transparent';

  const activeClasses = active
    ? 'border-b-blue-500 text-blue-500 hover:border-b-blue-500'
    : 'border-b-transparent';

  const disabledClasses = disabled ? 'cursor-not-allowed opacity-50' : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={twMerge(baseClasses, activeClasses, disabledClasses, className)}
      {...props}
    >
      {children}
    </button>
  );
}
