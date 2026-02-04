import { h } from 'preact';
import { useRef } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { useClickOutside } from '../../hooks/use-click-outside';

interface MenuDropdownProps {
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  documentId: string;
}

export const MenuDropdown = ({ onEdit, onDelete, onClose, documentId }: MenuDropdownProps) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { translate } = useTranslations(documentId);
  useClickOutside(dropdownRef, onClose);

  const handleEdit = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit();
    onClose();
  };

  const handleDelete = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
    onClose();
  };

  return (
    <div
      ref={dropdownRef}
      className="bg-bg-elevated ring-border-default absolute right-0 top-6 z-10 w-32 rounded-md shadow-lg ring-1"
    >
      <div className="py-1">
        <button
          onClick={handleEdit}
          className="text-fg-secondary hover:bg-interactive-hover block w-full px-4 py-2 text-left text-sm"
        >
          {translate('comments.edit')}
        </button>
        <button
          onClick={handleDelete}
          className="text-state-error hover:bg-interactive-hover block w-full px-4 py-2 text-left text-sm"
        >
          {translate('comments.delete')}
        </button>
      </div>
    </div>
  );
};
