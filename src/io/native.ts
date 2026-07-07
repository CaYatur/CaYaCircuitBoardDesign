// ─── Masaüstü (Electron) yerel köprüsü ────────────────────────────────────
// window.cayaNative (preload.cjs) için tipli sarmalayıcı ve özellik algılama.
// Web'de cayaNative yoktur → çağıranlar tarayıcı yöntemlerine düşer.

export interface RecentItem {
  path: string
  name: string
  at: number
}

export interface AppState {
  recents: RecentItem[]
  lastProjectDir: string
  lastExportDir: string
}

export interface CayaNative {
  saveLibrary(data: string): Promise<boolean>
  loadLibrary(): Promise<string | null>
  libraryPath(): Promise<string | null>
  getAppState(): Promise<AppState>
  clearRecents(): Promise<boolean>
  saveProject(a: {
    path?: string
    defaultName: string
    content: string
    saveAs?: boolean
  }): Promise<{ path?: string; canceled?: boolean; error?: string }>
  openProject(a?: {
    path?: string
  }): Promise<{ path?: string; content?: string; canceled?: boolean; error?: string }>
  exportFile(a: {
    defaultName: string
    content: string | Uint8Array
    ext?: string
  }): Promise<{ path?: string; canceled?: boolean; error?: string }>
  exportToDir(a: {
    files: { name: string; content: string | Uint8Array }[]
  }): Promise<{ dir?: string; count?: number; canceled?: boolean; error?: string }>
  isDesktop: boolean
}

/** Masaüstü köprüsü (yoksa null → web ortamı) */
export function native(): CayaNative | null {
  return (window as unknown as { cayaNative?: CayaNative }).cayaNative ?? null
}

/** Masaüstü uygulamasında mıyız? */
export function isDesktop(): boolean {
  return !!native()?.isDesktop
}

/** Blob/string içeriğini IPC'ye uygun biçime (Uint8Array veya string) çevir */
export async function toTransferable(content: string | Blob): Promise<string | Uint8Array> {
  if (typeof content === 'string') return content
  return new Uint8Array(await content.arrayBuffer())
}
