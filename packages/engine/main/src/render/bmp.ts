export function encodeBmp(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const pixels = width * height * 4;
  const headerLength = 66;
  const out = new Uint8Array(headerLength + pixels);
  const view = new DataView(out.buffer);

  out[0] = 0x42;
  out[1] = 0x4d;
  view.setUint32(2, headerLength + pixels, true);
  view.setUint32(10, headerLength, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 3, true);
  view.setUint32(34, pixels, true);
  view.setUint32(54, 0x000000ff, true);
  view.setUint32(58, 0x0000ff00, true);
  view.setUint32(62, 0x00ff0000, true);
  out.set(rgba, headerLength);
  return out;
}
