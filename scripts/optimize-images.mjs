// Converts one screenshot to a resized webp and prints the result.
// Usage: node scripts/optimize-images.mjs <input> <output.webp> [width=720] [quality=80]
import sharp from 'sharp';

const [input, output, width = '720', quality = '80'] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/optimize-images.mjs <input> <output.webp> [width=720] [quality=80]');
  process.exit(1);
}

const info = await sharp(input)
  .resize({ width: Number(width), withoutEnlargement: true })
  .webp({ quality: Number(quality) })
  .toFile(output);

console.log(`${output}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB`);