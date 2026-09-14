import { notify } from '@/components/Notification.vue'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { Update, check as tauriCheck } from '@tauri-apps/plugin-updater'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  body?: string
  date?: string
}

interface DownloadInfo {
  downloaded: number
  total: number
  speed: number
}

export const useUpdaterStore = defineStore(
  'updater',
  () => {
    const isHydrated = ref(false) // store 持久化的水合状态

    const isChecking = ref(false)
    const isDownloading = ref(false)
    const isDownloaded = ref(false)
    const updateInfo = ref<UpdateInfo | null>(null)
    const downloadInfo = ref<DownloadInfo | null>(null)

    let updater: Update | null = null

    watch(
      isHydrated,
      () => {
        check()
      },
      { once: true }
    )

    const check = async () => {
      if (isChecking.value || isDownloading.value) return
      isChecking.value = true
      notify.info('检查更新中...')

      try {
        await updater?.close()
        const update = await tauriCheck()

        if (!update) {
          updater = null

          const currentVersion = await getVersion()
          updateInfo.value = {
            hasUpdate: false,
            currentVersion: `v${currentVersion}`,
            latestVersion: `v${currentVersion}`
          }

          notify.success('已是最新版本')
        } else {
          updater = update
          updateInfo.value = {
            hasUpdate: true,
            currentVersion: `v${update.currentVersion}`,
            latestVersion: `v${update.version}`,
            body: update.body,
            date: update.date
          }

          notify.success(`发现新版本 ${update.version}`)
        }
      } catch (error) {
        console.error(error)
        notify.error('检查更新失败')
      } finally {
        isChecking.value = false
      }
    }

    const download = async () => {
      if (!updater || isDownloading.value) return

      isDownloading.value = true
      isDownloaded.value = false
      downloadInfo.value = null

      try {
        let start = performance.now()
        // 记录上一次进度回调的时间
        let lastProgressTime = start

        await updater.download((e) => {
          if (!downloadInfo.value) downloadInfo.value = { downloaded: 0, total: 0, speed: 0 }

          switch (e.event) {
            case 'Started':
              start = performance.now()
              lastProgressTime = start
              downloadInfo.value = { total: e.data.contentLength ?? 0, downloaded: 0, speed: 0 }
              break
            case 'Progress': {
              const now = performance.now()
              const chunkBytes = e.data.chunkLength
              downloadInfo.value.downloaded += chunkBytes

              const deltaSec = (now - lastProgressTime) / 1000
              if (deltaSec > 0) downloadInfo.value.speed = chunkBytes / deltaSec

              lastProgressTime = now
              break
            }
            case 'Finished':
              isDownloaded.value = true
              downloadInfo.value.speed = 0
              break
          }
        })

        await relaunch()
      } catch (error) {
        console.error(error)
        notify.error('下载失败')
      } finally {
        isDownloading.value = false
      }
    }

    const install = async () => {
      if (!updater || !isDownloaded.value) return

      try {
        await updater.install()
        await relaunch()
      } catch (error) {
        console.error(error)
        notify.error('安装失败')
      }
    }

    const reset = () => {
      isDownloading.value = false
      isDownloaded.value = false
      downloadInfo.value = null
    }

    return {
      isHydrated,
      isChecking,
      isDownloading,
      isDownloaded,
      updateInfo,
      downloadInfo,

      check,
      download,
      install,
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
