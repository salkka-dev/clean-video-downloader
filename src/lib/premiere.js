'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function toolPath(toolsDir, name) {
  return path.join(toolsDir, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
}

function run(executable, args, setChild, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    setChild(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => {
      const text = chunk.toString('utf8');
      stderr += text;
      text.split(/\r?\n/).filter(Boolean).forEach(onLine);
    });
    child.on('error', reject);
    child.on('close', code => {
      setChild(null);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`FFmpeg 변환이 중단되었습니다. (${code})`));
    });
  });
}

async function inspect(inputPath, toolsDir, setChild) {
  const result = await run(toolPath(toolsDir, 'ffprobe'), [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', inputPath
  ], setChild);
  return JSON.parse(result.stdout);
}

function isPremiereCompatible(info, inputPath) {
  const streams = Array.isArray(info.streams) ? info.streams : [];
  const video = streams.find(stream => stream.codec_type === 'video');
  const audio = streams.find(stream => stream.codec_type === 'audio');
  return path.extname(inputPath).toLowerCase() === '.mp4' &&
    video && video.codec_name === 'h264' && /^yuvj?420p/.test(video.pix_fmt || '') &&
    (!audio || audio.codec_name === 'aac');
}

function uniqueFinalPath(inputPath) {
  const parsed = path.parse(inputPath);
  if (parsed.ext.toLowerCase() === '.mp4') return inputPath;
  let candidate = path.join(parsed.dir, `${parsed.name}.mp4`);
  if (!fs.existsSync(candidate)) return candidate;
  candidate = path.join(parsed.dir, `${parsed.name}_Premiere.mp4`);
  return candidate;
}

async function replaceSafely(tempPath, finalPath, inputPath) {
  if (finalPath !== inputPath) {
    fs.renameSync(tempPath, finalPath);
    return;
  }
  const backup = `${inputPath}.cvd-backup`;
  fs.renameSync(inputPath, backup);
  try {
    fs.renameSync(tempPath, finalPath);
    fs.rmSync(backup, { force: true });
  } catch (error) {
    if (fs.existsSync(backup) && !fs.existsSync(inputPath)) fs.renameSync(backup, inputPath);
    throw error;
  }
}

async function optimizeForPremiere({ inputPath, toolsDir, onLog = () => {}, setChild = () => {} }) {
  if (!inputPath || !fs.existsSync(inputPath)) throw new Error('변환할 다운로드 파일을 찾지 못했습니다.');
  const info = await inspect(inputPath, toolsDir, setChild);
  const compatible = isPremiereCompatible(info, inputPath);
  const finalPath = uniqueFinalPath(inputPath);
  const tempPath = path.join(path.dirname(finalPath), `.${path.basename(finalPath)}.${process.pid}.tmp.mp4`);
  const args = ['-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0'];
  if (compatible) {
    onLog('이미 H.264/AAC 형식입니다. 빠른 시작용으로 정리합니다.');
    args.push('-c', 'copy');
  } else {
    onLog('H.264 영상과 48kHz AAC 오디오로 변환합니다. 영상 길이에 따라 시간이 걸릴 수 있습니다.');
    args.push(
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'
    );
  }
  args.push('-movflags', '+faststart', tempPath);
  try {
    await run(toolPath(toolsDir, 'ffmpeg'), args, setChild);
    await replaceSafely(tempPath, finalPath, inputPath);
    onLog(`Premiere 호환 MP4 준비 완료: ${path.basename(finalPath)}`);
    return finalPath;
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
}

module.exports = { isPremiereCompatible, optimizeForPremiere, uniqueFinalPath };
