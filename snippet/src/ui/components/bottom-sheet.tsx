import { h, Fragment, ComponentChildren } from 'preact';
import { useState, useRef, useCallback, useEffect } from 'preact/hooks';

// Animation duration in ms
const ANIMATION_DURATION = 300;

// Threshold for velocity-based snapping (pixels per ms)
const VELOCITY_THRESHOLD = 0.5;

// Minimum drag distance to consider it a drag (not a click)
const MIN_DRAG_DISTANCE = 5;

export type SnapPoint = number; // percentage (0-100)

export interface BottomSheetConfig {
  /** Snap points in percentages (0-100). First is initial, 0 means closed */
  snapPoints: SnapPoint[];
  /** Initial snap point index (default: 1, first non-zero snap point) */
  initialSnapIndex?: number;
  /** Whether to close when dragged below threshold */
  closeOnDragDown?: boolean;
  /** Threshold percentage below which to close (default: 15) */
  closeThreshold?: number;
}

export interface BottomSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Called when sheet should close */
  onClose: () => void;
  /** Container element for height calculations */
  container: HTMLElement;
  /** Configuration for snap behavior */
  config: BottomSheetConfig;
  /** Content to render inside the sheet */
  children: ComponentChildren;
  /** Optional className for the sheet container */
  className?: string;
}

interface DragState {
  isDragging: boolean;
  startY: number;
  startHeight: number;
  startSnapIndex: number;
  currentY: number;
  startTime: number;
}

/**
 * Reusable Bottom Sheet component with drag-to-resize functionality
 *
 * Features:
 * - Configurable snap points
 * - Velocity-based snapping
 * - Smooth enter/exit animations
 * - Touch and mouse support
 */
export function BottomSheet({
  isOpen,
  onClose,
  container,
  config,
  children,
  className = '',
}: BottomSheetProps) {
  const { snapPoints, initialSnapIndex = 1, closeOnDragDown = true, closeThreshold = 15 } = config;

  // Visual state for animations
  const [currentSnapIndex, setCurrentSnapIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState>({
    isDragging: false,
    startY: 0,
    startHeight: 0,
    startSnapIndex: 0,
    currentY: 0,
    startTime: 0,
  });

  // Handle isOpen changes for enter/exit animations
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Animate to initial snap point
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCurrentSnapIndex(initialSnapIndex);
        });
      });
    } else {
      // Animate to closed
      setCurrentSnapIndex(0);
      const timer = setTimeout(() => setIsVisible(false), ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialSnapIndex]);

  // Get height percentage for a snap index
  const getSnapHeight = useCallback(
    (index: number): number => {
      return snapPoints[index] ?? 0;
    },
    [snapPoints],
  );

  // Find nearest snap point based on current height and velocity
  const findSnapPoint = useCallback(
    (currentHeight: number, velocity: number): number => {
      // If close threshold reached, close
      if (closeOnDragDown && currentHeight <= closeThreshold) {
        return 0;
      }

      // Velocity-based snapping
      if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
        const currentIndex = dragState.current.startSnapIndex;
        if (velocity > 0) {
          // Dragging down - go to lower snap point
          return Math.max(0, currentIndex - 1);
        } else {
          // Dragging up - go to higher snap point
          return Math.min(snapPoints.length - 1, currentIndex + 1);
        }
      }

      // Position-based snapping - find nearest
      let nearestIndex = 0;
      let nearestDistance = Math.abs(currentHeight - snapPoints[0]);

      for (let i = 1; i < snapPoints.length; i++) {
        const distance = Math.abs(currentHeight - snapPoints[i]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      return nearestIndex;
    },
    [snapPoints, closeOnDragDown, closeThreshold],
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (clientY: number) => {
      if (!sheetRef.current) return;

      const containerHeight = container.clientHeight;
      const currentHeight = sheetRef.current.offsetHeight;
      const currentPercent = (currentHeight / containerHeight) * 100;

      dragState.current = {
        isDragging: true,
        startY: clientY,
        startHeight: currentPercent,
        startSnapIndex: currentSnapIndex,
        currentY: clientY,
        startTime: Date.now(),
      };
      setDragOffset(0);
    },
    [container, currentSnapIndex],
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (clientY: number) => {
      if (!dragState.current.isDragging) return;

      const containerHeight = container.clientHeight;
      const deltaY = dragState.current.startY - clientY;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPercent = Math.max(0, Math.min(100, dragState.current.startHeight + deltaPercent));

      dragState.current.currentY = clientY;

      const baseHeight = getSnapHeight(dragState.current.startSnapIndex);
      setDragOffset(newPercent - baseHeight);
    },
    [container, getSnapHeight],
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!dragState.current.isDragging) return;

    const { startY, currentY, startHeight, startTime, startSnapIndex } = dragState.current;
    const totalMovement = Math.abs(startY - currentY);

    // Ignore clicks
    if (totalMovement < MIN_DRAG_DISTANCE) {
      dragState.current.isDragging = false;
      setDragOffset(0);
      return;
    }

    const containerHeight = container.clientHeight;
    const deltaY = startY - currentY;
    const deltaPercent = (deltaY / containerHeight) * 100;
    const currentPercent = startHeight + deltaPercent;

    // Calculate velocity
    const timeDelta = Date.now() - startTime;
    const velocity = timeDelta > 0 ? (currentY - startY) / timeDelta : 0;

    // Find snap point
    const newSnapIndex = findSnapPoint(currentPercent, velocity);

    dragState.current.isDragging = false;
    setDragOffset(0);

    if (newSnapIndex === 0 && closeOnDragDown) {
      setCurrentSnapIndex(0);
      onClose();
    } else {
      setCurrentSnapIndex(newSnapIndex);
    }
  }, [container, findSnapPoint, closeOnDragDown, onClose]);

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      handleDragStart(e.touches[0].clientY);
    },
    [handleDragStart],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (dragState.current.isDragging && e.cancelable) {
        e.preventDefault();
      }
      handleDragMove(e.touches[0].clientY);
    },
    [handleDragMove],
  );

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse event handlers
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientY);
    },
    [handleDragStart],
  );

  // Global mouse move/up handlers
  useEffect(() => {
    if (!dragState.current.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientY);
    const handleMouseUp = () => handleDragEnd();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleDragMove, handleDragEnd]);

  if (!isVisible) return null;

  // Calculate display height
  const baseHeight = getSnapHeight(currentSnapIndex);
  const displayHeight = dragState.current.isDragging
    ? Math.max(0, Math.min(100, baseHeight + dragOffset))
    : baseHeight;

  // Backdrop opacity based on height
  const maxSnapHeight = Math.max(...snapPoints);
  const backdropOpacity = (displayHeight / maxSnapHeight) * 0.3;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 z-40 bg-black transition-opacity duration-300 ${
          displayHeight === 0 ? 'pointer-events-none' : ''
        }`}
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white shadow-2xl ${
          !dragState.current.isDragging ? 'transition-[height] duration-300 ease-out' : ''
        } ${className}`}
        style={{ height: `${displayHeight}%` }}
      >
        {/* Drag Handle */}
        <div
          className="flex flex-shrink-0 cursor-grab touch-none items-center justify-center py-3 active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </>
  );
}
