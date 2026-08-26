import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { path7za } = require('7zip-bin');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDirectory = path.join(root, 'premiere-plugin');
const releaseDirectory = path.join(root, 'release');
const zipFile = path.join(releaseDirectory, 'Clean-Video-Downloader-Premiere.zip');
const ccxFile = path.join(releaseDirectory, 'Clean-Video-Downloader-Premiere.ccx');

fs.mkdirSync(releaseDirectory, { recursive: true });
for (const output of [zipFile, ccxFile]) {
  if (fs.existsSync(output)) fs.rmSync(output, { force: true });
}

const result = spawnSync(path7za, ['a', '-tzip', zipFile, '.'], {
  cwd: pluginDirectory,
  encoding: 'utf8',
  windowsHide: true
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Premiere 플러그인 압축에 실패했습니다.');
  process.exit(result.status || 1);
}

fs.copyFileSync(zipFile, ccxFile);
process.stdout.write(`Created ${path.relative(root, ccxFile)}\nCreated ${path.relative(root, zipFile)}\n`);
