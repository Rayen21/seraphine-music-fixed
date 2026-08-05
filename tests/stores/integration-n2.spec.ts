import { useListStore } from '@/stores/list'
import { useLyricStore } from '@/stores/lyric'
import { useMusicStore } from '@/stores/music'
import { useSettingStore } from '@/stores/setting'
import { useUpdaterStore } from '@/stores/updater'
import { ListType, LyricFormat, PlayingOrigin, ShortcutKey } from '@/utils/params'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock 变量（vi.hoisted 保证被 vi.mock 引用时已初始化）
// ============================================================================
const {
  mockInvoke,
  mockSetAppTitle,
  mockGetRandomNumber,
  mockGetFullName,
  mockParseKrcLyric,
  mockParseLrcLyric,
  mockListen,
  mockChannelInstances,
  mockNotifySuccess,
  mockNotifyError,
  mockNotifyWarning,
  mockNotifyInfo,
  mockRandomUUID,
  mockRegister,
  mockUnregister,
  mockUnregisterAll,
  mockIsRegistered,
  mockCheck,
  mockRelaunch,
  mockGetVersion,
  // 保存 register 回调以便触发快捷键
  shortcutHandlers
} = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockSetAppTitle: vi.fn(),
  mockGetRandomNumber: vi.fn(),
  mockGetFullName: vi.fn(),
  mockParseKrcLyric: vi.fn(),
  mockParseLrcLyric: vi.fn(),
  mockListen: vi.fn().mockResolvedValue(() => {}),
  mockChannelInstances: [] as Array<{ onmessage: (pg: number) => void }>,
  mockNotifySuccess: vi.fn(),
  mockNotifyError: vi.fn(),
  mockNotifyWarning: vi.fn(),
  mockNotifyInfo: vi.fn(),
  mockRandomUUID: vi.fn(),
  mockRegister: vi.fn(),
  mockUnregister: vi.fn(),
  mockUnregisterAll: vi.fn(),
  mockIsRegistered: vi.fn().mockResolvedValue(false),
  mockCheck: vi.fn().mockResolvedValue(null),
  mockRelaunch: vi.fn().mockResolvedValue(undefined),
  mockGetVersion: vi.fn().mockResolvedValue('1.0.0'),
  shortcutHandlers: {} as Record<string, (e: { state: string }) => void>
}))

vi.mock('@/utils/tools', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    invoke: mockInvoke,
    setAppTitle: mockSetAppTitle,
    getRandomNumber: mockGetRandomNumber
  }
})

vi.mock('@/utils/music', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    getFullName: mockGetFullName,
    parseKrcLyric: mockParseKrcLyric,
    parseLrcLyric: mockParseLrcLyric
  }
})

vi.mock('@/components/Notification.vue', () => ({
  notify: {
    success: mockNotifySuccess,
    error: mockNotifyError,
    warning: mockNotifyWarning,
    info: mockNotifyInfo
  }
}))

vi.mock('@tauri-apps/api/core', () => ({
  Channel: vi.fn(function ChannelMock(this: { onmessage: (pg: number) => void }) {
    this.onmessage = () => {}
    mockChannelInstances.push(this)
  })
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn()
  }))
}))

vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  isRegistered: mockIsRegistered,
  // register(shortcut, handler) → 记录 handler 以便测试触发
  register: mockRegister.mockImplementation(
    (shortcut: string, handler: (e: { state: string }) => void) => {
      shortcutHandlers[shortcut] = handler
      return Promise.resolve()
    }
  ),
  unregister: mockUnregister,
  unregisterAll: mockUnregisterAll
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
// 夹具
// ============================================================================
const mkListMusic = (id: string, extra: Partial<ListMusic> = {}): ListMusic => ({
  id,
  hash: `${id}-hash`,
  path: `C:/Music/${id}.mp3`,
  cover: null,
  title: `Title-${id}`,
  artist: `Artist-${id}`,
  album: `Album-${id}`,
  duration: 100 + Number(String(id).match(/\d+/)?.[0] || 0) * 10,
  sort: 0,
  ...extra
})

const mkPlayingMusic = (id: string, extra: Partial<PlayingMusic> = {}): PlayingMusic => ({
  id,
  hash: `${id}-hash`,
  path: `C:/Music/${id}.mp3`,
  cover: null,
  title: `Title-${id}`,
  artist: `Artist-${id}`,
  duration: 100 + Number(String(id).match(/\d+/)?.[0] || 0) * 10,
  ...extra
})

const flushAll = async (depth: number = 24) => {
  for (let i = 0; i < depth; i++) {
    await Promise.resolve()
  }
}

const invokeCount = (cmd: string) => mockInvoke.mock.calls.filter((c: any[]) => c[0] === cmd).length

// 构造模拟 tauri-plugin-updater 返回的 Update 实例
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
describe('stores integration N2：跨 store 联动', () => {
  let musicStore: ReturnType<typeof useMusicStore>
  let listStore: ReturnType<typeof useListStore>
  let lyricStore: ReturnType<typeof useLyricStore>
  let settingStore: ReturnType<typeof useSettingStore>
  let updaterStore: ReturnType<typeof useUpdaterStore>

  beforeEach(() => {
    setActivePinia(createPinia())

    mockGetFullName.mockImplementation((m: PlayingMusic, style?: string) =>
      style === 'at' ? `${m.artist} - ${m.title}` : `${m.artist}-${m.title}`
    )
    mockParseKrcLyric.mockReturnValue([{ offset: 0, content: 'krc' }])
    mockParseLrcLyric.mockReturnValue([{ offset: 0, content: 'lrc' }])
    mockGetRandomNumber.mockImplementation((maxNum) => maxNum)
    mockRandomUUID.mockReturnValue('u-u-i-d')

    mockInvoke.mockReset()
    mockSetAppTitle.mockReset()
    mockListen.mockReset()
    mockChannelInstances.length = 0
    mockNotifySuccess.mockReset()
    mockNotifyError.mockReset()
    mockNotifyWarning.mockReset()
    mockNotifyInfo.mockReset()
    mockRegister.mockClear()
    mockUnregister.mockClear()
    mockUnregisterAll.mockClear()
    mockIsRegistered.mockReset()
    mockIsRegistered.mockResolvedValue(false)
    mockCheck.mockReset()
    mockCheck.mockResolvedValue(null)
    mockRelaunch.mockReset()
    mockRelaunch.mockResolvedValue(undefined)
    mockGetVersion.mockReset()
    mockGetVersion.mockResolvedValue('1.0.0')
    Object.keys(shortcutHandlers).forEach((k) => delete shortcutHandlers[k])

    listStore = useListStore()
    lyricStore = useLyricStore()
    musicStore = useMusicStore()
    settingStore = useSettingStore()
    updaterStore = useUpdaterStore()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // N2.1 setting.registerGlobalShortcut → music play/pause/volume/seek
  // ==========================================================================
  describe('N2.1 setting 快捷键 → music 联动', () => {
    beforeEach(() => {
      // music 处于"已加载未播放"状态，方便 playOrPause 测试
      ;(musicStore as any).music = mkPlayingMusic('s1')
      ;(musicStore as any).isLoaded = true
      ;(musicStore as any).isLoading = false
      ;(musicStore as any).isPlaying = false
      ;(musicStore as any).volume = 50
      ;(musicStore as any).lastVolumn = 50
      ;(musicStore as any).playProgress = 30

      mockInvoke.mockResolvedValue({})
    })

    it('playOrPause 快捷键 → music.play() 被调用（isPlaying=false 时）', async () => {
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      const handler = shortcutHandlers[settingStore.shortcutMap.playOrPause]
      expect(handler).toBeDefined()

      handler({ state: 'Pressed' })
      await flushAll()

      expect(invokeCount('music_player_play')).toBe(1)
      expect(musicStore.isPlaying).toBe(true)
    })

    it('playOrPause 快捷键 → music.pause() 被调用（isPlaying=true 时）', async () => {
      ;(musicStore as any).isPlaying = true
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      const handler = shortcutHandlers[settingStore.shortcutMap.playOrPause]

      handler({ state: 'Pressed' })
      await flushAll()

      expect(invokeCount('music_player_pause')).toBe(1)
      expect(musicStore.isPlaying).toBe(false)
    })

    it('playOrPause Released 事件 → 不触发播放/暂停', async () => {
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      const handler = shortcutHandlers[settingStore.shortcutMap.playOrPause]

      handler({ state: 'Released' })
      await flushAll()

      expect(invokeCount('music_player_play')).toBe(0)
      expect(invokeCount('music_player_pause')).toBe(0)
    })

    it('addVolumn 快捷键 → setVolume(volume+5) → invoke music_player_set_volume', async () => {
      await settingStore.registerGlobalShortcut(ShortcutKey.AddVolumn)
      const handler = shortcutHandlers[settingStore.shortcutMap.addVolumn]

      handler({ state: 'Pressed' })
      await flushAll()

      expect(invokeCount('music_player_set_volume')).toBe(1)
      const callArgs = mockInvoke.mock.calls.find((c) => c[0] === 'music_player_set_volume')
      expect(callArgs![1]).toEqual({ volume: 55 })
      expect(musicStore.volume).toBe(55)
    })

    it('subVolumn 快捷键 → setVolume(volume-5)', async () => {
      await settingStore.registerGlobalShortcut(ShortcutKey.SubVolumn)
      const handler = shortcutHandlers[settingStore.shortcutMap.subVolumn]

      handler({ state: 'Pressed' })
      await flushAll()

      const callArgs = mockInvoke.mock.calls.find((c) => c[0] === 'music_player_set_volume')
      expect(callArgs![1]).toEqual({ volume: 45 })
      expect(musicStore.volume).toBe(45)
    })

    it('mute 快捷键 → 音量从非零切到 0', async () => {
      await settingStore.registerGlobalShortcut(ShortcutKey.Mute)
      const handler = shortcutHandlers[settingStore.shortcutMap.mute]

      handler({ state: 'Pressed' })
      await flushAll()

      const callArgs = mockInvoke.mock.calls.find((c) => c[0] === 'music_player_set_volume')
      expect(callArgs![1]).toEqual({ volume: 0 })
      expect(musicStore.volume).toBe(0)
    })

    it('mute 快捷键 → 音量从 0 恢复到 lastVolumn', async () => {
      ;(musicStore as any).volume = 0
      ;(musicStore as any).lastVolumn = 70
      await settingStore.registerGlobalShortcut(ShortcutKey.Mute)
      const handler = shortcutHandlers[settingStore.shortcutMap.mute]

      handler({ state: 'Pressed' })
      await flushAll()

      const callArgs = mockInvoke.mock.calls.find((c) => c[0] === 'music_player_set_volume')
      expect(callArgs![1]).toEqual({ volume: 70 })
      expect(musicStore.volume).toBe(70)
    })

    it('prev 快捷键 → playPrevOrNext(prev)', async () => {
      listStore.addList(ListType.Play, [mkListMusic('s1'), mkListMusic('s2')], false)
      ;(musicStore as any).music = mkPlayingMusic('s1')

      // playPrevOrNext 内部调用 setMusic，需要 mock load_file
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'music_player_stop' || cmd === 'music_player_load_file') return {}
        if (cmd === 'music_player_play') return {}
        if (cmd === 'music_lyric_get') return null
        throw new Error(`[N2.1 prev] unmocked invoke: ${cmd}`)
      })

      await settingStore.registerGlobalShortcut(ShortcutKey.Prev)
      const handler = shortcutHandlers[settingStore.shortcutMap.prev]

      handler({ state: 'Pressed' })
      await flushAll(30)

      // 列表 [s1, s2]，当前 s1 → prev → s2（循环到末尾）
      expect(musicStore.music?.id).toBe('s2')
    })

    it('next 快捷键 → playPrevOrNext(next)', async () => {
      listStore.addList(ListType.Play, [mkListMusic('s1'), mkListMusic('s2')], false)
      ;(musicStore as any).music = mkPlayingMusic('s1')

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (
          cmd === 'music_player_stop' ||
          cmd === 'music_player_load_file' ||
          cmd === 'music_player_play'
        )
          return {}
        if (cmd === 'music_lyric_get') return null
        throw new Error(`[N2.1 next] unmocked invoke: ${cmd}`)
      })

      await settingStore.registerGlobalShortcut(ShortcutKey.Next)
      const handler = shortcutHandlers[settingStore.shortcutMap.next]

      handler({ state: 'Pressed' })
      await flushAll(30)

      expect(musicStore.music?.id).toBe('s2')
    })

    it('forward 快捷键 → seek(playProgress+5)', async () => {
      await settingStore.registerGlobalShortcut(ShortcutKey.Forward)
      const handler = shortcutHandlers[settingStore.shortcutMap.forward]

      handler({ state: 'Pressed' })
      await flushAll()

      const callArgs = mockInvoke.mock.calls.find((c) => c[0] === 'music_player_seek')
      expect(callArgs![1]).toEqual({ pos: 35 })
    })

    it('backward 快捷键 → seek(playProgress-5)', async () => {
      await settingStore.registerGlobalShortcut(ShortcutKey.Backward)
      const handler = shortcutHandlers[settingStore.shortcutMap.backward]

      handler({ state: 'Pressed' })
      await flushAll()

      const callArgs = mockInvoke.mock.calls.find((c) => c[0] === 'music_player_seek')
      expect(callArgs![1]).toEqual({ pos: 25 })
    })

    it('快捷键格式非法（多主键）→ setShortcutMap 清空为空字符串', async () => {
      settingStore.setShortcutMap(ShortcutKey.PlayOrPause, 'Alt+A+B')
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(settingStore.shortcutMap.playOrPause).toBe('')
    })

    it('isRegistered=true → 不重复注册（register 不被调用）', async () => {
      mockIsRegistered.mockResolvedValue(true)
      // 重置 register 计数（isRegistered=true 时 registerGlobalShortcut 提前 return）
      mockRegister.mockClear()

      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('register 抛出异常 → notify.error("注册失败, 可能被占用")', async () => {
      mockRegister.mockRejectedValueOnce(new Error('occupied'))
      await settingStore.registerGlobalShortcut(ShortcutKey.PlayOrPause)
      await flushAll()

      expect(mockNotifyError).toHaveBeenCalledWith('注册失败, 可能被占用')
      expect(settingStore.mediaShortcutState).toBe(false)
    })
  })

  // ==========================================================================
  // N2.2 list.addList + music.playPrevOrNext → 切歌
  // ==========================================================================
  describe('N2.2 list ↔ music 切歌联动', () => {
    it('list.addList(Play, [s1, s2, s3]) → music.playPrevOrNext(next) 顺序切换 s1→s2→s3', async () => {
      listStore.addList(
        ListType.Play,
        [mkListMusic('s1'), mkListMusic('s2'), mkListMusic('s3')],
        false
      )
      musicStore.setMode('OrderPlay' as any)

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (
          cmd === 'music_player_stop' ||
          cmd === 'music_player_load_file' ||
          cmd === 'music_player_play'
        )
          return {}
        if (cmd === 'music_lyric_get') return null
        throw new Error(`[N2.2] unmocked invoke: ${cmd}`)
      })

      // 加载 s1
      await musicStore.setMusic(mkPlayingMusic('s1'), {
        origin: PlayingOrigin.Local,
        autoPlay: true
      })
      await flushAll(20)
      expect(musicStore.music?.id).toBe('s1')

      // next → s2
      musicStore.playPrevOrNext('next')
      await flushAll(20)
      expect(musicStore.music?.id).toBe('s2')

      // next → s3
      musicStore.playPrevOrNext('next')
      await flushAll(20)
      expect(musicStore.music?.id).toBe('s3')
    })

    it('list.addList(Play, []) → playPrevOrNext 空列表：重播当前歌曲（loop:true）', async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (
          cmd === 'music_player_stop' ||
          cmd === 'music_player_load_file' ||
          cmd === 'music_player_play'
        )
          return {}
        if (cmd === 'music_lyric_get') return null
        throw new Error(`[N2.2 empty] unmocked invoke: ${cmd}`)
      })

      await musicStore.setMusic(mkPlayingMusic('only'), {
        origin: PlayingOrigin.Local,
        autoPlay: true
      })
      await flushAll(20)
      expect(musicStore.music?.id).toBe('only')

      // 空列表 + 无当前歌 → 应重播
      musicStore.playPrevOrNext('next')
      await flushAll(20)
      expect(musicStore.music?.id).toBe('only')
      // 重播触发 stop + load + play
      expect(invokeCount('music_player_stop')).toBeGreaterThanOrEqual(2)
    })

    it('list.addList(Play, [s1, s2]) → music.playPrevOrNext(prev) 从 s1 回到 s2（循环）', async () => {
      listStore.addList(ListType.Play, [mkListMusic('s1'), mkListMusic('s2')], false)
      musicStore.setMode('OrderPlay' as any)

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (
          cmd === 'music_player_stop' ||
          cmd === 'music_player_load_file' ||
          cmd === 'music_player_play'
        )
          return {}
        if (cmd === 'music_lyric_get') return null
        throw new Error(`[N2.2 prev] unmocked invoke: ${cmd}`)
      })

      await musicStore.setMusic(mkPlayingMusic('s1'), {
        origin: PlayingOrigin.Local,
        autoPlay: true
      })
      await flushAll(20)

      // prev → 循环到末尾 s2
      musicStore.playPrevOrNext('prev')
      await flushAll(20)
      expect(musicStore.music?.id).toBe('s2')
    })

    it('list.addNextList(0, music) → 插入下一首位置', () => {
      listStore.addList(ListType.Play, [mkListMusic('s1'), mkListMusic('s2')], false)
      const initialCount = listStore.play.list.length

      listStore.addNextList(0, mkListMusic('s3'))
      expect(listStore.play.list.length).toBe(initialCount + 1)
      expect(listStore.play.list[1].id).toContain('s3')
    })

    it('list.removeList(Play, s2) → 移除后 playPrevOrNext 顺序变化', async () => {
      listStore.addList(
        ListType.Play,
        [mkListMusic('s1'), mkListMusic('s2'), mkListMusic('s3')],
        false
      )
      musicStore.setMode('OrderPlay' as any)

      // 移除 s2
      listStore.removeList(ListType.Play, 's2')
      expect(listStore.play.list.map((m) => m.id)).toEqual(['s1', 's3'])

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (
          cmd === 'music_player_stop' ||
          cmd === 'music_player_load_file' ||
          cmd === 'music_player_play'
        )
          return {}
        if (cmd === 'music_lyric_get') return null
        throw new Error(`[N2.2 remove] unmocked invoke: ${cmd}`)
      })

      await musicStore.setMusic(mkPlayingMusic('s1'), {
        origin: PlayingOrigin.Local,
        autoPlay: true
      })
      await flushAll(20)

      musicStore.playPrevOrNext('next')
      await flushAll(20)
      // s2 被移除，next 跳到 s3
      expect(musicStore.music?.id).toBe('s3')
    })
  })

  // ==========================================================================
  // N2.3 lyric 字体/偏移/翻译模式联动
  // ==========================================================================
  describe('N2.3 lyric 内部状态联动', () => {
    it('setFontSize(add) → fontSize 增加 Step', () => {
      const initial = lyricStore.fontSize
      lyricStore.setFontSize('add')
      expect(lyricStore.fontSize).toBe(initial + 2) // LyricFontSize.Step=2
    })

    it('setFontSize(sub) → fontSize 减少 Step', () => {
      const initial = lyricStore.fontSize
      lyricStore.setFontSize('sub')
      expect(lyricStore.fontSize).toBe(initial - 2)
    })

    it('setFontSize(restart) → fontSize 恢复默认值', () => {
      lyricStore.setFontSize('add')
      lyricStore.setFontSize('add')
      expect(lyricStore.fontSize).toBeGreaterThan(26)

      lyricStore.setFontSize('restart')
      expect(lyricStore.fontSize).toBe(26) // LyricFontSize.Default=26
    })

    it('setOffsetMap(add) → offsetMap[lyric.id] 累加 Step', () => {
      lyricStore.setLyric({ id: 'ly-1', fmt: LyricFormat.Krc, lines: [] })
      // offsetMap 需先初始化（实际场景由持久化或首次设置提供）
      lyricStore.offsetMap['ly-1'] = 0
      lyricStore.setOffsetMap('add')
      expect(lyricStore.offsetMap['ly-1']).toBeCloseTo(0.2) // LyricOffset.Step=0.2

      lyricStore.setOffsetMap('add')
      expect(lyricStore.offsetMap['ly-1']).toBeCloseTo(0.4)
    })

    it('setOffsetMap(sub) → offsetMap[lyric.id] 累减 Step', () => {
      lyricStore.setLyric({ id: 'ly-1', fmt: LyricFormat.Krc, lines: [] })
      lyricStore.offsetMap['ly-1'] = 0
      lyricStore.setOffsetMap('sub')
      expect(lyricStore.offsetMap['ly-1']).toBeCloseTo(-0.2)

      lyricStore.setOffsetMap('sub')
      expect(lyricStore.offsetMap['ly-1']).toBeCloseTo(-0.4)
    })

    it('setOffsetMap(restart) → offsetMap[lyric.id] 重置为 0', () => {
      lyricStore.setLyric({ id: 'ly-1', fmt: LyricFormat.Krc, lines: [] })
      lyricStore.offsetMap['ly-1'] = 0
      lyricStore.setOffsetMap('add')
      lyricStore.setOffsetMap('add')
      expect(lyricStore.offsetMap['ly-1']).toBeCloseTo(0.4)

      lyricStore.setOffsetMap('restart')
      expect(lyricStore.offsetMap['ly-1']).toBe(0)
    })

    it('setOffsetMap 无激活 lyric → 不修改 offsetMap', () => {
      lyricStore.setLyric(null)
      const before = { ...lyricStore.offsetMap }
      lyricStore.setOffsetMap('add')
      expect(lyricStore.offsetMap).toStrictEqual(before)
    })

    it('setMatchedLyric(musicId, info) → matchedMap[musicId] 更新', () => {
      lyricStore.setMatchedLyric('m1', { id: 'ly-1', fmt: LyricFormat.Krc })
      expect(lyricStore.matchedMap['m1']).toStrictEqual({ id: 'ly-1', fmt: LyricFormat.Krc })

      lyricStore.setMatchedLyric('m1', { id: 'ly-2', fmt: LyricFormat.Lrc })
      expect(lyricStore.matchedMap['m1']).toStrictEqual({ id: 'ly-2', fmt: LyricFormat.Lrc })
    })

    it('load(music, lyric) → setLyric + setMatchedLyric 联动', async () => {
      const music = mkPlayingMusic('m1')
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'music_lyric_get')
          return { id: 'ly-load', fmt: LyricFormat.Krc, content: 'krc-content' }
        throw new Error(`[N2.3 load] unmocked invoke: ${cmd}`)
      })

      await lyricStore.load(music, { id: 'ly-load', accesskey: 'ak' } as any)
      await flushAll()

      expect(lyricStore.lyric?.id).toBe('ly-load')
      expect(lyricStore.lyric?.fmt).toBe(LyricFormat.Krc)
      expect(lyricStore.matchedMap['m1']).toStrictEqual({ id: 'ly-load', fmt: LyricFormat.Krc })
      expect(mockParseKrcLyric).toHaveBeenCalledWith('krc-content')
      expect(lyricStore.isLoading).toBe(false)
    })

    it('load(music) 本地+在线均无歌词 → lyric 保持 null', async () => {
      const music = mkPlayingMusic('m-no-lyric')
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'music_lyric_get') return null
        if (cmd === 'api_lyric_search') return { status: 200, candidates: [] }
        throw new Error(`[N2.3 no-lyric] unmocked invoke: ${cmd}`)
      })

      await lyricStore.load(music)
      await flushAll()

      expect(lyricStore.lyric).toBeNull()
      expect(lyricStore.matchedMap['m-no-lyric']).toBeUndefined()
    })
  })

  // ==========================================================================
  // N2.4 updater 检查更新 → 下载 → 安装 通知链（基于 tauri-plugin-updater）
  // ==========================================================================
  describe('N2.4 updater 通知链', () => {
    it('checkUpdate 有更新 → notify.success("发现新版本 X")，updateInfo 带 v 前缀', async () => {
      mockCheck.mockResolvedValueOnce(createMockUpdate({ version: '1.1.0' }))

      await updaterStore.checkUpdate()
      await flushAll()

      expect(updaterStore.isChecking).toBe(false)
      expect(updaterStore.updateInfo?.has_update).toBe(true)
      expect(updaterStore.updateInfo?.current_version).toBe('v1.0.0')
      expect(updaterStore.updateInfo?.latest_version).toBe('v1.1.0')
      expect(mockNotifyInfo).toHaveBeenCalledWith('检查更新中...')
      expect(mockNotifySuccess).toHaveBeenCalledWith('发现新版本 1.1.0')
    })

    it('checkUpdate 无更新 → notify.success("已是最新版本")', async () => {
      mockCheck.mockResolvedValueOnce(null)

      await updaterStore.checkUpdate()
      await flushAll()

      expect(updaterStore.updateInfo?.has_update).toBe(false)
      expect(updaterStore.updateInfo?.current_version).toBe('v1.0.0')
      expect(updaterStore.updateInfo?.latest_version).toBe('v1.0.0')
      expect(mockNotifySuccess).toHaveBeenCalledWith('已是最新版本')
    })

    it('check() 抛错 → notify.error("检查更新失败")', async () => {
      mockCheck.mockRejectedValueOnce(new Error('network error'))

      await updaterStore.checkUpdate()
      await flushAll()

      expect(updaterStore.isChecking).toBe(false)
      expect(updaterStore.updateInfo).toBeUndefined()
      expect(mockNotifyError).toHaveBeenCalledWith('检查更新失败')
    })

    it('checkUpdate 期间 isChecking=true → 重复调用直接 return', async () => {
      // 第一次调用挂起
      let resolveFirst: (v: any) => void
      mockCheck.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )

      const first = updaterStore.checkUpdate()
      await flushAll()
      expect(updaterStore.isChecking).toBe(true)

      // 第二次应直接返回（不再次 check）
      const checkCountBefore = mockCheck.mock.calls.length
      await updaterStore.checkUpdate()
      expect(mockCheck.mock.calls.length).toBe(checkCountBefore)

      resolveFirst!(null)
      await first
      await flushAll()
    })

    it('startDownload 成功 → isDownloaded=true + notify.success("下载完成")', async () => {
      const mockUpdate = createMockUpdate()
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await flushAll()

      await updaterStore.startDownload()
      await flushAll()

      expect(mockUpdate.download).toHaveBeenCalledTimes(1)
      expect(updaterStore.isDownloading).toBe(false)
      expect(updaterStore.isDownloaded).toBe(true)
      expect(mockNotifySuccess).toHaveBeenCalledWith('下载完成，可在设置页安装更新')
    })

    it('startDownload download() 失败 → notify.error("下载失败")', async () => {
      const mockUpdate = createMockUpdate()
      mockUpdate.download.mockRejectedValueOnce(new Error('disk full'))
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await flushAll()

      await updaterStore.startDownload()
      await flushAll()

      expect(updaterStore.isDownloaded).toBe(false)
      expect(updaterStore.isDownloading).toBe(false)
      expect(mockNotifyError).toHaveBeenCalledWith('下载失败')
    })

    it('startDownload 未先 checkUpdate → 直接 return（pendingUpdate 为 null）', async () => {
      await updaterStore.startDownload()
      await flushAll()

      expect(updaterStore.isDownloaded).toBe(false)
      expect(updaterStore.isDownloading).toBe(false)
    })

    it('DownloadEvent 进度回调 → downloadProgress 状态更新 + progressPercent 计算', async () => {
      const mockUpdate = createMockUpdate()
      mockUpdate.download.mockImplementationOnce(async (cb: any) => {
        cb({ event: 'Started', data: { contentLength: 1000 } })
        cb({ event: 'Progress', data: { chunkLength: 500 } })
        cb({ event: 'Progress', data: { chunkLength: 500 } })
        cb({ event: 'Finished' })
      })
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await flushAll()

      await updaterStore.startDownload()
      await flushAll()

      // Finished 强制 downloaded = total = 1000
      expect(updaterStore.downloadProgress?.downloaded).toBe(1000)
      expect(updaterStore.downloadProgress?.total).toBe(1000)
      expect(updaterStore.progressPercent).toBe(100)
    })

    it('installUpdate 已下载 → update.install + relaunch', async () => {
      const mockUpdate = createMockUpdate()
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await flushAll()
      await updaterStore.startDownload()
      await flushAll()

      await updaterStore.installUpdate()
      await flushAll()

      expect(mockUpdate.install).toHaveBeenCalledTimes(1)
      expect(mockRelaunch).toHaveBeenCalledTimes(1)
    })

    it('installUpdate 未下载 → 直接 return（不调 install/relaunch）', async () => {
      const mockUpdate = createMockUpdate()
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await flushAll()

      await updaterStore.installUpdate()
      await flushAll()

      expect(mockUpdate.install).not.toHaveBeenCalled()
      expect(mockRelaunch).not.toHaveBeenCalled()
    })

    it('installUpdate install() 失败 → notify.error("安装失败")；不调 relaunch', async () => {
      const mockUpdate = createMockUpdate()
      mockUpdate.install.mockRejectedValueOnce(new Error('permission denied'))
      mockCheck.mockResolvedValueOnce(mockUpdate)
      await updaterStore.checkUpdate()
      await flushAll()
      await updaterStore.startDownload()
      await flushAll()

      await updaterStore.installUpdate()
      await flushAll()

      expect(mockNotifyError).toHaveBeenCalledWith('安装失败')
      expect(mockRelaunch).not.toHaveBeenCalled()
    })

    it('reset → 重置所有下载状态', async () => {
      ;(updaterStore as any).isDownloaded = true
      ;(updaterStore as any).isDownloading = true
      ;(updaterStore as any).downloadProgress = { downloaded: 1, total: 10, speed: 1 }

      updaterStore.reset()

      expect(updaterStore.isDownloaded).toBe(false)
      expect(updaterStore.isDownloading).toBe(false)
      expect(updaterStore.downloadProgress).toBeUndefined()
    })

    it('progressPercent total=0 → 返回 0（避免零除）', async () => {
      ;(updaterStore as any).downloadProgress = { downloaded: 100, total: 0, speed: 1 }
      expect(updaterStore.progressPercent).toBe(0)
    })

    it('progressPercent downloadProgress=undefined → 返回 0', async () => {
      ;(updaterStore as any).downloadProgress = undefined
      expect(updaterStore.progressPercent).toBe(0)
    })
  })
})
