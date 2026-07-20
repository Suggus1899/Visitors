/**
 * Unit tests for detectImageType — magic byte detection for photo blobs.
 */
import { describe, it, expect } from 'vitest';
import { detectImageType } from '../../utils/detectImageType';

describe('detectImageType', () => {
  it('detects JPEG from FF D8 FF signature', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageType(buf)).toBe('image/jpeg');
  });

  it('detects PNG from 89 50 4E 47 signature', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(detectImageType(buf)).toBe('image/png');
  });

  it('detects GIF from 47 49 46 38 signature', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageType(buf)).toBe('image/gif');
  });

  it('defaults to image/jpeg for unknown signatures', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(detectImageType(buf)).toBe('image/jpeg');
  });

  it('defaults to image/jpeg for buffers shorter than 4 bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBe('image/jpeg');
    expect(detectImageType(Buffer.from([0x89]))).toBe('image/jpeg');
  });

  it('defaults to image/jpeg for non-Buffer input', () => {
    expect(detectImageType(null as any)).toBe('image/jpeg');
    expect(detectImageType(undefined as any)).toBe('image/jpeg');
  });

  it('defaults to image/jpeg for empty buffer', () => {
    expect(detectImageType(Buffer.alloc(0))).toBe('image/jpeg');
  });

  it('detects JPEG even when only first 3 bytes match (no 4th signature byte needed)', () => {
    // JPEG signature is only 3 bytes; the 4th byte can be anything
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xee]);
    expect(detectImageType(buf)).toBe('image/jpeg');
  });
});
