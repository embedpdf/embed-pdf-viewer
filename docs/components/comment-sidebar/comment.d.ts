import { h } from 'preact';
import { PdfAnnotationObject } from '@embedpdf/models';
interface CommentProps {
    annotation: PdfAnnotationObject;
    onSave: (text: string) => void;
    onDelete: () => void;
    isReply?: boolean;
    documentId: string;
}
export declare const Comment: ({ annotation, onSave, onDelete, isReply, documentId, }: CommentProps) => h.JSX.Element;
export {};
//# sourceMappingURL=comment.d.ts.map