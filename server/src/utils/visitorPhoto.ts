export function imageContentType(bytes: Buffer): string {
    if (bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
        bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 &&
        bytes.subarray(-8).equals(Buffer.from('49454e44ae426082', 'hex'))) return 'image/png';
    if (bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
        bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return 'image/jpeg';
    if (bytes.length > 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' &&
        bytes.readUInt32LE(4) === bytes.length - 8 && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) return 'image/webp';
    throw new Error('INVALID_PHOTO');
}

export function decodeVisitorPhoto(value: unknown): Buffer | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new Error('INVALID_PHOTO');
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) throw new Error('INVALID_PHOTO');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 5 * 1024 * 1024 || bytes.toString('base64') !== match[2] || imageContentType(bytes) !== match[1]) throw new Error('INVALID_PHOTO');
    return bytes;
}
