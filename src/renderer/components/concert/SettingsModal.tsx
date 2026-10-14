import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../context/AppContext';

export type SettingsTab = 'midi' | 'vst';

interface SettingsModalProps {
  initialTab: SettingsTab;
  onClose: () => void;
}

/** Modal central de configurações em estilo hardware navy — MIDI/VST moram aqui. */
export const SettingsModal: React.FC<SettingsModalProps> = ({ initialTab, onClose }) => {
  const {
    midiDevices, midiError, midiLastMessage, listMidiDevices, openMidiPort,
    scannedPlugins, loadedPlugins, scanVstPlugins, loadVstPlugin, unloadVstPlugin, setVstParameter,
  } = useAppContext();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [scanning, setScanning] = useState(false);
  const [activePluginId, setActivePluginId] = useState<string | null>(null);

  useEffect(() => setTab(initialTab), [initialTab]);
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
    : `VST · ${loadedPlugins.length} plugins`;

  const accentBtn: React.CSSProperties = {
    background: '#2DFF6A',
    color: '#0B120C',
    border: '1px solid #2DFF6A',
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
            onClick={() => setTab('midi')}
            className="hw-squarebtn flex-1 px-4 py-1.5 text-xs font-medium"
            style={tab === 'midi'
              ? { background: '#131316', color: '#fff', borderColor: '#2DFF6A' }
              : { color: '#9A9AA0' }}
          >
            Dispositivos MIDI
          </button>
          <button
            onClick={() => setTab('vst')}
            className="hw-squarebtn flex-1 px-4 py-1.5 text-xs font-medium"
            style={tab === 'vst'
              ? { background: '#131316', color: '#fff', borderColor: '#2DFF6A' }
              : { color: '#9A9AA0' }}
          >
            Plugins VST
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
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
                  {inputs.map((d) => (
                    <div key={d.id} className="hw-inset flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs" style={{ color: '#EDEDEF' }} title={d.name}>{d.name}</span>
                      <button
                        onClick={() => void openMidiPort(d.id, 'input')}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:brightness-110"
                        style={accentBtn}
                      >
                        Conectar
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h4 className="hw-label mb-2">Saídas ({outputs.length})</h4>
                <div className="space-y-1.5">
                  {outputs.length === 0 && <p className="text-xs" style={{ color: '#9A9AA0' }}>Nenhuma saída encontrada.</p>}
                  {outputs.map((d) => (
                    <div key={d.id} className="hw-inset flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs" style={{ color: '#EDEDEF' }} title={d.name}>{d.name}</span>
                      <button
                        onClick={() => void openMidiPort(d.id, 'output')}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:brightness-110"
                        style={accentBtn}
                      >
                        Conectar
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h4 className="hw-label mb-2">Monitor</h4>
                <div className="hw-lcd p-3 font-mono text-xs" style={{ color: '#1C241A' }}>
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
              <button
                onClick={() => { setScanning(true); void scanVstPlugins().finally(() => setScanning(false)); }}
                disabled={scanning}
                className="w-full rounded-lg px-3 py-2 text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                style={accentBtn}
              >
                {scanning ? 'Escaneando…' : 'Escanear plugins VST3'}
              </button>
              <section>
                <h4 className="hw-label mb-2">Disponíveis ({scannedPlugins.length})</h4>
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {scannedPlugins.length === 0 && <p className="text-xs" style={{ color: '#9A9AA0' }}>Nenhum plugin. Escaneie os diretórios VST3.</p>}
                  {scannedPlugins.map((p) => {
                    const loaded = loadedPlugins.some((l) => l.id === p.id);
                    return (
                      <div key={p.id} className="hw-inset flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium" style={{ color: '#EDEDEF' }}>{p.name}</div>
                          <div className="text-[10px]" style={{ color: '#9A9AA0' }}>{p.isInstrument ? 'Instrumento' : 'Efeito'}</div>
                        </div>
                        {loaded
                          ? <span className="rounded-lg px-2 py-1 text-[10px] font-semibold" style={{ background: 'rgba(45,255,106,0.18)', color: '#2DFF6A', border: '1px solid #2DFF6A' }}>Carregado</span>
                          : <button onClick={() => void loadVstPlugin(p.path)} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:brightness-110" style={accentBtn}>Carregar</button>}
                      </div>
                    );
                  })}
                </div>
              </section>
              <section>
                <h4 className="hw-label mb-2">Carregados ({loadedPlugins.length})</h4>
                <div className="space-y-1.5">
                  {loadedPlugins.map((p) => {
                    const open = activePluginId === p.id;
                    return (
                      <div key={p.id} className="hw-inset overflow-hidden">
                        <div className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={() => setActivePluginId(open ? null : p.id)}>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: '#EDEDEF' }}>{p.name}</span>
                          <span className="text-[10px]" style={{ color: '#9A9AA0' }}>{open ? '▾' : '▸'}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); void unloadVstPlugin(p.id); }}
                            className="rounded px-1.5 text-xs hover:text-red-300"
                            style={{ color: '#9A9AA0' }}
                            title="Descarregar"
                          >
                            ✕
                          </button>
                        </div>
                        {open && (
                          <div className="space-y-2 border-t px-3 py-2" style={{ borderColor: '#2E2E34' }}>
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
                                  onChange={(e) => void setVstParameter(p.id, param.id, parseFloat(e.target.value))}
                                  className="w-full"
                                  style={{ accentColor: '#2DFF6A' }}
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
