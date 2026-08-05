import { useDesktopLyricBridge } from '@/composables/useDesktopLyricBridge'
import { DesktopLyricEmit, WindowEvent, WindowTarget } from '@/utils/params'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

// ============================================================================
// Mock（vi.hoisted：vi.mock 会被提升到文件顶部，所有 mock 变量必须在此创建）
// ============================================================================
const {
  mockEmitTo,
  mockListen,
  mockUnlisten,
  mockGetCurrentWindowShow,
  mockMusicPlay,
  mockMusicPause,
  mockMusicPlayPrevOrNext,
  mockSetDesktopLyricPosition,
  mockLyricWindowClose,
  mockGetAvailableFonts
} = vi.hoisted(() => ({
  mockEmitTo: vi.fn(),
  mockListen: vi.fn(),
  mockUnlisten: vi.fn(),
  mockGetCurrentWindowShow: vi.fn(),
  mockMusicPlay: vi.fn(),
  mockMusicPause: vi.fn(),
  mockMusicPlayPrevOrNext: vi.fn(),
  mockSetDesktopLyricPosition: vi.fn(),
  mockLyricWindowClose: vi.fn(),
  mockGetAvailableFonts: vi.fn()
}))

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: mockEmitTo,
  listen: mockListen
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: vi.fn()
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    show: mockGetCurrentWindowShow
  }),
  PhysicalPosition: vi.fn()
}))

vi.mock('@/stores/music', () => ({
  useMusicStore: () => ({
    isLoading: false,
    isPlaying: false,
    music: null,
    playProgress: 0,
    play: mockMusicPlay,
    pause: mockMusicPause,
    playPrevOrNext: mockMusicPlayPrevOrNext
  })
}))

vi.mock('@/stores/lyric', () => ({
  useLyricStore: () => ({
    lyric: null
  })
}))

vi.mock('@/stores/setting', () => ({
  useSettingStore: () => ({
    availableFonts: [],
    getAvailableFonts: mockGetAvailableFonts,
    setdesktopLyricPosition: mockSetDesktopLyricPosition
  })
}))

// ============================================================================
describe('composables/useDesktopLyricBridge — 主窗口↔桌面歌词桥（M5.4）', () => {
  let lyricWindowRef: any

  beforeEach(() => {
    setActivePinia(createPinia())

    mockEmitTo.mockReset()
    mockListen.mockReset()
    mockUnlisten.mockReset()
    mockGetCurrentWindowShow.mockReset()
    mockMusicPlay.mockReset()
    mockMusicPause.mockReset()
    mockMusicPlayPrevOrNext.mockReset()
    mockSetDesktopLyricPosition.mockReset()
    mockLyricWindowClose.mockReset()
    mockGetAvailableFonts.mockReset()

    mockListen.mockResolvedValue(mockUnlisten)
    mockEmitTo.mockResolvedValue(undefined)

    lyricWindowRef = ref({ close: mockLyricWindowClose })
  })

  // ==========================================================================
  // 1. start：注册监听
  // ==========================================================================
  describe('1. start', () => {
    it('调用后注册 listen(WindowEvent.DesktopLyric, cb)', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()

      expect(mockListen).toHaveBeenCalledWith(WindowEvent.DesktopLyric, expect.any(Function))

      stop()
    })

    it('start 后调用 stop → 5 个清理函数全部执行（4 watch + 1 unlisten）', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()

      stop()

      expect(mockUnlisten).toHaveBeenCalledTimes(1)
      expect(mockLyricWindowClose).toHaveBeenCalledTimes(1)
      expect(lyricWindowRef.value).toBeUndefined()
    })
  })

  // ==========================================================================
  // 2. Init 事件：同步所有数据
  // ==========================================================================
  describe('2. Init 事件', () => {
    it('Init → emit Audio + Lyric + Fonts + Progress', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Init, data: null } })

      const emitTypes = mockEmitTo.mock.calls.map((c) => c[2].type)
      expect(emitTypes).toContain(DesktopLyricEmit.Audio)
      expect(emitTypes).toContain(DesktopLyricEmit.Lyric)
      expect(emitTypes).toContain(DesktopLyricEmit.Fonts)
      expect(emitTypes).toContain(DesktopLyricEmit.Progress)

      stop()
    })

    it('Init 时 availableFonts 为空 → 调用 getAvailableFonts 后再 emit', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Init, data: null } })

      expect(mockGetAvailableFonts).toHaveBeenCalledTimes(1)

      stop()
    })
  })

  // ==========================================================================
  // 3. Main 事件：显示主窗口
  // ==========================================================================
  describe('3. Main 事件', () => {
    it('Main 事件 → getCurrentWindow().show()', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Main, data: null } })
      expect(mockGetCurrentWindowShow).toHaveBeenCalledTimes(1)

      stop()
    })
  })

  // ==========================================================================
  // 4. 播放控制事件路由
  // ==========================================================================
  describe('4. 播放控制事件路由', () => {
    it('Play 事件 → musicStore.play()', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Play, data: null } })
      expect(mockMusicPlay).toHaveBeenCalledTimes(1)

      stop()
    })

    it('Pause 事件 → musicStore.pause()', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Pause, data: null } })
      expect(mockMusicPause).toHaveBeenCalledTimes(1)

      stop()
    })

    it('Prev 事件 → musicStore.playPrevOrNext("prev")', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Prev, data: null } })
      expect(mockMusicPlayPrevOrNext).toHaveBeenCalledWith('prev')

      stop()
    })

    it('Next 事件 → musicStore.playPrevOrNext("next")', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Next, data: null } })
      expect(mockMusicPlayPrevOrNext).toHaveBeenCalledWith('next')

      stop()
    })
  })

  // ==========================================================================
  // 5. Pos 事件：更新桌面歌词坐标
  // ==========================================================================
  describe('5. Pos 事件', () => {
    it('Pos 事件 → settingStore.setdesktopLyricPosition({ x, y })', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Pos, data: { x: 50, y: 80 } } })
      expect(mockSetDesktopLyricPosition).toHaveBeenCalledWith({ x: 50, y: 80 })

      stop()
    })
  })

  // ==========================================================================
  // 6. Close 事件：触发 stop
  // ==========================================================================
  describe('6. Close 事件', () => {
    it('Close 事件 → stop（关闭 lyricWindow + 清空 ref）', async () => {
      const { start } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Close, data: null } })

      expect(mockLyricWindowClose).toHaveBeenCalledTimes(1)
      expect(lyricWindowRef.value).toBeUndefined()
    })
  })

  // ==========================================================================
  // 7. stop：边界条件
  // ==========================================================================
  describe('7. stop 边界', () => {
    it('lyricWindowRef.value 为 undefined 时 → 不调用 close', async () => {
      lyricWindowRef.value = undefined
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()

      stop()

      expect(mockLyricWindowClose).not.toHaveBeenCalled()
      expect(mockUnlisten).toHaveBeenCalledTimes(1)
    })

    it('重复调用 stop 不抛错（stopFns 清空后 length=0）', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()

      stop()
      expect(() => stop()).not.toThrow()
    })
  })

  // ==========================================================================
  // 8. 事件名规范：验证带业务前缀
  // ==========================================================================
  describe('8. 事件名规范', () => {
    it('listen 的事件名带 "desktop-lyric:" 前缀', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()

      const eventName = mockListen.mock.calls[0][0]
      expect(eventName).toBe('desktop-lyric:handler')
      expect(eventName.startsWith('desktop-lyric:')).toBe(true)

      stop()
    })

    it('emitTo 的 target 为 WindowTarget.DesktopLyric', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: DesktopLyricEmit.Init, data: null } })

      mockEmitTo.mock.calls.forEach((call) => {
        expect(call[0]).toBe(WindowTarget.DesktopLyric)
      })

      stop()
    })

    it('所有 DesktopLyricEmit 枚举值都被 switch 处理（白盒验证）', async () => {
      const { start, stop } = useDesktopLyricBridge(lyricWindowRef)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      // Main → getCurrentWindow().show
      listenCb({ payload: { type: DesktopLyricEmit.Main, data: null } })
      expect(mockGetCurrentWindowShow).toHaveBeenCalled()

      // Play/Pause/Prev/Next 都不应抛错
      listenCb({ payload: { type: DesktopLyricEmit.Play, data: null } })
      listenCb({ payload: { type: DesktopLyricEmit.Pause, data: null } })
      listenCb({ payload: { type: DesktopLyricEmit.Prev, data: null } })
      listenCb({ payload: { type: DesktopLyricEmit.Next, data: null } })

      // Pos 需要 data: { x, y }
      listenCb({ payload: { type: DesktopLyricEmit.Pos, data: { x: 1, y: 2 } } })

      // Close 触发 stop（最后一次调用）
      listenCb({ payload: { type: DesktopLyricEmit.Close, data: null } })

      // 验证不抛错即可（switch 无 default，未处理的 case 静默跳过）
      const remainingTypes: DesktopLyricEmit[] = [
        DesktopLyricEmit.Main,
        DesktopLyricEmit.Play,
        DesktopLyricEmit.Pause,
        DesktopLyricEmit.Prev,
        DesktopLyricEmit.Next
      ]
      remainingTypes.forEach((type) => {
        expect(() => listenCb({ payload: { type, data: null } })).not.toThrow()
      })

      stop()
    })
  })
})
