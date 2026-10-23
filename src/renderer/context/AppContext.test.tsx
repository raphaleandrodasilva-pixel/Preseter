import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppContext, type AppContextType } from './AppContext';
import type { ElectronApiMock } from '../../test/electron-api-mock';
import type { RawMidiEvent } from '../services/WebMidiService';
import {
  createConcertSettings,
  createConcertState,
  createElement,
  createLayout,
  createPluginInfo,
  createPreset,
  createSet,
  createAudioSettingsSnapshot,
  createPreferences,
} from '../../test/fixtures';

let latest: AppContextType;

function Probe(): React.ReactElement {
  latest = useAppContext();
  return <div data-testid="loaded">{String(latest.concertLoaded)}</div>;
}

function api(): ElectronApiMock {
  return window.electronAPI as ElectronApiMock;
}

async function renderProvider(): Promise<ReturnType<typeof render>> {
  const result = render(
    <AppProvider>
      <Probe />
    </AppProvider>
  );
  await waitFor(() => expect(latest).toBeDefined());
  await waitFor(() => expect(latest.concertLoaded).toBe(true));
  return result;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.electronAPI.concertInit).mockResolvedValue(createConcertState());
});

describe('AppProvider initialization', () => {
  it('loads the concert, engine, audio and preferences', async () => {
    const layout = createLayout({ tempo: 94, elements: [createElement({ id: 'x' })] });
    const settings = createConcertSettings({ notes: 'loaded' });
    const patch = createPreset({ id: 'p1', name: 'Patch' });
    const set = createSet({ id: 's1' });
    vi.mocked(window.electronAPI.concertInit).mockResolvedValue(
      createConcertState({
        name: 'Loaded',
        path: 'C:/show.preseter',
        tempo: 94,
        patches: [patch],
        sets: [set],
        settings,
        layout,
        dirty: true,
        strips: [{ id: 'c1', name: 'C', pluginId: 'p', path: 'p', role: 'instrument' }],
      })
    );
    vi.mocked(window.electronAPI.vstLoaded).mockResolvedValue([createPluginInfo()]);
    vi.mocked(window.electronAPI.audioSettingsGet).mockResolvedValue(
      createAudioSettingsSnapshot()
    );
    vi.mocked(window.electronAPI.preferencesGet).mockResolvedValue(
      createPreferences({ scrollSpeed: 'slower' })
    );

    await renderProvider();

    expect(latest.concertName).toBe('Loaded');
    expect(latest.concertPath).toBe('C:/show.preseter');
    expect(latest.concertDirty).toBe(true);
    expect(latest.layout).toEqual(layout);
    expect(latest.concertSettings).not.toBeNull();
    expect(latest.concertSettings?.notes).toBe('loaded');
    expect(latest.sets).toEqual([set]);
    expect(latest.presets[0]).toMatchObject({ id: 'p1', name: 'Patch' });
    expect(latest.presets[0].layout.elements.map((element) => element.id)).toEqual(['x']);
    expect(latest.loadedPlugins).toHaveLength(1);
    expect(latest.audioDevices).not.toBeNull();
    expect(latest.preferences?.scrollSpeed).toBe('slower');
    expect(latest.concertStrips).toHaveLength(1);
    expect(window.electronAPI.concertInit).toHaveBeenCalledWith({});
  });

  it('reports initialization failures', async () => {
    vi.mocked(window.electronAPI.concertInit).mockRejectedValue(new Error('init failed'));
    vi.mocked(navigator.requestMIDIAccess).mockReturnValue(new Promise(() => undefined));
    render(
      <AppProvider>
        <Probe />
      </AppProvider>
    );
    await waitFor(() => expect(latest.midiError).toBe('init failed'));
    expect(latest.concertLoaded).toBe(false);
  });

  it('reads and tolerates legacy localStorage data', async () => {
    localStorage.setItem('preseter.sets.v1', JSON.stringify([createSet()]));
    localStorage.setItem('preseter.concertName.v1', 'Legacy');
    await renderProvider();
    expect(window.electronAPI.concertInit).toHaveBeenCalledWith({
      sets: [createSet()],
      name: 'Legacy',
    });
  });

  it('ignores malformed legacy localStorage data', async () => {
    localStorage.setItem('preseter.sets.v1', '{');
    await renderProvider();
    expect(window.electronAPI.concertInit).toHaveBeenCalledWith({});
  });
});

describe('AppProvider concert editing', () => {
  it('creates and edits sets and patches', async () => {
    const set = createSet({ id: 's1', name: 'Original' });
    const patch = createPreset({ id: 'p1', setId: 's1' });
    vi.mocked(window.electronAPI.concertInit).mockResolvedValue(
      createConcertState({ sets: [set], patches: [patch] })
    );
    await renderProvider();

    act(() => {
      latest.setConcertName('Renamed concert');
      latest.renameSet('s1', 'Renamed set');
      latest.toggleSetExpanded('s1');
      latest.toggleSetSkipped('s1');
    });
    expect(latest.concertName).toBe('Renamed concert');
    expect(latest.sets[0]).toMatchObject({
      name: 'Renamed set',
      expanded: false,
      skipped: true,
    });

    let created: ReturnType<AppContextType['createSet']> | undefined;
    act(() => {
      created = latest.createSet('  New set  ');
    });
    expect(created?.name).toBe('New set');
    expect(latest.sets.map((item) => item.name)).toEqual(['Renamed set', 'New set']);

    act(() => {
      latest.deleteSet('s1');
    });
    expect(latest.sets.map((item) => item.id)).toEqual([created!.id]);
    expect(latest.presets[0].setId).toBeUndefined();
  });

  it('reorders sets and ignores unknown ids', async () => {
    const a = createSet({ id: 'a', order: 0 });
    const b = createSet({ id: 'b', order: 1 });
    vi.mocked(window.electronAPI.concertInit).mockResolvedValue(
      createConcertState({ sets: [a, b] })
    );
    await renderProvider();
    act(() => latest.reorderSets(['b', 'missing', 'a']));
    expect(latest.sets.map((item) => [item.id, item.order])).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
  });

  it('updates settings, strips, mappings and layout elements', async () => {
    const layout = createLayout({ elements: [createElement({ id: 'e1' })] });
    vi.mocked(window.electronAPI.concertInit).mockResolvedValue(
      createConcertState({ layout })
    );
    await renderProvider();

    act(() => {
      latest.updateConcertSettings({ notes: 'changed' });
      latest.updateConcertStrips([
        { id: 's1', name: 'S', pluginId: 'p', path: 'p', role: 'instrument' },
      ]);
      latest.updateMappings([
        { id: 'm', source: { type: 'cc', channel: 0, controllerNumber: 1 } },
      ]);
    });
    expect(latest.concertSettings?.notes).toBe('changed');
    expect(latest.concertStrips).toHaveLength(1);
    expect(latest.mappings).toHaveLength(1);

    const added = createElement({ id: 'e2' });
    act(() => latest.addUIElement(added));
    expect(latest.layout?.elements.map((element) => element.id)).toEqual(['e1', 'e2']);
    expect(window.electronAPI.uiElementAdd).toHaveBeenCalledWith(added);

    act(() => latest.updateUIElement({ ...added, label: 'Updated' }));
    expect(latest.layout?.elements[1].label).toBe('Updated');

    act(() => latest.removeUIElement('e1'));
    expect(latest.layout?.elements.map((element) => element.id)).toEqual(['e2']);

    const next = createLayout({ tempo: 150, background: 'bg' });
    act(() => latest.setLayout(next));
    expect(latest.layout).toEqual(next);
    expect(window.electronAPI.layoutChange).toHaveBeenCalledWith(next);
  });

  it('creates presets and toggles panels', async () => {
    await renderProvider();
    const preset = latest.createPreset('Lead', 12);
    expect(preset).toMatchObject({
      name: 'Lead',
      programNumber: 12,
      midiChannel: 0,
      plugins: [],
      vstStates: {},
    });
    expect(preset.id).toMatch(/^preset_/);

    act(() => latest.togglePanel('midi'));
    expect(latest.isPanelOpen.midi).toBe(true);
    act(() => latest.togglePanel('midi'));
    expect(latest.isPanelOpen.midi).toBe(false);
  });
});

describe('AppProvider preset and concert actions', () => {
  it('saves a preset without layout geometry and updates the list', async () => {
    const preset = createPreset({ id: 'p1' });
    vi.mocked(window.electronAPI.concertInit).mockResolvedValue(
      createConcertState({
        patches: [preset],
        layout: createLayout({ elements: [createElement({ id: 'x', pluginId: 'plugin' })] }),
      })
    );
    vi.mocked(window.electronAPI.presetSave).mockResolvedValue(true);
    await renderProvider();

    let saved = false;
    await act(async () => {
      saved = await latest.savePreset(latest.presets[0]);
    });
    expect(saved).toBe(true);
    expect(window.electronAPI.presetSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p1',
        mappings: { x: { pluginId: 'plugin' } },
        layout: { elements: [], background: null, tempo: 120 },
      })
    );
  });

  it('loads a preset and applies tempo changes', async () => {
    const preset = createPreset({
      id: 'p1',
      programNumber: 4,
      changeTempoOnSelect: true,
      layout: createLayout({ tempo: 99 }),
    });
    vi.mocked(window.electronAPI.concertInit).mockResolvedValue(
      createConcertState({ patches: [preset] })
    );
    vi.mocked(window.electronAPI.presetLoad).mockResolvedValue(true);
    await renderProvider();

    let loaded = false;
    await act(async () => {
      loaded = await latest.loadPreset('p1');
    });
    expect(loaded).toBe(true);
    expect(latest.currentPreset?.id).toBe('p1');
    expect(latest.appStatus.tempo).toBe(99);
    expect(window.electronAPI.appStatusChange).toHaveBeenCalledWith({ tempo: 99 });
  });

  it('handles preset load failures and reports them', async () => {
    vi.mocked(window.electronAPI.presetLoad).mockRejectedValue(new Error('load failed'));
    vi.mocked(navigator.requestMIDIAccess).mockReturnValue(new Promise(() => undefined));
    await renderProvider();
    await act(async () => {
      await expect(latest.loadPreset('missing')).rejects.toThrow('load failed');
    });
    await waitFor(() => expect(latest.midiError).toBe('load failed'));
  });

  it('deletes presets and imports patches and sets', async () => {
    vi.mocked(window.electronAPI.presetDelete).mockResolvedValue(true);
    vi.mocked(window.electronAPI.patchImport).mockResolvedValue(
      createPreset({ id: 'imported' })
    );
    vi.mocked(window.electronAPI.setImport).mockResolvedValue({
      set: createSet({ id: 'imported-set' }),
      patches: [createPreset({ id: 'imported-patch', setId: 'imported-set' })],
    });
    await renderProvider();

    let deleted = false;
    await act(async () => {
      deleted = await latest.deletePreset('any');
    });
    expect(deleted).toBe(true);

    let imported: unknown;
    await act(async () => {
      imported = await latest.importPatch();
    });
    expect(imported).toMatchObject({ id: 'imported' });
    expect(latest.presets.map((item) => item.id)).toContain('imported');

    await act(async () => {
      imported = await latest.importSet();
    });
    expect(imported).toMatchObject({ set: { id: 'imported-set' } });
    expect(latest.sets.map((item) => item.id)).toContain('imported-set');
    expect(latest.presets.map((item) => item.id)).toContain('imported-patch');
  });

  it('chooses a new concert template', async () => {
    vi.mocked(window.electronAPI.concertNew).mockResolvedValue(
      createConcertState({ name: 'Novo', layout: createLayout({ tempo: 88 }) })
    );
    await renderProvider();
    await act(async () => {
      await latest.chooseTemplate('vazio');
    });
    expect(latest.concertName).toBe('Novo');
    expect(latest.layout?.tempo).toBe(88);
  });
});

describe('AppProvider MIDI and VST actions', () => {
  it('sends MIDI to the engine and to a selected output', async () => {
    await renderProvider();
    vi.mocked(window.electronAPI.engineMidi).mockResolvedValue(true);
    expect(await latest.sendMidiMessage([0x90, 60, 100])).toBe(true);
    expect(window.electronAPI.engineMidi).toHaveBeenCalledWith([0x90, 60, 100]);

    act(() => latest.sendMidiNote(60, 100, 2));
    await waitFor(() =>
      expect(window.electronAPI.engineMidi).toHaveBeenCalledWith([0x92, 60, 100])
    );
    act(() => latest.sendControlChange(7, 127, 1));
    await waitFor(() =>
      expect(window.electronAPI.engineMidi).toHaveBeenCalledWith([0xb1, 7, 127])
    );
  });

  it('subscribes and unsubscribes MIDI learn listeners', async () => {
    await renderProvider();
    const listener = vi.fn<(event: RawMidiEvent) => void>();
    const unsubscribe = latest.subscribeMidiLearn(listener);
    expect(unsubscribe).toBeTypeOf('function');
    unsubscribe();
  });

  it('scans, loads and manipulates VST plugins', async () => {
    const plugin = createPluginInfo();
    vi.mocked(window.electronAPI.vstScan).mockResolvedValue([plugin]);
    vi.mocked(window.electronAPI.vstLoad).mockResolvedValue(plugin);
    vi.mocked(window.electronAPI.vstUnload).mockResolvedValue(true);
    vi.mocked(window.electronAPI.vstSetParam).mockResolvedValue(true);
    await renderProvider();

    await act(async () => {
      expect(await latest.scanVstPlugins()).toHaveLength(1);
    });
    expect(latest.scannedPlugins).toHaveLength(1);

    await act(async () => {
      await latest.loadVstPlugin('C:/plugins/test.vst3', 'layer-1');
    });
    expect(latest.loadedPlugins).toHaveLength(1);

    await act(async () => {
      expect(await latest.setVstParameter('layer-1', 'param', 0.7)).toBe(true);
    });
    expect(window.electronAPI.vstSetParam).toHaveBeenCalledWith('layer-1', 'param', 0.7);

    await act(async () => {
      expect(await latest.unloadVstPlugin('plugin-1')).toBe(true);
    });
    expect(latest.loadedPlugins).toHaveLength(0);
  });

  it('reports scan and VST failures without throwing', async () => {
    vi.mocked(window.electronAPI.vstScan).mockRejectedValue(new Error('scan failed'));
    vi.mocked(window.electronAPI.vstLoad).mockRejectedValue(new Error('load failed'));
    await renderProvider();
    await act(async () => {
      expect(await latest.scanVstPlugins()).toEqual([]);
    });
    expect(latest.midiError).toBe('scan failed');
    await act(async () => {
      expect(await latest.loadVstPlugin('x')).toBeNull();
    });
    expect(latest.midiError).toBe('load failed');
  });
});

describe('AppProvider main-process events', () => {
  it('applies preset, layout, plugin and engine events', async () => {
    vi.mocked(window.electronAPI.concertInit).mockResolvedValue(
      createConcertState({ patches: [createPreset({ id: 'p1' })] })
    );
    await renderProvider();
    const patch = createPreset({ id: 'p2', name: 'Second' });

    act(() => {
      api().emit('onPresetList', [patch]);
      api().emit('onAppStatusChange', {
        isPlaying: true,
        currentPresetId: 'p2',
        currentProgramNumber: 1,
        tempo: 130,
        isMetronomeOn: true,
      });
      api().emit('onLayoutChange', createLayout({ tempo: 111 }));
    });
    expect(latest.presets).toEqual([patch]);
    expect(latest.appStatus.tempo).toBe(130);
    expect(latest.layout?.tempo).toBe(111);

    act(() => {
      api().emit('onPresetLoaded', { presetId: 'p2', programNumber: 1 });
    });
    expect(latest.currentPreset?.id).toBe('p2');

    act(() => {
      api().emit('onPluginLoaded', createPluginInfo({ layerId: 'l1' }));
      api().emit('onPluginLoaded', createPluginInfo({ layerId: 'l1', name: 'Updated' }));
    });
    expect(latest.loadedPlugins).toHaveLength(1);
    expect(latest.loadedPlugins[0].name).toBe('Updated');

    act(() => {
      api().emit('onParameterChanged', { layerId: 'l1', paramId: 'p', value: 0.9 });
    });
    expect(latest.loadedPlugins[0].parameters).toEqual([]);

    act(() => {
      api().emit('onEngineCrashed', { message: 'engine down' });
    });
    expect(latest.engineError).toBe('engine down');

    act(() => {
      api().emit('onEngineRecovered');
    });
    await waitFor(() => expect(latest.engineError).toBeNull());

    act(() => {
      api().emit('onPluginUnloaded', 'l1');
    });
    expect(latest.loadedPlugins).toHaveLength(0);
  });

  it('opens the template picker from the menu and handles open/save actions', async () => {
    vi.mocked(window.electronAPI.concertTemplates).mockResolvedValue([]);
    vi.mocked(window.electronAPI.concertOpen).mockResolvedValue(
      createConcertState({ name: 'Opened' })
    );
    vi.mocked(window.electronAPI.concertSave).mockResolvedValue(
      createConcertState({ path: 'C:/saved.preseter', dirty: false })
    );
    await renderProvider();

    await act(async () => api().emit('onMenuAction', { action: 'new' }));
    expect(latest.templatePickerOpen).toBe(true);
    act(() => latest.cancelTemplatePicker());
    expect(latest.templatePickerOpen).toBe(false);

    await act(async () => api().emit('onMenuAction', { action: 'open' }));
    expect(latest.concertName).toBe('Opened');

    await act(async () => api().emit('onMenuAction', { action: 'save' }));
    expect(latest.concertPath).toBe('C:/saved.preseter');
  });
});
