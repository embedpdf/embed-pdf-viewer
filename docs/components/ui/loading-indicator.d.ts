import { h } from 'preact';
interface LoadingIndicatorProps {
    size?: 'sm' | 'md' | 'lg';
    text?: string;
    className?: string;
}
export declare function LoadingIndicator({ size, text, className }: LoadingIndicatorProps): h.JSX.Element;
export declare function Spinner({ size, className, }: {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}): h.JSX.Element;
export declare function LoadingOverlay({ text, className }: {
    text?: string;
    className?: string;
}): h.JSX.Element;
export {};
//# sourceMappingURL=loading-indicator.d.ts.map