/**
 * ConcertManager (Fase 2.2): guarda o concert aberto em memória, grava/lê o
 * arquivo `.preseter`, mantém a lista de recentes e a sessão (último concert e
 * último patch) em userData.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import {
  ConcertState,
  ConcertSyncPayload,
  LayoutConfig,
  Preset,
  PresetSet,
  PreseterConcertFile,
  RecentConcert,
  SessionState,
} from '../../shared/types';
import {
  buildConcertFile,
  createEmptyConcertFile,
  migrateLegacyConcert,
  parseConcertFile,
  serializeConcertFile,
} from './ConcertFile';
import { buildTemplateConcert } from './templates';

const MAX_RECENT = 10;

/** Remove campos voláteis (updatedAt) para comparar se algo realmente mudou. */
function withoutTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTimestamps);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'updatedAt') continue;
      out[key] = withoutTimestamps(item);
    }
    return out;
  }
  return value;
}

function signature(value: unknown): string {
  return JSON.stringify(withoutTimestamps(value));
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const data: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data || typeof data !== 'object') return fallback;
    return data as T;
  } catch {
    return fallback;
  }
}

export interface LegacyConcertPayload {
  sets?: PresetSet[];
  name?: string;
  tempo?: number;
  layout?: LayoutConfig | null;
}

export class ConcertManager extends EventEmitter {
  private file: PreseterConcertFile;
  private filePath: string | null = null;
  private savedSignature: string;
  private recent: RecentConcert[] = [];
  private session: SessionState = { concertPath: null, lastPatchId: null };
  private readonly recentPath: string;
  private readonly sessionPath: string;

  constructor() {
    super();
    const userData = app.getPath('userData');
    this.recentPath = path.join(userData, 'recent-concerts.json');
    this.sessionPath = path.join(userData, 'session.json');
    this.file = createEmptyConcertFile();
    this.savedSignature = signature(this.file);
    this.recent = this.readRecent();
    this.session = this.readSession();
  }

  // === Leitura de estado ===

  getState(): ConcertState {
    return {
      path: this.filePath,
      name: this.file.concert.name,
      tempo: this.file.concert.tempo,
      sets: this.file.sets,
      patches: this.file.patches,
      layout: this.file.layout,
      dirty: this.isDirty(),
      settings: this.file.concert.settings,
      strips: this.file.concert.strips ?? [],
      lastPatchId: this.session.lastPatchId,
    };
  }

  isDirty(): boolean {
    return signature(this.file) !== this.savedSignature;
  }

  getPresets(): Preset[] {
    return [...this.file.patches].sort((a, b) => a.programNumber - b.programNumber);
  }

  getPreset(presetId: string): Preset | undefined {
    return this.file.patches.find((preset) => preset.id === presetId);
  }

  getSet(setId: string): PresetSet | undefined {
    if (!setId) return undefined;
    return this.file.sets.find((set) => set.id === setId);
  }

  findByProgramNumber(programNumber: number): Preset | undefined {
    return this.file.patches.find((preset) => preset.programNumber === programNumber);
  }

  duplicatePreset(presetId: string): Preset | null {
    const src = this.file.patches.find((p) => p.id === presetId);
    if (!src) return null;
    const copy: Preset = { ...src, id: `${src.id}_copy_${Date.now()}`, name: src.name + ' (cópia)', createdAt: Date.now(), updatedAt: Date.now() };
    this.file.patches.push(copy);
    this.emitChanged();
    return copy;
  }

  getRecent(): RecentConcert[] {
    return this.recent;
  }

  getSessionConcertPath(): string | null {
    return this.session.concertPath;
  }

  getLastPatchId(): string | null {
    return this.session.lastPatchId;
  }

  setLastPatchId(id: string | null): void {
    if (this.session.lastPatchId === id) return;
    this.writeSession({ lastPatchId: id });
  }

  // === Ciclo de vida do concert ===

  newConcert(templateId = 'vazio'): ConcertState {
    this.file = buildTemplateConcert(templateId);
    this.filePath = null;
    this.savedSignature = signature(this.file);
    this.writeSession({ concertPath: null });
    this.emitChanged();
    return this.getState();
  }

  openFromPath(filePath: string): ConcertState {
    const text = fs.readFileSync(filePath, 'utf8');
    const file = parseConcertFile(text);
    this.file = file;
    this.filePath = filePath;
    this.savedSignature = signature(file);
    this.rememberRecent(filePath);
    this.writeSession({ concertPath: filePath });
    this.emitChanged();
    return this.getState();
  }

  /** Grava o concert atual. Sem caminho informado, usa o do arquivo aberto. */
  saveTo(target?: string): ConcertState {
    const filePath = target ?? this.filePath;
    if (!filePath) {
      throw new Error('O concert ainda não tem um arquivo; escolha onde salvá-lo.');
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, serializeConcertFile(this.file), 'utf8');
    this.filePath = filePath;
    this.savedSignature = signature(this.file);
    this.rememberRecent(filePath);
    this.writeSession({ concertPath: filePath });
    this.emit('saved', this.getState());
    this.emitChanged();
    return this.getState();
  }

  migrateLegacy(presets: Preset[], legacy: LegacyConcertPayload = {}): ConcertState {
    const file = migrateLegacyConcert({
      presets,
      sets: legacy.sets,
      concertName: legacy.name,
      tempo: legacy.tempo,
      layout: legacy.layout,
    });
    this.file = file;
    this.filePath = null;
    // Sem assinatura "salva": o concert migrado começa como alterado, até ser gravado.
    this.savedSignature = '';
    this.emitChanged();
    return this.getState();
  }

  // === Edição ===

  /** Aplica o estado editado no renderer (nome, tempo, sets, strips e configurações). */
  applyEditors(payload: ConcertSyncPayload): boolean {
    const nextSets = Array.isArray(payload.sets) ? payload.sets : [];
    const nextSettings =
      payload.settings && typeof payload.settings === 'object' ? payload.settings : this.file.concert.settings;
    const nextStrips = Array.isArray(payload.strips) ? payload.strips : this.file.concert.strips ?? [];
    const changed =
      this.file.concert.name !== payload.name ||
      this.file.concert.tempo !== payload.tempo ||
      signature(this.file.sets) !== signature(nextSets) ||
      signature(this.file.concert.settings) !== signature(nextSettings) ||
      signature(this.file.concert.strips ?? []) !== signature(nextStrips);
    if (!changed) return false;

    this.file.concert.name = payload.name;
    this.file.concert.tempo = payload.tempo;
    this.file.concert.settings = nextSettings;
    this.file.concert.strips = nextStrips;
    this.file.concert.updatedAt = Date.now();
    this.file.sets = nextSets;
    this.emitChanged();
    return true;
  }

  upsertPatch(preset: Preset): boolean {
    const index = this.file.patches.findIndex((item) => item.id === preset.id);
    if (index === -1) {
      this.file.patches = [...this.file.patches, preset];
    } else {
      if (signature(this.file.patches[index]) === signature(preset)) return false;
      const next = [...this.file.patches];
      next[index] = preset;
      this.file.patches = next;
    }
    this.file.concert.updatedAt = Date.now();
    this.emitChanged();
    return true;
  }

  deletePatch(presetId: string): boolean {
    if (!this.file.patches.some((preset) => preset.id === presetId)) return false;
    this.file.patches = this.file.patches.filter((preset) => preset.id !== presetId);
    if (this.session.lastPatchId === presetId) this.setLastPatchId(null);
    this.file.concert.updatedAt = Date.now();
    this.emitChanged();
    return true;
  }

  /** Monta o documento como será gravado (usado por testes/diagnóstico). */
  buildDocument(): PreseterConcertFile {
    return buildConcertFile({
      concert: this.file.concert,
      sets: this.file.sets,
      patches: this.file.patches,
      layout: this.file.layout,
      mappings: this.file.mappings,
    });
  }

  // === Recentes e sessão ===

  private readRecent(): RecentConcert[] {
    const data = readJsonFile<unknown>(this.recentPath, []);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (item): item is RecentConcert =>
        !!item && typeof item === 'object' && typeof (item as RecentConcert).path === 'string'
    );
  }

  private rememberRecent(filePath: string): void {
    const name = this.file.concert.name;
    const entry: RecentConcert = { path: filePath, name, openedAt: Date.now() };
    this.recent = [entry, ...this.recent.filter((item) => item.path !== filePath)].slice(0, MAX_RECENT);
    this.writeJson(this.recentPath, this.recent);
    this.emit('recent-changed', this.recent);
  }

  private readSession(): SessionState {
    const data = readJsonFile<Partial<SessionState>>(this.sessionPath, {});
    return {
      concertPath: typeof data.concertPath === 'string' ? data.concertPath : null,
      lastPatchId: typeof data.lastPatchId === 'string' ? data.lastPatchId : null,
    };
  }

  private writeSession(update: Partial<SessionState>): void {
    this.session = { ...this.session, ...update };
    this.writeJson(this.sessionPath, this.session);
  }

  private writeJson(filePath: string, data: unknown): void {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    } catch (error) {
      console.warn('[Preseter] Não foi possível gravar', filePath, error);
    }
  }

  private emitChanged(): void {
    this.emit('changed', this.getState());
  }
}
