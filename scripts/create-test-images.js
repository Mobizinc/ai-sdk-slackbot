
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'fixtures', 'images');

async function createImages() {
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Small JPEG
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } })
        .jpeg()
        .toFile(path.join(assetsDir, 'small.jpg'));

    // Medium PNG
    await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0.5 } } })
        .png()
        .toFile(path.join(assetsDir, 'medium.png'));

    // Large WebP
    await sharp({ create: { width: 2048, height: 1536, channels: 3, background: { r: 0, g: 0, b: 255 } } })
        .webp()
        .toFile(path.join(assetsDir, 'large.webp'));

    // Large GIF (sharp doesn't support animated gifs, so we'll make a static one)
     await sharp({ create: { width: 1024, height: 768, channels: 3, background: { r: 255, g: 255, b: 0 } } })
        .gif()
        .toFile(path.join(assetsDir, 'large.gif'));


    console.log('Test images created successfully.');
}

createImages().catch(err => console.error(err));
