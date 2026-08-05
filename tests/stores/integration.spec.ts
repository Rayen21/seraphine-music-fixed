import { useListStore } from '@/stores/list'
import { useLyricStore } from '@/stores/lyric'
import { useMusicStore } from '@/stores/music'
import { useUserStore } from '@/stores/user'
import {
  ApiInvokeStatus,
  ListType,
  LyricFormat,
  LyricTransMode,
  PlayingMode,
  PlayingOrigin,
  PlayingQuality
} from '@/utils/params'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock 变量（必须 vi.hoisted，vi.mock 会被提升）
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
  mockRandomUUID
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
  mockRandomUUID: vi.fn()
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
    info: vi.fn()
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

beforeAll(() => {
  const base = (globalThis as any).crypto ?? {}
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...base,
      randomUUID: (...args: any[]) => mockRandomUUID(...args)
    }
  })
})
afterAll(() => {
  mockRandomUUID.mockReset()
})

// ============================================================================
// 夹具 & 辅助
// ============================================================================
const mkListMusic = (id: string, extra: Partial<ListMusic> = {}): ListMusic => ({
  id,
  hash: `${id}-hash`,
  path: String(id).startsWith('online') ? null : `C:/Music/${id}.mp3`,
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
  path: String(id).startsWith('online') ? null : `C:/Music/${id}.mp3`,
  cover: null,
  title: `Title-${id}`,
  artist: `Artist-${id}`,
  duration: 100 + Number(String(id).match(/\d+/)?.[0] || 0) * 10,
  ...extra
})

const mkUserInfo = (uid: number): UserInfo => ({
  userid: uid,
  nickname: `User-${uid}`,
  pic: `https://cdn/u-${uid}.jpg`
})

const SAMPLE_KRC_LINES: LyricLine[] = [
  {
    offset: 0,
    duration: 5000,
    words: [{ offset: 0, duration: 5000, text: 'hello' }],
    translations: { [LyricTransMode.Roman]: '', [LyricTransMode.Trans]: '' }
  },
  {
    offset: 5000,
    duration: 3000,
    words: [{ offset: 5000, duration: 3000, text: 'world' }],
    translations: { [LyricTransMode.Roman]: '', [LyricTransMode.Trans]: '' }
  }
]
const SAMPLE_LRC_LINES: LyricLine[] = [
  {
    offset: 1000,
    duration: 4000,
    words: [{ offset: 1000, duration: 4000, text: 'l1' }],
    translations: { [LyricTransMode.Roman]: '', [LyricTransMode.Trans]: '' }
  },
  {
    offset: 6000,
    duration: 2000,
    words: [{ offset: 6000, duration: 2000, text: 'l2' }],
    translations: { [LyricTransMode.Roman]: '', [LyricTransMode.Trans]: '' }
  }
]

// 异步深度刷新：setMusic → finally 里 loadLyric（微任务级多步）→ parse* → setLyric
const flushAll = async (depth: number = 24) => {
  for (let i = 0; i < depth; i++) {
    await Promise.resolve()
  }
}

// 触发 playAutoNext：模拟 monitorPlay 的 Channel 进度值跨越 duration 阈值
const triggerPlayAutoNext = async (musicStore: ReturnType<typeof useMusicStore>) => {
  mockChannelInstances.length = 0
  ;(musicStore as any).isHydrated = true
  await flushAll(10)
  const playChannel = mockChannelInstances[0]
  expect(playChannel).toBeDefined()
  ;(musicStore as any).isPlaying = true
  ;(musicStore as any).isLoading = false
  const dur = musicStore.music!.duration
  playChannel.onmessage(0)
  playChannel.onmessage(dur)
  await flushAll(30)
}

// 按 cmd 名称统计 invoke 调用次数
const invokeCount = (cmd: string) => mockInvoke.mock.calls.filter((c: any[]) => c[0] === cmd).length
// 按 cmd 名称取某一次调用的 args
const invokeArgsOf = <T = any>(cmd: string, nth: number = 1): T | undefined => {
  const calls = mockInvoke.mock.calls.filter((c: any[]) => c[0] === cmd)
  return calls[nth - 1]?.[1] as T | undefined
}

// ============================================================================
describe('stores integration (N1：选歌↔歌词↔播放↔会员 联动)', () => {
  let musicStore: ReturnType<typeof useMusicStore>
  let listStore: ReturnType<typeof useListStore>
  let lyricStore: ReturnType<typeof useLyricStore>
  let userStore: ReturnType<typeof useUserStore>

  beforeEach(() => {
    setActivePinia(createPinia())

    // ---- Fixture 级默认 mock（每次 before 都要重设，因为 afterEach clearAllMocks） ----
    mockGetFullName.mockImplementation((m: PlayingMusic, style?: string) =>
      style === 'at' ? `${m.artist} - ${m.title}` : `${m.artist}-${m.title}`
    )
    mockParseKrcLyric.mockReturnValue(SAMPLE_KRC_LINES)
    mockParseLrcLyric.mockReturnValue(SAMPLE_LRC_LINES)
    mockGetRandomNumber.mockImplementation((maxNum) => maxNum)
    mockRandomUUID.mockReturnValue('u-u-i-d')

    mockInvoke.mockReset()
    mockSetAppTitle.mockReset()
    mockListen.mockReset()
    mockChannelInstances.length = 0
    mockNotifySuccess.mockReset()
    mockNotifyError.mockReset()
    mockNotifyWarning.mockReset()

    listStore = useListStore()
    lyricStore = useLyricStore()
    userStore = useUserStore()
    musicStore = useMusicStore()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // N1.1 本地曲 setMusic(autoPlay=true) → stop/load/play + loadLyric(本地Krc)
  // ==========================================================================
  it('N1.1 本地曲 setMusic(autoPlay=true)：stop/load/play 均调用，loadLyric 命中本地 Krc 写入 lyric', async () => {
    const id = 's1'
    const song = mkPlayingMusic(id)
    lyricStore.setMatchedLyric(id, { id: 'ly-s1', fmt: LyricFormat.Krc })

    // ---- 关键：cmd-based 路由，不依赖调用次数索引（load.finally 里 loadLyric 会在 play() 前先调 music_lyric_get） ----
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_file':
        case 'music_player_play':
          return {}
        case 'music_lyric_get':
          return { id: 'ly-s1', fmt: LyricFormat.Krc, content: '[00:00.00]hello' }
        default:
          throw new Error(`[N1.1] unmocked invoke: ${cmd}`)
      }
    })

    await musicStore.setMusic(song, { origin: PlayingOrigin.Local, autoPlay: true })
    await flushAll()

    // 三个播放动作
    expect(invokeCount('music_player_stop')).toBe(1)
    expect(invokeCount('music_player_load_file')).toBe(1)
    expect(invokeCount('music_player_play')).toBe(1)

    // 音乐状态
    expect(musicStore.music?.id).toBe(id)
    expect(musicStore.isLoaded).toBe(true)
    expect(musicStore.isPlaying).toBe(true)
    expect(musicStore.origin).toBe(PlayingOrigin.Local)

    // 歌词：music_lyric_get 返回 Krc → parseKrcLyric（parseLrcLyric 不调）
    expect(invokeCount('music_lyric_get')).toBe(1)
    expect(mockParseKrcLyric).toHaveBeenCalledWith('[00:00.00]hello')
    expect(mockParseLrcLyric).not.toHaveBeenCalled()
    expect(lyricStore.lyric?.id).toBe('ly-s1')
    expect(lyricStore.lyric?.fmt).toBe(LyricFormat.Krc)
    expect(lyricStore.lyric?.lines).toStrictEqual(SAMPLE_KRC_LINES)

    // finally: setAppTitle(getFullName(newMusic))
    expect(mockSetAppTitle).toHaveBeenCalledTimes(2) // stop 里设 Seraphine + load.finally 设歌曲名
  })

  // ==========================================================================
  // N1.2 已登录 VIP + setQuality(Flac) + 在线曲
  // ==========================================================================
  it('N1.2 登录VIP + setQuality(Flac) → api_song_url quality=Flac + api_lyric_search → 官方推荐 → Lrc', async () => {
    // ---- 1) 登录并拉取 VIP ----
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'api_youth_union_vip') {
        return {
          status: ApiInvokeStatus.Success,
          data: { busi_vip: [{ product_type: 'svip', is_vip: 1 }] }
        }
      }
      return {}
    })
    await userStore.login(mkUserInfo(9527))
    await flushAll(8)
    expect(userStore.userinfo?.userid).toBe(9527)
    expect(userStore.isVip).toBe(true)
    expect(mockNotifySuccess).toHaveBeenCalledWith('登录成功')

    // ---- 2) 设置为 VIP 音质 ----
    musicStore.setQuality(PlayingQuality.BitrateFlac)
    expect(musicStore.quality).toBe(PlayingQuality.BitrateFlac)

    // ---- 3) 在线曲 setMusic：cmd-based 路由 ----
    const id = 'online-1'
    const song = mkPlayingMusic(id)
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string, args: any) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_url':
          return {}
        case 'api_song_url':
          expect(args.hash).toBe(`${id}-hash`)
          expect(args.quality).toBe(PlayingQuality.BitrateFlac)
          return {
            status: ApiInvokeStatus.Success,
            backupUrl: ['https://cdn/online-1.flac']
          }
        case 'music_lyric_get':
          return null // 本地没
        case 'api_lyric_search':
          return {
            status: 200,
            candidates: [
              {
                id: 'ly-official',
                accesskey: 'ak-official',
                product_from: '官方推荐歌词',
                singer: '',
                song: '',
                score: 100
              }
            ]
          }
        case 'api_lyric_get':
          expect(args.id).toBe('ly-official')
          expect(args.accesskey).toBe('ak-official')
          return { id: 'ly-official', fmt: LyricFormat.Lrc, content: '[00:01.00]lrc1' }
        default:
          throw new Error(`[N1.2] unmocked invoke: ${cmd}`)
      }
    })

    await musicStore.setMusic(song, { origin: PlayingOrigin.Online, autoPlay: false })
    await flushAll(20)

    const songUrlArgs = invokeArgsOf<{ hash: string; quality: PlayingQuality }>('api_song_url')
    expect(songUrlArgs!.quality).toBe(PlayingQuality.BitrateFlac)
    expect(songUrlArgs!.hash).toBe(`${id}-hash`)

    expect(invokeCount('api_lyric_search')).toBe(1)
    expect(mockGetFullName).toHaveBeenCalledWith(song, 'at')
    const getArgs = invokeArgsOf<{ id: string; accesskey: string }>('api_lyric_get')
    expect(getArgs!.id).toBe('ly-official')
    expect(getArgs!.accesskey).toBe('ak-official')
    expect(mockParseLrcLyric).toHaveBeenCalledWith('[00:01.00]lrc1')
    expect(lyricStore.lyric?.id).toBe('ly-official')
    expect(lyricStore.lyric?.fmt).toBe(LyricFormat.Lrc)
    expect(lyricStore.matchedMap[id]).toStrictEqual({
      id: 'ly-official',
      fmt: LyricFormat.Lrc
    })

    expect(musicStore.isPlaying).toBe(false)
    expect(musicStore.isLoaded).toBe(true)
  })

  // ==========================================================================
  // N1.3 playPrevOrNext('next')：取 listStore.play.list[index+1] → setMusic → loadLyric
  // ==========================================================================
  it('N1.3 playPrevOrNext(next)：切歌后重新加载新歌歌词', async () => {
    const l1 = mkListMusic('s1')
    const l2 = mkListMusic('s2')
    listStore.addList(ListType.Play, [l1, l2], false)
    expect(listStore.play.list.map((m) => m.id)).toEqual(['s1', 's2'])
    lyricStore.setMatchedLyric('s1', { id: 'ly-s1', fmt: LyricFormat.Krc })
    lyricStore.setMatchedLyric('s2', { id: 'ly-s2', fmt: LyricFormat.Lrc })

    // ---- 先加载 s1 ----
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_file':
        case 'music_player_play':
          return {}
        case 'music_lyric_get':
          return { id: 'ly-s1', fmt: LyricFormat.Krc, content: 'krc-s1' }
        default:
          throw new Error(`[N1.3 s1] unmocked invoke: ${cmd}`)
      }
    })
    await musicStore.setMusic(mkPlayingMusic('s1'), { origin: PlayingOrigin.Local, autoPlay: true })
    await flushAll(14)
    expect(musicStore.music?.id).toBe('s1')
    expect(lyricStore.lyric?.id).toBe('ly-s1')
    expect(mockParseKrcLyric).toHaveBeenLastCalledWith('krc-s1')

    // ---- 切 s2：重设 mock route ----
    mockParseKrcLyric.mockClear()
    mockParseLrcLyric.mockClear()
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_file':
        case 'music_player_load_url':
        case 'music_player_play':
          return {}
        case 'api_song_url':
          return { status: ApiInvokeStatus.Success, backupUrl: ['https://a/s2.mp3'] }
        case 'music_lyric_get':
          return { id: 'ly-s2', fmt: LyricFormat.Lrc, content: 'lrc-s2' }
        default:
          throw new Error(`[N1.3 s2] unmocked invoke: ${cmd}`)
      }
    })

    musicStore.playPrevOrNext('next')
    await flushAll(20)

    expect(musicStore.music?.id).toBe('s2')
    expect(musicStore.isPlaying).toBe(true)
    expect(mockParseLrcLyric).toHaveBeenCalledWith('lrc-s2')
    expect(mockParseKrcLyric).not.toHaveBeenCalled()
    expect(lyricStore.lyric?.id).toBe('ly-s2')
    expect(lyricStore.lyric?.fmt).toBe(LyricFormat.Lrc)
  })

  // ==========================================================================
  // N1.4 playAutoNext 阈值触发：自动切 listStore.play.list 下一首 → 歌词自动加载
  // ==========================================================================
  it('N1.4 playAutoNext 阈值触发：自动切下一首 + 歌词自动换新', async () => {
    const l1 = mkListMusic('s1', { duration: 200 })
    const l2 = mkListMusic('s2', { duration: 300 })
    listStore.addList(ListType.Play, [l1, l2], false)
    musicStore.setMode(PlayingMode.OrderPlay)
    lyricStore.setMatchedLyric('s1', { id: 'ly-s1', fmt: LyricFormat.Krc })
    lyricStore.setMatchedLyric('s2', { id: 'ly-s2', fmt: LyricFormat.Lrc })

    // ---- 先 setMusic s1 ----
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_file':
          return {}
        case 'music_lyric_get':
          return { id: 'ly-s1', fmt: LyricFormat.Krc, content: 'krc-a' }
        default:
          throw new Error(`[N1.4 s1] unmocked invoke: ${cmd}`)
      }
    })
    await musicStore.setMusic(mkPlayingMusic('s1', { duration: 200 }), {
      origin: PlayingOrigin.Local,
      autoPlay: false
    })
    await flushAll(14)
    expect(musicStore.music?.id).toBe('s1')
    expect(lyricStore.lyric?.id).toBe('ly-s1')
    expect(mockParseKrcLyric).toHaveBeenLastCalledWith('krc-a')

    // ---- 触发 playAutoNext，切到 s2 ----
    mockParseKrcLyric.mockClear()
    mockParseLrcLyric.mockClear()
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_file':
        case 'music_player_load_url':
        case 'music_player_play':
          return {}
        case 'api_song_url':
          return { status: ApiInvokeStatus.Success, backupUrl: ['https://a/s2.mp3'] }
        case 'music_lyric_get':
          return { id: 'ly-s2', fmt: LyricFormat.Lrc, content: 'lrc-b' }
        default:
          throw new Error(`[N1.4 s2] unmocked invoke: ${cmd}`)
      }
    })

    await triggerPlayAutoNext(musicStore)

    expect(musicStore.music?.id).toBe('s2')
    expect(musicStore.isPlaying).toBe(true)
    expect(mockParseLrcLyric).toHaveBeenCalledWith('lrc-b')
    expect(mockParseKrcLyric).not.toHaveBeenCalled()
    expect(lyricStore.lyric?.id).toBe('ly-s2')
    expect(lyricStore.lyric?.fmt).toBe(LyricFormat.Lrc)
  })

  // ==========================================================================
  // N1.5 同一首歌二次加载：首次走 api_lyric_search，二次命中 matchedMap 仅 music_lyric_get
  // ==========================================================================
  it('N1.5 同一首歌二次 setMusic：首次 search，第二次只 music_lyric_get（不再 search）', async () => {
    const id = 'online-999'
    const song = mkPlayingMusic(id)
    lyricStore.setMatchedLyric(id, { id: 'ly-stale', fmt: LyricFormat.Krc })

    // ---- 1st setMusic（首次）：music_lyric_get 返回 null → 回退 api_lyric_search → api_lyric_get ----
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_url':
          return {}
        case 'api_song_url':
          return { status: ApiInvokeStatus.Success, backupUrl: ['https://a/first.mp3'] }
        case 'music_lyric_get':
          return null // 本地无 → 回退在线 search
        case 'api_lyric_search':
          return {
            status: 200,
            candidates: [
              {
                id: 'ly-online-999',
                accesskey: 'ak-999',
                product_from: '官方推荐歌词',
                singer: '',
                song: '',
                score: 100
              }
            ]
          }
        case 'api_lyric_get':
          return { id: 'ly-online-999', fmt: LyricFormat.Lrc, content: '[00:02.00]first-time' }
        default:
          throw new Error(`[N1.5 1st] unmocked invoke: ${cmd}`)
      }
    })

    await musicStore.setMusic(song, { origin: PlayingOrigin.Online })
    await flushAll(24)

    expect(lyricStore.lyric?.id).toBe('ly-online-999')
    expect(lyricStore.matchedMap[id]).toStrictEqual({
      id: 'ly-online-999',
      fmt: LyricFormat.Lrc
    })
    expect(invokeCount('api_lyric_search')).toBe(1)
    expect(mockParseLrcLyric).toHaveBeenLastCalledWith('[00:02.00]first-time')

    // ---- 切换到其它歌，避免下次 setMusic 同 id 短路 ----
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_url':
          return {}
        case 'api_song_url':
          return { status: ApiInvokeStatus.Success, backupUrl: ['https://other'] }
        case 'music_lyric_get':
          return { id: 'ly-other', fmt: LyricFormat.Lrc, content: 'other-lyric' }
        default:
          throw new Error(`[N1.5 other] unmocked invoke: ${cmd}`)
      }
    })
    await musicStore.setMusic(mkPlayingMusic('online-other'), { origin: PlayingOrigin.Online })
    await flushAll(20)
    expect(musicStore.music?.id).toBe('online-other')

    // ---- 切回 online-999：matchedMap 已更新为 Lrc id → music_lyric_get（走 matchedMap id），不再 search ----
    mockParseKrcLyric.mockClear()
    mockParseLrcLyric.mockClear()
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_url':
          return {}
        case 'api_song_url':
          return { status: ApiInvokeStatus.Success, backupUrl: ['https://a/second.mp3'] }
        case 'music_lyric_get':
          return { id: 'ly-online-999', fmt: LyricFormat.Lrc, content: 'second-time' }
        case 'api_lyric_search':
          throw new Error('[N1.5 2nd] 不应该再次 search，应命中 matchedMap')
        default:
          throw new Error(`[N1.5 2nd] unmocked invoke: ${cmd}`)
      }
    })

    await musicStore.setMusic(song, { origin: PlayingOrigin.Online })
    await flushAll(20)

    expect(lyricStore.lyric?.id).toBe('ly-online-999')
    expect(invokeCount('api_lyric_search')).toBe(0) // 关键断言
    expect(invokeCount('music_lyric_get')).toBe(1)
    expect(mockParseLrcLyric).toHaveBeenLastCalledWith('second-time')
    expect(mockParseKrcLyric).not.toHaveBeenCalled()
  })

  // ==========================================================================
  // N1.6 会员流程：login → setQuality(Bitrate320) → logout → quality 参数都被正确携带
  // ==========================================================================
  it('N1.6 会员流程：login(svip) → logout，quality 参数贯穿', async () => {
    expect(userStore.userinfo).toBeUndefined()
    expect(userStore.isVip).toBe(false)

    // ---- login(svip=1) ----
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'api_youth_union_vip') {
        return {
          status: ApiInvokeStatus.Success,
          data: { busi_vip: [{ product_type: 'svip', is_vip: 1 }] }
        }
      }
      return {}
    })
    await userStore.login(mkUserInfo(12345))
    await flushAll(8)
    expect(userStore.userinfo?.userid).toBe(12345)
    expect(userStore.isVip).toBe(true)
    expect(mockNotifySuccess).toHaveBeenCalledWith('登录成功')

    // ---- VIP 下 q=320 在线歌 ----
    musicStore.setQuality(PlayingQuality.Bitrate320)
    lyricStore.setMatchedLyric('q320', { id: 'ly-q320', fmt: LyricFormat.Krc })
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string, args: any) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_url':
          return {}
        case 'api_song_url':
          return { status: ApiInvokeStatus.Success, backupUrl: [`https://cdn/${args.quality}`] }
        case 'music_lyric_get':
          return { id: 'ly-q320', fmt: LyricFormat.Krc, content: 'krc-320' }
        default:
          throw new Error(`[N1.6 q320] unmocked invoke: ${cmd}`)
      }
    })
    await musicStore.setMusic(mkPlayingMusic('q320'), { origin: PlayingOrigin.Online })
    await flushAll(20)
    expect(invokeArgsOf<{ quality: PlayingQuality }>('api_song_url')!.quality).toBe(
      PlayingQuality.Bitrate320
    )

    // ---- logout ----
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'api_login_out' || cmd === 'api_register_dev') return {}
      throw new Error(`[N1.6 logout] unmocked invoke: ${cmd}`)
    })
    await userStore.logout()
    await flushAll(8)
    expect(userStore.userinfo).toBeUndefined()
    expect(mockNotifyWarning).toHaveBeenCalledWith('退出中...')
    expect(mockNotifySuccess).toHaveBeenCalledWith('已退出登录')
    expect(invokeCount('api_login_out')).toBe(1)
    expect(invokeCount('api_register_dev')).toBe(1)

    // ---- logout 后 q=128 在线歌 ----
    musicStore.setQuality(PlayingQuality.Bitrate128)
    lyricStore.setMatchedLyric('after-logout', { id: 'ly-after', fmt: LyricFormat.Lrc })
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'music_player_stop':
        case 'music_player_load_url':
          return {}
        case 'api_song_url':
          return { status: ApiInvokeStatus.Success, backupUrl: ['https://128'] }
        case 'music_lyric_get':
          return { id: 'ly-after', fmt: LyricFormat.Lrc, content: 'lrc-after' }
        default:
          throw new Error(`[N1.6 after] unmocked invoke: ${cmd}`)
      }
    })
    await musicStore.setMusic(mkPlayingMusic('after-logout'), { origin: PlayingOrigin.Online })
    await flushAll(20)
    expect(invokeArgsOf<{ quality: PlayingQuality }>('api_song_url')!.quality).toBe(
      PlayingQuality.Bitrate128
    )
    expect(mockParseLrcLyric).toHaveBeenLastCalledWith('lrc-after')
  })
})
