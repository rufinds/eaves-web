// Converts screens/<name>.jpg into two webp sizes in assets/.
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const NAMES = ['home', 'lineup', 'details', 'following', 'roles'];

for (const name of NAMES) {
  const input = ['jpg', 'jpeg', 'png'].map((e) => `screens/${name}.${e}`).find(existsSync);
  if (!input) {
    console.warn(`missing: screens/${name}.jpg (skipped)`);
    continue;
  }
  for (const width of [480, 720]) {
    await sharp(input).resize({ width }).webp({ quality: 80 }).toFile(`assets/phone-${name}-${width}.webp`);
  }
  console.log(`done: ${name}`);
}