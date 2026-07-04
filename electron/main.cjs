const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

// ── Kullanıcı komponent kütüphanesi kalıcılığı (userData) ──
function libraryFilePath() {
  return path.join(app.getPath('userData'), 'caya-library.json')
}

ipcMain.handle('caya:saveLibrary', (_e, data) => {
  try {
    fs.writeFileSync(libraryFilePath(), String(data), 'utf8')
    return true
  } catch (err) {
    console.error('Kütüphane kaydedilemedi:', err)
    return false
  }
})

ipcMain.handle('caya:loadLibrary', () => {
  try {
    const p = libraryFilePath()
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, 'utf8')
  } catch (err) {
    console.error('Kütüphane okunamadı:', err)
    return null
  }
})

ipcMain.handle('caya:libraryPath', () => {
  try {
    return libraryFilePath()
  } catch {
    return null
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: 'CaYa PCB Studio',
    backgroundColor: '#14171c',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Dış bağlantılar sistem tarayıcısında açılsın
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Kaydedilmemiş değişiklik varken kapatmaya karşı uyarı.
  // Renderer, kaydedilmemiş iş varken window.__cayaDirty = true bırakır.
  let forceClose = false
  win.on('close', (e) => {
    if (forceClose) return
    e.preventDefault()
    win.webContents
      .executeJavaScript('window.__cayaDirty === true')
      .catch(() => false)
      .then((dirty) => {
        if (!dirty) {
          forceClose = true
          win.destroy()
          return
        }
        const response = dialog.showMessageBoxSync(win, closeDialogOptions())
        if (response === 0) {
          forceClose = true
          win.destroy()
        }
      })
  })
}

function closeDialogOptions() {
  return {
    type: 'warning',
    buttons: ['Kaydetmeden çık', 'İptal'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'CaYa PCB Studio',
    message: 'Kaydedilmemiş değişiklikler var',
    detail:
      'Yaptığınız değişiklikler kaydedilmedi. Çıkarsanız bu iş kaybolur.\n' +
      'Önce pencereye dönüp "Kaydet" ile projeyi kaydedebilirsiniz.'
  }
}

// Uygulama menüsünü sadeleştir (kısayollar uygulama içinde ele alınıyor)
const menuTemplate = [
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' }
]
Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
