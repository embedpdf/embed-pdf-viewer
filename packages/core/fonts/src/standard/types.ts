/** One standard face's generated layout numbers (`faces.generated.ts`). */
export interface StandardFaceData {
  /** In 1/1000 em, as the engine's text layout reads them: the face's font box. */
  readonly ascent: number;
  readonly descent: number;
  /** SHA-256 of the face's display program, hex. */
  readonly programHash: string;
  /** The characters the face's encoding can write, in code order. */
  readonly codePoints: readonly number[];
  /** Each one's advance in 1/1000 em, in the same order. */
  readonly advances: readonly number[];
}
