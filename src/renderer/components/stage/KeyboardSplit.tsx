import React from 'react';
import { KeyboardControl } from './KeyboardControl';

interface KeyboardSplitProps {
  low?: number;
  high?: number;
  splitNote?: number;
  lowerLabel?: string;
  upperLabel?: string;
}

/** Atalho: teclado com split e sem interatividade direta (prévia). */
export const KeyboardSplit: React.FC<KeyboardSplitProps> = (props) => (
  <KeyboardControl
    low={props.low ?? 36}
    high={props.high ?? 84}
    splitNote={props.splitNote ?? 60}
    lowerLabel={props.lowerLabel ?? 'Piano'}
    upperLabel={props.upperLabel ?? 'Strings'}
    interactive={false}
    octaveShift={false}
  />
);
