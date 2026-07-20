/**
 * Detects an image format from the leading magic bytes of a binary blob.
 * Returns the corresponding MIME type, defaulting to image/jpeg when the
 * signature is unknown (legacy stored photos are JPEG).
 */
export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif';

const SIGNATURES: Array<{ bytes: number[]; mime: ImageMimeType }> = [
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png' },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
];

export const detectImageType = (data: Buffer): ImageMimeType => {
  if (!Buffer.isBuffer(data) || data.length < 4) {
    return 'image/jpeg';
  }
  for (const sig of SIGNATURES) {
    let matches = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (data[i] !== sig.bytes[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return sig.mime;
  }
  return 'image/jpeg';
};

export default detectImageType;
