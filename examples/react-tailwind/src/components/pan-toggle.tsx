import { usePan } from '@embedpdf/plugin-pan/react';

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
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
        <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
        <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
        <path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />
      </svg>
    </button>
  );
}
