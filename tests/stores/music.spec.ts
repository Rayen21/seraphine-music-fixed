import { useListStore } from '@/stores/list'
import { useMusicStore } from '@/stores/music'
import {
  ApiInvokeStatus,
  Interval,
  PlayingMode,
  PlayingOrigin,
  PlayingQuality
} from '@/utils/params'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock 变量声明（必须在 vi.hoisted 内创建，vi.mock 会被提升到文件顶部）
// ============================================================================
const {
  mockInvoke,
  mockNotifyError,
  mockSetAppTitle,
  mockGetRandomNumber,
  mockLyricLoad,
  mockListen,
  mockChannelInstances
} = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockNotifyError: vi.fn(),
  mockSetAppTitle: vi.fn(),
  mockGetRandomNumber: vi.fn(),
  mockLyricLoad: vi.fn(),
  mockListen: vi.fn().mockResolvedValue(() => {}),
  // 记录每次 new Channel() 返回的实例，便于测试中取出 playChannel/downloadChannel
  mockChannelInstances: [] as Array<{ onmessage: (pg: number) => void }>
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

vi.mock('@/components/Notification.vue', () => ({
  notify: {
    error: mockNotifyError,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn()
  }
}))

vi.mock('@/stores/lyric', () => ({
  useLyricStore: vi.fn(() => ({
    load: mockLyricLoad
  }))
}))

// Channel 必须是可 new 的构造函数（monitorPlay/monitorDownload 都使用 new Channel）
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

// ============================================================================
// 夹具 + 测试辅助
// ============================================================================
const mkSong = (id: string, extra: Partial<ListMusic> = {}): ListMusic => ({
  id,
  hash: id.startsWith('online') ? `${id}-hash` : null,
  path:
    extra.path !== undefined ? extra.path : id.startsWith('local') ? `C:/music/${id}.mp3` : null,
  cover: null,
  title: `Song ${id}`,
  artist: 'Artist',
  album: null,
  duration: 200,
  sort: 0,
  ...extra
})

const SONGS: ListMusic[] = [mkSong('local-1'), mkSong('local-2'), mkSong('local-3')]
const LAST_INDEX = SONGS.length - 1

/**
 * 刷新所有微任务队列（fake timers 下不使用真实 setTimeout，否则永远挂起）
 * 通过 8 层以上的 Promise.resolve() 微任务链保证：
 *   invoke() → mockResolvedValue → then() 回调
 *   setMusic → stop()→load()→play() 多层 async/await
 *  全部兑现完毕
 */
const flushPromises = async (depth: number = 8) => {
  for (let i = 0; i < depth; i++) {
    // 先让所有 microtasks 执行（Promise 回调链）
    await Promise.resolve()
  }
  // fake timer 下再推进 0ms，处理 timer 开头的微任务
  await vi.advanceTimersByTimeAsync(0)
}

/**
 * 触发 playAutoNext 间接调用：
 * - 先设置 isHydrated=true 触发 watch，安装 monitorPlay + playChannel
 * - 再设置 isPlaying=true 且 isLoading=false（否则 monitorPlay 守卫直接 return）
 * - 最后通过 playChannel.onmessage 推送越阈值的 pg
 */
const triggerPlayAutoNextViaMonitorPlay = async (musicStore: ReturnType<typeof useMusicStore>) => {
  mockChannelInstances.length = 0
  ;(musicStore as any).isHydrated = true
  await flushPromises()
  // monitorPlay 第一个 new Channel = playChannel；monitorDownload 第二个 new Channel = downloadChannel
  const playChannel = mockChannelInstances[0]
  expect(playChannel).toBeDefined()
  expect(typeof playChannel.onmessage).toBe('function')

  // 打开守卫条件：monitorPlay onmessage 开头判断 !music || !isPlaying || isLoading → return
  ;(musicStore as any).isPlaying = true
  ;(musicStore as any).isLoading = false

  const dur = musicStore.music!.duration
  // 推两次：第一次建立 lastProgress 基线；第二次跨过阈值触发 playAutoNext
  playChannel.onmessage(0)
  playChannel.onmessage(dur)
  await flushPromises()
  // setMusic → playAutoNext 的 stop/load/play 链都是异步的，再 flush 一轮
  await flushPromises()
}

// ============================================================================
describe('stores/music 播放状态机（M2：状态机切换核心）', () => {
  let musicStore: ReturnType<typeof useMusicStore>
  let listStore: ReturnType<typeof useListStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()

    mockInvoke.mockReset()
    mockNotifyError.mockReset()
    mockSetAppTitle.mockReset()
    mockGetRandomNumber.mockReset()
    mockLyricLoad.mockReset()
    mockListen.mockReset()
    mockChannelInstances.length = 0

    mockInvoke.mockResolvedValue({})
    mockGetRandomNumber.mockImplementation((maxNum: number) => maxNum)

    listStore = useListStore()
    musicStore = useMusicStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  // ==========================================================================
  // 1. 初始默认值 & setters（基础契约）
  // ==========================================================================
  describe('1. 初始默认值 & 基础 setter 契约', () => {
    it('初始状态：未播放、未加载、未拖动、空曲目、默认模式/音量/音质', () => {
      expect(musicStore.isHydrated).toBe(false)
      expect(musicStore.isLoading).toBe(false)
      expect(musicStore.isLoaded).toBe(false)
      expect(musicStore.isPlaying).toBe(false)
      expect(musicStore.isDragging).toBe(false)
      expect(musicStore.music).toBeNull()
      expect(musicStore.origin).toBe(PlayingOrigin.Local)
      expect(musicStore.mode).toBe(PlayingMode.OrderPlay)
      expect(musicStore.volume).toBe(100)
      expect(musicStore.quality).toBe(PlayingQuality.Bitrate128)
      expect(musicStore.playProgress).toBe(0)
      expect(musicStore.downloadProgress).toBe(0)
    })

    it('setMode / setQuality：直接修改对应字段', () => {
      musicStore.setMode(PlayingMode.SingleLoop)
      expect(musicStore.mode).toBe(PlayingMode.SingleLoop)
      musicStore.setQuality(PlayingQuality.BitrateFlac)
      expect(musicStore.quality).toBe(PlayingQuality.BitrateFlac)
    })

    it('setVolume 正常取值（0~100 之间），lastVolumn 随正音量更新', async () => {
      await musicStore.setVolume(75)
      expect(musicStore.volume).toBe(75)
      expect(musicStore.lastVolumn).toBe(75)
      expect(mockInvoke).toHaveBeenCalledWith('music_player_set_volume', { volume: 75 })
    })

    it('setVolume clamp：<0→0，>100→100，0 值不改 lastVolumn', async () => {
      ;(musicStore as any).lastVolumn = 42
      await musicStore.setVolume(-5)
      expect(musicStore.volume).toBe(0)
      expect(musicStore.lastVolumn).toBe(42)
      expect(mockInvoke).toHaveBeenLastCalledWith('music_player_set_volume', { volume: 0 })

      await musicStore.setVolume(200)
      expect(musicStore.volume).toBe(100)
      expect(musicStore.lastVolumn).toBe(100)
    })
  })

  // ==========================================================================
  // 2. Play / Pause / Stop 状态切换
  // ==========================================================================
  describe('2. Play/Pause/Stop 标志位与守卫', () => {
    beforeEach(() => {
      ;(musicStore as any).music = SONGS[0]
      ;(musicStore as any).origin = PlayingOrigin.Local
      ;(musicStore as any).isLoaded = true
      ;(musicStore as any).isLoading = false
    })

    it('play()：正常调用 invoke，isPlaying 置 true', async () => {
      await musicStore.play()
      expect(mockInvoke).toHaveBeenCalledWith('music_player_play')
      expect(musicStore.isPlaying).toBe(true)
    })

    it('play() 守卫：music=null / isLoading=true / isLoaded=false 任一→不调 invoke', async () => {
      ;(musicStore as any).music = null
      await musicStore.play()
      expect(mockInvoke).not.toHaveBeenCalled()
      expect(musicStore.isPlaying).toBe(false)

      ;(musicStore as any).music = SONGS[0]
      ;(musicStore as any).isLoading = true
      await musicStore.play()
      expect(mockInvoke).not.toHaveBeenCalled()

      ;(musicStore as any).isLoading = false
      ;(musicStore as any).isLoaded = false
      await musicStore.play()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('pause()：无条件调 invoke + isPlaying=false', async () => {
      ;(musicStore as any).isPlaying = false
      await musicStore.pause()
      expect(mockInvoke).toHaveBeenCalledWith('music_player_pause')
      expect(musicStore.isPlaying).toBe(false)
    })

    it('stop()：invoke stop + isPlaying=false + progress/下载归零（music 不清空）', async () => {
      const beforeMusic = musicStore.music
      ;(musicStore as any).isPlaying = true
      ;(musicStore as any).playProgress = 55
      ;(musicStore as any).downloadProgress = 0.8
      await musicStore.stop()
      expect(mockInvoke).toHaveBeenCalledWith('music_player_stop')
      expect(musicStore.isPlaying).toBe(false)
      expect(musicStore.playProgress).toBe(0)
      expect(musicStore.downloadProgress).toBe(0)
      expect(musicStore.music).toBe(beforeMusic)
    })

    it('Play→Pause→Play 连续切换：状态与调用次数正确', async () => {
      await musicStore.play()
      expect(musicStore.isPlaying).toBe(true)
      await musicStore.pause()
      expect(musicStore.isPlaying).toBe(false)
      await musicStore.play()
      expect(musicStore.isPlaying).toBe(true)
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'music_player_play')
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'music_player_pause')
      expect(mockInvoke).toHaveBeenNthCalledWith(3, 'music_player_play')
    })
  })

  // ==========================================================================
  // 3. setMusic 核心加载流程
  // ==========================================================================
  describe('3. setMusic 核心加载流程', () => {
    beforeEach(() => {
      listStore.play.list = [...SONGS]
      listStore.play.info.count = SONGS.length
    })

    const wasInvoked = (cmd: string) => mockInvoke.mock.calls.some((c: any[]) => c[0] === cmd)

    it('setMusic(null) → 走 stop()，isPlaying/progress 归零，music id 不变', async () => {
      const priorMusic = SONGS[0]
      ;(musicStore as any).music = priorMusic
      ;(musicStore as any).isPlaying = true
      ;(musicStore as any).playProgress = 30

      await musicStore.setMusic(null as any)
      expect(mockInvoke).toHaveBeenCalledWith('music_player_stop')
      expect(musicStore.isPlaying).toBe(false)
      expect(musicStore.playProgress).toBe(0)
      // Pinia 可能包装 ref，用 toStrictEqual 比较内容而非引用
      expect(musicStore.music?.id).toStrictEqual(priorMusic.id)
    })

    it('同 id + loop=false → 短路返回，不触发任何 invoke', async () => {
      ;(musicStore as any).music = SONGS[0]
      await musicStore.setMusic(SONGS[0], { loop: false })
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('同 id + loop=true → 不短路，stop→load→play 整链路', async () => {
      ;(musicStore as any).music = SONGS[0]
      ;(musicStore as any).isLoaded = true
      await musicStore.setMusic(SONGS[0], { loop: true })
      expect(wasInvoked('music_player_stop')).toBe(true)
      expect(wasInvoked('music_player_load_file')).toBe(true)
      expect(wasInvoked('music_player_play')).toBe(true)
      expect(musicStore.isLoaded).toBe(true)
      expect(musicStore.isPlaying).toBe(true)
    })

    it('Local 新曲目 autoPlay=true：全链路 + isLoaded/isPlaying=true', async () => {
      await musicStore.setMusic(SONGS[1], { autoPlay: true })
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'music_player_stop')
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'music_player_load_file', {
        path: SONGS[1].path
      })
      expect(mockInvoke).toHaveBeenNthCalledWith(3, 'music_player_play')
      expect(musicStore.music?.id).toBe(SONGS[1].id)
      expect(musicStore.origin).toBe(PlayingOrigin.Local)
      expect(musicStore.isLoaded).toBe(true)
      expect(musicStore.isPlaying).toBe(true)
      expect(mockSetAppTitle).toHaveBeenCalled()
      expect(mockLyricLoad).toHaveBeenCalledWith(musicStore.music)
    })

    it('Local 新曲目 autoPlay=false：load 后不调 play', async () => {
      await musicStore.setMusic(SONGS[2], { autoPlay: false })
      expect(wasInvoked('music_player_load_file')).toBe(true)
      expect(wasInvoked('music_player_play')).toBe(false)
      expect(musicStore.isPlaying).toBe(false)
      expect(musicStore.isLoaded).toBe(true)
    })

    it('Local 但 path=null → 抛错 + notify + startWaitNext（timer 推进后切下一首）', async () => {
      const bad: ListMusic = { ...SONGS[0], path: null }
      await musicStore.setMusic(bad)
      expect(mockNotifyError).toHaveBeenCalled()
      expect(mockNotifyError.mock.calls[0][0]).toContain('即将切换下一首')
      // startWaitNext 内部 setTimeout(Interval.PoN)
      await vi.advanceTimersByTimeAsync(Interval.PoN + 1)
      await flushPromises()
      // 切歌之后会再次尝试 load 下一首 SONGS[1]，应调用 load_file
      expect(wasInvoked('music_player_load_file')).toBe(true)
    })

    it('Online OK：api_song_url 返回 backupUrl → load_url → play', async () => {
      const online = mkSong('online-ok')
      mockInvoke
        .mockResolvedValueOnce({}) // stop
        .mockResolvedValueOnce({
          status: ApiInvokeStatus.Success,
          backupUrl: ['https://cdn/x.mp3']
        })
        .mockResolvedValueOnce({}) // load_url
        .mockResolvedValueOnce({}) // play
      await musicStore.setMusic(online, { origin: PlayingOrigin.Online })
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'api_song_url', {
        hash: 'online-ok-hash',
        quality: PlayingQuality.Bitrate128
      })
      expect(mockInvoke).toHaveBeenNthCalledWith(3, 'music_player_load_url', {
        path: 'https://cdn/x.mp3',
        hash: 'online-ok-hash'
      })
      expect(musicStore.music?.path).toBe('https://cdn/x.mp3')
      expect(musicStore.origin).toBe(PlayingOrigin.Online)
      expect(musicStore.isLoaded).toBe(true)
    })

    it('Online FAIL：api 无 backupUrl → notify + startWaitNext → timer 后切歌', async () => {
      const online = mkSong('online-bad')
      mockInvoke
        .mockResolvedValueOnce({}) // stop
        .mockResolvedValueOnce({ status: ApiInvokeStatus.Success, backupUrl: [] })
      await musicStore.setMusic(online, { origin: PlayingOrigin.Online })
      expect(mockNotifyError).toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(Interval.PoN + 1)
      await flushPromises()
      // 下一首 SONGS[1] 是本地的，会走 load_file
      expect(wasInvoked('music_player_load_file')).toBe(true)
    })
  })

  // ==========================================================================
  // 4. 5 种播放模式逻辑（通过触发 monitorPlay 阈值调用 playAutoNext）
  // ==========================================================================
  describe('4. 5 种播放模式逻辑（playAutoNext 阈值触发）', () => {
    beforeEach(() => {
      listStore.play.list = [...SONGS]
      listStore.play.info.count = SONGS.length
    })

    const setCurrent = (idx: number) => {
      ;(musicStore as any).music = SONGS[idx]
      ;(musicStore as any).origin = PlayingOrigin.Local
    }

    it('OrderPlay 普通 index → index+1（autoPlay=true）', async () => {
      musicStore.setMode(PlayingMode.OrderPlay)
      setCurrent(0)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(musicStore.music?.id).toBe(SONGS[1].id)
      expect(mockInvoke.mock.calls.some((c: any[]) => c[0] === 'music_player_play')).toBe(true)
    })

    it('OrderPlay 末尾 index → loop=true, autoPlay=false（停在本曲）', async () => {
      musicStore.setMode(PlayingMode.OrderPlay)
      setCurrent(LAST_INDEX)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(musicStore.music?.id).toBe(SONGS[LAST_INDEX].id)
      // autoPlay=false → setMusic 里 load 后不调 play → music_player_play 不应出现
      // 注意：triggerPlayAutoNextViaMonitorPlay 内部会设置 isPlaying=true 来打开守卫
      // 但 setMusic(loop=true, autoPlay=false) 会先 stop → isPlaying=false，然后 load，不再 play
      expect(mockInvoke.mock.calls.filter((c: any[]) => c[0] === 'music_player_play').length).toBe(
        0
      )
    })

    it('SinglePlay — loop=true, autoPlay=false（播完停在当前）', async () => {
      musicStore.setMode(PlayingMode.SinglePlay)
      setCurrent(1)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(musicStore.music?.id).toBe(SONGS[1].id)
      expect(mockInvoke.mock.calls.filter((c: any[]) => c[0] === 'music_player_play').length).toBe(
        0
      )
    })

    it('OrderLoop 普通 index → index+1', async () => {
      musicStore.setMode(PlayingMode.OrderLoop)
      setCurrent(1)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(musicStore.music?.id).toBe(SONGS[2].id)
    })

    it('OrderLoop 末尾 index → 回到 0（循环）', async () => {
      musicStore.setMode(PlayingMode.OrderLoop)
      setCurrent(LAST_INDEX)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(musicStore.music?.id).toBe(SONGS[0].id)
    })

    it('SingleLoop — loop=true, autoPlay=true（无限重播当前）', async () => {
      musicStore.setMode(PlayingMode.SingleLoop)
      setCurrent(1)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(musicStore.music?.id).toBe(SONGS[1].id)
      expect(mockInvoke.mock.calls.some((c: any[]) => c[0] === 'music_player_play')).toBe(true)
    })

    it('RandomPlay — getRandomNumber(lastIndex, currentIndex)', async () => {
      musicStore.setMode(PlayingMode.RandomPlay)
      setCurrent(1)
      mockGetRandomNumber.mockImplementationOnce(() => 2)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(mockGetRandomNumber).toHaveBeenCalledWith(LAST_INDEX, 1)
      expect(musicStore.music?.id).toBe(SONGS[2].id)
    })

    it('空列表 lastIndex=-1 → reload 自身（loop=true）', async () => {
      listStore.play.list = []
      listStore.play.info.count = 0
      ;(musicStore as any).music = SONGS[0]
      musicStore.setMode(PlayingMode.OrderLoop)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(musicStore.music?.id).toBe(SONGS[0].id)
      const called = mockInvoke.mock.calls.some((c: any[]) => c[0] === 'music_player_load_file')
      expect(called).toBe(true)
    })

    it('当前曲目不在列表（findIndex=-1）→ OrderLoop fallback index=0', async () => {
      musicStore.setMode(PlayingMode.OrderLoop)
      ;(musicStore as any).music = mkSong('external-001', { path: '/x.mp3' })
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(musicStore.music?.id).toBe(SONGS[0].id)
    })

    it('当前曲目不在列表 + RandomPlay → getRandomNumber(lastIndex, -1)', async () => {
      musicStore.setMode(PlayingMode.RandomPlay)
      ;(musicStore as any).music = mkSong('external-002', { path: '/y.mp3' })
      mockGetRandomNumber.mockImplementationOnce(() => 1)
      await triggerPlayAutoNextViaMonitorPlay(musicStore)
      expect(mockGetRandomNumber).toHaveBeenCalledWith(LAST_INDEX, -1)
      expect(musicStore.music?.id).toBe(SONGS[1].id)
    })
  })

  // ==========================================================================
  // 5. playPrevOrNext('prev' | 'next') 用户手动切歌
  // ==========================================================================
  describe('5. playPrevOrNext — 用户手动切歌', () => {
    beforeEach(() => {
      listStore.play.list = [...SONGS]
      listStore.play.info.count = SONGS.length
    })

    const setCurrent = (idx: number) => {
      ;(musicStore as any).music = SONGS[idx]
      ;(musicStore as any).origin = PlayingOrigin.Local
    }

    it('next：index=last → 回到 0（循环）', async () => {
      setCurrent(LAST_INDEX)
      musicStore.playPrevOrNext('next')
      await flushPromises()
      expect(musicStore.music?.id).toBe(SONGS[0].id)
    })

    it('next：普通 index → index+1', async () => {
      setCurrent(0)
      musicStore.playPrevOrNext('next')
      await flushPromises()
      expect(musicStore.music?.id).toBe(SONGS[1].id)
    })

    it('prev：index=0 → 回到 lastIndex（循环）', async () => {
      setCurrent(0)
      musicStore.playPrevOrNext('prev')
      await flushPromises()
      expect(musicStore.music?.id).toBe(SONGS[LAST_INDEX].id)
    })

    it('prev：普通 index → index-1', async () => {
      setCurrent(2)
      musicStore.playPrevOrNext('prev')
      await flushPromises()
      expect(musicStore.music?.id).toBe(SONGS[1].id)
    })

    it('RandomPlay → getRandomNumber 决定切歌目标', async () => {
      musicStore.setMode(PlayingMode.RandomPlay)
      setCurrent(1)
      mockGetRandomNumber.mockImplementationOnce(() => 0)
      musicStore.playPrevOrNext('next')
      await flushPromises()
      expect(mockGetRandomNumber).toHaveBeenCalled()
      expect(musicStore.music?.id).toBe(SONGS[0].id)
    })

    it('空列表 → fallback reload 自身', async () => {
      listStore.play.list = []
      listStore.play.info.count = 0
      ;(musicStore as any).music = SONGS[0]
      ;(musicStore as any).origin = PlayingOrigin.Local
      musicStore.playPrevOrNext('next')
      await flushPromises()
      expect(musicStore.music?.id).toBe(SONGS[0].id)
    })

    it('当前曲目不在列表（findIndex=-1）→ 直接 fallback 到 index=0 的曲目', async () => {
      ;(musicStore as any).music = mkSong('ext-orphan', { path: '/o.mp3' })
      musicStore.playPrevOrNext('next')
      await flushPromises()
      // 源码 playPrevOrNext：findIndex===-1 时直接 index=0，不再进入 type==='next' 的 +1 分支
      expect(musicStore.music?.id).toBe(SONGS[0].id)
    })
  })

  // ==========================================================================
  // 6. 进度拖动：startChangeProgress / stopChangeProgress 在线等待下载
  // ==========================================================================
  describe('6. 进度拖动（isDragging + 在线下载等待）', () => {
    beforeEach(() => {
      ;(musicStore as any).music = SONGS[0]
      ;(musicStore as any).isLoaded = true
    })

    it('startChangeProgress：有 music + 未拖动 → isDragging=true', () => {
      expect(musicStore.isDragging).toBe(false)
      musicStore.startChangeProgress()
      expect(musicStore.isDragging).toBe(true)
    })

    it('startChangeProgress：已经在拖 → 忽略', () => {
      ;(musicStore as any).isDragging = true
      musicStore.startChangeProgress()
      expect(musicStore.isDragging).toBe(true)
    })

    it('startChangeProgress：music=null → 直接返回', () => {
      ;(musicStore as any).music = null
      musicStore.startChangeProgress()
      expect(musicStore.isDragging).toBe(false)
    })

    it('stopChangeProgress（Local）：直接 seek + play + isDragging=false', async () => {
      musicStore.startChangeProgress()
      await musicStore.stopChangeProgress(50)
      expect(mockInvoke).toHaveBeenCalledWith('music_player_seek', { pos: 50 })
      expect(mockInvoke).toHaveBeenCalledWith('music_player_play')
      expect(musicStore.isDragging).toBe(false)
    })

    it('stopChangeProgress（Online 已下载覆盖目标）→ 直接 seek+play', async () => {
      ;(musicStore as any).origin = PlayingOrigin.Online
      // 下载进度 >= 目标进度 (50/200 = 0.25)
      ;(musicStore as any).downloadProgress = 0.6
      musicStore.startChangeProgress()
      await musicStore.stopChangeProgress(50)
      expect(mockInvoke).toHaveBeenCalledWith('music_player_seek', { pos: 50 })
      expect(mockInvoke).toHaveBeenCalledWith('music_player_play')
      expect(musicStore.isDragging).toBe(false)
    })

    it('stopChangeProgress（Online 未覆盖）→ pause + 等下载够后 seek+play', async () => {
      ;(musicStore as any).origin = PlayingOrigin.Online
      // 目标进度 = 50/200 = 0.25，当前下载 0.1 < 0.25 → 走等待下载
      ;(musicStore as any).downloadProgress = 0.1
      musicStore.startChangeProgress()

      await musicStore.stopChangeProgress(50)
      expect(mockInvoke).toHaveBeenCalledWith('music_player_pause')
      expect(musicStore.isLoading).toBe(true)
      expect(musicStore.isDragging).toBe(false)

      // 还没下载够 → interval tick 一次，不应有 seek
      await vi.advanceTimersByTimeAsync(Interval.Long)
      await flushPromises()
      const seekBefore = mockInvoke.mock.calls.some((c: any[]) => c[0] === 'music_player_seek')
      expect(seekBefore).toBe(false)

      // 下载追上 (0.3 >= 0.25) → tick → seek + play
      ;(musicStore as any).downloadProgress = 0.3
      await vi.advanceTimersByTimeAsync(Interval.Long)
      await flushPromises()
      expect(mockInvoke).toHaveBeenCalledWith('music_player_seek', { pos: 50 })
      expect(mockInvoke).toHaveBeenCalledWith('music_player_play')
      expect(musicStore.isLoading).toBe(false)
    })

    it('stopChangeProgress：未拖过（isDragging=false）→ 忽略返回', async () => {
      await musicStore.stopChangeProgress(40)
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // 7. 失败重试 MAX_RETRY_COUNT=3（播放列表全是坏曲 → 连续失败累加）
  // ==========================================================================
  describe('7. 加载失败重试计数（MAX_RETRY_COUNT=3）', () => {
    it('连续 3 次自动切歌仍失败 → notify「重试次数过多」并停止', async () => {
      const badPlaylist: ListMusic[] = [1, 2, 3, 4].map((i) => mkSong(`bad-${i}`, { path: null }))
      listStore.play.list = badPlaylist
      listStore.play.info.count = badPlaylist.length
      const firstBad = badPlaylist[0]

      // 第 1 次 setMusic：load 失败（path=null）→ retryCount=1 → startWaitNext
      await musicStore.setMusic(firstBad)
      expect(
        mockNotifyError.mock.calls.some((c: any[]) => String(c[0]).includes('即将切换下一首'))
      ).toBe(true)

      // 第 1 个 timer：retryCount++ 到 2 → playPrevOrNext('next') → 下一首仍然坏
      await vi.advanceTimersByTimeAsync(Interval.PoN + 1)
      await flushPromises()

      // 第 2 个 timer：retryCount++ 到 3 → 下一首仍然坏，触发 MAX
      await vi.advanceTimersByTimeAsync(Interval.PoN + 1)
      await flushPromises()

      // 第 3 个 timer：retryCount++ 到 4 ≥ MAX → notify「重试次数过多」
      await vi.advanceTimersByTimeAsync(Interval.PoN + 1)
      await flushPromises()

      const overLimitCalls = mockNotifyError.mock.calls.filter((c: any[]) =>
        String(c[0]).includes('重试次数过多')
      )
      expect(overLimitCalls.length).toBeGreaterThanOrEqual(1)
    })
  })
})
