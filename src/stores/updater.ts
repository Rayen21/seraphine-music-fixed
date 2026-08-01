import { notify } from '@/components/Notification'
import { invoke } from '@/utils/tools'
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

export const useUpdaterStore = defineStore(
  'updater',
  () => {
    // ========== 状态 ==========
    const isHydrated = ref(false) // store 持久化的水合状态

    const isChecking = ref(false)
    const updateInfo = ref<UpdateInfo>()
    const isDownloading = ref(false)
    const isDownloaded = ref(false)
    const downloadPath = ref('')
    const downloadProgress = ref<DownloadProgress>()
    const progressPercent = computed(() => {
      if (!downloadProgress.value || downloadProgress.value.total === 0) return 0
      return Math.round((downloadProgress.value.downloaded / downloadProgress.value.total) * 100)
    })

    let unlistenProgress: UnlistenFn | undefined

    // ========== 方法 ==========

    watch(
      isHydrated,
      () => {
        checkUpdate()
      },
      { once: true }
    )

    /** 检查更新 */
    const checkUpdate = async () => {
      if (isChecking.value || isDownloading.value) return
      isChecking.value = true
      notify.info('检查更新中...')

      try {
        const info = await invoke('check_update')
        if (info) {
          updateInfo.value = info
          notify.success(info.has_update ? `发现新版本 ${info.latest_version}` : '已是最新版本')
        }
      } catch (error) {
        console.error(error)
        notify.error('检查更新失败')
      } finally {
        isChecking.value = false
      }
    }

    /** 下载更新包（后台运行，通过事件推送进度） */
    const startDownload = async () => {
      if (!updateInfo.value?.download_url || isDownloading.value) return

      isDownloading.value = true
      isDownloaded.value = false
      downloadProgress.value = undefined

      try {
        unlistenProgress = await listen<DownloadProgress>('update:download-progress', (e) => {
          downloadProgress.value = e.payload
        })

        const path = await invoke('download_update', { downloadUrl: updateInfo.value.download_url })
        if (!path) return

        downloadPath.value = path
        isDownloaded.value = true
        notify.success('下载完成，可在设置页安装更新')
      } catch (error) {
        console.error(error)
        notify.error(`下载失败`)
      } finally {
        unlistenProgress?.()
        unlistenProgress = undefined
        isDownloading.value = false
      }
    }

    /** 启动已下载的安装程序 */
    const installUpdate = async () => {
      if (!downloadPath.value) return

      try {
        await invoke('install_update', { savePath: downloadPath.value })
      } catch (error) {
        console.error(error)
        notify.error(`安装失败`)
      }
    }

    /** 重置下载状态 */
    const reset = () => {
      unlistenProgress?.()
      unlistenProgress = undefined
      isDownloading.value = false
      isDownloaded.value = false
      downloadPath.value = ''
      downloadProgress.value = undefined
    }

    return {
      isHydrated,
      isChecking,
      updateInfo,
      isDownloading,
      isDownloaded,
      downloadPath,
      downloadProgress,
      progressPercent,

      checkUpdate,
      startDownload,
      installUpdate,
      reset
    }
  },
  {
    persist: {
      key: 'updater-store',
      pick: [],
      afterHydrate: (ctx) => (ctx.store.isHydrated = true)
    }
  }
)
