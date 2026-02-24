import { ReactNode } from 'react';

type DialogFooterProps = {
  children: ReactNode;
  className?: string;
};

export function DialogFooter({ children, className = '' }: DialogFooterProps) {
  return (
    <div className={`flex justify-end gap-3 border-t border-gray-200 pt-4 ${className}`}>
      {children}
    </div>
  );
}
