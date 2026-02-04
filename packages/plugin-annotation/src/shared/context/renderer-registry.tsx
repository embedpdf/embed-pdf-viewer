import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from '@framework';
import { BoxedAnnotationRenderer } from '../components/types';

// Separate contexts: register function is stable, renderers list changes
type RegisterFn = (entries: BoxedAnnotationRenderer[]) => () => void;

const RegisterContext = createContext<RegisterFn | null>(null);
const RenderersContext = createContext<BoxedAnnotationRenderer[]>([]);

export function AnnotationRendererProvider({ children }: { children: ReactNode }) {
  const [renderers, setRenderers] = useState<BoxedAnnotationRenderer[]>([]);

  // Stable reference - no dependencies
  const register = useCallback((entries: BoxedAnnotationRenderer[]) => {
    setRenderers((prev) => {
      const ids = new Set(entries.map((e) => e.id));
      return [...prev.filter((r) => !ids.has(r.id)), ...entries];
    });
    return () => setRenderers((prev) => prev.filter((r) => !entries.some((e) => e.id === r.id)));
  }, []);

  return (
    <RegisterContext.Provider value={register}>
      <RenderersContext.Provider value={renderers}>{children}</RenderersContext.Provider>
    </RegisterContext.Provider>
  );
}

/**
 * Hook to register annotation renderers. Handles all registration lifecycle internally.
 * Plugin authors just call this with their renderers array.
 */
export function useRegisterRenderers(renderers: BoxedAnnotationRenderer[]) {
  const register = useContext(RegisterContext);
  const renderersRef = useRef(renderers);

  useEffect(() => {
    if (!register) return;
    return register(renderersRef.current);
  }, [register]);
}

/**
 * Hook to get all registered renderers (for rendering components).
 */
export function useRegisteredRenderers(): BoxedAnnotationRenderer[] {
  return useContext(RenderersContext);
}

/**
 * Low-level hook if someone needs direct access to register function.
 * Most plugins should use useRegisterRenderers instead.
 */
export function useRendererRegistry() {
  return useContext(RegisterContext);
}
