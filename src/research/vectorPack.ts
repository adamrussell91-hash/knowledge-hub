export type PackedVectorEntry = {
  pageId: string;
  title: string;
  vector: ArrayLike<number>;
};

export type PackedVectorIndex = {
  meta: { pageId: string; title: string }[];
  bytes: Uint8Array;
};

const MAGIC = new TextEncoder().encode("KHIX");
const HEADER_BYTES = 12;

function requireSharedDimension(entries: PackedVectorEntry[]) {
  const dimension = entries[0]?.vector.length ?? 0;
  if (!dimension) throw new Error("vector pack requires at least one non-empty vector");
  for (const entry of entries) {
    if (entry.vector.length !== dimension) {
      throw new Error(`vector length ${entry.vector.length} does not match ${dimension}`);
    }
  }
  return dimension;
}

export function packVectorIndex(entries: PackedVectorEntry[]): PackedVectorIndex {
  const dimension = requireSharedDimension(entries);
  const count = entries.length;
  const bytes = new Uint8Array(HEADER_BYTES + count * dimension * 4);
  const view = new DataView(bytes.buffer);
  bytes.set(MAGIC, 0);
  view.setUint32(4, dimension, true);
  view.setUint32(8, count, true);
  const floats = new Float32Array(bytes.buffer, HEADER_BYTES, count * dimension);
  for (let row = 0; row < count; row++) {
    const vector = entries[row]?.vector;
    if (!vector) continue;
    const offset = row * dimension;
    for (let col = 0; col < dimension; col++) {
      floats[offset + col] = vector[col] ?? 0;
    }
  }
  return {
    meta: entries.map(entry => ({ pageId: entry.pageId, title: entry.title })),
    bytes,
  };
}

export function unpackVectorIndex(
  meta: { pageId: string; title: string }[],
  bytes: ArrayBuffer | Uint8Array,
): { pageId: string; title: string; vector: Float32Array }[] {
  const buffer = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "KHIX") throw new Error("invalid vector pack magic");
  const dimension = view.getUint32(4, true);
  const count = view.getUint32(8, true);
  if (meta.length !== count) throw new Error(`vector meta length ${meta.length} does not match pack count ${count}`);
  const floats = new Float32Array(buffer, HEADER_BYTES, count * dimension);
  return meta.map((entry, row) => ({
    pageId: entry.pageId,
    title: entry.title,
    vector: floats.subarray(row * dimension, (row + 1) * dimension),
  }));
}
