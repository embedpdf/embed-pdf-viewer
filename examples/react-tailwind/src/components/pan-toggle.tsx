import { usePan } from '@embedpdf/plugin-pan/react';
import { HandIcon } from './icons';

type PanToggleButtonProps = {
  documentId: string;
};

export function PanToggleButton({ documentId }: PanToggleButtonProps) {
  const { provides: pan, isPanning } = usePan(documentId);

  if (!pan) return null;

  return (
    <button
      onClick={pan.togglePan}
      className={`flex h-8 w-8 items-center justify-center rounded border transition-colors ${
        isPanning
          ? 'border-blue-500 bg-blue-100 text-blue-700'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
      }`}
      aria-pressed={isPanning}
      aria-label="Toggle Pan"
      title="Pan (hand)"
    >
      <HandIcon className="h-4 w-4" title="Pan" />
    </button>
  );
}
