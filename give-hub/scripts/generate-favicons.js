const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 64, 192, 512];
const publicDir = path.join(__dirname, '..', 'public');
const inputSvg = path.join(publicDir, 'icon.svg');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate PNG icons
async function generateIcons() {
  try {
    for (const size of sizes) {
      const outputFile = path.join(publicDir, `icon-${size}x${size}.png`);
      await sharp(inputSvg)
        .resize(size, size)
        .png()
        .toFile(outputFile);
      console.log(`Generated: ${path.basename(outputFile)}`);
    }
    
    // Create favicon.ico (16x16, 32x32, 48x48)
    const outputFile = path.join(publicDir, 'favicon.ico');
    await sharp(inputSvg)
      .resize(64, 64)
      .toFile(outputFile);
    console.log('Generated: favicon.ico');
    
    console.log('\n✅ Favicon generation complete!');
  } catch (error) {
    console.error('Error generating favicons:', error);
    process.exit(1);
  }
}

generateIcons();
