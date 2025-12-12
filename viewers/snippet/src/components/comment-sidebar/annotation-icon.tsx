import { h } from 'preact';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { Icon } from '../ui/icon';
import { AnnotationConfig } from './config';

export const AnnotationIcon = ({
  annotation,
  config,
  className = '',
}: {
  annotation: TrackedAnnotation;
  config: AnnotationConfig;
  className?: string;
}) => {
  const iconProps = config.iconProps(annotation.object);

  return (
    <div
      className={`bg-bg-surface-alt flex items-center justify-center rounded-full ${className}`}
      title={config.label}
    >
      <Icon icon={config.icon} {...iconProps} />
    </div>
  );
};
