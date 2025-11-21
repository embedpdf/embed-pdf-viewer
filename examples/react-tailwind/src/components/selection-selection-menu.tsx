import { SelectionMenuProps } from '@embedpdf/plugin-selection/react';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { useState, useEffect } from 'react';
import { SquaresIcon, CheckIcon } from './icons';

export interface SelectionSelectionMenuProps extends SelectionMenuProps {
  documentId: string;
}

export function SelectionSelectionMenu({
  rect,
  menuWrapperProps,
  placement,
  documentId,
}: SelectionSelectionMenuProps) {
  const { provides: selectionCapability } = useSelectionCapability();
  const [copied, setCopied] = useState(false);

  // Reset copied state when placement changes
  useEffect(() => {
    setCopied(false);
  }, [placement]);

  const handleCopy = () => {
    if (!selectionCapability) return;

    const scope = selectionCapability.forDocument(documentId);
    if (!scope) return;

    // Copy to clipboard
    scope.copyToClipboard();

    // clear selection
    scope.clear();

    // Show feedback
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  // Calculate position based on suggestTop
  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'auto',
    cursor: 'default',
  };

  if (placement.suggestTop) {
    // Position above the selection
    menuStyle.top = -40 - 8;
  } else {
    // Position below the selection (default)
    menuStyle.top = rect.size.height + 8;
  }

  return (
    <div {...menuWrapperProps}>
      <div style={menuStyle} className="rounded-lg border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center gap-1 px-2 py-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100"
            aria-label="Copy selected text"
            title="Copy"
          >
            {copied ? (
              <>
                <CheckIcon className="h-4 w-4 text-green-600" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <SquaresIcon className="h-4 w-4" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
