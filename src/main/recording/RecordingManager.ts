import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { RecordingBitrate, RecordingFormat } from '../../shared/types';

/** Extensão do arquivo final para cada formato. */
export function recordingExtension(format: RecordingFormat): string {
  return format === 'mp3' ? 'mp3' : format === 'flac' ? 'flac' : 'wav';
}

/** Nome sugerido no diálogo de gravação (sem pasta). */
export function recordingFileName(format: RecordingFormat, date = new Date()): string {
  return `Preseter ${date.toISOString().slice(0, 10)}.${recordingExtension(format)}`;
}

/** Filtro do diálogo de salvar, com a extensão do formato escolhido. */
export function recordingFilter(format: RecordingFormat): { name: string; extensions: string[] } {
  return {
    name: format === 'wav' ? 'WAV' : format === 'mp3' ? 'MP3' : 'FLAC',
    extensions: [recordingExtension(format)],
  };
}

/**
 * Localiza o FFmpeg: empacotado em `resources/ffmpeg/` ou, em desenvolvimento,
 * o binário do pacote `ffmpeg-static`.
 */
export function resolveFfmpegPath(): string | null {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, 'ffmpeg', exe);
    if (fs.existsSync(packaged)) return packaged;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('ffmpeg-static') as string | { default?: string } | null;
    const resolved = typeof mod === 'string' ? mod : mod?.default;
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    /* pacote ausente em produção sem resources */
  }
  return null;
}

/** Argumentos do FFmpeg para converter um WAV em MP3 ou FLAC. */
export function ffmpegArgs(
  input: string,
  output: string,
  format: Exclude<RecordingFormat, 'wav'>,
  bitrate: RecordingBitrate
): string[] {
  const codec = format === 'mp3'
    ? ['-codec:a', 'libmp3lame', '-b:a', `${bitrate}k`]
    : ['-codec:a', 'flac'];
  return ['-y', '-i', input, ...codec, output];
}

export interface ConversionResult {
  ok: boolean;
  error?: string;
}

/** Converte o WAV temporário para o formato final. */
export function convertRecording(
  input: string,
  output: string,
  format: Exclude<RecordingFormat, 'wav'>,
  bitrate: RecordingBitrate
): Promise<ConversionResult> {
  return new Promise((resolve) => {
    const ffmpeg = resolveFfmpegPath();
    if (!ffmpeg) {
      resolve({ ok: false, error: 'FFmpeg não encontrado. Reinstale o Preseter ou use o formato WAV.' });
      return;
    }

    let stderr = '';
    const child = spawn(ffmpeg, ffmpegArgs(input, output, format, bitrate), {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: `Falha ao executar o FFmpeg: ${error.message}` });
    });
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(output)) {
        resolve({ ok: true });
        return;
      }
      const detail = stderr.split(/\r?\n/).filter((line) => line.trim()).slice(-2).join(' ');
      resolve({
        ok: false,
        error: detail
          ? `Falha ao converter a gravação: ${detail}`
          : `O FFmpeg terminou com código ${code ?? '?'} sem gerar o arquivo.`,
      });
    });
  });
}
