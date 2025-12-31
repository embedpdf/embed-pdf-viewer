import { h, ComponentChildren } from 'preact';
import { PdfStandardFontFamily, PdfAnnotationBorderStyle, PdfAnnotationLineEnding } from '@embedpdf/models';
/**
 * A hook to manage the state and behavior of a dropdown component.
 * It handles:
 * 1. Open/closed state.
 * 2. Closing the dropdown when clicking outside of it.
 * 3. Scrolling the selected item into view when the dropdown opens.
 */
export declare const useDropdown: () => {
    open: boolean;
    setOpen: import("preact/hooks").Dispatch<import("preact/hooks").StateUpdater<boolean>>;
    rootRef: import("preact").RefObject<HTMLDivElement>;
    selectedItemRef: import("preact").RefObject<HTMLElement>;
};
/**
 * Section label for annotation property groups
 */
export declare const SectionLabel: ({ children, className, }: {
    children: ComponentChildren;
    className?: string;
}) => h.JSX.Element;
/**
 * Value display for showing current values (e.g., "50%", "5px")
 */
export declare const ValueDisplay: ({ children, className, }: {
    children: ComponentChildren;
    className?: string;
}) => h.JSX.Element;
/**
 * Section wrapper for consistent spacing
 */
export declare const Section: ({ children, className, }: {
    children: ComponentChildren;
    className?: string;
}) => h.JSX.Element;
export declare const Slider: ({ value, min, max, step, onChange, }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange: (v: number) => void;
}) => h.JSX.Element;
export declare const ColorSwatch: ({ color, active, onSelect, }: {
    color: string;
    active: boolean;
    onSelect: (c: string) => void;
}) => h.JSX.Element;
type StrokeItem = {
    id: PdfAnnotationBorderStyle;
    dash?: number[];
};
export declare const StrokeStyleSelect: (props: {
    value: StrokeItem;
    onChange: (s: StrokeItem) => void;
}) => h.JSX.Element;
export declare const LineEndingSelect: ({ position, ...props }: {
    value: PdfAnnotationLineEnding;
    onChange: (e: PdfAnnotationLineEnding) => void;
    position: "start" | "end";
}) => h.JSX.Element;
export declare const FontFamilySelect: (props: {
    value: PdfStandardFontFamily;
    onChange: (fam: PdfStandardFontFamily) => void;
}) => h.JSX.Element;
export declare const FontSizeInputSelect: ({ value, onChange, options, }: {
    value: number;
    onChange: (size: number) => void;
    options?: readonly number[];
}) => h.JSX.Element;
export {};
//# sourceMappingURL=ui.d.ts.map