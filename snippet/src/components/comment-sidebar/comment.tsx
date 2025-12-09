import { h } from 'preact';
import { useState } from 'preact/hooks';
import { PdfAnnotationObject } from '@embedpdf/models';
import { UserAvatar } from './user-avatar';
import { MenuDropdown } from './menu-dropdown';
import { EditCommentForm } from './edit-comment-form';
import { formatDate } from '@/components/utils';

interface CommentProps {
  annotation: PdfAnnotationObject;
  onSave: (text: string) => void;
  onDelete: () => void;
  isReply?: boolean;
}

export const Comment = ({ annotation, onSave, onDelete, isReply = false }: CommentProps) => {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isEditing, setEditing] = useState(false);
  const author = annotation.author || 'Guest';

  const handleSave = (newText: string) => {
    onSave(newText);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex w-full items-start space-x-3" onClick={(e) => e.stopPropagation()}>
        {isReply && <UserAvatar name={author} className="h-8 w-8" />}
        <EditCommentForm
          initialText={annotation.contents || ''}
          onSave={handleSave}
          onCancel={handleCancel}
          autoFocus
        />
      </div>
    );
  }

  // The return logic for display mode remains the same...
  return (
    <div className="flex items-start space-x-3">
      {isReply && <UserAvatar name={author} className="h-8 w-8" />}
      <div className="min-w-0 flex-1">
        {isReply && (
          <div className="flex items-center justify-between">
            <div className="leading-none">
              <h5 className="text-fg-primary text-sm font-medium">{author}</h5>
              <span className="text-fg-muted text-xs">
                {formatDate(annotation.modified || annotation.created)}
              </span>
            </div>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(true);
                }}
                className="text-fg-muted hover:bg-interactive-hover rounded-md p-1"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>
              {isMenuOpen && (
                <MenuDropdown
                  onEdit={() => setEditing(true)}
                  onDelete={onDelete}
                  onClose={() => setMenuOpen(false)}
                />
              )}
            </div>
          </div>
        )}
        <p className="text-fg-primary mt-2 text-sm">{annotation.contents}</p>
      </div>
    </div>
  );
};
