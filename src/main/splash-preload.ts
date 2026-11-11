import { contextBridge, ipcRenderer } from 'electron';

/** Ponte mínima da splash: só o botão de continuar em segundo plano. */
contextBridge.exposeInMainWorld('splashContinue', () => {
  ipcRenderer.send('splash-continue');
});
