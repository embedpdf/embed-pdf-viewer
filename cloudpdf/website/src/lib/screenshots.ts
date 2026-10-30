import manifest from '@/generated/platform-screenshots.json';

/** A dashboard screenshot, at the size it shows on the page (half its pixels: taken at 2x). */
export interface Screenshot {
  src: string;
  width: number;
  height: number;
}

const SHOTS: Record<string, { file: string; width: number; height: number }> = manifest.shots;

/**
 * The screenshot the platform's capture script made under `name`. A page
 * that names one the script never made fails the build, so a page never
 * ships with a missing picture.
 */
export function screenshotOf(name: string): Screenshot {
  const shot = SHOTS[name];
  if (!shot) {
    throw new Error(
      `No dashboard screenshot named "${name}". Add it to the platform's capture script and run it.`,
    );
  }
  return { src: `/docs/platform/${shot.file}`, width: shot.width / 2, height: shot.height / 2 };
}
