import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const webDistDir = path.join(rootDir, 'apps/web/dist');
const cliDistWebDir = path.join(rootDir, 'apps/cli/dist/web');

if (fs.existsSync(webDistDir)) {
  if (!fs.existsSync(cliDistWebDir)) {
    fs.mkdirSync(cliDistWebDir, { recursive: true });
  }
  fs.cpSync(webDistDir, cliDistWebDir, { recursive: true, force: true });
  console.log(`[build:web-assets] apps/web/dist başarıyla apps/cli/dist/web dizinine kopyalandı.`);
} else {
  console.warn(
    `[build:web-assets] Uyarı: apps/web/dist bulunamadı, web arayüzü önce build edilmelidir.`,
  );
}
