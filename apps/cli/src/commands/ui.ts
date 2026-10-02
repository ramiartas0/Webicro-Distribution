import { Command } from 'commander';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import chalk from 'chalk';
import * as clack from '@clack/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uiCommand = new Command('ui')
  .description('Launch the Webicro Distribution web dashboard')
  .option('-p, --port <number>', 'Port to run the dashboard on', '3100')
  .action((options: { port: string }) => {
    const port = parseInt(options.port, 10);
    
    // apps/web/dist konumunu bul
    const webDistPath = path.resolve(__dirname, '../../web/dist');
    const fallbackPath = path.resolve(process.cwd(), 'apps/web/dist');
    const staticDir = fs.existsSync(webDistPath) ? webDistPath : fallbackPath;

    if (!fs.existsSync(staticDir)) {
      clack.log.error(chalk.red(`Web dashboard derleme klasörü bulunamadı: ${staticDir}`));
      clack.log.info('Lütfen önce `pnpm --filter @webicro/web run build` komutunu çalıştırın.');
      process.exit(1);
    }

    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };

    const server = http.createServer((req, res) => {
      let reqPath = req.url === '/' || !req.url ? '/index.html' : req.url;
      // Query parametrelerini temizle
      reqPath = reqPath.split('?')[0] || '/index.html';
      
      let filePath = path.join(staticDir, reqPath);

      // SPA fallback
      if (!fs.existsSync(filePath)) {
        filePath = path.join(staticDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Server error loading dashboard');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      clack.intro(chalk.bold('🚀 Webicro Distribution - Web Dashboard'));
      clack.log.success(`${chalk.green('Dashboard hazır ve çalışıyor:')} ${chalk.cyan.underline(url)}`);
      clack.log.info(chalk.dim('Durdurmak için Ctrl+C tuşlarına basın.'));

      // Tarayıcıyı otomatik aç
      const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${startCmd} ${url}`);
    });
  });
