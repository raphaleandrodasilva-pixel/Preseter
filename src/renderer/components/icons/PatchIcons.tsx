import React from 'react';
import { PATCH_ICON_IDS, isPatchIconId, type PatchIconId } from '@shared/patch-icons';

type IconProps = { size?: number };

const Icon: React.FC<IconProps & { children: React.ReactNode }> = ({ size = 16, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

/** Ícones de linha no estilo do app (currentColor, stroke 1.7). */
export const PATCH_ICONS: Record<PatchIconId, React.FC<IconProps>> = {
  piano: (props) => (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 13h18M7 13v7M11 13v7M15 13v7M18 13v7" />
      <path d="M7 4v9M11 4v9M15 4v9M18 4v9" opacity=".45" />
    </Icon>
  ),
  epiano: (props) => (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h4M13 8h4M7 12h10" />
      <circle cx="8" cy="16" r="1" />
      <circle cx="16" cy="16" r="1" />
    </Icon>
  ),
  organ: (props) => (
    <Icon {...props}>
      <rect x="3" y="12" width="18" height="8" rx="1" />
      <path d="M6 12V6h4v6M14 12V6h4v6M5 16h14M9 16v4M13 16v4" />
    </Icon>
  ),
  strings: (props) => (
    <Icon {...props}>
      <path d="M4 20 20 4M14 6l4 4" />
      <path d="M6 14c-2 2-2 4 0 6s4 2 6 0l2-2-6-6-2 2z" />
    </Icon>
  ),
  brass: (props) => (
    <Icon {...props}>
      <path d="M3 10h10l2-2h6v8h-6l-2-2H3z" />
      <path d="M6 10v4M9 10v4M12 10v4" />
    </Icon>
  ),
  flute: (props) => (
    <Icon {...props}>
      <path d="M3 12h18M18 9v6" />
      <circle cx="7" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
    </Icon>
  ),
  choir: (props) => (
    <Icon {...props}>
      <circle cx="8" cy="7" r="2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 20c0-3 2-5 4-5s4 2 4 5M12 20c0-3 2-5 4-5s4 2 4 5" />
    </Icon>
  ),
  pad: (props) => (
    <Icon {...props}>
      <rect x="3" y="8" width="18" height="8" rx="4" />
      <path d="M7 8V6a5 5 0 0 1 10 0v2M7 16v2a5 5 0 0 0 10 0v-2" />
    </Icon>
  ),
  'pad-dark': (props) => (
    <Icon {...props}>
      <rect x="3" y="9" width="13" height="9" rx="4" />
      <path d="M18 6a4 4 0 1 0 3 6 4.5 4.5 0 0 1-3-6z" />
    </Icon>
  ),
  'pad-bright': (props) => (
    <Icon {...props}>
      <rect x="3" y="12" width="11" height="7" rx="3" />
      <circle cx="18" cy="7" r="2.5" />
      <path d="M18 2v1.5M18 10.5V12M13 7h1.5M21.5 7H23M14.5 3.5l1 1M21.5 3.5l-1 1" />
    </Icon>
  ),
  lead: (props) => (
    <Icon {...props}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </Icon>
  ),
  bass: (props) => (
    <Icon {...props}>
      <path d="M2 13c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6" />
      <path d="M3 19h18" />
    </Icon>
  ),
  guitar: (props) => (
    <Icon {...props}>
      <circle cx="9" cy="15" r="5" />
      <circle cx="9" cy="15" r="1.5" />
      <path d="M12 12 21 3M17 7l2 2M19 5l2 2" />
    </Icon>
  ),
  drums: (props) => (
    <Icon {...props}>
      <ellipse cx="12" cy="8" rx="8" ry="3" />
      <path d="M4 8v7c0 1.7 3.6 3 8 3s8-1.3 8-3V8M7 6 5 2M17 6l2-4" />
    </Icon>
  ),
  synth: (props) => (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h3M11 9h3M15 9h2" />
      <circle cx="7" cy="15" r="1" />
      <circle cx="12" cy="15" r="1" />
      <circle cx="17" cy="15" r="1" />
    </Icon>
  ),
  split: (props) => (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14M6 10h3M6 14h3M15 10h3M15 14h3" />
    </Icon>
  ),
  layer: (props) => (
    <Icon {...props}>
      <rect x="3" y="8" width="18" height="11" rx="2" />
      <path d="M6 5h12M9 2h6" />
    </Icon>
  ),
  mic: (props) => (
    <Icon {...props}>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
    </Icon>
  ),
  bell: (props) => (
    <Icon {...props}>
      <path d="M18 16H6l1.5-2V9a4.5 4.5 0 0 1 9 0v5L18 16zM10 19a2 2 0 0 0 4 0" />
    </Icon>
  ),
  star: (props) => (
    <Icon {...props}>
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.9L12 3z" />
    </Icon>
  ),
  fire: (props) => (
    <Icon {...props}>
      <path d="M12 3c4 4 6 6.5 6 10a6 6 0 0 1-12 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 1-5.5 2-8.5z" />
    </Icon>
  ),
  wave: (props) => (
    <Icon {...props}>
      <path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6" />
    </Icon>
  ),
  generic: (props) => (
    <Icon {...props}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </Icon>
  ),
  none: (props) => (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m6.5 6.5 11 11" />
    </Icon>
  ),
};

interface PatchIconProps {
  /** ID novo (`piano`, `pad`…) ou emoji/texto legado. */
  icon?: string;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Renderiza o ícone de um patch.
 * - ID novo: SVG de linha.
 * - Emoji/texto antigo: mantém o texto original.
 * - Ausente/vazio: ícone genérico.
 * - `none`: não desenha nada.
 */
export const PatchIcon: React.FC<PatchIconProps> = ({ icon, size = 16, className, title }) => {
  if (icon === 'none') {
    return <span className={className} style={{ display: 'inline-block', width: size, height: size }} aria-hidden="true" />;
  }

  const id = isPatchIconId(icon) && icon !== 'none' ? icon : null;
  if (id) {
    const Component = PATCH_ICONS[id];
    return (
      <span
        className={className}
        data-patch-icon={id}
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'currentColor' }}
        title={title}
      >
        <Component size={size} />
      </span>
    );
  }

  if (icon) {
    return (
      <span
        className={className}
        role={title ? 'img' : undefined}
        aria-label={title}
        style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}
        title={title}
      >
        {icon}
      </span>
    );
  }

  const Generic = PATCH_ICONS.generic;
  return (
    <span
      className={className}
      data-patch-icon="generic"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'currentColor' }}
      title={title}
    >
      <Generic size={size} />
    </span>
  );
};

/** Lista de ícones para o seletor (sem `none`, que tem botão próprio). */
export const PICKER_ICON_IDS = PATCH_ICON_IDS.filter((id) => id !== 'none');
