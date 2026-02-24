import { useEffect, useRef, useState } from 'preact/hooks';

export const useSwipeGesture = (isOpen: boolean) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const elementRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
      isDragging.current = false;
    }
  }, [isOpen]);

  // Set up gesture handlers only when panel is open
  useEffect(() => {
    if (!isOpen) return;

    const element = elementRef.current;
    if (!element) {
      return;
    }

    const handleStart = (e: TouchEvent | MouseEvent) => {
      isDragging.current = true;
      startY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
      currentY.current = startY.current;
    };

    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!isDragging.current) return;

      currentY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = currentY.current - startY.current;

      // Reduced threshold to 15 pixels for more responsive feel
      if (deltaY < -2 && !isFullscreen) {
        setIsFullscreen(true);
        isDragging.current = false;
      } else if (deltaY > 2 && isFullscreen) {
        setIsFullscreen(false);
        isDragging.current = false;
      }
    };

    const handleEnd = () => {
      isDragging.current = false;
    };

    // Touch events
    element.addEventListener('touchstart', handleStart);
    element.addEventListener('touchmove', handleMove);
    element.addEventListener('touchend', handleEnd);
    element.addEventListener('touchcancel', handleEnd);

    // Mouse events
    element.addEventListener('mousedown', handleStart);
    element.addEventListener('mousemove', handleMove);
    element.addEventListener('mouseup', handleEnd);
    element.addEventListener('mouseleave', handleEnd);

    return () => {
      // Clean up touch events
      element.removeEventListener('touchstart', handleStart);
      element.removeEventListener('touchmove', handleMove);
      element.removeEventListener('touchend', handleEnd);
      element.removeEventListener('touchcancel', handleEnd);

      // Clean up mouse events
      element.removeEventListener('mousedown', handleStart);
      element.removeEventListener('mousemove', handleMove);
      element.removeEventListener('mouseup', handleEnd);
      element.removeEventListener('mouseleave', handleEnd);
    };
  }, [isOpen, isFullscreen]); // Depend on isOpen instead of elementRef.current

  return { elementRef, isFullscreen };
};
