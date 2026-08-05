import { notify } from '@/components/Notification.vue'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { type DownloadEvent, type Update, check } from '@tauri-apps/plugin-updater'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/** check() 返回的 Update 元数据快照（响应式暴露给 UI） */
interface UpdateInfo {
  has_update: boolean
  current_version: string
  latest_version: string
  body?: string
  date?: string
}

/** 下载进度（前端聚合后推送，UI 用于展示进度条/速度） */
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
    const downloadProgress = ref<DownloadProgress>()
    const progressPercent = computed(() => {
      if (!downloadProgress.value || downloadProgress.value.total === 0) return 0
      return Math.round((downloadProgress.value.downloaded / downloadProgress.value.total) * 100)
    })

    // 插件返回的 Update 实例（非响应式；跨渲染周期持有以供后续 download/install 调用）
    let pendingUpdate: Update | null = null
    // 下载进度聚合用的内部变量（避免每个 chunk 都触发响应式更新）
    let downloadStartTime = 0
    let lastEmitTime = 0
    let downloadedBytes = 0
    let totalBytes = 0

    // ========== 方法 ==========

    watch(
      isHydrated,
      () => {
        checkUpdate()
      },
      { once: true }
    )

    /** 检查更新（通过 tauri-plugin-updater 的 check()） */
    const checkUpdate = async () => {
      if (isChecking.value || isDownloading.value) return
      isChecking.value = true
      notify.info('检查更新中...')

      try {
        const currentVersion = await getVersion()
        const update = await check()

        // 无论是否拿到新 Update，都先清理上一轮的下载状态
        isDownloaded.value = false
        downloadProgress.value = undefined

        if (update) {
          // 释放上一轮的 Update 资源后再持有新的
          pendingUpdate?.close().catch(() => {})
          pendingUpdate = update

          updateInfo.value = {
            has_update: true,
            current_version: `v${update.currentVersion}`,
            latest_version: `v${update.version}`,
            body: update.body,
            date: update.date
          }
          notify.success(`发现新版本 ${update.version}`)
        } else {
          // check() 返回 null：当前版本已是最新
          pendingUpdate?.close().catch(() => {})
          pendingUpdate = null

          updateInfo.value = {
            has_update: false,
            current_version: `v${currentVersion}`,
            latest_version: `v${currentVersion}`
          }
          notify.success('已是最新版本')
        }
      } catch (error) {
        console.error(error)
        notify.error('检查更新失败')
      } finally {
        isChecking.value = false
      }
    }

    /** 下载更新包（通过插件 Update.download，progress 回调推送进度） */
    const startDownload = async () => {
      if (!pendingUpdate || isDownloading.value) return

      isDownloading.value = true
      isDownloaded.value = false
      downloadProgress.value = undefined
      downloadedBytes = 0
      totalBytes = 0
      downloadStartTime = performance.now()
      lastEmitTime = downloadStartTime

      try {
        await pendingUpdate.download((event: DownloadEvent) => {
          switch (event.event) {
            case 'Started':
              totalBytes = event.data.contentLength ?? 0
              emitProgress(true)
              break
            case 'Progress':
              downloadedBytes += event.data.chunkLength
              emitProgress(false)
              break
            case 'Finished':
              // 最终确保 100% 进度（避免节流导致最后一段未推送）
              if (totalBytes > 0) {
                downloadedBytes = totalBytes
              }
              emitProgress(true)
              break
          }
        })

        isDownloaded.value = true
        notify.success('下载完成，可在设置页安装更新')
      } catch (error) {
        console.error(error)
        notify.error('下载失败')
      } finally {
        isDownloading.value = false
      }
    }

    /** 节流推送下载进度（首次和末次强制推送，中间 100ms 节流） */
    const emitProgress = (force: boolean) => {
      const now = performance.now()
      if (!force && now - lastEmitTime < 100) return

      const elapsed = (now - downloadStartTime) / 1000
      const speed = elapsed > 0 ? downloadedBytes / elapsed : 0
      downloadProgress.value = {
        downloaded: downloadedBytes,
        total: totalBytes,
        speed
      }
      lastEmitTime = now
    }

    /** 安装已下载的更新并重启应用 */
    const installUpdate = async () => {
      if (!pendingUpdate || !isDownloaded.value) return

      try {
        await pendingUpdate.install()
        // 安装完成后重启应用以应用更新
        await relaunch()
      } catch (error) {
        console.error(error)
        notify.error('安装失败')
      }
    }

    /** 重置下载状态（保留 pendingUpdate 以便重新检查/下载） */
    const reset = () => {
      isDownloading.value = false
      isDownloaded.value = false
      downloadProgress.value = undefined
      downloadedBytes = 0
      totalBytes = 0
    }

    return {
      isHydrated,
      isChecking,
      updateInfo,
      isDownloading,
      isDownloaded,
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
