import { h } from 'preact';
import { SidebarAnnotationEntry, TrackedAnnotation } from '@embedpdf/plugin-annotation';
interface AnnotationCardProps {
    entry: SidebarAnnotationEntry;
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (id: string, contents: string) => void;
    onDelete: (annotation: TrackedAnnotation) => void;
    onReply: (inReplyToId: string, contents: string) => void;
    documentId: string;
}
export declare const AnnotationCard: ({ entry, isSelected, onSelect, onUpdate, onDelete, onReply, documentId, }: AnnotationCardProps) => h.JSX.Element | null;
export {};
//# sourceMappingURL=annotation-card.d.ts.map