import { useSettingStore } from '@/stores/setting'
import { AutoStartMode, CloseStatus, ShortcutKey } from '@/utils/params'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock（vi.hoisted：vi.mock 会被提升到文件顶部，所有 mock 变量必须在此创建）
// ============================================================================
const {
  mockIsRegistered,
  mockRegister,
  mockUnregister,
  mockUnregisterAll,
  mockNotifyError,
  mockNotifySuccess,
  mockNotifyWarning,
  mockMusicPause,
  mockMusicPlay,
  mockMusicSetVolume,
  mockMusicPlayPrevOrNext,
  mockMusicSeek,
  // 可变 music 状态：用 getter 让 setting.ts 内部闭包捕获的对象能动态读取
  mockMusicState
} = vi.hoisted(() => ({
  mockIsRegistered: vi.fn(),
  mockRegister: vi.fn(),
  mockUnregister: vi.fn(),
  mockUnregisterAll: vi.fn(),
  mockNotifyError: vi.fn(),
  mockNotifySuccess: vi.fn(),
  mockNotifyWarning: vi.fn(),
  mockMusicPause: vi.fn(),
  mockMusicPlay: vi.fn(),
  mockMusicSetVolume: vi.fn(),
  mockMusicPlayPrevOrNext: vi.fn(),
  mockMusicSeek: vi.fn(),
  mockMusicState: {
    isPlaying: false,
    volume: 50,
    lastVolumn: 80,
    playProgress: 100
  }
}))

vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  isRegistered: mockIsRegistered,
  register: mockRegister,
  unregister: mockUnregister,
  unregisterAll: mockUnregisterAll
}))

vi.mock('@/components/Notification.vue', () => ({
  notify: {
    success: mockNotifySuccess,
    error: mockNotifyError,
    warning: mockNotifyWarning,
    info: vi.fn()
  }
}))

// 用 getter 让 musicStore 字段动态读取 mockMusicState，测试中修改 mockMusicState 即可生效
vi.mock('@/stores/music', () => ({
  useMusicStore: () => ({
    get isPlaying() {
      return mockMusicState.isPlaying
    },
    get volume() {
      return mockMusicState.volume
    },
    get lastVolumn() {
      return mockMusicState.lastVolumn
    },
    get playProgress() {
      return mockMusicState.playProgress
    },
    pause: mockMusicPause,
    play: mockMusicPlay,
    setVolume: mockMusicSetVolume,
    playPrevOrNext: mockMusicPlayPrevOrNext,
    seek: mockMusicSeek
  })
}))

// ============================================================================
// 辅助：异步刷新队列（watch 回调 + toggle 内部未 await 的异步链）
// ============================================================================
const flushAll = async (depth = 30) => {
  for (let i = 0; i < depth; i++) {
    await Promise.resolve()
  }
}

// ============================================================================
describe('stores/setting — 系统设置/快捷键/字体/窗口状态（M4.1）', () => {
  let settingStore: ReturnType<typeof useSettingStore>

  beforeEach(() => {
    setActivePinia(createPinia())

    mockIsRegistered.mockReset()
    mockRegister.mockReset()
    mockUnregister.mockReset()
    mockUnregisterAll.mockReset()
    mockNotifyError.mockReset()
    mockNotifySuccess.mockReset()
    mockNotifyWarning.mockReset()
    mockMusicPause.mockReset()
    mockMusicPlay.mockReset()
    mockMusicSetVolume.mockReset()
    mockMusicPlayPrevOrNext.mockReset()
    mockMusicSeek.mockReset()

    // 重置 music 状态
    mockMusicState.isPlaying = false
    mockMusicState.volume = 50
    mockMusicState.lastVolumn = 80
    mockMusicState.playProgress = 100

    // 默认未注册 + register/unregister 正常 resolve
    mockIsRegistered.mockResolvedValue(false)
    mockRegister.mockResolvedValue(undefined)
    mockUnregister.mockResolvedValue(undefined)
    mockUnregisterAll.mockResolvedValue(undefined)

    settingStore = useSettingStore()
  })

  // ==========================================================================
  // 1. 初始默认值
  // ==========================================================================
  describe('1. 初始默认值', () => {
    it('窗口状态/字体/快捷键/设备/坐标全部为默认', () => {
      expect(settingStore.isHydrated).toBe(false)
      expect(settingStore.isMaximized).toBe(false)
      expect(settingStore.isFullscreen).toBe(false)
      expect(settingStore.autoLiteVipState).toBe(false)
      expect(settingStore.availableFonts).toEqual([])
      expect(settingStore.fontFamily).toBe('system-ui')
      expect(settingStore.autoStartState).toBe(false)
      expect(settingStore.autoStartMode).toBe(AutoStartMode.Foreground)
      expect(settingStore.closeStatus).toBeUndefined()
      expect(settingStore.globalShortcutState).toBe(true)
      expect(settingStore.mediaShortcutState).toBe(true)
      expect(settingStore.device).toBe('')
      expect(settingStore.miniPlayerPosition).toEqual({ x: 0, y: 0 })
      expect(settingStore.desktopLyricPosition).toEqual({ x: 0, y: 0 })
    })

    it('shortcutMap 初始等于 Default_Shortcut 副本', () => {
      expect(settingStore.shortcutMap.playOrPause).toBe('Alt+F5')
      expect(settingStore.shortcutMap.addVolumn).toBe('Alt+Up')
      expect(settingStore.shortcutMap.subVolumn).toBe('Alt+Down')
      expect(settingStore.shortcutMap.mute).toBe('Alt+S')
      expect(settingStore.shortcutMap.prev).toBe('Alt+Left')
      expect(settingStore.shortcutMap.next).toBe('Alt+Right')
      expect(settingStore.shortcutMap.backward).toBe('Ctrl+Alt+Left')
      expect(settingStore.shortcutMap.forward).toBe('Ctrl+Alt+Right')

      // 修改 store 不影响后续 reset
      settingStore.setShortcutMap(ShortcutKey.PlayOrPause, 'Ctrl+P')
      expect(settingStore.shortcutMap.playOrPause).toBe('Ctrl+P')
    })
  })

  // ==========================================================================
  // 2. 基础 setter（直接字段赋值类）
  // ==========================================================================
  describe('2. 基础 setter', () => {
    it('toggleAutoLiteVipState：取反', () => {
      expect(settingStore.autoLiteVipState).toBe(false)
      settingStore.toggleAutoLiteVipState()
      expect(settingStore.autoLiteVipState).toBe(true)
      settingStore.toggleAutoLiteVipState()
      expect(settingStore.autoLiteVipState).toBe(false)
    })

    it('toggleMaximizedState(state)：直接赋值', () => {
      settingStore.toggleMaximizedState(true)
      expect(settingStore.isMaximized).toBe(true)
      settingStore.toggleMaximizedState(false)
      expect(settingStore.isMaximized).toBe(false)
    })

    it('toggleFullscreenState(state)：直接赋值', () => {
      settingStore.toggleFullscreenState(true)
      expect(settingStore.isFullscreen).toBe(true)
      settingStore.toggleFullscreenState(false)
      expect(settingStore.isFullscreen).toBe(false)
    })

    it('setFontFamily(font)', () => {
      settingStore.setFontFamily('Microsoft YaHei')
      expect(settingStore.fontFamily).toBe('Microsoft YaHei')
    })

    it('toggleAutoStartState(state)', () => {
      settingStore.toggleAutoStartState(true)
      expect(settingStore.autoStartState).toBe(true)
    })

    it('setAutoStartMode(mode)', () => {
      settingStore.setAutoStartMode(AutoStartMode.Background)
      expect(settingStore.autoStartMode).toBe(AutoStartMode.Background)
    })

    it('setCloseStatus(status)', () => {
      settingStore.setCloseStatus(CloseStatus.Hide)
      expect(settingStore.closeStatus).toBe(CloseStatus.Hide)
      settingStore.setCloseStatus(CloseStatus.Exit)
      expect(settingStore.closeStatus).toBe(CloseStatus.Exit)
    })

    it('setDevice(id)', () => {
      settingStore.setDevice('dev-001')
      expect(settingStore.device).toBe('dev-001')
    })

    it('setMiniPlayerPosition(pos)', () => {
      settingStore.setMiniPlayerPosition({ x: 100, y: 200 })
      expect(settingStore.miniPlayerPosition).toEqual({ x: 100, y: 200 })
    })

    it('setdesktopLyricPosition(pos)', () => {
      settingStore.setdesktopLyricPosition({ x: 10, y: 20 })
      expect(settingStore.desktopLyricPosition).toEqual({ x: 10, y: 20 })
    })

    it('setShortcutMap(key, value)：单键更新', () => {
      settingStore.setShortcutMap(ShortcutKey.Mute, 'Ctrl+M')
      expect(settingStore.shortcutMap.mute).toBe('Ctrl+M')
      expect(settingStore.shortcutMap.playOrPause).toBe('Alt+F5')
    })

    it('resetShortcutMap()：恢复全部默认值', () => {
      settingStore.setShortcutMap(ShortcutKey.PlayOrPause, 'X')
      settingStore.setShortcutMap(ShortcutKey.Next, 'Y')
      settingStore.resetShortcutMap()
      expect(settingStore.shortcutMap.playOrPause).toBe('Alt+F5')
      expect(settingStore.shortcutMap.next).toBe('Alt+Right')
    })
  })

  // ==========================================================================
  // 3. getAvailableFonts：canvas 检测可用字体
  // ==========================================================================
  describe('3. getAvailableFonts：canvas measureText 比较', () => {
    it('context 为 null → 直接 return，availableFonts 不变', () => {
      vi.spyOn(document, 'createElement').mockReturnValue({
        getContext: () => null
      } as any)

      settingStore.getAvailableFonts()
      expect(settingStore.availableFonts).toEqual([])

      vi.restoreAllMocks()
    })

    it('字体宽度差异 > 0.1 → 推入 availableFonts；无差异 → 跳过', () => {
      const measureText = vi.fn()
      measureText
        .mockReturnValueOnce({ width: 100 }) // baseWidth
        .mockReturnValueOnce({ width: 100 }) // fonts[0] 无差异
        .mockReturnValueOnce({ width: 100 }) // fonts[1] 无差异
        .mockReturnValueOnce({ width: 200 }) // fonts[2] 有差异 → 推入
      // 之后的全部返回 100（无差异）
      measureText.mockReturnValue({ width: 100 })

      const ctx = { font: '', measureText } as unknown as CanvasRenderingContext2D
      vi.spyOn(document, 'createElement').mockReturnValue({
        getContext: () => ctx
      } as any)

      settingStore.getAvailableFonts()

      // DefaultSystemFonts[2] = ['微软雅黑 UI', 'Microsoft YaHei UI']
      expect(settingStore.availableFonts).toHaveLength(1)
      expect(settingStore.availableFonts[0]).toEqual(['微软雅黑 UI', 'Microsoft YaHei UI'])

      vi.restoreAllMocks()
    })
  })

  // ==========================================================================
  // 4. toggleGlobalShortcutState：取反 + 注册/注销分发
  // ==========================================================================
  describe('4. toggleGlobalShortcutState', () => {
    it('true → false：调用 unregisterAllGlobalShortcut（遍历 8 个 key 调 unregister）', async () => {
      expect(settingStore.globalShortcutState).toBe(true)
      settingStore.toggleGlobalShortcutState()
      await flushAll()
      expect(settingStore.globalShortcutState).toBe(false)
      expect(mockUnregister).toHaveBeenCalledTimes(8)
    })

    it('false → true：调用 registerAllGlobalShortcut（遍历 8 个 key 调 register）', async () => {
      // 先置为 false
      settingStore.toggleGlobalShortcutState()
      await flushAll()
      mockUnregister.mockClear()
      mockRegister.mockClear()

      // 再切回 true
      settingStore.toggleGlobalShortcutState()
      await flushAll()
      expect(settingStore.globalShortcutState).toBe(true)
      expect(mockRegister).toHaveBeenCalledTimes(8)
    })
  })

  // ==========================================================================
  // 5. toggleMediaShortcutState：取反 + 媒体键注册/注销
  // ==========================================================================
  describe('5. toggleMediaShortcutState', () => {
    it('true → false：调用 unregisterMediaShortcut（注销 3 个媒体键）', async () => {
      expect(settingStore.mediaShortcutState).toBe(true)
      settingStore.toggleMediaShortcutState()
      await flushAll()
      expect(settingStore.mediaShortcutState).toBe(false)
      // unregisterMediaShortcut 内部：if (mediaShortcutState.value) return
      // 此时 mediaShortcutState 已被取反为 false → 不 return，执行 3 个 unregister
      expect(mockUnregister).toHaveBeenCalledTimes(3)
      expect(mockUnregister).toHaveBeenCalledWith('MediaPlayPause')
      expect(mockUnregister).toHaveBeenCalledWith('F9')
      expect(mockUnregister).toHaveBeenCalledWith('F7')
    })

    it('false → true：调用 registerMediaShortcut（注册 3 个媒体键）', async () => {
      // 先置 false
      settingStore.toggleMediaShortcutState()
      await flushAll()
      mockRegister.mockClear()
      mockUnregister.mockClear()

      // 切回 true
      settingStore.toggleMediaShortcutState()
      await flushAll()
      expect(settingStore.mediaShortcutState).toBe(true)
      expect(mockRegister).toHaveBeenCalledTimes(3)
      expect(mockRegister).toHaveBeenCalledWith('MediaPlayPause', expect.any(Function))
      expect(mockRegister).toHaveBeenCalledWith('F9', expect.any(Function))
      expect(mockRegister).toHaveBeenCalledWith('F7', expect.any(Function))
    })

    it('registerMediaShortcut 内部 register 抛错 → catch：mediaShortcutState=false + notify.error', async () => {
      // 先置 false（触发 unregister 分支）
      settingStore.toggleMediaShortcutState()
      await flushAll()
      mockUnregister.mockClear()

      // 设置 register 第一次抛错，后续正常 resolve
      mockRegister.mockReset()
      mockRegister.mockRejectedValueOnce(new Error('occupied'))
      mockRegister.mockResolvedValue(undefined)

      // toggle false→true 触发 registerMediaShortcut
      settingStore.toggleMediaShortcutState()
      await flushAll()

      expect(settingStore.mediaShortcutState).toBe(false)
      expect(mockNotifyError).toHaveBeenCalledWith('媒体快捷键启用失败, 可能被占用')
    })
  })

  // ==========================================================================
  // 6. registerGlobalShortcut：8 种 ShortcutKey 分支 + 解析错误分支
  // ==========================================================================
  describe('6. registerGlobalShortcut：8 种 type 分支', () => {
    it('shortcut 为空字符串 → 直接 return（不注册）', async () => {
      settingStore.setShortcutMap(ShortcutKey.PlayOrPause, '')
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('mainKeys.length !== 1（无主键）→ setShortcutMap(type, "") + return', async () => {
      settingStore.setShortcutMap(ShortcutKey.PlayOrPause, 'Ctrl+Shift+Alt')
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(mockRegister).not.toHaveBeenCalled()
      expect(settingStore.shortcutMap.playOrPause).toBe('')
    })

    it('mainKeys.length > 1（多个主键）→ setShortcutMap(type, "") + return', async () => {
      settingStore.setShortcutMap(ShortcutKey.PlayOrPause, 'Ctrl+A+B')
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(mockRegister).not.toHaveBeenCalled()
      expect(settingStore.shortcutMap.playOrPause).toBe('')
    })

    it('isRegistered=true（已注册）→ 跳过 register', async () => {
      mockIsRegistered.mockResolvedValueOnce(true)
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('playOrPause：register 被调用，回调 Released 不触发 play/pause', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(mockRegister).toHaveBeenCalledWith('Alt+F5', expect.any(Function))

      capturedCb({ state: 'Released' })
      expect(mockMusicPause).not.toHaveBeenCalled()
      expect(mockMusicPlay).not.toHaveBeenCalled()
    })

    it('playOrPause 回调 Pressed + isPlaying=false → musicStore.play()', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      mockMusicState.isPlaying = false
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicPlay).toHaveBeenCalledTimes(1)
      expect(mockMusicPause).not.toHaveBeenCalled()
    })

    it('playOrPause 回调 Pressed + isPlaying=true → musicStore.pause()', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      mockMusicState.isPlaying = true
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicPause).toHaveBeenCalledTimes(1)
      expect(mockMusicPlay).not.toHaveBeenCalled()
    })

    it('addVolumn 回调 Pressed → setVolume(volume + 5)', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      mockMusicState.volume = 50
      await settingStore.registerGlobalShortcut(ShortcutKey.AddVolumn)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicSetVolume).toHaveBeenCalledWith(55)
    })

    it('subVolumn 回调 Pressed → setVolume(volume - 5)', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      mockMusicState.volume = 50
      await settingStore.registerGlobalShortcut(ShortcutKey.SubVolumn)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicSetVolume).toHaveBeenCalledWith(45)
    })

    it('mute 回调 Pressed + volume>0 → setVolume(0)', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      mockMusicState.volume = 50
      await settingStore.registerGlobalShortcut(ShortcutKey.Mute)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicSetVolume).toHaveBeenCalledWith(0)
    })

    it('mute 回调 Pressed + volume=0 → setVolume(lastVolumn)', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      mockMusicState.volume = 0
      mockMusicState.lastVolumn = 80
      await settingStore.registerGlobalShortcut(ShortcutKey.Mute)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicSetVolume).toHaveBeenCalledWith(80)
    })

    it('prev 回调 Pressed → playPrevOrNext("prev")', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      await settingStore.registerGlobalShortcut(ShortcutKey.Prev)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicPlayPrevOrNext).toHaveBeenCalledWith('prev')
    })

    it('next 回调 Pressed → playPrevOrNext("next")', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      await settingStore.registerGlobalShortcut(ShortcutKey.Next)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicPlayPrevOrNext).toHaveBeenCalledWith('next')
    })

    it('forward 回调 Pressed → seek(playProgress + 5)', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      mockMusicState.playProgress = 100
      await settingStore.registerGlobalShortcut(ShortcutKey.Forward)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicSeek).toHaveBeenCalledWith(105)
    })

    it('backward 回调 Pressed → seek(playProgress - 5)', async () => {
      let capturedCb: any
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        capturedCb = cb
      })
      mockMusicState.playProgress = 100
      await settingStore.registerGlobalShortcut(ShortcutKey.Backward)
      capturedCb({ state: 'Pressed' })
      expect(mockMusicSeek).toHaveBeenCalledWith(95)
    })

    it('register 抛错 → catch：mediaShortcutState=false + notify.error("注册失败, 可能被占用")', async () => {
      mockRegister.mockRejectedValueOnce(new Error('occupied'))
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      await flushAll()
      expect(settingStore.mediaShortcutState).toBe(false)
      expect(mockNotifyError).toHaveBeenCalledWith('注册失败, 可能被占用')
    })
  })

  // ==========================================================================
  // 7. unregisterGlobalShortcut
  // ==========================================================================
  describe('7. unregisterGlobalShortcut', () => {
    it('shortcut 为空 → 直接 return', async () => {
      settingStore.setShortcutMap(ShortcutKey.PlayOrPause, '')
      await settingStore.unregisterGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(mockUnregister).not.toHaveBeenCalled()
    })

    it('正常注销：调用 unregister(shortcut)', async () => {
      await settingStore.unregisterGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(mockUnregister).toHaveBeenCalledWith('Alt+F5')
    })
  })

  // ==========================================================================
  // 8. registerAllGlobalShortcut / unregisterAllGlobalShortcut
  // ==========================================================================
  describe('8. registerAll / unregisterAll 遍历', () => {
    it('registerAllGlobalShortcut：遍历 8 个 key 全部 register', async () => {
      await settingStore.registerAllGlobalShortcut()
      await flushAll()
      expect(mockRegister).toHaveBeenCalledTimes(8)
    })

    it('unregisterAllGlobalShortcut：遍历 8 个 key 全部 unregister', async () => {
      await settingStore.unregisterAllGlobalShortcut()
      await flushAll()
      expect(mockUnregister).toHaveBeenCalledTimes(8)
      const unregisteredShortcuts = mockUnregister.mock.calls.map((c) => c[0])
      expect(unregisteredShortcuts).toContain('Alt+F5')
      expect(unregisteredShortcuts).toContain('Alt+Up')
      expect(unregisteredShortcuts).toContain('Alt+Down')
      expect(unregisteredShortcuts).toContain('Alt+S')
      expect(unregisteredShortcuts).toContain('Alt+Left')
      expect(unregisteredShortcuts).toContain('Alt+Right')
      expect(unregisteredShortcuts).toContain('Ctrl+Alt+Left')
      expect(unregisteredShortcuts).toContain('Ctrl+Alt+Right')
    })
  })

  // ==========================================================================
  // 9. 媒体快捷键回调（通过 toggleMediaShortcutState 触发 registerMediaShortcut）
  // ==========================================================================
  describe('9. 媒体快捷键回调', () => {
    it('toggle false→true：MediaPlayPause 回调 Pressed + isPlaying=false → play()', async () => {
      let playPauseCb: any
      // 先置 false
      settingStore.toggleMediaShortcutState()
      await flushAll()
      mockUnregister.mockClear()

      // 设置 mockRegister 捕获第一个回调（MediaPlayPause）
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        playPauseCb = cb
      })
      // 后两个媒体键 register 正常 resolve
      mockRegister.mockResolvedValue(undefined)

      // toggle false→true 触发 registerMediaShortcut
      settingStore.toggleMediaShortcutState()
      await flushAll()

      expect(mockRegister).toHaveBeenCalledTimes(3)
      mockMusicState.isPlaying = false
      playPauseCb({ state: 'Pressed' })
      expect(mockMusicPlay).toHaveBeenCalledTimes(1)
    })

    it('MediaPlayPause 回调 Released → 不触发 play/pause', async () => {
      let playPauseCb: any
      settingStore.toggleMediaShortcutState()
      await flushAll()
      mockUnregister.mockClear()

      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        playPauseCb = cb
      })
      mockRegister.mockResolvedValue(undefined)

      settingStore.toggleMediaShortcutState()
      await flushAll()

      playPauseCb({ state: 'Released' })
      expect(mockMusicPlay).not.toHaveBeenCalled()
      expect(mockMusicPause).not.toHaveBeenCalled()
    })

    it('F9 键（切下一首）回调 Pressed → playPrevOrNext("next")', async () => {
      let nextCb: any
      settingStore.toggleMediaShortcutState()
      await flushAll()
      mockUnregister.mockClear()

      // 第 1 个 register（MediaPlayPause）正常 resolve
      mockRegister.mockResolvedValueOnce(undefined)
      // 第 2 个（MediaTrackNext）捕获回调
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        nextCb = cb
      })
      // 第 3 个正常 resolve
      mockRegister.mockResolvedValueOnce(undefined)

      settingStore.toggleMediaShortcutState()
      await flushAll()

      nextCb({ state: 'Pressed' })
      expect(mockMusicPlayPrevOrNext).toHaveBeenCalledWith('next')
    })

    it('F7 键（切上一首）回调 Pressed → playPrevOrNext("prev")', async () => {
      let prevCb: any
      settingStore.toggleMediaShortcutState()
      await flushAll()
      mockUnregister.mockClear()

      mockRegister.mockResolvedValueOnce(undefined)
      mockRegister.mockResolvedValueOnce(undefined)
      mockRegister.mockImplementationOnce(async (_s: string, cb: any) => {
        prevCb = cb
      })

      settingStore.toggleMediaShortcutState()
      await flushAll()

      prevCb({ state: 'Pressed' })
      expect(mockMusicPlayPrevOrNext).toHaveBeenCalledWith('prev')
    })

    it('registerMediaShortcut 内部 register 抛错 → catch：mediaShortcutState=false + notify.error', async () => {
      settingStore.toggleMediaShortcutState()
      await flushAll()
      mockUnregister.mockClear()

      // 设置 register 抛错
      mockRegister.mockReset()
      mockRegister.mockRejectedValueOnce(new Error('occupied'))
      mockRegister.mockResolvedValue(undefined)

      settingStore.toggleMediaShortcutState() // false→true 触发 registerMediaShortcut
      await flushAll()

      expect(settingStore.mediaShortcutState).toBe(false)
      expect(mockNotifyError).toHaveBeenCalledWith('媒体快捷键启用失败, 可能被占用')
    })
  })

  // ==========================================================================
  // 10. watch(isHydrated, { once: true })
  // ==========================================================================
  describe('10. watch(isHydrated)：首次 hydrated → unregisterAll + registerAll + registerMedia', () => {
    it('isHydrated=true → 触发 unregisterAll() + registerAllGlobalShortcut() + registerMediaShortcut()', async () => {
      ;(settingStore as any).isHydrated = true
      await flushAll(40)

      expect(mockUnregisterAll).toHaveBeenCalledTimes(1)
      // 8 global + 3 media = 11
      expect(mockRegister).toHaveBeenCalledTimes(11)
    })

    it('once: true — 再次切换 isHydrated 不会重复触发', async () => {
      ;(settingStore as any).isHydrated = true
      await flushAll(40)
      const registerCountAfter1 = mockRegister.mock.calls.length

      ;(settingStore as any).isHydrated = false
      await flushAll(10)
      ;(settingStore as any).isHydrated = true
      await flushAll(40)

      const registerCountAfter2 = mockRegister.mock.calls.length
      expect(registerCountAfter2).toBe(registerCountAfter1)
    })

    it('isHydrated 保持 false → 不触发任何注册/注销', async () => {
      await flushAll(20)
      expect(mockUnregisterAll).not.toHaveBeenCalled()
      expect(mockRegister).not.toHaveBeenCalled()
    })
  })
})
