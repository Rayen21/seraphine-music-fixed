import { useMiniPlayerBridge } from '@/composables/useMiniPlayerBridge'
import { MiniPlayerEmit, WindowEvent, WindowTarget } from '@/utils/params'
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
  mockMusicPlay,
  mockMusicPause,
  mockMusicPlayPrevOrNext,
  mockMusicSetMusic,
  mockSetMiniPlayerPosition,
  mockMainWindowShow,
  mockMiniWindowClose
} = vi.hoisted(() => ({
  mockEmitTo: vi.fn(),
  mockListen: vi.fn(),
  mockUnlisten: vi.fn(),
  mockMusicPlay: vi.fn(),
  mockMusicPause: vi.fn(),
  mockMusicPlayPrevOrNext: vi.fn(),
  mockMusicSetMusic: vi.fn(),
  mockSetMiniPlayerPosition: vi.fn(),
  mockMainWindowShow: vi.fn(),
  mockMiniWindowClose: vi.fn()
}))

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: mockEmitTo,
  listen: mockListen
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: vi.fn()
}))

vi.mock('@/stores/list', () => ({
  useListStore: () => ({
    play: { list: [] }
  })
}))

vi.mock('@/stores/music', () => ({
  useMusicStore: () => ({
    isLoading: false,
    isPlaying: false,
    music: null,
    origin: null,
    playProgress: 0,
    play: mockMusicPlay,
    pause: mockMusicPause,
    playPrevOrNext: mockMusicPlayPrevOrNext,
    setMusic: mockMusicSetMusic
  })
}))

vi.mock('@/stores/lyric', () => ({
  useLyricStore: () => ({
    lyric: null,
    offsetMap: {}
  })
}))

vi.mock('@/stores/setting', () => ({
  useSettingStore: () => ({
    setMiniPlayerPosition: mockSetMiniPlayerPosition
  })
}))

// ============================================================================
// 夹具
// ============================================================================
const mkMusic = (id: string, extra: Partial<ListMusic> = {}): ListMusic => ({
  id,
  hash: null,
  path: null,
  cover: null,
  title: `Song-${id}`,
  artist: '',
  duration: 100,
  album: '',
  sort: 0,
  ...extra
})

// ============================================================================
describe('composables/useMiniPlayerBridge — 主窗口↔迷你播放器桥（M5.3）', () => {
  let miniWindowRef: any
  let mainWindow: any

  beforeEach(() => {
    setActivePinia(createPinia())

    mockEmitTo.mockReset()
    mockListen.mockReset()
    mockUnlisten.mockReset()
    mockMusicPlay.mockReset()
    mockMusicPause.mockReset()
    mockMusicPlayPrevOrNext.mockReset()
    mockMusicSetMusic.mockReset()
    mockSetMiniPlayerPosition.mockReset()
    mockMainWindowShow.mockReset()
    mockMiniWindowClose.mockReset()

    // listen 默认返回 unlisten 函数
    mockListen.mockResolvedValue(mockUnlisten)
    mockEmitTo.mockResolvedValue(undefined)

    miniWindowRef = ref({ close: mockMiniWindowClose })
    mainWindow = { show: mockMainWindowShow }
  })

  // ==========================================================================
  // 1. start：注册监听 + 返回 stop
  // ==========================================================================
  describe('1. start', () => {
    it('调用后注册 listen(WindowEvent.MiniPlayer, cb)', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()

      expect(mockListen).toHaveBeenCalledWith(WindowEvent.MiniPlayer, expect.any(Function))

      stop()
    })

    it('start 返回后 stopFns 已注册 4 个清理函数（3 watch + 1 unlisten）', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()

      // 触发 listen 的 unlisten + 3 个 watch 的 unwatch
      stop()

      // mainWindow.show 被调用
      expect(mockMainWindowShow).toHaveBeenCalledTimes(1)
      // miniWindow.close 被调用
      expect(mockMiniWindowClose).toHaveBeenCalledTimes(1)
      // miniWindowRef.value 被清空
      expect(miniWindowRef.value).toBeUndefined()
      // listen 的 unlisten 被调用
      expect(mockUnlisten).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // 2. syncAudio：响应 music store 变化
  // ==========================================================================
  describe('2. syncAudio（通过事件路由触发 Init）', () => {
    it('Init 事件 → emitTo(Audio 数据)', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()

      // 取出 listen 注册的回调
      const listenCb = mockListen.mock.calls[0][1]
      listenCb({ payload: { type: MiniPlayerEmit.Init, data: null } })

      // 验证 emitTo 被调用，target 为 MiniPlayer
      expect(mockEmitTo).toHaveBeenCalledWith(
        WindowTarget.MiniPlayer,
        WindowEvent.MiniPlayer,
        expect.objectContaining({ type: MiniPlayerEmit.Audio })
      )

      stop()
    })

    it('Init 事件 → 同时 emit Playlist 和 Lyric', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()

      const listenCb = mockListen.mock.calls[0][1]
      listenCb({ payload: { type: MiniPlayerEmit.Init, data: null } })

      const emitTypes = mockEmitTo.mock.calls.map((c) => c[2].type)
      expect(emitTypes).toContain(MiniPlayerEmit.Audio)
      expect(emitTypes).toContain(MiniPlayerEmit.Playlist)
      // Lyric 在 lyric=null 时不应 emit
      stop()
    })
  })

  // ==========================================================================
  // 3. 事件路由：Play / Pause / Prev / Next
  // ==========================================================================
  describe('3. 播放控制事件路由', () => {
    it('Play 事件 → musicStore.play()', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: MiniPlayerEmit.Play, data: null } })
      expect(mockMusicPlay).toHaveBeenCalledTimes(1)

      stop()
    })

    it('Pause 事件 → musicStore.pause()', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: MiniPlayerEmit.Pause, data: null } })
      expect(mockMusicPause).toHaveBeenCalledTimes(1)

      stop()
    })

    it('Prev 事件 → musicStore.playPrevOrNext("prev")', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: MiniPlayerEmit.Prev, data: null } })
      expect(mockMusicPlayPrevOrNext).toHaveBeenCalledWith('prev')

      stop()
    })

    it('Next 事件 → musicStore.playPrevOrNext("next")', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: MiniPlayerEmit.Next, data: null } })
      expect(mockMusicPlayPrevOrNext).toHaveBeenCalledWith('next')

      stop()
    })
  })

  // ==========================================================================
  // 4. Set 事件：播放指定音频
  // ==========================================================================
  describe('4. Set 事件', () => {
    it('Set 事件 → musicStore.setMusic(music, { origin })', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      const music = mkMusic('test-1')
      listenCb({ payload: { type: MiniPlayerEmit.Set, data: music } })

      expect(mockMusicSetMusic).toHaveBeenCalledTimes(1)
      const [argMusic, argOpts] = mockMusicSetMusic.mock.calls[0]
      expect(argMusic).toBe(music)
      expect(argOpts).toHaveProperty('origin')

      stop()
    })
  })

  // ==========================================================================
  // 5. Pos 事件：更新 mini player 坐标
  // ==========================================================================
  describe('5. Pos 事件', () => {
    it('Pos 事件 → settingStore.setMiniPlayerPosition({ x, y })', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: MiniPlayerEmit.Pos, data: { x: 100, y: 200 } } })
      expect(mockSetMiniPlayerPosition).toHaveBeenCalledWith({ x: 100, y: 200 })

      stop()
    })
  })

  // ==========================================================================
  // 6. Close 事件：触发 stop 流程
  // ==========================================================================
  describe('6. Close 事件', () => {
    it('Close 事件 → 调用 stop（mainWindow.show + miniWindow.close）', async () => {
      const { start } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()
      const listenCb = mockListen.mock.calls[0][1]

      listenCb({ payload: { type: MiniPlayerEmit.Close, data: null } })

      expect(mockMainWindowShow).toHaveBeenCalledTimes(1)
      expect(mockMiniWindowClose).toHaveBeenCalledTimes(1)
      expect(miniWindowRef.value).toBeUndefined()
    })
  })

  // ==========================================================================
  // 7. stop：清理监听 + 显示主窗口 + 关闭迷你窗口
  // ==========================================================================
  describe('7. stop', () => {
    it('miniWindowRef.value 为 undefined 时 → mainWindow.show 调用，但不调用 close', async () => {
      miniWindowRef.value = undefined
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()

      stop()

      expect(mockMainWindowShow).toHaveBeenCalledTimes(1)
      expect(mockMiniWindowClose).not.toHaveBeenCalled()
    })

    it('stop 调用 unlisten 清理事件监听', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()

      stop()

      expect(mockUnlisten).toHaveBeenCalledTimes(1)
    })

    it('stop 后 miniWindowRef.value 被置 undefined（再次 stop 不重复 close）', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()

      stop()
      stop() // 二次调用不应抛错

      expect(mockMiniWindowClose).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // 8. 事件名规范：验证带业务前缀
  // ==========================================================================
  describe('8. 事件名规范', () => {
    it('listen 的事件名带 "mini-player:" 前缀', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()

      const eventName = mockListen.mock.calls[0][0]
      expect(eventName).toBe('mini-player:handler')
      expect(eventName.startsWith('mini-player:')).toBe(true)

      stop()
    })

    it('emitTo 的 target 为 WindowTarget.MiniPlayer', async () => {
      const { start, stop } = useMiniPlayerBridge(miniWindowRef, mainWindow)
      await start()
      const listenCb = mockListen.mock.calls[0][1]
      listenCb({ payload: { type: MiniPlayerEmit.Init, data: null } })

      mockEmitTo.mock.calls.forEach((call) => {
        expect(call[0]).toBe(WindowTarget.MiniPlayer)
      })

      stop()
    })
  })
})
