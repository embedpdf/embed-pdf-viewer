import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';

interface TruncatedTextProps {
  text: string;
  maxWords?: number;
  className?: string;
}

export const TruncatedText = ({ text, maxWords = 16, className = '' }: TruncatedTextProps) => {
  const [isExpanded, setExpanded] = useState(false);

  const words = text.split(' ');
  const shouldTruncate = words.length > maxWords;

  if (!shouldTruncate) {
    return <div className={className}>{text}</div>;
  }

  const displayText = isExpanded ? text : words.slice(0, maxWords).join(' ') + '...';

  return (
    <div className={className}>
      {displayText}{' '}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!isExpanded);
        }}
        className="text-accent hover:text-accent-hover text-sm font-medium focus:outline-none"
      >
        {isExpanded ? 'less' : 'more'}
      </button>
    </div>
  );
};
