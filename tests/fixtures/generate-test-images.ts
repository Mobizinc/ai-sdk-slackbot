/**
 * Script to generate test images for multimodal feature testing
 */

import sharp from "sharp";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const OUTPUT_DIR = join(__dirname, "images");

async function generateTestImages() {
  console.log("Generating test images...");

  // 1. Small image (under 1MB) - should not need optimization
  const smallImage = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  await writeFile(join(OUTPUT_DIR, "small-image.jpg"), smallImage);
  console.log(`✓ small-image.jpg (${smallImage.length} bytes)`);

  // 2. Medium image (~2MB) - will need compression
  const mediumImage = await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 255, g: 100, b: 50 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();

  await writeFile(join(OUTPUT_DIR, "medium-image.jpg"), mediumImage);
  console.log(`✓ medium-image.jpg (${mediumImage.length} bytes)`);

  // 3. Large image (~8MB) - will need significant optimization
  const largeImage = await sharp({
    create: {
      width: 3840,
      height: 2160,
      channels: 3,
      background: { r: 50, g: 200, b: 100 },
    },
  })
    .png()
    .toBuffer();

  await writeFile(join(OUTPUT_DIR, "large-image.png"), largeImage);
  console.log(`✓ large-image.png (${largeImage.length} bytes)`);

  // 4. PNG format
  const pngImage = await sharp({
    create: {
      width: 1024,
      height: 768,
      channels: 4, // with alpha
      background: { r: 200, g: 200, b: 200, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  await writeFile(join(OUTPUT_DIR, "test-screenshot.png"), pngImage);
  console.log(`✓ test-screenshot.png (${pngImage.length} bytes)`);

  // 5. WebP format
  const webpImage = await sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 3,
      background: { r: 150, g: 100, b: 200 },
    },
  })
    .webp({ quality: 80 })
    .toBuffer();

  await writeFile(join(OUTPUT_DIR, "test-diagram.webp"), webpImage);
  console.log(`✓ test-diagram.webp (${webpImage.length} bytes)`);

  // 6. GIF format
  const gifImage = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 255, g: 200, b: 100 },
    },
  })
    .gif()
    .toBuffer();

  await writeFile(join(OUTPUT_DIR, "test-icon.gif"), gifImage);
  console.log(`✓ test-icon.gif (${gifImage.length} bytes)`);

  // 7. Extremely large image (>20MB) - should fail optimization
  const extremelyLargeImage = await sharp({
    create: {
      width: 7680,
      height: 4320,
      channels: 3,
      background: { r: 100, g: 100, b: 100 },
    },
  })
    .png()
    .toBuffer();

  await writeFile(join(OUTPUT_DIR, "extremely-large.png"), extremelyLargeImage);
  console.log(`✓ extremely-large.png (${extremelyLargeImage.length} bytes)`);

  console.log("\n✅ Test images generated successfully!");
}

// Run if executed directly
if (require.main === module) {
  generateTestImages().catch(console.error);
}

export { generateTestImages };
