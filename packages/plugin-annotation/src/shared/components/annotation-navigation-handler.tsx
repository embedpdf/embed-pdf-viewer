import { useEffect } from '@framework';
import { useAnnotationPlugin, useAnnotationCapability } from '../hooks/use-annotation';

export function AnnotationNavigationHandler() {
  const { plugin } = useAnnotationPlugin();
  const { provides } = useAnnotationCapability();

  useEffect(() => {
    if (!provides || !plugin) return;

    return provides.onNavigate((event) => {
      if (event.result.outcome === 'uri' && plugin.config.autoOpenLinks !== false) {
        window.open(event.result.uri, '_blank', 'noopener,noreferrer');
      }
    });
  }, [provides, plugin]);

  return null;
}
