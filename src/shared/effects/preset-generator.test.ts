import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const effectsDir = path.join(root, 'src', 'shared', 'effects');
const sourcesDir = path.join(effectsDir, 'presets-src');

function catalogEffects (): Array<{ id: string; presets: Array<{ id: string }> }> {
  return ['catalog.json', 'guitarix.json'].flatMap((file) => {
    const data = JSON.parse(fs.readFileSync(path.join(effectsDir, file), 'utf8')) as {
      effects: Array<{ id: string; presets: Array<{ id: string }> }>;
    };
    return data.effects;
  });
}

describe('presets em valores reais', () => {
  it('mantém o catálogo gerado em dia com a fonte', () => {
    // `--check` falha (exit 1) quando o catálogo precisa ser regenerado.
    expect(() => execFileSync(process.execPath, ['scripts/generate-effect-presets.mjs', '--check'], {
      cwd: root,
      stdio: 'pipe',
    })).not.toThrow();
  });

  it('tem uma fonte para cada efeito com presets (e nenhuma órfã)', () => {
    const effects = catalogEffects();
    const files = new Set(
      fs.readdirSync(sourcesDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => JSON.parse(fs.readFileSync(path.join(sourcesDir, name), 'utf8')).effect as string)
    );

    for (const effect of effects) {
      if (effect.presets.length === 0) continue;
      expect(files.has(effect.id), `fonte ausente para ${effect.id}`).toBe(true);
    }

    const ids = new Set(effects.map((effect) => effect.id));
    for (const id of files) expect(ids.has(id), `fonte órfã: ${id}`).toBe(true);
  });
});
