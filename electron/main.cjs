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

// ── Uygulama durumu: son kullanılanlar + hatırlanan klasörler (userData) ──
function appStatePath() {
  return path.join(app.getPath('userData'), 'caya-app-state.json')
}
function readAppState() {
  try {
    const p = appStatePath()
    if (!fs.existsSync(p)) return { recents: [], lastProjectDir: '', lastExportDir: '' }
    const s = JSON.parse(fs.readFileSync(p, 'utf8'))
    return {
      recents: Array.isArray(s.recents) ? s.recents : [],
      lastProjectDir: typeof s.lastProjectDir === 'string' ? s.lastProjectDir : '',
      lastExportDir: typeof s.lastExportDir === 'string' ? s.lastExportDir : ''
    }
  } catch {
    return { recents: [], lastProjectDir: '', lastExportDir: '' }
  }
}
function writeAppState(state) {
  try {
    fs.writeFileSync(appStatePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch (err) {
    console.error('Uygulama durumu yazılamadı:', err)
  }
}
function addRecent(filePath) {
  if (!filePath) return
  const state = readAppState()
  const name = path.basename(filePath)
  const recents = [
    { path: filePath, name, at: Date.now() },
    ...state.recents.filter((r) => r.path !== filePath)
  ].slice(0, 12)
  writeAppState({ ...state, recents, lastProjectDir: path.dirname(filePath) })
}

ipcMain.handle('caya:getAppState', () => {
  const s = readAppState()
  // Var olmayan (silinmiş) son kullanılanları ele
  s.recents = s.recents.filter((r) => {
    try {
      return fs.existsSync(r.path)
    } catch {
      return false
    }
  })
  return s
})

ipcMain.handle('caya:clearRecents', () => {
  const s = readAppState()
  writeAppState({ ...s, recents: [] })
  return true
})

// Proje kaydet: yol verilmişse doğrudan yaz; yoksa (ya da farklı-kaydet) diyalog aç
ipcMain.handle('caya:saveProject', async (e, { path: givenPath, defaultName, content, saveAs }) => {
  try {
    let target = givenPath
    if (!target || saveAs) {
      const state = readAppState()
      const win = BrowserWindow.fromWebContents(e.sender)
      const res = await dialog.showSaveDialog(win, {
        title: 'Projeyi Kaydet',
        defaultPath: path.join(
          givenPath ? path.dirname(givenPath) : state.lastProjectDir || app.getPath('documents'),
          defaultName || 'proje.cayapcb'
        ),
        filters: [{ name: 'CaYa PCB', extensions: ['cayapcb'] }]
      })
      if (res.canceled || !res.filePath) return { canceled: true }
      target = res.filePath
    }
    fs.writeFileSync(target, String(content), 'utf8')
    addRecent(target)
    return { path: target }
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) }
  }
})

// Proje aç: yol verilmişse oku; yoksa diyalog aç
ipcMain.handle('caya:openProject', async (e, opts) => {
  try {
    let target = opts && opts.path
    if (!target) {
      const state = readAppState()
      const win = BrowserWindow.fromWebContents(e.sender)
      const res = await dialog.showOpenDialog(win, {
        title: 'Proje Aç',
        defaultPath: state.lastProjectDir || app.getPath('documents'),
        properties: ['openFile'],
        filters: [{ name: 'CaYa PCB', extensions: ['cayapcb', 'json'] }]
      })
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) return { canceled: true }
      target = res.filePaths[0]
    }
    const content = fs.readFileSync(target, 'utf8')
    addRecent(target)
    return { path: target, content }
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) }
  }
})

// Tek dosya dışa aktar (diyalogla konum seç)
ipcMain.handle('caya:exportFile', async (e, { defaultName, content, ext }) => {
  try {
    const state = readAppState()
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showSaveDialog(win, {
      title: 'Dışa Aktar',
      defaultPath: path.join(state.lastExportDir || app.getPath('documents'), defaultName || 'cikti'),
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    const buf = typeof content === 'string' ? content : Buffer.from(content)
    fs.writeFileSync(res.filePath, buf)
    writeAppState({ ...state, lastExportDir: path.dirname(res.filePath) })
    return { path: res.filePath }
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) }
  }
})

// Çok dosyayı seçilen bir klasöre yaz (Gerber seti, tüm SVG'ler vb.)
ipcMain.handle('caya:exportToDir', async (e, { files }) => {
  try {
    const state = readAppState()
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win, {
      title: 'Dışa Aktarılacak Klasörü Seç',
      defaultPath: state.lastExportDir || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) return { canceled: true }
    const dir = res.filePaths[0]
    for (const f of files) {
      const buf = typeof f.content === 'string' ? f.content : Buffer.from(f.content)
      fs.writeFileSync(path.join(dir, f.name), buf)
    }
    writeAppState({ ...state, lastExportDir: dir })
    return { dir, count: files.length }
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) }
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
      .then(async (dirty) => {
        if (!dirty) {
          forceClose = true
          win.destroy()
          return
        }
        // Butonlar: 0 = Kaydet ve Çık, 1 = Kaydetmeden Çık, 2 = İptal
        const response = dialog.showMessageBoxSync(win, closeDialogOptions())
        if (response === 0) {
          // Renderer'daki kaydetme akışını çalıştır; başarılıysa kapat.
          try {
            const saved = await win.webContents.executeJavaScript(
              'window.__cayaRequestSave ? window.__cayaRequestSave() : false'
            )
            if (saved) {
              forceClose = true
              win.destroy()
            }
            // saved === false → kaydetme iptal/başarısız, pencere açık kalır
          } catch {
            /* kaydetme başarısız — pencere açık kalsın */
          }
        } else if (response === 1) {
          forceClose = true
          win.destroy()
        }
        // response === 2 → İptal: hiçbir şey yapma
      })
  })
}

function closeDialogOptions() {
  return {
    type: 'warning',
    buttons: ['Kaydet ve Çık', 'Kaydetmeden Çık', 'İptal'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: 'CaYa PCB Studio',
    message: 'Kaydedilmemiş değişiklikler var',
    detail:
      'Yaptığınız değişiklikler kaydedilmedi.\n' +
      '"Kaydet ve Çık" ile projeyi kaydedip kapatabilir, "Kaydetmeden Çık" ile ' +
      'değişiklikleri atabilir ya da "İptal" ile pencereye dönebilirsiniz.'
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
