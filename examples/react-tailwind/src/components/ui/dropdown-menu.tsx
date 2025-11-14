import { ReactNode } from 'react';

type DropdownMenuProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function DropdownMenu({ isOpen, onClose, children, className = '' }: DropdownMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-10" onClick={onClose} />

      {/* Menu */}
      <div
        className={`absolute left-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${className}`}
      >
        {children}
      </div>
    </>
  );
}

type DropdownItemProps = {
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
  isActive?: boolean;
};

export function DropdownItem({ onClick, icon, children, isActive = false }: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100 ${
        isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
      }`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

type DropdownSectionProps = {
  title?: string;
  children: ReactNode;
};

export function DropdownSection({ title, children }: DropdownSectionProps) {
  return (
    <>
      {title && (
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </div>
      )}
      {children}
    </>
  );
}

export function DropdownDivider() {
  return <div className="my-1 border-t border-gray-200" />;
}
