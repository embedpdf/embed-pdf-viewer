import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { Rotation } from '@embedpdf/models';
import { RotatePlugin } from '@embedpdf/plugin-rotate';
import { useEffect, useState } from '@framework';

export const useRotatePlugin = () => usePlugin<RotatePlugin>(RotatePlugin.id);
export const useRotateCapability = () => useCapability<RotatePlugin>(RotatePlugin.id);

export const useRotate = () => {
  const { provides } = useRotateCapability();
  const [rotation, setRotation] = useState<Rotation>(0);

  useEffect(() => {
    return provides?.onRotateChange((rotation) => setRotation(rotation));
  }, [provides]);

  return {
    rotation,
    provides,
  };
};
