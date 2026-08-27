import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { path7za } = require('7zip-bin');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'premiere-cep');
const release = path.join(root, 'release');
const output = path.join(release, 'Clean-Video-Studio-Premiere.zip');
const versioned = path.join(release, 'Clean-Video-Studio-Premiere-v1.0.1.zip');

fs.mkdirSync(release, { recursive: true });
for (const file of [output, versioned]) if (fs.existsSync(file)) fs.rmSync(file, { force: true });
const result = spawnSync(path7za, ['a', '-tzip', output, '.'], { cwd: source, encoding: 'utf8', windowsHide: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Premiere 올인원 플러그인 압축에 실패했습니다.');
  process.exit(result.status || 1);
}
fs.copyFileSync(output, versioned);
process.stdout.write(`Created ${path.relative(root, output)}\nCreated ${path.relative(root, versioned)}\n`);
