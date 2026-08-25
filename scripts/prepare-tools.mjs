import { chmod, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from '@derhuerst/ffprobe-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'vendor', 'current');
const executableSuffix = process.platform === 'win32' ? '.exe' : '';
const ytDlpAsset = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp_macos';
const ytDlpVersion = process.env.YTDLP_VERSION || '2026.08.19';
const ytDlpUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${ytDlpVersion}/${ytDlpAsset}`;

async function download(url, file) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'clean-video-downloader-build' } });
  if (!response.ok) throw new Error(`도구 다운로드 실패 (${response.status}): ${url}`);
  await BunlessWrite(file, new Uint8Array(await response.arrayBuffer()));
}

async function BunlessWrite(file, bytes) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, bytes);
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

const ffmpegDestination = path.join(destination, `ffmpeg${executableSuffix}`);
const ffprobeDestination = path.join(destination, `ffprobe${executableSuffix}`);
const ytDlpDestination = path.join(destination, `yt-dlp${executableSuffix}`);

await copyFile(ffmpegPath, ffmpegDestination);
await copyFile(ffprobePath, ffprobeDestination);
await download(ytDlpUrl, ytDlpDestination);

if (process.platform !== 'win32') {
  await Promise.all([
    chmod(ffmpegDestination, 0o755),
    chmod(ffprobeDestination, 0o755),
    chmod(ytDlpDestination, 0o755)
  ]);
}

console.log(`Prepared tools for ${process.platform}-${process.arch}`);
