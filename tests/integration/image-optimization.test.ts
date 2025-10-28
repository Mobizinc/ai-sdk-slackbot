
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { optimizeImageForClaude, optimizeBatch } from '../../../lib/utils/image-processing'; // Adjust path
import { CLAUDE_MAX_IMAGE_SIZE_BYTES } from '../../../lib/constants'; // Adjust path

describe('Image Optimization Integration', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures', 'images');
    let smallJpeg: Buffer, mediumPng: Buffer, largeWebp: Buffer, largeGif: Buffer;

    beforeAll(async () => {
        [smallJpeg, mediumPng, largeWebp, largeGif] = await Promise.all([
            fs.readFile(path.join(fixturesDir, 'small.jpg')),
            fs.readFile(path.join(fixturesDir, 'medium.png')),
            fs.readFile(path.join(fixturesDir, 'large.webp')),
            fs.readFile(path.join(fixturesDir, 'large.gif')),
        ]);
    });

    it('should optimize a large PNG image and convert it to JPEG', async () => {
        const startTime = Date.now();
        const result = await optimizeImageForClaude(mediumPng, 'image/png');
        const endTime = Date.now();

        expect(result.mediaType).toBe('image/jpeg');
        const optimizedBuffer = Buffer.from(result.base64Image, 'base64');
        expect(optimizedBuffer.length).toBeLessThan(mediumPng.length);
        expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        expect(endTime - startTime).toBeLessThan(2000); // Should be fast
    });

    it('should optimize a large WebP image', async () => {
        const result = await optimizeImageForClaude(largeWebp, 'image/webp');
        const optimizedBuffer = Buffer.from(result.base64Image, 'base64');
        expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        expect(result.mediaType).toBe('image/jpeg');
    });

    it('should optimize a large GIF image', async () => {
        const result = await optimizeImageForClaude(largeGif, 'image/gif');
        const optimizedBuffer = Buffer.from(result.base64Image, 'base64');
        expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        expect(result.mediaType).toBe('image/jpeg');
    });

    it('should leave a small JPEG as-is', async () => {
        const result = await optimizeImageForClaude(smallJpeg, 'image/jpeg');
        expect(result.base64Image).toBe(smallJpeg.toString('base64'));
        expect(result.mediaType).toBe('image/jpeg');
    });

    it('should perform batch optimization with mixed success', async () => {
        const images = [
            { data: largeWebp, mediaType: 'image/webp' },
            { data: Buffer.from('invalid image data'), mediaType: 'image/jpeg' }, // This will fail
            { data: mediumPng, mediaType: 'image/png' },
        ];

        const results = await optimizeBatch(images);

        expect(results.length).toBe(3);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
        expect(results[2].success).toBe(true);

        if (results[0].success) {
            const optimizedBuffer = Buffer.from(results[0].result.base64Image, 'base64');
            expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        }
        if (results[2].success) {
            const optimizedBuffer = Buffer.from(results[2].result.base64Image, 'base64');
            expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        }
    });
});
