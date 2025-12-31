import { h } from 'preact';
interface PrintModalProps {
    documentId: string;
    isOpen?: boolean;
    onClose?: () => void;
    onExited?: () => void;
}
export declare function PrintModal({ documentId, isOpen, onClose, onExited }: PrintModalProps): h.JSX.Element;
export {};
//# sourceMappingURL=print-modal.d.ts.map