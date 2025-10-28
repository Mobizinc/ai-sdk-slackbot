
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { optimizeImageForClaude, optimizeBatch } from '../../lib/utils/image-processing';

const CLAUDE_MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

describe('Image Optimization Integration', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures', 'images');
    let smallJpeg: Buffer, mediumPng: Buffer, largeWebp: Buffer, largeGif: Buffer;

    beforeAll(async () => {
        [smallJpeg, mediumPng, largeWebp, largeGif] = await Promise.all([
            fs.readFile(path.join(fixturesDir, 'small-image.jpg')),
            fs.readFile(path.join(fixturesDir, 'test-screenshot.png')),
            fs.readFile(path.join(fixturesDir, 'test-diagram.webp')),
            fs.readFile(path.join(fixturesDir, 'test-icon.gif')),
        ]);
    });

    it('should optimize or pass-through a PNG image', async () => {
        const startTime = Date.now();
        const result = await optimizeImageForClaude(mediumPng, 'image/png');
        const endTime = Date.now();

        // Should return valid result
        expect(result.data).toBeTruthy();
        expect(['image/jpeg', 'image/png']).toContain(result.media_type);
        const optimizedBuffer = Buffer.from(result.data, 'base64');
        expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        expect(endTime - startTime).toBeLessThan(2000); // Should be fast
    });

    it('should handle WebP images', async () => {
        const result = await optimizeImageForClaude(largeWebp, 'image/webp');
        expect(result.data).toBeTruthy();
        const optimizedBuffer = Buffer.from(result.data, 'base64');
        expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        expect(['image/jpeg', 'image/webp']).toContain(result.media_type);
    });

    it('should handle GIF images', async () => {
        const result = await optimizeImageForClaude(largeGif, 'image/gif');
        expect(result.data).toBeTruthy();
        const optimizedBuffer = Buffer.from(result.data, 'base64');
        expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        expect(['image/jpeg', 'image/gif']).toContain(result.media_type);
    });

    it('should handle small images efficiently', async () => {
        const result = await optimizeImageForClaude(smallJpeg, 'image/jpeg');
        expect(result.data).toBeTruthy();
        expect(result.media_type).toBe('image/jpeg');
        // Small images may be returned as-is
        expect(result.size_bytes).toBeLessThanOrEqual(CLAUDE_MAX_IMAGE_SIZE_BYTES);
    });

    it('should perform batch optimization successfully', async () => {
        const images = [
            { buffer: largeWebp, contentType: 'image/webp', fileName: 'large.webp' },
            { buffer: mediumPng, contentType: 'image/png', fileName: 'medium.png' },
            { buffer: smallJpeg, contentType: 'image/jpeg', fileName: 'small.jpg' },
        ];

        const results = await optimizeBatch(images);

        // All valid images should succeed
        expect(results.successful.length).toBe(3);
        expect(results.failed.length).toBe(0);

        results.successful.forEach(img => {
            const optimizedBuffer = Buffer.from(img.data, 'base64');
            expect(optimizedBuffer.length).toBeLessThan(CLAUDE_MAX_IMAGE_SIZE_BYTES);
        });
    });
});
