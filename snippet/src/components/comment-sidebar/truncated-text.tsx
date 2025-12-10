import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

interface TruncatedTextProps {
  text: string;
  maxWords?: number;
  className?: string;
  documentId: string;
}

export const TruncatedText = ({
  text,
  maxWords = 16,
  className = '',
  documentId,
}: TruncatedTextProps) => {
  const [isExpanded, setExpanded] = useState(false);
  const { translate } = useTranslations(documentId);

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
        {isExpanded ? translate('comments.showLess') : translate('comments.showMore')}
      </button>
    </div>
  );
};
