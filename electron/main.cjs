/*
 * Electron main process for the desktop build of OpEzee Puzzle.
 *
 *   npm run electron:dev    -> Vite dev server inside an Electron window
 *   npm run electron:build  -> release/OpEzee Puzzle Setup <version>.exe
 */

const fs = require('fs')
const path = require('path')
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, net, shell } = require('electron')

const { getMachineNumber } = require('./machineNumber.cjs')

// `electron . --dev` (npm run electron:dev) loads the Vite dev server; anything
// else loads the built files from dist/.
const DEV_URL =
  process.env.VITE_DEV_SERVER_URL ||
  (!app.isPackaged && process.argv.includes('--dev') ? 'http://localhost:5174' : null)
const isDev = Boolean(DEV_URL)

let mainWindow = null

// --- one copy at a time -------------------------------------------------------
// Opening the game twice would run two licence checks side by side; instead a
// second launch just brings the existing window forward.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

const machineNumber = () => getMachineNumber(app.getPath('appData'))

// --- window size and position are remembered between launches -----------------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    if (state.width >= 640 && state.height >= 480) return state
  } catch {
    /* first launch */
  }
  return { width: 1100, height: 800 }
}

function saveWindowState(win) {
  try {
    const bounds = win.getNormalBounds()
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }))
  } catch {
    /* not worth failing a quit over */
  }
}

// --- IPC ------------------------------------------------------------------------
ipcMain.on('opezee:info', (event) => {
  event.returnValue = {
    machineNumber: machineNumber(),
    appVersion: app.getVersion(),
    platform: process.platform,
  }
})

ipcMain.handle('opezee:post', async (_event, url, body) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Invalid URL')

  const res = await net.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  return { status: res.status, data }
})

ipcMain.handle('opezee:copy', (_event, text) => {
  clipboard.writeText(String(text ?? ''))
  return true
})

// --- menu -------------------------------------------------------------------------
function showAbout() {
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: `About ${app.getName()}`,
      message: app.getName(),
      detail: `Version ${app.getVersion()}\nMachine number: ${machineNumber()}`,
      buttons: ['Copy machine number', 'OK'],
      defaultId: 1,
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) clipboard.writeText(machineNumber())
    })
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'reload', label: 'Restart game' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Copy machine number',
          click: () => clipboard.writeText(machineNumber()),
        },
        { type: 'separator' },
        { label: `About ${app.getName()}`, click: showAbout },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// --- window -----------------------------------------------------------------------
function createWindow() {
  const state = readWindowState()

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#020617',
    show: false,
    title: app.getName(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (state.maximized) mainWindow.maximize()
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', () => saveWindowState(mainWindow))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Links open in the user's browser, never inside the game window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_URL) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  if (isDev) mainWindow.loadURL(DEV_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  if (!gotLock) return

  // Created here, on the first launch after installing, and reused forever after.
  machineNumber()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
