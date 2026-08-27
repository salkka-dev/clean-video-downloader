import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { path7za } = require('7zip-bin');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'extension');
const release = path.join(root, 'release');
const output = path.join(release, 'Clean-Video-Downloader-Chrome.zip');
const versionedOutput = path.join(release, 'Clean-Video-Downloader-Chrome-v2.4.1.zip');

mkdirSync(release, { recursive: true });
for (const file of [output, versionedOutput]) {
  if (existsSync(file)) rmSync(file);
}

const result = spawnSync(path7za, ['a', '-tzip', output, '.'], { cwd: source, encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Chrome 확장 압축에 실패했습니다.');
  process.exit(result.status || 1);
}
copyFileSync(output, versionedOutput);
process.stdout.write(`Created ${path.relative(root, output)}\nCreated ${path.relative(root, versionedOutput)}\n`);
