import React, { useEffect, useState } from 'react';
import type { ScrollSpeed } from '@shared/types';
import { useAppContext } from '../../context/AppContext';

export type SettingsTab = 'midi' | 'vst' | 'audio' | 'general' | 'view';

interface SettingsModalProps {
  initialTab: SettingsTab;
  onClose: () => void;
}

/** Modal central de configurações em estilo hardware navy — MIDI/VST moram aqui. */
export const SettingsModal: React.FC<SettingsModalProps> = ({ initialTab, onClose }) => {
  const {
    midiDevices, midiError, midiLastMessage, openMidiInputs, selectedMidiOutputId, listMidiDevices, openMidiPort,
    scannedPlugins, loadedPlugins, scanVstPlugins, addVstPluginFolder, removeVstPluginFolder,
    loadVstPlugin, unloadVstPlugin, setVstParameter,
    audioDevices, audioSettings, refreshAudioSettings, startAudio, stopAudio,
    preferences, updatePreferences, layout,
  } = useAppContext();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [scanning, setScanning] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [audioType, setAudioType] = useState('');
  const [audioInput, setAudioInput] = useState('');
  const [audioOutput, setAudioOutput] = useState('');
  const [sampleRate, setSampleRate] = useState(48000);
  const [bufferSize, setBufferSize] = useState(512);
  const [audioOutputPairs, setAudioOutputPairs] = useState(1);
  const [audioBusy, setAudioBusy] = useState(false);

  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    if (tab === 'audio') void refreshAudioSettings();
  }, [tab, refreshAudioSettings]);
  useEffect(() => {
    if (!audioDevices) return;
    // Ao trocar o driver, não pré-selecionamos o primeiro dispositivo:
    // deixar o usuário escolher. Se há tipo salvo, usa ele; senão vazio.
    const savedType = audioSettings?.type ?? audioDevices.current?.type ?? '';
    setAudioType(savedType);
    // Não pré-selecionar entrada/saída: deixar vazio para o usuário escolher.
    const type = savedType ? audioDevices.audioTypes.find((item) => item.type === savedType) : null;
    setAudioInput('');
    setAudioOutput('');
    setSampleRate(audioSettings?.sampleRate ?? audioDevices.current?.sampleRate ?? 48000);
    setBufferSize(audioSettings?.bufferSize ?? audioDevices.current?.bufferSize ?? 512);
    const channels = audioSettings?.outputs ?? audioDevices.current?.outputChannels ?? 2;
    setAudioOutputPairs(Math.max(1, Math.min(4, Math.ceil(channels / 2))));
  }, [audioDevices, audioSettings]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inputs = midiDevices.filter((d) => d.type === 'input');
  const outputs = midiDevices.filter((d) => d.type === 'output');
  const lcdText = tab === 'midi'
    ? `MIDI · ${inputs.length + outputs.length} disp`
    : tab === 'vst'
      ? `VST · ${loadedPlugins.length} layers`
      : tab === 'general'
        ? 'Geral'
        : tab === 'view'
          ? 'Visualização'
          : `Áudio · ${audioDevices?.running ? 'Ativo' : 'Parado'}`;
  const selectedAudioType = audioDevices?.audioTypes.find((item) => item.type === audioType);
  const asioAvailable = audioDevices?.asioSupported === true;
  const asioDriverAvailable = audioDevices?.asioDriverAvailable === true;

  const accentBtn: React.CSSProperties = {
    background: '#0A84FF',
    color: '#FFFFFF',
    border: '1px solid #0A84FF',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="hw-panel flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-4">
          <div>
            <div className="hw-label">Configurações</div>
            <div className="text-sm font-semibold" style={{ color: '#EDEDEF' }}>MIDI e plugins VST</div>
          </div>
          <div className="hw-lcd ml-auto px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wide">
            {lcdText}
          </div>
          <button
            onClick={onClose}
            className="hw-squarebtn px-2.5 py-1 text-sm"
            style={{ color: '#EDEDEF' }}
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="mx-5 mt-3 flex items-center gap-2">
          <button
            onClick={() => setTab('general')}
            className="hw-squarebtn flex-1 px-4 py-1.5 text-xs font-medium"
            style={tab === 'general'
              ? { background: '#1F1F21', color: '#fff', borderColor: '#0A84FF' }
              : { color: '#9A9AA0' }}
          >
            Geral
          </button>
          <button
            onClick={() => setTab('view')}
            className="hw-squarebtn flex-1 px-4 py-1.5 text-xs font-medium"
            style={tab === 'view'
              ? { background: '#1F1F21', color: '#fff', borderColor: '#0A84FF' }
              : { color: '#9A9AA0' }}
          >
            View
          </button>
          <button
            onClick={() => setTab('midi')}
            className="hw-squarebtn flex-1 px-4 py-1.5 text-xs font-medium"
            style={tab === 'midi'
              ? { background: '#1F1F21', color: '#fff', borderColor: '#0A84FF' }
              : { color: '#9A9AA0' }}
          >
            Dispositivos MIDI
          </button>
          <button
            onClick={() => setTab('vst')}
            className="hw-squarebtn flex-1 px-4 py-1.5 text-xs font-medium"
            style={tab === 'vst'
              ? { background: '#1F1F21', color: '#fff', borderColor: '#0A84FF' }
              : { color: '#9A9AA0' }}
          >
            Plugins VST
          </button>
          <button
            onClick={() => setTab('audio')}
            className="hw-squarebtn flex-1 px-4 py-1.5 text-xs font-medium"
            style={tab === 'audio'
              ? { background: '#1F1F21', color: '#fff', borderColor: '#0A84FF' }
              : { color: '#9A9AA0' }}
          >
            Áudio
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'general' && (
            <div className="space-y-4">
              <section className="hw-inset space-y-3 p-3">
                <h4 className="hw-label">Troca de patch</h4>
                <label className="flex cursor-pointer items-start gap-3 text-xs" style={{ color: '#C6C6CB' }}>
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    style={{ accentColor: '#0A84FF' }}
                    checked={preferences?.silencePreviousPatch ?? false}
                    onChange={(event) => void updatePreferences({ silencePreviousPatch: event.target.checked })}
                  />
                  <span>
                    <span className="font-semibold text-white">Silence Previous Patch</span>
                    <span className="mt-0.5 block" style={{ color: '#9A9AA0' }}>
                      Corta o patch anterior assim que você troca. Desligado (padrão), as caudas do patch anterior continuam soando até o fim.
                    </span>
                  </span>
                </label>
              </section>
            </div>
          )}
          {tab === 'audio' && (
            <div className="space-y-4">
              {midiError && (
                <div className="rounded-xl border border-red-800 bg-red-950/60 px-3 py-2 text-xs text-red-200">
                  {midiError}
                </div>
              )}
              <section className="hw-inset space-y-3 p-3">
                <h4 className="hw-label">Dispositivo ativo</h4>
                {audioDevices?.current ? (
                  <p className="text-xs text-slate-200">
                    {audioDevices.current.type} · {audioDevices.current.name} · {audioDevices.current.sampleRate} Hz · buffer {audioDevices.current.bufferSize}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: '#9A9AA0' }}>Nenhum dispositivo de áudio ativo.</p>
                )}
                <label className="block text-xs" style={{ color: '#9A9AA0' }}>
                  Driver / tipo
                  <select
                    value={audioType}
                    onChange={(event) => {
                      setAudioType(event.target.value);
                      // Ao trocar o driver não pré-selecionamos o primeiro dispositivo:
                      // o usuário escolhe. Sem entrada escolhida aplicamos inputs: 0.
                      setAudioInput('');
                      setAudioOutput('');
                    }}
                    className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100"
                  >
                    <option value="">Selecione o driver</option>
                    {audioDevices?.audioTypes.map((item) => (
                      <option key={item.type} value={item.type}>{item.type}</option>
                    ))}
                  </select>
                </label>
                {!asioAvailable && (
                  <p className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                    <strong className="block">ASIO não está ativo nesta compilação.</strong>
                    {audioDevices?.asioUnavailableReason ?? 'Este engine foi compilado sem o backend ASIO.'}
                    {' '}Para ativá-lo, instale o ASIO SDK da Steinberg e recompile com PRESETER_ENABLE_ASIO=ON e PRESETER_ASIO_SDK_DIR apontando para o SDK. O SDK deve ser obtido e licenciado separadamente. Os drivers listados acima continuam disponíveis sem ASIO.
                  </p>
                )}
                {asioAvailable && (
                  asioDriverAvailable ? (
                    <p className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-2 text-[11px] text-emerald-200">
                      Backend ASIO habilitado e driver encontrado. Selecione ASIO em Driver / tipo para escolher o dispositivo.
                    </p>
                  ) : (
                    <p className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                      Backend ASIO habilitado, mas nenhum driver ASIO foi encontrado. Instale o driver ASIO do dispositivo de áudio; os outros drivers continuam disponíveis.
                    </p>
                  )
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs" style={{ color: '#9A9AA0' }}>
                    Entrada
                    <select
                      value={audioInput}
                      onChange={(event) => setAudioInput(event.target.value)}
                      className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100"
                    >
                      <option value="">Sem entrada</option>
                      {selectedAudioType?.inputs.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs" style={{ color: '#9A9AA0' }}>
                    Saída
                    <select
                      value={audioOutput}
                      onChange={(event) => setAudioOutput(event.target.value)}
                      className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100"
                    >
                      <option value="">Saída padrão</option>
                      {selectedAudioType?.outputs.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs" style={{ color: '#9A9AA0' }}>
                    Taxa de amostragem
                    <select value={sampleRate} onChange={(event) => setSampleRate(Number(event.target.value))} className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100">
                      {[44100, 48000, 88200, 96000, 176400, 192000].map((rate) => <option key={rate} value={rate}>{rate} Hz</option>)}
                    </select>
                  </label>
                  <label className="block text-xs" style={{ color: '#9A9AA0' }}>
                    Tamanho do buffer
                    <select value={bufferSize} onChange={(event) => setBufferSize(Number(event.target.value))} className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100">
                      {[64, 128, 256, 480, 512, 1024, 2048].map((size) => <option key={size} value={size}>{size} samples</option>)}
                    </select>
                  </label>
                </div>
                <label className="block text-xs" style={{ color: '#9A9AA0' }}>
                  Saídas estéreo
                  <select
                    value={audioOutputPairs}
                    onChange={(event) => setAudioOutputPairs(Math.max(1, Math.min(4, Number(event.target.value) || 1)))}
                    className="hw-inset mt-1 w-full px-2 py-2 text-xs text-slate-100"
                  >
                    {[1, 2, 3, 4].map((pairs) => (
                      <option key={pairs} value={pairs}>
                        {pairs} par{pairs > 1 ? 'es' : ''} · {pairs * 2} canais
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[10px]" style={{ color: '#8E8E93' }}>
                  Cada par = 2 canais. No Edit, outputs extras só aparecem quando usados ou configurados.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setAudioBusy(true);
                      const started = await startAudio({
                        type: audioType || undefined,
                        input: audioInput || undefined,
                        output: audioOutput || undefined,
                        inputs: audioInput ? 2 : 0,
                        outputs: audioOutputPairs * 2,
                        sampleRate,
                        bufferSize,
                      });
                      if (!started) {
                        const channels = audioSettings?.outputs ?? audioDevices?.current?.outputChannels ?? 2;
                        setAudioOutputPairs(Math.max(1, Math.min(4, Math.ceil(channels / 2))));
                      }
                      setAudioBusy(false);
                    }}
                    disabled={audioBusy}
                    className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    style={accentBtn}
                  >
                    {audioBusy ? 'Aplicando…' : 'Aplicar e iniciar áudio'}
                  </button>
                  <button
                    onClick={async () => {
                      setAudioBusy(true);
                      await stopAudio();
                      setAudioBusy(false);
                    }}
                    disabled={audioBusy || !audioDevices?.running}
                    className="hw-squarebtn px-3 py-2 text-xs disabled:opacity-50"
                    style={{ color: '#EDEDEF' }}
                  >
                    Parar
                  </button>
                </div>
                <p className="text-[10px]" style={{ color: '#8E8E93' }}>
                  As preferências são salvas e reaplicadas quando o Preseter abre.
                </p>
              </section>
            </div>
          )}

          {tab === 'view' && (
            <div className="space-y-4">
              <section className="hw-inset space-y-3 p-3">
                <h4 className="hw-label">Layout do concert</h4>
                <p className="text-xs" style={{ color: '#C6C6CB' }}>
                  {layout?.elements.length ?? 0} controle(s) no workspace. O layout é compartilhado por todos os patches.
                </p>
                <p className="text-[11px]" style={{ color: '#8E8E93' }}>
                  Cmd/Ctrl+1 Layout · 2 Edit · 3 Perform · 4 Perform em tela cheia.
                  Cmd/Ctrl+F abre a Patch Library; Shift+Cmd/Ctrl+M abre Assignments &amp; Mappings.
                </p>
                <button
                  className="hw-squarebtn px-3 py-1.5 text-xs"
                  onClick={() => { void window.electronAPI.windowSetFullscreen(true); onClose(); }}
                >
                  Entrar em tela cheia
                </button>
              </section>
              <section className="hw-inset space-y-3 p-3">
                <h4 className="hw-label">Velocidade do scroll</h4>
                <p className="text-[11px]" style={{ color: '#8E8E93' }}>
                  Afeta listas e menus do Preseter. Menus nativos do Windows não mudam.
                </p>
                <select
                  value={preferences?.scrollSpeed ?? 'slow'}
                  onChange={(event) => void updatePreferences({ scrollSpeed: event.target.value as ScrollSpeed })}
                  className="hw-inset w-full px-2 py-2 text-xs text-slate-100"
                >
                  <option value="normal">Normal (nativo)</option>
                  <option value="slow">Lenta (0,5×)</option>
                  <option value="slower">Muito lenta (0,35×)</option>
                </select>
              </section>
            </div>
          )}
          {tab === 'midi' && (
            <div className="space-y-4">
              {midiError && (
                <div className="rounded-xl border border-red-800 bg-red-950/60 px-3 py-2 text-xs text-red-200">
                  {midiError}
                </div>
              )}
              <section>
                <h4 className="hw-label mb-2">Entradas ({inputs.length})</h4>
                <div className="space-y-1.5">
                  {inputs.length === 0 && <p className="text-xs" style={{ color: '#9A9AA0' }}>Nenhuma entrada encontrada. Clique em atualizar.</p>}
                  {inputs.map((d) => {
                    const connected = openMidiInputs.has(d.id);
                    return (
                      <div key={d.id} className="hw-inset flex items-center gap-2 px-3 py-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: connected ? '#30D158' : '#636366' }} />
                        <span className="min-w-0 flex-1 truncate text-xs" style={{ color: '#EDEDEF' }} title={d.name}>{d.name}</span>
                        <button
                          onClick={() => void openMidiPort(d.id, 'input')}
                          disabled={connected}
                          className="rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:brightness-110 disabled:cursor-default"
                          style={connected
                            ? { background: 'rgba(48,209,88,0.14)', color: '#30D158', border: '1px solid rgba(48,209,88,0.45)' }
                            : accentBtn}
                        >
                          {connected ? 'Conectado' : 'Conectar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px]" style={{ color: '#8E8E93' }}>
                  As entradas são abertas automaticamente para tocar e usar o MIDI Learn.
                </p>
              </section>
              <section>
                <h4 className="hw-label mb-2">Saídas ({outputs.length})</h4>
                <div className="space-y-1.5">
                  {outputs.length === 0 && <p className="text-xs" style={{ color: '#9A9AA0' }}>Nenhuma saída encontrada.</p>}
                  {outputs.map((d) => {
                    const selected = selectedMidiOutputId === d.id;
                    return (
                      <div key={d.id} className="hw-inset flex items-center gap-2 px-3 py-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: selected ? '#30D158' : '#636366' }} />
                        <span className="min-w-0 flex-1 truncate text-xs" style={{ color: '#EDEDEF' }} title={d.name}>{d.name}</span>
                        <button
                          onClick={() => void openMidiPort(d.id, 'output')}
                          className="rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:brightness-110"
                          style={selected
                            ? { background: 'rgba(48,209,88,0.14)', color: '#30D158', border: '1px solid rgba(48,209,88,0.45)' }
                            : accentBtn}
                        >
                          {selected ? 'Selecionado' : 'Conectar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px]" style={{ color: '#8E8E93' }}>
                  A saída serve para enviar Program Change ao controlador.
                </p>
              </section>
              <section>
                <h4 className="hw-label mb-2">Monitor</h4>
                <div className="hw-lcd p-3 font-mono text-xs" style={{ color: '#E5E5EA' }}>
                  {midiLastMessage || 'Aguardando mensagens MIDI…'}
                </div>
              </section>
              <button
                onClick={() => void listMidiDevices()}
                className="hw-squarebtn w-full px-3 py-2 text-xs font-medium"
                style={{ color: '#EDEDEF' }}
              >
                Atualizar dispositivos
              </button>
            </div>
          )}

          {tab === 'vst' && (
            <div className="space-y-4">
              {midiError && (
                <div className="rounded-xl border border-red-800 bg-red-950/60 px-3 py-2 text-xs text-red-200">
                  {midiError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setScanning(true); void scanVstPlugins().finally(() => setScanning(false)); }}
                  disabled={scanning}
                  className="rounded-lg px-3 py-2 text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                  style={accentBtn}
                >
                  {scanning ? 'Escaneando…' : 'Escanear plugins'}
                </button>
                <button
                  onClick={() => { setScanning(true); void addVstPluginFolder().finally(() => setScanning(false)); }}
                  disabled={scanning}
                  className="hw-squarebtn rounded-lg px-3 py-2 text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                >
                  Adicionar pasta de plugins
                </button>
              </div>
              <section>
                <h4 className="hw-label mb-2">Pastas de plugins</h4>
                <div className="space-y-1.5">
                  {(preferences?.pluginFolders ?? []).length === 0 && (
                    <p className="text-xs" style={{ color: '#9A9AA0' }}>
                      Nenhuma pasta extra. Use “Adicionar pasta” para plugins VST2/VST3 fora dos diretórios padrão.
                    </p>
                  )}
                  {(preferences?.pluginFolders ?? []).map((folder) => (
                    <div key={folder} className="hw-inset flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: '#D1D1D6' }} title={folder}>{folder}</span>
                      <button
                        onClick={() => void removeVstPluginFolder(folder)}
                        className="rounded px-1.5 text-xs hover:text-red-300"
                        style={{ color: '#9A9AA0' }}
                        title="Remover pasta"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h4 className="hw-label mb-2">Disponíveis ({scannedPlugins.length})</h4>
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {scannedPlugins.length === 0 && <p className="text-xs" style={{ color: '#9A9AA0' }}>Nenhum plugin ainda. O app escaneia os diretórios VST3 e as pastas adicionadas automaticamente ao iniciar; aguarde ou clique em Escanear plugins.</p>}
                  {scannedPlugins.map((p) => {
                    const loadedCount = loadedPlugins.filter((l) => l.id === p.id).length;
                    return (
                      <div key={p.id} className="hw-inset flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium" style={{ color: '#EDEDEF' }}>{p.name}</div>
                          <div className="text-[10px]" style={{ color: p.arch === 'x86' ? '#FF9F0A' : '#9A9AA0' }}>
                            {p.isInstrument ? 'Instrumento' : 'Efeito'} · {p.format ?? 'VST3'}
                            {p.arch === 'x86' ? ' · 32-bit (não suportado)' : ''}
                          </div>
                        </div>
                        {loadedCount > 0
                          ? <span className="rounded-lg px-2 py-1 text-[10px] font-semibold" style={{ background: 'rgba(10,132,255,0.18)', color: '#0A84FF', border: '1px solid #0A84FF' }}>{loadedCount} carregado(s)</span>
                          : <button
                              onClick={() => void loadVstPlugin(p.path)}
                              disabled={p.arch === 'x86'}
                              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:brightness-110 disabled:opacity-40"
                              style={accentBtn}
                              title={p.arch === 'x86' ? 'Plugin 32-bit: precisa de uma bridge 32-bit' : undefined}
                            >Carregar</button>}
                      </div>
                    );
                  })}
                </div>
              </section>
              <section>
                <h4 className="hw-label mb-2">Carregados ({loadedPlugins.length})</h4>
                <div className="space-y-1.5">
                  {loadedPlugins.map((p) => {
                    const layerId = p.layerId ?? p.id;
                    const open = activeLayerId === layerId;
                    return (
                      <div key={layerId} className="hw-inset overflow-hidden">
                        <div className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={() => setActiveLayerId(open ? null : layerId)}>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: '#EDEDEF' }}>{p.name}</span>
                          <span className="text-[10px]" style={{ color: '#9A9AA0' }}>{open ? '▾' : '▸'}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); void unloadVstPlugin(layerId); }}
                            className="rounded px-1.5 text-xs hover:text-red-300"
                            style={{ color: '#9A9AA0' }}
                            title="Descarregar"
                          >
                            ✕
                          </button>
                        </div>
                        {open && (
                          <div className="space-y-2 border-t px-3 py-2" style={{ borderColor: '#3A3A3C' }}>
                            {p.parameters.length === 0 && <p className="text-[11px]" style={{ color: '#9A9AA0' }}>Sem parâmetros expostos.</p>}
                            {p.parameters.map((param) => (
                              <div key={param.id}>
                                <div className="mb-0.5 flex justify-between text-[11px]">
                                  <span style={{ color: '#9A9AA0' }}>{param.name}</span>
                                  <span className="hw-badge tabular-nums" style={{ fontSize: 10 }}>{param.value.toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min={param.minValue}
                                  max={param.maxValue}
                                  step={(param.maxValue - param.minValue) / 100}
                                  value={param.value}
                                  onChange={(e) => void setVstParameter(layerId, param.id, parseFloat(e.target.value))}
                                  className="w-full"
                                  style={{ accentColor: '#0A84FF' }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
