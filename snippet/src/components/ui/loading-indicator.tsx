import { h } from 'preact';

interface LoadingIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export function LoadingIndicator({ size = 'md', text, className = '' }: LoadingIndicatorProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className="relative">
        <div
          className={`${sizeClasses[size]} border-border-default animate-spin rounded-full border-4`}
        />
        <div
          className={`${sizeClasses[size]} border-r-accent border-t-accent absolute left-0 top-0 animate-spin rounded-full border-4 border-transparent`}
        />
      </div>
      {text && (
        <p className={`${textSizeClasses[size]} text-fg-secondary animate-pulse font-medium`}>
          {text}
        </p>
      )}
    </div>
  );
}

// Simple spinner component for inline use
export function Spinner({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  };

  return (
    <div
      className={`${sizeClasses[size]} border-border-default border-t-accent animate-spin rounded-full ${className}`}
    />
  );
}

// Full page loading overlay
export function LoadingOverlay({ text, className = '' }: { text?: string; className?: string }) {
  return (
    <div
      className={`bg-bg-surface fixed inset-0 z-50 flex items-center justify-center bg-opacity-90 ${className}`}
    >
      <LoadingIndicator size="lg" text={text} />
    </div>
  );
}
