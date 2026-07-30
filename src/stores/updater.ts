import { notify } from '@/components/Notification'
import { invoke } from '@/utils/tools'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { type UnlistenFn, listen } from '@tauri-apps/api/event'

/** GitHub API 返回的更新信息 */
interface UpdateInfo {
  has_update: boolean
  current_version: string
  latest_version: string
  download_url: string | null
  file_size: number | null
}

/** 下载进度事件数据 */
interface DownloadProgress {
  downloaded: number
  total: number
  speed: number
}

export const useUpdaterStore = defineStore('updater', () => {
  // ========== 状态 ==========
  const checking = ref(false)
  const checked = ref(false)
  const updateInfo = ref<UpdateInfo | null>(null)
  const downloading = ref(false)
  const downloaded = ref(false)
  const downloadPath = ref('')
  const downloadProgress = ref<DownloadProgress | null>(null)
  const progressPercent = computed(() => {
    if (!downloadProgress.value || downloadProgress.value.total === 0) return 0
    return Math.round((downloadProgress.value.downloaded / downloadProgress.value.total) * 100)
  })

  let unlistenProgress: UnlistenFn | null = null

  // ========== 方法 ==========

  /**
   * 检查更新
   * @param silent 静默模式（不弹错误通知，由调用方处理 UI）
   */
  const checkUpdate = async (silent = false) => {
    if (checking.value || downloading.value) return null

    checking.value = true
    try {
      const info = silent
        ? await tauriInvoke<UpdateInfo>('check_update')
        : await invoke('check_update')

      updateInfo.value = info ?? null
      checked.value = true

      if (info?.has_update && !silent) {
        notify.success(`发现新版本 v${info.latest_version}`)
      }
      return info ?? null
    } catch (e) {
      console.error('[update] 检查更新失败:', e)
      return null
    } finally {
      checking.value = false
    }
  }

  /** 下载更新包（后台运行，通过事件推送进度） */
  const startDownload = async () => {
    if (!updateInfo.value?.download_url || downloading.value) return

    downloading.value = true
    downloaded.value = false
    downloadProgress.value = null

    try {
      unlistenProgress = await listen<DownloadProgress>('update:download-progress', (event) => {
        downloadProgress.value = event.payload
      })

      const path = await invoke('download_update', { downloadUrl: updateInfo.value.download_url })

      if (path) {
        downloadPath.value = path
        downloaded.value = true
        notify.success('下载完成，可在设置页安装更新')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notify.error(`下载失败: ${msg}`)
    } finally {
      downloading.value = false
      unlistenProgress?.()
      unlistenProgress = null
    }
  }

  /** 启动已下载的安装程序 */
  const installUpdate = async () => {
    if (!downloadPath.value) return

    await invoke('install_update', { savePath: downloadPath.value })
  }

  /** 重置下载状态 */
  const reset = () => {
    unlistenProgress?.()
    unlistenProgress = null
    downloading.value = false
    downloaded.value = false
    downloadPath.value = ''
    downloadProgress.value = null
  }

  return {
    checking,
    checked,
    updateInfo,
    downloading,
    downloaded,
    downloadPath,
    downloadProgress,
    progressPercent,

    checkUpdate,
    startDownload,
    installUpdate,
    reset
  }
})
