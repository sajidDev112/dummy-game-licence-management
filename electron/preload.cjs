/*
 * The only bridge between the game page and Electron. The page gets a small,
 * fixed API on `window.opezee` — never Node or ipcRenderer itself.
 */

const { contextBridge, ipcRenderer } = require('electron')

const info = ipcRenderer.sendSync('opezee:info')

contextBridge.exposeInMainWorld('opezee', {
  isDesktop: true,
  machineNumber: info.machineNumber,
  appVersion: info.appVersion,
  platform: info.platform,

  /**
   * Licence API calls go through the main process, so they are not subject to
   * CORS from a file:// page. Resolves to { status, data }; rejects when the
   * server cannot be reached at all.
   */
  post: (url, body) => ipcRenderer.invoke('opezee:post', url, body),

  copyText: (text) => ipcRenderer.invoke('opezee:copy', text),
})
