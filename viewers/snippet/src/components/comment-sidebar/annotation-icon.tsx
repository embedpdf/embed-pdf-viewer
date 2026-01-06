import { h } from 'preact';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { Icon } from '../ui/icon';
import { AnnotationConfig } from './config';

export const AnnotationIcon = ({
  annotation,
  config,
  className = '',
  translate,
}: {
  annotation: TrackedAnnotation;
  config: AnnotationConfig;
  className?: string;
  translate: any;
}) => {
  const iconProps = config.iconProps(annotation.object);

  return (
    <div
      className={`bg-bg-surface-alt flex items-center justify-center rounded-full ${className}`}
      title={translate(`annotation.${config.label.toLowerCase()}`, {fallback: config.label})}
    >
      <Icon icon={config.icon} {...iconProps} />
    </div>
  );
};
