import { useUpdaterStore } from '@/stores/updater'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock（vi.hoisted：vi.mock 会被提升到文件顶部，所有 mock 变量必须在此创建）
// ============================================================================
const {
  mockCheck,
  mockRelaunch,
  mockGetVersion,
  mockNotifyInfo,
  mockNotifySuccess,
  mockNotifyError
} = vi.hoisted(() => ({
  mockCheck: vi.fn(),
  mockRelaunch: vi.fn(),
  mockGetVersion: vi.fn(),
  mockNotifyInfo: vi.fn(),
  mockNotifySuccess: vi.fn(),
  mockNotifyError: vi.fn()
}))

vi.mock('@/components/Notification.vue', () => ({
  notify: {
    success: mockNotifySuccess,
    error: mockNotifyError,
    warning: vi.fn(),
    info: mockNotifyInfo
  }
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: mockGetVersion
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: mockRelaunch
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mockCheck
}))

// ============================================================================
// 夹具：构造一个模拟插件返回的 Update 实例
// ============================================================================
const createMockUpdate = (overrides: Partial<any> = {}): any => ({
  version: '1.1.0',
  currentVersion: '1.0.0',
  body: 'release notes',
  date: '2026-01-01T00:00:00Z',
  download: vi.fn().mockResolvedValue(undefined),
  install: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  ...overrides
})

// ============================================================================
// 辅助：刷新微任务队列（watch 回调 + await 链）
// ============================================================================
const flushAll = async (depth = 15) => {
  for (let i = 0; i < depth; i++) {
    await Promise.resolve()
  }
}

// ============================================================================
describe('stores/updater — tauri-plugin-updater 状态机', () => {
  let updaterStore: ReturnType<typeof useUpdaterStore>

  beforeEach(() => {
    setActivePinia(createPinia())

    mockCheck.mockReset()
    mockRelaunch.mockReset()
    mockGetVersion.mockReset()
    mockNotifyInfo.mockReset()
    mockNotifySuccess.mockReset()
    mockNotifyError.mockReset()

    mockGetVersion.mockResolvedValue('1.0.0')
    mockRelaunch.mockResolvedValue(undefined)
    mockCheck.mockResolvedValue(null)

    // 抑制源码 catch 块中的 console.error 输出（预期错误，非测试失败）
    vi.spyOn(console, 'error').mockImplementation(() => {})

    updaterStore = useUpdaterStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // 1. 初始默认值
  // ==========================================================================
  describe('1. 初始默认值', () => {
    it('全部为空/默认值', () => {
      expect(updaterStore.isHydrated).toBe(false)
      expect(updaterStore.isChecking).toBe(false)
      expect(updaterStore.updateInfo).toBeUndefined()
      expect(updaterStore.isDownloading).toBe(false)
      expect(updaterStore.isDownloaded).toBe(false)
      expect(updaterStore.downloadProgress).toBeUndefined()
      expect(updaterStore.progressPercent).toBe(0)
    })

    it('progressPercent：downloadProgress 为 undefined → 0', () => {
      expect(updaterStore.progressPercent).toBe(0)
    })

    it('progressPercent：total=0 → 0（避免除零）', () => {
      ;(updaterStore as any).downloadProgress = { downloaded: 100, total: 0, speed: 0 }
      expect(updaterStore.progressPercent).toBe(0)
    })

    it('progressPercent：downloaded=50, total=200 → 25', () => {
      ;(updaterStore as any).downloadProgress = { downloaded: 50, total: 200, speed: 0 }
      expect(updaterStore.progressPercent).toBe(25)
    })

    it('progressPercent：downloaded=334, total=1000 → 33（Math.round）', () => {
      ;(updaterStore as any).downloadProgress = { downloaded: 334, total: 1000, speed: 0 }
      expect(updaterStore.progressPercent).toBe(33)
    })
  })

  // ==========================================================================
  // 2. checkUpdate：状态机 + 5 种分支
  // ==========================================================================
  describe('2. checkUpdate', () => {
    it('正常 + 有更新 → notify.success("发现新版本 X")，updateInfo 带 v 前缀', async () => {
      const mockUpdate = createMockUpdate({ version: '1.1.0' })
      mockCheck.mockResolvedValueOnce(mockUpdate)

      await updaterStore.checkUpdate()

      expect(mockNotifyInfo).toHaveBeenCalledWith('检查更新中...')
      expect(mockGetVersion).toHaveBeenCalled()
      expect(mockCheck).toHaveBeenCalled()
      expect(updaterStore.updateInfo?.has_update).toBe(true)
      expect(updaterStore.updateInfo?.current_version).toBe('v1.0.0')
      expect(updaterStore.updateInfo?.latest_version).toBe('v1.1.0')
      expect(updaterStore.updateInfo?.body).toBe('release notes')
      expect(updaterStore.updateInfo?.date).toBe('2026-01-01T00:00:00Z')
      expect(updaterStore.isChecking).toBe(false)
      expect(mockNotifySuccess).toHaveBeenCalledWith('发现新版本 1.1.0')
      expect(mockNotifyError).not.toHaveBeenCalled()
    })

    it('正常 + 无更新 → notify.success("已是最新版本")，latest=current', async () => {
      mockCheck.mockResolvedValueOnce(null)
      await updaterStore.checkUpdate()

      expect(updaterStore.updateInfo?.has_update).toBe(false)
      expect(updaterStore.updateInfo?.current_version).toBe('v1.0.0')
      expect(updaterStore.updateInfo?.latest_version).toBe('v1.0.0')
      expect(mockNotifySuccess).toHaveBeenCalledWith('已是最新版本')
    })

    it('check() 抛错 → catch：notify.error("检查更新失败")；finally：isChecking=false', async () => {
      mockCheck.mockRejectedValueOnce(new Error('network'))
      await expect(updaterStore.checkUpdate()).resolves.not.toThrow()

      expect(mockNotifyError).toHaveBeenCalledWith('检查更新失败')
      expect(updaterStore.isChecking).toBe(false)
    })

    it('isChecking=true 时再次调用 → 直接 return（防重入）', async () => {
      mockCheck.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 50))
      )
      const p1 = updaterStore.checkUpdate()
      expect(updaterStore.isChecking).toBe(true)
      await updaterStore.checkUpdate()
      expect(mockCheck).toHaveBeenCalledTimes(1)
      await p1
    })

    it('isDownloading=true 时调用 → 直接 return（下载中不允许检查）', async () => {
      ;(updaterStore as any).isDownloading = true
      await updaterStore.checkUpdate()
      expect(mockCheck).not.toHaveBeenCalled()
      expect(mockNotifyInfo).not.toHaveBeenCalled()
    })

    it('再次检查拿到新 Update → close 旧的 pendingUpdate', async () => {
      const oldUpdate = createMockUpdate({ version: '1.1.0' })
      mockCheck.mockResolvedValueOnce(oldUpdate)
      await updaterStore.checkUpdate()

      const newUpdate = createMockUpdate({ version: '1.2.0' })
      mockCheck.mockResolvedValueOnce(newUpdate)
      await updaterStore.checkUpdate()

      expect(oldUpdate.close).toHaveBeenCalledTimes(1)
      expect(updaterStore.updateInfo?.latest_version).toBe('v1.2.0')
    })

    it('再次检查返回 null → close 旧的 pendingUpdate 并清空', async () => {
      const oldUpdate = createMockUpdate()
      mockCheck.mockResolvedValueOnce(oldUpdate)
      await updaterStore.checkUpdate()

      mockCheck.mockResolvedValueOnce(null)
      await updaterStore.checkUpdate()

      expect(oldUpdate.close).toHaveBeenCalledTimes(1)
      expect(updaterStore.updateInfo?.has_update).toBe(false)
    })

    it('再次检查时清理上一轮下载状态（isDownloaded/downloadProgress）', async () => {
      const mockUpdate = createMockUpdate()
      mockUpdate.download.mockImplementationOnce(async (cb: any) => {
        cb({ event: 'Started', data: { contentLength: 1000 } })
        cb({ event: 'Finished' })
      })
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await updaterStore.startDownload()
      expect(updaterStore.isDownloaded).toBe(true)

      // 再次检查 → 清理下载状态
      mockCheck.mockResolvedValueOnce(createMockUpdate({ version: '1.2.0' }))
      await updaterStore.checkUpdate()

      expect(updaterStore.isDownloaded).toBe(false)
      expect(updaterStore.downloadProgress).toBeUndefined()
    })
  })

  // ==========================================================================
  // 3. startDownload：状态机 + DownloadEvent 回调 + 4 种分支
  // ==========================================================================
  describe('3. startDownload', () => {
    it('未调用 checkUpdate（pendingUpdate 为 null）→ 直接 return', async () => {
      await updaterStore.startDownload()
      expect(updaterStore.isDownloading).toBe(false)
      expect(updaterStore.isDownloaded).toBe(false)
    })

    it('isDownloading=true → 直接 return（防重入）', async () => {
      const mockUpdate = createMockUpdate()
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      ;(updaterStore as any).isDownloading = true

      await updaterStore.startDownload()

      expect(mockUpdate.download).not.toHaveBeenCalled()
    })

    it('正常下载：download → isDownloaded=true + notify.success', async () => {
      const mockUpdate = createMockUpdate()
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()

      await updaterStore.startDownload()

      expect(mockUpdate.download).toHaveBeenCalledTimes(1)
      expect(updaterStore.isDownloaded).toBe(true)
      expect(updaterStore.isDownloading).toBe(false)
      expect(mockNotifySuccess).toHaveBeenCalledWith('下载完成，可在设置页安装更新')
    })

    it('Started + Progress + Finished 事件 → downloadProgress 最终 100%', async () => {
      const mockUpdate = createMockUpdate()
      mockUpdate.download.mockImplementationOnce(async (cb: any) => {
        cb({ event: 'Started', data: { contentLength: 2000 } })
        cb({ event: 'Progress', data: { chunkLength: 500 } })
        cb({ event: 'Progress', data: { chunkLength: 500 } })
        cb({ event: 'Finished' })
      })
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()

      await updaterStore.startDownload()

      // Finished 强制 downloaded = total = 2000
      expect(updaterStore.downloadProgress?.total).toBe(2000)
      expect(updaterStore.downloadProgress?.downloaded).toBe(2000)
      expect(updaterStore.progressPercent).toBe(100)
    })

    it('Started 中 contentLength 为 undefined → total=0，progressPercent=0', async () => {
      const mockUpdate = createMockUpdate()
      mockUpdate.download.mockImplementationOnce(async (cb: any) => {
        cb({ event: 'Started', data: { contentLength: undefined } })
        cb({ event: 'Progress', data: { chunkLength: 100 } })
        cb({ event: 'Finished' })
      })
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()

      await updaterStore.startDownload()

      expect(updaterStore.downloadProgress?.total).toBe(0)
      expect(updaterStore.progressPercent).toBe(0)
    })

    it('节流：Progress 事件在 100ms 内推送 → 中间状态被节流，Finished 强制推送最终值', async () => {
      vi.useFakeTimers()
      const mockUpdate = createMockUpdate()
      let downloadCb: any
      mockUpdate.download.mockImplementationOnce((cb: any) => {
        downloadCb = cb
        return new Promise<void>((resolve) => setTimeout(() => resolve(), 5000))
      })
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()

      const downloadPromise = updaterStore.startDownload()
      await Promise.resolve() // 让 download 被调用并捕获 cb

      // Started：强制推送，total=1000
      downloadCb({ event: 'Started', data: { contentLength: 1000 } })
      expect(updaterStore.downloadProgress?.total).toBe(1000)
      expect(updaterStore.downloadProgress?.downloaded).toBe(0)

      // 50ms 后 Progress：节流窗口内，不推送
      vi.advanceTimersByTime(50)
      downloadCb({ event: 'Progress', data: { chunkLength: 200 } })
      expect(updaterStore.downloadProgress?.downloaded).toBe(0)

      // 再过 60ms（累计 110ms > 100ms）→ 推送
      vi.advanceTimersByTime(60)
      downloadCb({ event: 'Progress', data: { chunkLength: 300 } })
      expect(updaterStore.downloadProgress?.downloaded).toBe(500)

      // 完成
      vi.advanceTimersByTime(5000)
      await downloadPromise
      vi.useRealTimers()
    })

    it('download() 抛错 → catch：notify.error("下载失败")；finally：isDownloading=false', async () => {
      const mockUpdate = createMockUpdate()
      mockUpdate.download.mockRejectedValueOnce(new Error('disk full'))
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()

      await expect(updaterStore.startDownload()).resolves.not.toThrow()

      expect(mockNotifyError).toHaveBeenCalledWith('下载失败')
      expect(updaterStore.isDownloading).toBe(false)
      expect(updaterStore.isDownloaded).toBe(false)
    })
  })

  // ==========================================================================
  // 4. installUpdate：3 种分支
  // ==========================================================================
  describe('4. installUpdate', () => {
    it('未下载（isDownloaded=false）→ 直接 return', async () => {
      const mockUpdate = createMockUpdate()
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()

      await updaterStore.installUpdate()

      expect(mockUpdate.install).not.toHaveBeenCalled()
      expect(mockRelaunch).not.toHaveBeenCalled()
    })

    it('正常安装：install + relaunch', async () => {
      const mockUpdate = createMockUpdate()
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await updaterStore.startDownload() // 标记 isDownloaded=true

      await updaterStore.installUpdate()

      expect(mockUpdate.install).toHaveBeenCalledTimes(1)
      expect(mockRelaunch).toHaveBeenCalledTimes(1)
      expect(mockNotifyError).not.toHaveBeenCalled()
    })

    it('install() 抛错 → catch：notify.error("安装失败")；不调 relaunch', async () => {
      const mockUpdate = createMockUpdate()
      mockUpdate.install.mockRejectedValueOnce(new Error('permission denied'))
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await updaterStore.startDownload()

      await expect(updaterStore.installUpdate()).resolves.not.toThrow()

      expect(mockNotifyError).toHaveBeenCalledWith('安装失败')
      expect(mockRelaunch).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // 5. reset：重置下载状态
  // ==========================================================================
  describe('5. reset', () => {
    it('清理所有下载相关状态', () => {
      ;(updaterStore as any).isDownloading = true
      ;(updaterStore as any).isDownloaded = true
      ;(updaterStore as any).downloadProgress = { downloaded: 100, total: 200, speed: 0 }

      updaterStore.reset()

      expect(updaterStore.isDownloading).toBe(false)
      expect(updaterStore.isDownloaded).toBe(false)
      expect(updaterStore.downloadProgress).toBeUndefined()
    })
  })

  // ==========================================================================
  // 6. watch(isHydrated, { once: true })
  // ==========================================================================
  describe('6. watch(isHydrated)：首次 hydrated → 自动 checkUpdate', () => {
    it('isHydrated=true → 触发 checkUpdate（invoke check + notify.info）', async () => {
      mockCheck.mockResolvedValueOnce(null)
      ;(updaterStore as any).isHydrated = true
      await flushAll()

      expect(mockNotifyInfo).toHaveBeenCalledWith('检查更新中...')
      expect(mockCheck).toHaveBeenCalled()
    })

    it('once: true — 再次切换 isHydrated 不会重复触发', async () => {
      mockCheck.mockResolvedValue(null)
      ;(updaterStore as any).isHydrated = true
      await flushAll()
      const invokeCountAfter1 = mockCheck.mock.calls.length

      ;(updaterStore as any).isHydrated = false
      await flushAll(5)
      ;(updaterStore as any).isHydrated = true
      await flushAll()

      const invokeCountAfter2 = mockCheck.mock.calls.length
      expect(invokeCountAfter2).toBe(invokeCountAfter1)
    })

    it('isHydrated 保持 false → 不触发 checkUpdate', async () => {
      await flushAll(10)
      expect(mockCheck).not.toHaveBeenCalled()
      expect(mockNotifyInfo).not.toHaveBeenCalled()
    })
  })
})
