import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
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
  documentId: string;
  isReadOnly?: boolean;
}

export const AnnotationCard = ({
  entry,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onReply,
  documentId,
  isReadOnly = false,
}: AnnotationCardProps) => {
  const { annotation, replies } = entry;
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isEditing, setEditing] = useState(false);
  const { translate } = useTranslations(documentId);

  const config = getAnnotationConfig(annotation);
  const hasContent = !!annotation.object.contents;
  const hasReplies = replies.length > 0;
  const showCommentInput = !hasContent && !hasReplies;
  const inputRef = useRef<HTMLInputElement>(null);
  const prevSelectedRef = useRef(false);
  const author = annotation.object.author || 'Guest';

  // Only focus when transitioning from not-selected to selected
  useEffect(() => {
    if (isSelected && !prevSelectedRef.current) {
      inputRef.current?.focus({ preventScroll: true });
    }
    prevSelectedRef.current = isSelected;
  }, [isSelected]);

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
      className={`bg-bg-surface cursor-pointer rounded-lg border shadow-sm transition-all hover:shadow-md ${
        isSelected ? 'border-accent ring-interactive-focus-ring ring-2' : 'border-border-subtle'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start space-x-3">
          <AnnotationIcon
            annotation={annotation}
            config={config}
            title={translate(config.labelKey, { fallback: config.label })}
            className="h-8 w-8"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <div className="leading-none">
                <h4 className="text-fg-primary text-sm font-medium">{author}</h4>
                <span className="text-fg-disabled text-xs">
                  {formatDate(annotation.object.modified || annotation.object.created)}
                </span>
              </div>
              {!isReadOnly && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(true);
                    }}
                    className="text-fg-disabled hover:bg-interactive-hover hover:text-fg-secondary rounded-md p-1"
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
                      documentId={documentId}
                    />
                  )}
                </div>
              )}
            </div>

            {annotation.object.custom?.text && (
              <TruncatedText
                text={annotation.object.custom.text}
                maxWords={14}
                className="text-fg-muted mt-2 text-sm"
                documentId={documentId}
              />
            )}

            {isEditing ? (
              <div className="mt-2">
                <EditCommentForm
                  initialText={annotation.object.contents || ''}
                  onSave={handleSaveEdit}
                  onCancel={handleCancelEdit}
                  autoFocus
                  documentId={documentId}
                />
              </div>
            ) : hasContent ? (
              <p className="text-fg-primary mt-2 text-sm">{annotation.object.contents}</p>
            ) : null}
          </div>
        </div>

        {hasReplies && (
          <div className="border-border-subtle mt-4 space-y-4 border-t pt-4">
            {replies.map((reply) => (
              <Comment
                key={reply.object.id}
                annotation={reply.object}
                onSave={(text) => onUpdate(reply.object.id, text)}
                onDelete={() => onDelete(reply)}
                isReply
                documentId={documentId}
                isReadOnly={isReadOnly}
              />
            ))}
          </div>
        )}

        {!isEditing && !isReadOnly && (
          <AnnotationInput
            inputRef={inputRef}
            isFocused={isSelected}
            placeholder={
              showCommentInput ? translate('comments.addComment') : translate('comments.addReply')
            }
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
