import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_STORE_SOURCES_TEXT,
  type StoreSourcesState,
} from '@shared/store-sources';
import type { StoreItemView, StoreSnapshot, StoreOs } from '@shared/store';

interface StoreAddressesProps {
  snapshot: StoreSnapshot | null;
  onSnapshot: (snapshot: StoreSnapshot) => void;
}

interface AddressRowProps {
  item: StoreItemView;
  onSaved: (snapshot: StoreSnapshot) => void;
}

const AddressRow: React.FC<AddressRowProps> = ({ item, onSaved }) => {
  const [page, setPage] = useState(item.page ?? item.variant?.page ?? '');
  const [os, setOs] = useState<StoreOs>(item.variant?.os ?? item.variants[0]?.os ?? 'windows');
  const variant = item.variants.find((entry) => entry.os === os) ?? item.variants[0];
  const [url, setUrl] = useState(variant?.url ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPage(item.page ?? item.variant?.page ?? '');
    const next = item.variants.find((entry) => entry.os === os) ?? item.variants[0];
    setUrl(next?.url ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.page, item.variant?.page, item.variants]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.electronAPI.storeAddressSet({
        itemId: item.id,
        page,
        ...(url.trim() ? { os, url } : {}),
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Endereço inválido.');
        return;
      }
      onSaved(result.snapshot);
      setMessage('Salvo.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Falha ao salvar o endereço.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-2" style={{ borderColor: '#2C2C2E', background: 'rgba(15,17,19,0.45)' }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-[11px] font-semibold text-white">{item.name}</span>
        <span className="rounded px-1 py-0.5 text-[8px]" style={{ background: 'rgba(255,255,255,0.06)', color: '#9A9AA0' }}>
          {item.catalogSource ?? 'main'}
        </span>
        <span className="text-[9px]" style={{ color: '#6E6E73' }}>{item.author}</span>
        {message && (
          <span className="ml-auto text-[9px]" style={{ color: message === 'Salvo.' ? '#30D158' : '#FF9F0A' }}>
            {message}
          </span>
        )}
      </div>
      <div className="mt-1 grid gap-1 lg:grid-cols-[minmax(0,1fr)_70px_minmax(0,1fr)_auto]">
        <label className="min-w-0 text-[9px]" style={{ color: '#8E8E93' }}>
          Página oficial
          <input
            className="hw-inset mt-0.5 w-full px-2 py-1 text-[10px] text-slate-100"
            value={page}
            onChange={(event) => setPage(event.target.value)}
            placeholder="https://…"
            aria-label={`Página oficial de ${item.name}`}
          />
        </label>
        <label className="text-[9px]" style={{ color: '#8E8E93' }}>
          Sistema
          <select
            className="hw-inset mt-0.5 w-full px-1 py-1 text-[10px] text-slate-100"
            value={os}
            onChange={(event) => {
              const nextOs = event.target.value as StoreOs;
              setOs(nextOs);
              const next = item.variants.find((entry) => entry.os === nextOs);
              setUrl(next?.url ?? '');
            }}
            aria-label={`Sistema do endereço de ${item.name}`}
          >
            {item.variants.map((entry) => (
              <option key={entry.os} value={entry.os}>
                {entry.os === 'windows' ? 'Win' : entry.os === 'mac' ? 'Mac' : 'Linux'}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-[9px]" style={{ color: '#8E8E93' }}>
          Endereço de download
          <input
            className="hw-inset mt-0.5 w-full px-2 py-1 text-[10px] text-slate-100"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://… (opcional)"
            aria-label={`Endereço de download de ${item.name}`}
          />
        </label>
        <button
          type="button"
          className="hw-squarebtn self-end px-2 py-1 text-[10px] disabled:opacity-40"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? '…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
};

/** Aba "Endereços": edita o sources.list e cada URL de plugin/sample. */
export const StoreAddresses: React.FC<StoreAddressesProps> = ({ snapshot, onSnapshot }) => {
  const [state, setState] = useState<StoreSourcesState | null>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await window.electronAPI.storeSourcesGet();
      setState(next);
      setText(next.text);
      setIssues([]);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Falha ao ler as fontes.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSources = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await window.electronAPI.storeSourcesSet(text);
      setState(result.state);
      setText(result.state.text);
      setIssues(result.issues);
      onSnapshot(result.snapshot);
      setNotice(result.ok ? 'Fontes salvas e catálogo recarregado.' : 'Corrija as linhas indicadas.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Falha ao salvar as fontes.');
    } finally {
      setBusy(false);
    }
  };

  const resetAddresses = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await window.electronAPI.storeAddressesReset();
      onSnapshot(result.snapshot);
      setNotice('Endereços restaurados para os valores do catálogo.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Falha ao restaurar os endereços.');
    } finally {
      setBusy(false);
    }
  };

  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = snapshot?.items ?? [];
    if (!term) return list;
    return list.filter((item) =>
      `${item.name} ${item.author} ${item.category} ${item.catalogSource ?? ''}`
        .toLowerCase()
        .includes(term)
    );
  }, [snapshot, query]);

  const localCount = state?.sources.filter((source) => source.local).length ?? 0;
  const remoteCount = (state?.sources.length ?? 0) - localCount;

  return (
    <div className="space-y-3">
      <section className="hw-inset space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="hw-label">Fontes da Loja</h4>
            <p className="mt-1 text-[11px]" style={{ color: '#9A9AA0' }}>
              Arquivo no estilo <code>sources.list</code>: uma fonte por linha no
              formato <code>&lt;id&gt; &lt;endereço&gt;</code>. Use <code>#</code> no
              início para desativar uma fonte.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: '#6E6E73' }}>
            <span>{remoteCount} remota(s)</span>
            <span>·</span>
            <span>{localCount} local(is)</span>
          </div>
        </div>
        <textarea
          className="hw-inset min-h-[104px] w-full px-2 py-1.5 font-mono text-[10px] text-slate-100"
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          aria-label="Fontes da Loja no formato sources.list"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="hw-squarebtn px-3 py-1.5 text-[10px] disabled:opacity-40"
            onClick={() => void saveSources()}
            disabled={busy}
          >
            {busy ? 'Salvando…' : 'Salvar fontes'}
          </button>
          <button
            type="button"
            className="hw-squarebtn px-3 py-1.5 text-[10px]"
            onClick={() => { setText(DEFAULT_STORE_SOURCES_TEXT); setIssues([]); }}
          >
            Restaurar padrão
          </button>
          <button
            type="button"
            className="hw-squarebtn px-3 py-1.5 text-[10px]"
            onClick={() => void refresh()}
          >
            Recarregar
          </button>
          <span className="truncate text-[9px]" style={{ color: '#6E6E73' }} title={state?.path}>
            {state?.path ?? '—'}
          </span>
        </div>
        {state && (
          <div className="flex flex-wrap gap-1.5">
            {state.sources.map((source) => (
              <span
                key={source.id}
                className="rounded px-2 py-1 text-[9px]"
                style={{
                  background: source.error
                    ? 'rgba(255,85,77,0.12)'
                    : source.local
                      ? 'rgba(48,209,88,0.12)'
                      : 'rgba(10,132,255,0.12)',
                  color: source.error ? '#FF8A8A' : source.local ? '#30D158' : '#7FB6FF',
                }}
                title={source.error ?? source.url}
              >
                {source.enabled ? '' : '○ '}{source.id} · {source.itemCount} itens
              </span>
            ))}
          </div>
        )}
        {issues.length > 0 && (
          <div className="rounded px-2 py-1 text-[10px]" style={{ background: '#3A1417', color: '#FF8A8A' }}>
            {issues.map((issue) => <div key={issue}>{issue}</div>)}
          </div>
        )}
        {notice && (
          <div className="rounded px-2 py-1 text-[10px]" style={{ background: '#14243A', color: '#CFE5FF' }}>
            {notice}
          </div>
        )}
      </section>

      <section className="hw-inset space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h4 className="hw-label">Endereços de plugins e samples</h4>
            <p className="text-[10px]" style={{ color: '#6E6E73' }}>
              Edite a página oficial e o link de download de cada item. Links de
              download exigem HTTPS de um host oficial.
            </p>
          </div>
          <input
            className="hw-inset w-48 px-2 py-1 text-[10px] text-slate-100"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar itens…"
            aria-label="Filtrar endereços"
          />
          <button
            type="button"
            className="hw-squarebtn px-2 py-1 text-[10px]"
            onClick={() => void resetAddresses()}
            disabled={busy}
          >
            Restaurar endereços
          </button>
        </div>
        <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {items.length === 0 && (
            <p className="text-[10px]" style={{ color: '#9A9AA0' }}>Nenhum item para mostrar.</p>
          )}
          {items.map((item) => (
            <AddressRow key={item.id} item={item} onSaved={onSnapshot} />
          ))}
        </div>
        {state && (
          <p className="truncate text-[9px]" style={{ color: '#6E6E73' }} title={state.addressesPath}>
            Endereços salvos em {state.addressesPath}
          </p>
        )}
      </section>
    </div>
  );
};
