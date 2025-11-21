import { ReactNode } from 'react';

type DialogContentProps = {
  children: ReactNode;
  className?: string;
};

export function DialogContent({ children, className = '' }: DialogContentProps) {
  return <div className={`space-y-6 ${className}`}>{children}</div>;
}
