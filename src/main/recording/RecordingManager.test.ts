import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  convertRecording,
  ffmpegArgs,
  recordingExtension,
  recordingFileName,
  recordingFilter,
  resolveFfmpegPath,
} from './RecordingManager';
import { makeTempDir, removeTempDir } from '../../test/helpers/temp';

let tempRoot = '';
const ffmpeg = resolveFfmpegPath();

beforeEach(() => {
  tempRoot = makeTempDir();
});

afterEach(() => {
  removeTempDir(tempRoot);
});

/** WAV PCM 16-bit mono de silêncio, para exercitar a conversão real. */
function writeSilenceWav(file: string, seconds = 0.05): void {
  const sampleRate = 44100;
  const samples = Math.floor(sampleRate * seconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(file, buffer);
}

describe('RecordingManager', () => {
  it('mapeia extensões, nome, filtro e argumentos do FFmpeg', () => {
    expect(recordingExtension('wav')).toBe('wav');
    expect(recordingExtension('mp3')).toBe('mp3');
    expect(recordingExtension('flac')).toBe('flac');
    expect(recordingFileName('mp3', new Date('2026-10-31T12:00:00Z'))).toBe('Preseter 2026-10-31.mp3');
    expect(recordingFilter('wav')).toEqual({ name: 'WAV', extensions: ['wav'] });
    expect(recordingFilter('mp3')).toEqual({ name: 'MP3', extensions: ['mp3'] });
    expect(recordingFilter('flac')).toEqual({ name: 'FLAC', extensions: ['flac'] });
    expect(ffmpegArgs('in.wav', 'out.mp3', 'mp3', 320)).toEqual([
      '-y', '-i', 'in.wav', '-codec:a', 'libmp3lame', '-b:a', '320k', 'out.mp3',
    ]);
    expect(ffmpegArgs('in.wav', 'out.flac', 'flac', 320)).toEqual([
      '-y', '-i', 'in.wav', '-codec:a', 'flac', 'out.flac',
    ]);
  });

  it('encontra o FFmpeg do pacote em desenvolvimento', () => {
    expect(ffmpeg).toMatch(/ffmpeg(\.exe)?$/i);
  });

  it.skipIf(!ffmpeg)('converte um WAV curto para MP3 e FLAC', async () => {
    const wav = path.join(tempRoot, 'entrada.wav');
    writeSilenceWav(wav);

    const mp3 = path.join(tempRoot, 'saida.mp3');
    const mp3Result = await convertRecording(wav, mp3, 'mp3', 128);
    expect(mp3Result.ok).toBe(true);
    expect(fs.statSync(mp3).size).toBeGreaterThan(100);

    const flac = path.join(tempRoot, 'saida.flac');
    const flacResult = await convertRecording(wav, flac, 'flac', 320);
    expect(flacResult.ok).toBe(true);
    expect(fs.statSync(flac).size).toBeGreaterThan(100);
  });
});
