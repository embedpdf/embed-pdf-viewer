type ToolbarDividerProps = {
  orientation?: 'vertical' | 'horizontal';
  className?: string;
};

export function ToolbarDivider({ orientation = 'vertical', className = '' }: ToolbarDividerProps) {
  const dividerClasses =
    orientation === 'horizontal'
      ? `my-1 h-px w-full bg-gray-300 ${className}`
      : `mx-1 h-6 w-px bg-gray-300 ${className}`;

  return <div className={dividerClasses} />;
}
