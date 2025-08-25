import {
  JSX,
  HTMLAttributes,
  CSSProperties,
  useState,
  Fragment,
  useLayoutEffect,
  mapDoubleClick,
  MouseEvent,
} from '@framework';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { PdfAnnotationObject, Position, Rect, rectEquals } from '@embedpdf/models';
import { useAnnotationCapability } from '../hooks';
import { SelectionMenuProps } from '../../shared/types';
import { CounterRotate } from '@embedpdf/utils/@framework';
import { VertexEditor } from './vertex-editor';
import { ComputePatch } from '../patchers';
import { useDragResize } from '../hooks/use-drag-resize';
import { ResizeHandles } from './resize-handles';

type AnnotationContainerProps<T extends PdfAnnotationObject> = Omit<
  HTMLAttributes<HTMLDivElement>,
  'style' | 'children'
> & {
  scale: number;
  isSelected?: boolean;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  trackedAnnotation: TrackedAnnotation<T>;
  children: JSX.Element | ((annotation: T) => JSX.Element);
  style?: CSSProperties;
  isDraggable?: boolean;
  isResizable?: boolean;
  outlineOffset?: number;
  onDoubleClick?: (event: MouseEvent<HTMLDivElement>) => void;
  selectionMenu?: (props: SelectionMenuProps) => JSX.Element;
  computeVertices?: (annotation: T) => Position[];
  computePatch?: ComputePatch<T>;
  lockAspectRatio?: boolean;
};

export function AnnotationContainer<T extends PdfAnnotationObject>({
  scale,
  pageIndex,
  rotation,
  pageWidth,
  pageHeight,
  trackedAnnotation,
  children,
  style,
  outlineOffset = 1,
  isSelected = false,
  isDraggable = true,
  isResizable = true,
  lockAspectRatio = false,
  computeVertices,
  computePatch,
  selectionMenu,
  onDoubleClick,
  ...props
}: AnnotationContainerProps<T>): JSX.Element {
  const { provides: annotationProvides } = useAnnotationCapability();
  const [currentRect, setCurrentRect] = useState<Rect>(trackedAnnotation.object.rect);
  const [currentVertices, setCurrentVertices] = useState<Position[]>(
    computeVertices?.(trackedAnnotation.object) ?? [],
  );
  const [previewObject, setPreviewObject] = useState<Partial<T> | null>(null);

  /* hook owns every pointer detail */
  const { rootHandlers, startResize } = useDragResize({
    scale,
    pageWidth,
    pageHeight,
    rotation,
    tracked: trackedAnnotation,
    isSelected,
    isDraggable,
    isResizable,
    lockAspectRatio,
    computePatch,
    computeVertices,
    currentRect,
    setCurrentRect,
    setCurrentVertices,
    setPreviewObject,
    commit: (patch) =>
      annotationProvides?.updateAnnotation(pageIndex, trackedAnnotation.object.id, patch),
  });

  useLayoutEffect(() => {
    if (!rectEquals(trackedAnnotation.object.rect, currentRect)) {
      setCurrentRect(trackedAnnotation.object.rect);
      setPreviewObject((prev) => (prev ? { ...prev, rect: trackedAnnotation.object.rect } : null));
      setCurrentVertices(computeVertices?.(trackedAnnotation.object) ?? []);
    }
  }, [trackedAnnotation]);

  const currentObject = previewObject
    ? { ...trackedAnnotation.object, ...previewObject }
    : trackedAnnotation.object;

  return (
    <Fragment>
      <div
        /* attach handlers */
        {...rootHandlers}
        {...mapDoubleClick(onDoubleClick)}
        style={{
          position: 'absolute',
          outline: isSelected ? '1px solid #007ACC' : 'none',
          outlineOffset: isSelected ? `${outlineOffset}px` : '0px',
          left: `${currentRect.origin.x * scale}px`,
          top: `${currentRect.origin.y * scale}px`,
          width: `${currentRect.size.width * scale}px`,
          height: `${currentRect.size.height * scale}px`,
          pointerEvents: isSelected ? 'auto' : 'none',
          touchAction: isSelected ? 'auto' : 'none',
          cursor: isSelected && isDraggable ? 'move' : 'default',
          ...(isSelected && {
            zIndex: 3,
          }),
          ...style,
        }}
        {...props}
      >
        {/* children */}
        {typeof children === 'function' ? children(currentObject) : children}

        {/* vertex editing – unchanged */}
        {isSelected && currentVertices.length > 0 && (
          <VertexEditor
            rect={currentRect}
            rotation={rotation}
            scale={scale}
            vertices={currentVertices}
            onEdit={(v) => {
              setCurrentVertices(v);
              if (computePatch) {
                const patch = computePatch(trackedAnnotation.object, {
                  rect: currentRect,
                  vertices: v,
                });
                setPreviewObject(patch);
                setCurrentRect(patch.rect || currentRect);
              }
            }}
            onCommit={(v) => {
              if (annotationProvides && computePatch) {
                const patch = computePatch(trackedAnnotation.object, {
                  rect: currentRect,
                  vertices: v,
                });
                annotationProvides.updateAnnotation(pageIndex, trackedAnnotation.object.id, patch);
              }
            }}
          />
        )}

        {/* resize handles */}
        {isSelected && isResizable && (
          <ResizeHandles
            rotation={rotation}
            outlineOffset={outlineOffset}
            startResize={startResize}
          />
        )}
      </div>

      {/* CounterRotate remains unchanged */}
      <CounterRotate
        rect={{
          origin: { x: currentRect.origin.x * scale, y: currentRect.origin.y * scale },
          size: { width: currentRect.size.width * scale, height: currentRect.size.height * scale },
        }}
        rotation={rotation}
      >
        {({ rect, menuWrapperProps }) =>
          selectionMenu &&
          selectionMenu({
            annotation: trackedAnnotation,
            selected: isSelected,
            rect,
            menuWrapperProps,
          })
        }
      </CounterRotate>
    </Fragment>
  );
}
