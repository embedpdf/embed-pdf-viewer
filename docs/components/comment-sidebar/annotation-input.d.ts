import { h, RefObject } from 'preact';
interface AnnotationInputProps {
    placeholder: string;
    onSubmit: (text: string) => void;
    inputRef?: RefObject<HTMLInputElement>;
    isFocused?: boolean;
}
export declare const AnnotationInput: ({ placeholder, onSubmit, inputRef, isFocused, }: AnnotationInputProps) => h.JSX.Element;
export {};
//# sourceMappingURL=annotation-input.d.ts.map