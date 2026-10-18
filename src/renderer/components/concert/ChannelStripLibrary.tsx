import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { VstPluginInfo, VstPreset, VstPresetLibraryStatus, VstPresetListResult } from '@shared/types';
import { VST_PRESET_CATEGORIES } from '@shared/vst-presets';

interface ChannelStripLibraryProps {
  selectedLayerId: string | null;
  selectedPlugin: VstPluginInfo | null;
}

const EMPTY_STATUS: VstPresetLibraryStatus = { scanning: false, scanned: 0, total: 0 };
const RECENT_KEY = 'preseter.vstPresetRecent.v1';

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 24)));
  } catch {
    // Ignora indisponibilidade do localStorage.
  }
}

const rowClass = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px]';

/**
 * Channel Strip Library no estilo do MainStage: navegação em colunas
 * (categoria → coleção/plugin → preset) para os presets do VST do layer atual.
 */
export const ChannelStripLibrary: React.FC<ChannelStripLibraryProps> = ({
  selectedLayerId,
  selectedPlugin,
}) => {
  const [result, setResult] = useState<VstPresetListResult>({ presets: [], status: EMPTY_STATUS });
  const [category, setCategory] = useState('Todos');
  const [collection, setCollection] = useState<string>('Todos');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await window.electronAPI.vstPresetsList();
      setResult(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar presets de VST.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.electronAPI.onVstPresetsUpdated((next) => setResult(next));
  }, [refresh]);

  useEffect(() => {
    setSelectedId(null);
    setCollection('Todos');
    setCategory('Todos');
  }, [selectedPlugin?.id]);

  const pluginPresets = useMemo(() => {
    if (!selectedPlugin) return result.presets;
    return result.presets.filter(
      (preset) => preset.pluginId === selectedPlugin.id || preset.pluginName === selectedPlugin.name
    );
  }, [result.presets, selectedPlugin]);

  const categories = useMemo(() => {
    const available = new Set(pluginPresets.map((preset) => preset.category));
    const ordered = VST_PRESET_CATEGORIES.filter(
      (name) =>
        name === 'Favoritos' ||
        name === 'Recentes' ||
        name === 'Meus presets' ||
        available.has(name)
    );
    const extra = [...available].filter((name) => !VST_PRESET_CATEGORIES.includes(name)).sort();
    return ['Todos', ...ordered, ...extra];
  }, [pluginPresets]);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] ?? 'Todos');
  }, [categories, category]);

  const byCategory = useMemo(() => {
    const term = query.trim().toLowerCase();
    return pluginPresets.filter((preset) => {
      if (category === 'Favoritos' && !preset.favorite) return false;
      if (category === 'Recentes' && !recent.includes(preset.id)) return false;
      if (category === 'Meus presets' && preset.source !== 'snapshot') return false;
      if (
        category !== 'Favoritos' &&
        category !== 'Recentes' &&
        category !== 'Meus presets' &&
        category !== 'Todos' &&
        preset.category !== category
      ) {
        return false;
      }
      if (!term) return true;
      return `${preset.name} ${preset.pluginName} ${preset.category} ${preset.collection ?? ''}`
        .toLowerCase()
        .includes(term);
    });
  }, [pluginPresets, category, recent, query]);

  const collections = useMemo(() => {
    const values = new Set(byCategory.map((preset) => preset.collection || preset.pluginName || 'Outros'));
    return ['Todos', ...[...values].sort((a, b) => a.localeCompare(b))];
  }, [byCategory]);

  useEffect(() => {
    if (!collections.includes(collection)) setCollection('Todos');
  }, [collections, collection]);

  const rows = useMemo(() => {
    const filtered = byCategory.filter((preset) => {
      if (collection === 'Todos') return true;
      return (preset.collection || preset.pluginName || 'Outros') === collection;
    });
    if (category === 'Recentes') {
      return [...filtered].sort(
        (a, b) => recent.indexOf(a.id) - recent.indexOf(b.id)
      );
    }
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [byCategory, collection, category, recent]);

  const selected = rows.find((preset) => preset.id === selectedId) ?? null;
  const activePreset = selected ?? rows[0] ?? null;

  const markRecent = (presetId: string) => {
    const next = [presetId, ...recent.filter((id) => id !== presetId)].slice(0, 24);
    setRecent(next);
    saveRecent(next);
  };

  const applyPreset = async (preset: VstPreset) => {
    setSelectedId(preset.id);
    if (!selectedLayerId) {
      setMessage('Selecione um channel strip no palco para aplicar o preset.');
      return;
    }
    if (selectedPlugin && preset.pluginId && preset.pluginId !== selectedPlugin.id) {
      setMessage(
        `Este preset é do plugin “${preset.pluginName}”. Selecione um layer com esse plugin para aplicá-lo.`
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const applied = await window.electronAPI.vstPresetApply(preset.id, selectedLayerId);
      if (!applied) {
        setMessage('O preset não pôde ser aplicado.');
        return;
      }
      markRecent(preset.id);
      setMessage(`Preset “${preset.name}” aplicado.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao aplicar o preset.');
    } finally {
      setBusy(false);
    }
  };

  const saveSnapshot = async () => {
    if (!selectedLayerId || !selectedPlugin) {
      setMessage('Selecione um channel strip carregado para capturar o som atual.');
      return;
    }
    const name = snapshotName.trim() || `${selectedPlugin.name} — som atual`;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await window.electronAPI.vstPresetSaveSnapshot({
        layerId: selectedLayerId,
        name,
        category: categories.includes(category) && !['Favoritos', 'Recentes', 'Meus presets'].includes(category)
          ? category
          : undefined,
      });
      if (!saved) {
        setMessage('Não foi possível capturar o som atual.');
        return;
      }
      setSnapshotName('');
      setSelectedId(saved.id);
      markRecent(saved.id);
      setMessage(`Preset “${saved.name}” salvo em Meus presets.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar o som atual.');
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async (preset: VstPreset) => {
    try {
      await window.electronAPI.vstPresetUpdate(preset.id, { favorite: !preset.favorite });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao atualizar o favorito.');
    }
  };

  const changeCategory = async (preset: VstPreset, nextCategory: string) => {
    try {
      await window.electronAPI.vstPresetUpdate(preset.id, { category: nextCategory });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao atualizar a categoria.');
    }
  };

  const deleteSnapshot = async (preset: VstPreset) => {
    if (preset.source !== 'snapshot') return;
    setBusy(true);
    try {
      const deleted = await window.electronAPI.vstPresetDelete(preset.id);
      if (deleted) {
        setMessage(`Preset “${preset.name}” excluído.`);
        setSelectedId(null);
        await refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao excluir o preset.');
    } finally {
      setBusy(false);
    }
  };

  const rescan = async () => {
    setBusy(true);
    setMessage('Reescaneando plugins e presets…');
    try {
      const next = await window.electronAPI.vstPresetsRescan();
      setResult(next);
      setMessage('Reescaneamento concluído.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao reescanear.');
    } finally {
      setBusy(false);
    }
  };

  const statusText = result.status.scanning
    ? `Lendo presets… ${result.status.scanned}/${result.status.total}${result.status.current ? ` · ${result.status.current}` : ''}`
    : selectedPlugin
      ? selectedPlugin.name
      : 'Selecione um channel strip';

  return (
    <div className="flex h-full min-h-[190px] flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div>
          <div className="text-[12px] font-semibold text-white">Channel Strip Library</div>
          <div className="text-[10px]" style={{ color: '#8E8E93' }}>{statusText}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="rounded-lg border px-2 py-1 text-[10px] text-slate-200 hover:brightness-110 disabled:opacity-50"
            style={{ borderColor: '#3A3A3C', background: '#242426' }}
            disabled={busy || result.status.scanning}
            onClick={() => void rescan()}
            title="Reescanear VSTs e presets"
          >
            {result.status.scanning ? 'Escaneando…' : 'Reescanear'}
          </button>
          <button
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
            style={{ background: '#0A84FF' }}
            disabled={busy || !selectedLayerId || !selectedPlugin}
            onClick={() => void saveSnapshot()}
            title="Salvar o som atual como preset do Preseter"
          >
            Salvar som atual
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar preset por nome, plugin ou categoria…"
          className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-[#0A84FF]"
          style={{ borderColor: '#3A3A3C', background: '#242426' }}
        />
        <input
          value={snapshotName}
          onChange={(event) => setSnapshotName(event.target.value)}
          placeholder="Nome do novo preset"
          className="w-44 rounded-lg border px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-[#0A84FF]"
          style={{ borderColor: '#3A3A3C', background: '#242426' }}
        />
        {activePreset && (
          <select
            value={activePreset.category}
            onChange={(event) => void changeCategory(activePreset, event.target.value)}
            className="w-32 rounded-lg border px-2 py-1.5 text-[11px] text-slate-100 outline-none"
            style={{ borderColor: '#3A3A3C', background: '#242426' }}
            title="Categoria do preset"
          >
            {VST_PRESET_CATEGORIES.filter(
              (name) => !['Favoritos', 'Recentes', 'Meus presets'].includes(name)
            ).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            {!VST_PRESET_CATEGORIES.includes(activePreset.category) && (
              <option value={activePreset.category}>{activePreset.category}</option>
            )}
          </select>
        )}
      </div>

      {!selectedLayerId && (
        <div className="mb-2 rounded-lg border px-2 py-1.5 text-[10px]" style={{ borderColor: '#5A4B1F', background: '#2C2615', color: '#FFD60A' }}>
          Selecione um channel strip no palco para ouvir e aplicar presets.
        </div>
      )}

      <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(130px,1fr)_minmax(180px,1.6fr)] gap-2">
        <div className="px-1 text-[9px] uppercase tracking-wide" style={{ color: '#636366' }}>Categoria</div>
        <div className="px-1 text-[9px] uppercase tracking-wide" style={{ color: '#636366' }}>Coleção</div>
        <div className="px-1 text-[9px] uppercase tracking-wide" style={{ color: '#636366' }}>Preset</div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(110px,0.7fr)_minmax(130px,1fr)_minmax(180px,1.6fr)] gap-2">
        <div className="min-h-0 overflow-auto rounded-lg border p-1" style={{ borderColor: '#303032', background: '#1A1A1C' }}>
          {categories.map((name) => (
            <button
              key={name}
              onClick={() => { setCategory(name); setSelectedId(null); }}
              className={rowClass}
              style={category === name
                ? { background: 'rgba(10,132,255,0.28)', color: '#fff' }
                : { color: '#D1D1D6' }}
            >
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>

        <div className="min-h-0 overflow-auto rounded-lg border p-1" style={{ borderColor: '#303032', background: '#1A1A1C' }}>
          {collections.map((name) => (
            <button
              key={name}
              onClick={() => { setCollection(name); setSelectedId(null); }}
              className={rowClass}
              style={collection === name
                ? { background: 'rgba(10,132,255,0.20)', color: '#fff' }
                : { color: '#D1D1D6' }}
            >
              <span className="truncate">{name}</span>
            </button>
          ))}
          {collections.length === 0 && (
            <div className="p-2 text-[10px]" style={{ color: '#8E8E93' }}>Nenhuma coleção.</div>
          )}
        </div>

        <div className="min-h-0 overflow-auto rounded-lg border p-1" style={{ borderColor: '#303032', background: '#1A1A1C' }}>
          {rows.length === 0 && (
            <div className="p-2 text-[10px]" style={{ color: '#8E8E93' }}>
              {result.status.scanning
                ? 'Escaneando presets…'
                : !selectedPlugin
                  ? 'Selecione um channel strip para ver os presets.'
                  : pluginPresets.length === 0
                    ? 'Este plugin não expõe presets ao host. Use “Salvar som atual”.'
                    : 'Nenhum preset nesta categoria/coleção.'}
            </div>
          )}
          {rows.map((preset) => (
            <div
              key={preset.id}
              className="group flex items-center gap-1 rounded-lg px-1.5 py-1"
              style={selectedId === preset.id ? { background: 'rgba(10,132,255,0.24)' } : undefined}
            >
              <button
                className="min-w-0 flex-1 truncate text-left text-[11px]"
                style={{ color: '#E5E5EA' }}
                onClick={() => void applyPreset(preset)}
                title={`${preset.name}${preset.collection ? ` · ${preset.collection}` : ''}`}
              >
                {preset.name}
              </button>
              <button
                onClick={() => void toggleFavorite(preset)}
                className="px-1 text-[11px]"
                style={{ color: preset.favorite ? '#FFD60A' : '#636366' }}
                title={preset.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              >
                {preset.favorite ? '★' : '☆'}
              </button>
              {preset.source === 'snapshot' && (
                <button
                  onClick={() => void deleteSnapshot(preset)}
                  className="px-1 text-[10px] opacity-0 group-hover:opacity-100"
                  style={{ color: '#FF8A80' }}
                  title="Excluir preset"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {message && (
        <div className="mt-2 rounded-lg border px-2 py-1 text-[10px]" style={{ borderColor: '#303032', background: '#242426', color: '#D1D1D6' }}>
          {message}
        </div>
      )}
    </div>
  );
};
