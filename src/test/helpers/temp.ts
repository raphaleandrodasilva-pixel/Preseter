import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function makeTempDir(prefix = 'preseter-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeTempDir(directory: string): void {
  fs.rmSync(directory, { recursive: true, force: true });
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}
