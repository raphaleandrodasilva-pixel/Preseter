import React, { useEffect, useRef, useState } from 'react';

interface NumberFieldProps {
  value: number;
  min?: number;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Rótulo acessível quando o input não está dentro de um <label>. */
  'aria-label'?: string;
  onCommit: (value: number) => void;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

/**
 * Campo numérico que aceita digitação livre (inclusive sinal negativo) e só
 * aplica o valor no blur/Enter. Evita o clamp a cada tecla, que impedia
 * digitar "-18" ou "140".
 */
export const NumberField: React.FC<NumberFieldProps> = ({
  value,
  min = -Number.MAX_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
  className,
  style,
  onCommit,
  ...rest
}) => {
  const [text, setText] = useState(() => formatValue(value));
  const editing = useRef(false);
  const lastCommitted = useRef(value);

  useEffect(() => {
    lastCommitted.current = value;
    if (!editing.current) setText(formatValue(value));
  }, [value]);

  const parse = (raw: string): number | null => {
    const normalized = raw.trim().replace(',', '.');
    if (normalized === '' || normalized === '-' || normalized === '.' || normalized === '-.') return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const commit = () => {
    const parsed = parse(text);
    if (parsed === null) {
      setText(formatValue(lastCommitted.current));
      return;
    }
    const next = clamp(parsed);
    setText(formatValue(next));
    if (next !== lastCommitted.current) {
      lastCommitted.current = next;
      onCommit(next);
    }
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      value={text}
      onFocus={(event) => {
        editing.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        editing.current = false;
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setText(formatValue(lastCommitted.current));
          event.currentTarget.blur();
        }
      }}
    />
  );
};
