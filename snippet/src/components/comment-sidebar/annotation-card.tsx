import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SidebarAnnotationEntry, TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { AnnotationInput } from './annotation-input';
import { Comment } from './comment';
import { getAnnotationConfig } from './config';
import { TruncatedText } from './truncated-text';
import { MenuDropdown } from './menu-dropdown';
import { formatDate } from '../utils';
import { AnnotationIcon } from './annotation-icon';
import { EditCommentForm } from './edit-comment-form';

interface AnnotationCardProps {
  entry: SidebarAnnotationEntry;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (id: string, contents: string) => void;
  onDelete: (annotation: TrackedAnnotation) => void;
  onReply: (inReplyToId: string, contents: string) => void;
}

export const AnnotationCard = ({
  entry,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onReply,
}: AnnotationCardProps) => {
  const { annotation, replies } = entry;
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isEditing, setEditing] = useState(false);

  const config = getAnnotationConfig(annotation);
  const hasContent = !!annotation.object.contents;
  const hasReplies = replies.length > 0;
  const showCommentInput = !hasContent && !hasReplies;
  const inputRef = useRef<HTMLInputElement>(null);
  const author = annotation.object.author || 'Guest';

  useEffect(() => {
    if (isSelected) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [isSelected, entry]);

  if (!config) return null;

  const handleSaveEdit = (newText: string) => {
    onUpdate(annotation.object.id, newText);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border bg-white shadow-sm transition-all hover:shadow-md ${
        isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start space-x-3">
          <AnnotationIcon annotation={annotation} config={config} className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <div className="leading-none">
                <h4 className="text-sm font-medium text-gray-900">{author}</h4>
                <span className="text-xs text-gray-400">
                  {formatDate(annotation.object.modified || annotation.object.created)}
                </span>
              </div>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(true);
                  }}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                </button>
                {isMenuOpen && (
                  <MenuDropdown
                    onEdit={() => setEditing(true)}
                    onDelete={() => onDelete(annotation)}
                    onClose={() => setMenuOpen(false)}
                  />
                )}
              </div>
            </div>

            {annotation.object.custom?.text && (
              <TruncatedText
                text={annotation.object.custom.text}
                maxWords={14}
                className="mt-2 text-sm text-gray-500"
              />
            )}

            <div className="mt-2">
              {isEditing ? (
                <EditCommentForm
                  initialText={annotation.object.contents || ''}
                  onSave={handleSaveEdit}
                  onCancel={handleCancelEdit}
                  autoFocus
                />
              ) : hasContent ? (
                <p className="text-sm text-gray-800">{annotation.object.contents}</p>
              ) : null}
            </div>
          </div>
        </div>

        {hasReplies && (
          <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
            {replies.map((reply) => (
              <Comment
                key={reply.object.id}
                annotation={reply.object}
                onSave={(text) => onUpdate(reply.object.id, text)}
                onDelete={() => onDelete(reply)}
                isReply
              />
            ))}
          </div>
        )}

        {!isEditing && (
          <AnnotationInput
            inputRef={inputRef}
            isFocused={isSelected}
            placeholder={showCommentInput ? 'Add comment...' : 'Add reply...'}
            onSubmit={(text) => {
              if (showCommentInput) {
                onUpdate(annotation.object.id, text);
              } else {
                onReply(annotation.object.id, text);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};
