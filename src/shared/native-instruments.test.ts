import { describe, expect, it } from 'vitest';
import {
  NATIVE_INSTRUMENTS,
  isNativeInstrumentId,
  nativeInstrumentEntry,
  nativeInstrumentInfo,
} from './native-instruments';

describe('catálogo de instrumentos nativos', () => {
  it('inclui o Preseter Drums com id preseter.drums', () => {
    const drums = NATIVE_INSTRUMENTS.find((instrument) => instrument.id === 'preseter.drums');
    expect(drums).toMatchObject({ name: 'Preseter Drums', category: 'Bateria' });
    expect(isNativeInstrumentId('preseter.drums')).toBe(true);
    expect(nativeInstrumentInfo('preseter.drums')?.name).toBe('Preseter Drums');
  });

  it('monta a entrada de catálogo do Drums como instrumento nativo', () => {
    expect(nativeInstrumentEntry('preseter.drums')).toMatchObject({
      id: 'preseter.drums',
      name: 'Preseter Drums',
      path: 'preseter.drums',
      isInstrument: true,
      format: 'Native',
      manufacturer: 'Preseter',
    });
  });

  it('mantém os instrumentos já existentes no catálogo', () => {
    for (const id of ['preseter.organ', 'preseter.tines', 'preseter.reeds', 'preseter.piano', 'preseter.dx', 'preseter.jx', 'preseter.synth2']) {
      expect(isNativeInstrumentId(id)).toBe(true);
    }
    expect(isNativeInstrumentId('preseter.nao-existe')).toBe(false);
    expect(nativeInstrumentEntry('preseter.nao-existe')).toBeNull();
  });
});
