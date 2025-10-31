type ToolbarDividerProps = {
  className?: string;
};

export function ToolbarDivider({ className = '' }: ToolbarDividerProps) {
  return <div className={`mx-1 h-6 w-px bg-gray-300 ${className}`} />;
}
