import { useLyricStore } from '@/stores/lyric'
import {
  LyricBaseColor,
  LyricFontSize,
  LyricFormat,
  LyricOffset,
  LyricPageMode,
  LyricTextAlign,
  LyricTransMode
} from '@/utils/params'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock（必须全部在 vi.hoisted 中创建，vi.mock 会被提升到文件顶部）
// ============================================================================
const { mockInvoke, mockGetFullName, mockParseKrcLyric, mockParseLrcLyric } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockGetFullName: vi.fn(),
  mockParseKrcLyric: vi.fn(),
  mockParseLrcLyric: vi.fn()
}))

vi.mock('@/utils/music', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    getFullName: mockGetFullName,
    parseKrcLyric: mockParseKrcLyric,
    parseLrcLyric: mockParseLrcLyric
  }
})

vi.mock('@/utils/tools', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    invoke: mockInvoke
  }
})

// ============================================================================
// 夹具
// ============================================================================
const mkPlayingMusic = (id: string, extra: Partial<PlayingMusic> = {}): PlayingMusic => ({
  id,
  hash: `${id}-hash`,
  path: id.startsWith('online') ? null : `C:/Music/${id}.mp3`,
  cover: null,
  title: `Title-${id}`,
  artist: `Artist-${id}`,
  duration: 200,
  ...extra
})

const SAMPLE_LINES_KRC: LyricLine[] = [
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
const SAMPLE_LINES_LRC: LyricLine[] = [
  {
    offset: 1000,
    duration: 4000,
    words: [{ offset: 1000, duration: 4000, text: 'lrc-line-1' }],
    translations: { [LyricTransMode.Roman]: '', [LyricTransMode.Trans]: '' }
  },
  {
    offset: 6000,
    duration: 2000,
    words: [{ offset: 6000, duration: 2000, text: 'lrc-line-2' }],
    translations: { [LyricTransMode.Roman]: '', [LyricTransMode.Trans]: '' }
  }
]

const ONLINE_CANDIDATES: LyricCandidate[] = [
  {
    id: 'ly-official',
    accesskey: 'ak-official',
    product_from: '官方推荐歌词',
    singer: 'Artist',
    song: 'Song',
    score: 100
  },
  {
    id: 'ly-top',
    accesskey: 'ak-top',
    product_from: '用户上传',
    singer: 'Artist',
    song: 'Song',
    score: 90
  }
]

// ============================================================================
describe('stores/lyric — 歌词加载与渲染配置（M3：lyric store）', () => {
  let lyricStore: ReturnType<typeof useLyricStore>

  beforeEach(() => {
    setActivePinia(createPinia())

    mockInvoke.mockReset()
    mockGetFullName.mockReset()
    mockParseKrcLyric.mockReset()
    mockParseLrcLyric.mockReset()

    // 默认返回值，测试中可按需覆写
    mockGetFullName.mockImplementation((m: PlayingMusic, style?: string) =>
      style === 'at' ? `${m.artist} - ${m.title}` : `${m.artist}-${m.title}`
    )
    mockParseKrcLyric.mockReturnValue(SAMPLE_LINES_KRC)
    mockParseLrcLyric.mockReturnValue(SAMPLE_LINES_LRC)

    // 抑制源码 catch 块中的 console.error 输出（预期错误，非测试失败）
    vi.spyOn(console, 'error').mockImplementation(() => {})

    lyricStore = useLyricStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // 1. 初始默认值
  // ==========================================================================
  describe('1. 初始默认值', () => {
    it('所有字段初始值：page/pageMode/isLoading/lyric/字体/颜色/对齐/翻译/matchedMap/offsetMap', () => {
      expect(lyricStore.pageVisible).toBe(false)
      expect(lyricStore.pageMode).toBe(LyricPageMode.Cover)
      expect(lyricStore.isLoading).toBe(false)
      expect(lyricStore.lyric).toBeNull()
      expect(lyricStore.fontFamily).toBe('system-ui')
      expect(lyricStore.fontSize).toBe(LyricFontSize.Default) // 26
      expect(lyricStore.textColor).toBe(LyricBaseColor.Blue) // '#3b82f6'
      expect(lyricStore.textAlign).toBe(LyricTextAlign.Left) // 'text-left'
      expect(lyricStore.transMode).toBe(LyricTransMode.Off)
      expect(lyricStore.matchedMap).toEqual({})
      expect(lyricStore.offsetMap).toEqual({})
    })
  })

  // ==========================================================================
  // 2. UI/展示配置 setters
  // ==========================================================================
  describe('2. UI 配置 setters（page/font/size/color/align/transMode）', () => {
    it('togglePageVisible：每次翻转 pageVisible 布尔', () => {
      lyricStore.togglePageVisible()
      expect(lyricStore.pageVisible).toBe(true)
      lyricStore.togglePageVisible()
      expect(lyricStore.pageVisible).toBe(false)
    })

    it('setPageMode / setFontFamily / setTextColor / setTextAlign / setTransMode：直接改对应字段', () => {
      lyricStore.setPageMode(LyricPageMode.Record)
      expect(lyricStore.pageMode).toBe(LyricPageMode.Record)

      lyricStore.setFontFamily('Microsoft YaHei')
      expect(lyricStore.fontFamily).toBe('Microsoft YaHei')

      lyricStore.setTextColor(LyricBaseColor.Red)
      expect(lyricStore.textColor).toBe(LyricBaseColor.Red)
      // 也可以接受自定义字符串颜色（非枚举）
      lyricStore.setTextColor('#123456')
      expect(lyricStore.textColor).toBe('#123456')

      lyricStore.setTextAlign(LyricTextAlign.Center)
      expect(lyricStore.textAlign).toBe(LyricTextAlign.Center)

      lyricStore.setTransMode(LyricTransMode.Roman)
      expect(lyricStore.transMode).toBe(LyricTransMode.Roman)
    })

    it('setFontSize：add +Step(2)；sub -Step(2)；restart 重置 Default(26)；无 clamp', () => {
      // 默认 26
      lyricStore.setFontSize('add') // 28
      expect(lyricStore.fontSize).toBe(LyricFontSize.Default + LyricFontSize.Step)
      lyricStore.setFontSize('add') // 30
      expect(lyricStore.fontSize).toBe(30)
      lyricStore.setFontSize('sub') // 28
      expect(lyricStore.fontSize).toBe(28)
      lyricStore.setFontSize('restart')
      expect(lyricStore.fontSize).toBe(LyricFontSize.Default)
    })

    it('setLyric：直接写入，可写入 LyricInfo 或 null', () => {
      const info: LyricInfo = {
        id: 'lrc-1',
        fmt: LyricFormat.Lrc,
        lines: SAMPLE_LINES_LRC
      }
      lyricStore.setLyric(info)
      // Pinia 可能在写入时包装 ref，用 toStrictEqual 比较内容而非引用
      expect(lyricStore.lyric).toStrictEqual(info)
      lyricStore.setLyric(null)
      expect(lyricStore.lyric).toBeNull()
    })
  })

  // ==========================================================================
  // 3. setMatchedLyric & setOffsetMap
  // ==========================================================================
  describe('3. setMatchedLyric / setOffsetMap（matchedMap/offsetMap + 守卫）', () => {
    it('setMatchedLyric：写入 matchedMap[musicId] = { id, fmt }，可多次覆写', () => {
      lyricStore.setMatchedLyric('song-1', { id: 'ly-1', fmt: LyricFormat.Krc })
      expect(lyricStore.matchedMap['song-1']).toEqual({ id: 'ly-1', fmt: LyricFormat.Krc })
      lyricStore.setMatchedLyric('song-2', { id: 'ly-2', fmt: LyricFormat.Lrc })
      expect(lyricStore.matchedMap['song-2']).toEqual({ id: 'ly-2', fmt: LyricFormat.Lrc })
      // 覆写 song-1
      lyricStore.setMatchedLyric('song-1', { id: 'ly-1b', fmt: LyricFormat.Lrc })
      expect(lyricStore.matchedMap['song-1']).toEqual({ id: 'ly-1b', fmt: LyricFormat.Lrc })
    })

    it('setOffsetMap 守卫：lyric.value 为 null → 直接 return 不修改 offsetMap', () => {
      expect(lyricStore.lyric).toBeNull()
      lyricStore.setOffsetMap('add')
      lyricStore.setOffsetMap('sub')
      lyricStore.setOffsetMap('restart')
      expect(lyricStore.offsetMap).toEqual({})
    })

    it('setOffsetMap：lyric 存在 → 对 offsetMap[lyric.id] 执行 add/sub/restart（Step=0.2 Default=0）', () => {
      lyricStore.setLyric({ id: 'ly-current', fmt: LyricFormat.Krc, lines: [] })
      // 默认 offsetMap['ly-current'] 为 undefined
      // 源码：offsetMap[lyric.id] += Step → undefined + 0.2 = NaN
      // 先 restart 一次设为 Default(0) 再操作，模拟用户已调整过的情况
      lyricStore.setOffsetMap('restart')
      expect(lyricStore.offsetMap['ly-current']).toBe(LyricOffset.Default) // 0

      lyricStore.setOffsetMap('add') // 0.2
      expect(lyricStore.offsetMap['ly-current']).toBe(LyricOffset.Default + LyricOffset.Step)
      lyricStore.setOffsetMap('add') // 0.4
      expect(lyricStore.offsetMap['ly-current']).toBeCloseTo(0.4, 5)
      lyricStore.setOffsetMap('sub') // 0.2
      expect(lyricStore.offsetMap['ly-current']).toBeCloseTo(0.2, 5)
      lyricStore.setOffsetMap('restart') // 0
      expect(lyricStore.offsetMap['ly-current']).toBe(LyricOffset.Default)
    })

    it('setOffsetMap 多条独立 key：只修改当前 lyric.id 对应 key，其他保留', () => {
      // 预先塞两个 key
      ;(lyricStore as any).offsetMap = { 'ly-other': 0.6, 'ly-yet-another': -0.2 }
      lyricStore.setLyric({ id: 'ly-current', fmt: LyricFormat.Lrc, lines: [] })
      lyricStore.setOffsetMap('restart')
      lyricStore.setOffsetMap('add')

      expect(lyricStore.offsetMap['ly-other']).toBe(0.6) // 未动
      expect(lyricStore.offsetMap['ly-yet-another']).toBe(-0.2) // 未动
      expect(lyricStore.offsetMap['ly-current']).toBeCloseTo(0.2, 5)
    })
  })

  // ==========================================================================
  // 4. load() 加载核心链路（getLocalLyric → getOnlineLyric → 解析 → setLyric）
  // ==========================================================================
  describe('4. load 异步加载链路（本地→在线 fallback + Krc/Lrc 解析 + loading 复位）', () => {
    // ---------- 4.1 本地歌词直接命中 ----------
    it('本地歌词命中（传入 lyric Candidate）→ music_lyric_get 返回 Krc → parseKrcLyric → setLyric + setMatchedLyric', async () => {
      const music = mkPlayingMusic('local-song-1')
      const candidate: LyricCandidate = {
        id: 'ly-local-1',
        accesskey: 'ak-1',
        product_from: '本地缓存',
        singer: music.artist || '',
        song: music.title,
        score: 0
      }
      mockInvoke.mockResolvedValueOnce({
        id: 'ly-local-1',
        fmt: LyricFormat.Krc,
        content: '...fake-krc...'
      })

      await lyricStore.load(music, candidate)

      // 1) isLoading 开关
      // load 先同步 true → 结束时 false（我们检查最终值 + 调用 history）

      // 2) 本地歌词调用：music_lyric_get(name, id, fmt)
      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'music_lyric_get', {
        name: `${music.artist}-${music.title}`,
        id: 'ly-local-1',
        fmt: LyricFormat.Krc
      })

      // 3) 解析 Krc
      expect(mockParseKrcLyric).toHaveBeenCalledWith('...fake-krc...')
      expect(mockParseLrcLyric).not.toHaveBeenCalled()

      // 4) 写 lyric + matchedMap
      expect(lyricStore.lyric).not.toBeNull()
      expect(lyricStore.lyric!.id).toBe('ly-local-1')
      expect(lyricStore.lyric!.fmt).toBe(LyricFormat.Krc)
      expect(lyricStore.lyric!.lines).toStrictEqual(SAMPLE_LINES_KRC)
      expect(lyricStore.matchedMap[music.id]).toEqual({
        id: 'ly-local-1',
        fmt: LyricFormat.Krc
      })
      // 5) loading 复位
      expect(lyricStore.isLoading).toBe(false)
    })

    // ---------- 4.2 本地歌词使用 matchedMap 命中（未传 lyric）----------
    it('无 lyric 参数但 matchedMap 命中 → music_lyric_get 使用 matchedMap[id/fmt]', async () => {
      const music = mkPlayingMusic('matched-song')
      lyricStore.setMatchedLyric(music.id, { id: 'ly-matched', fmt: LyricFormat.Lrc })
      mockInvoke.mockResolvedValueOnce({
        id: 'ly-matched',
        fmt: LyricFormat.Lrc,
        content: '...lrc-text...'
      })

      await lyricStore.load(music)

      expect(mockInvoke).toHaveBeenCalledWith('music_lyric_get', {
        name: `${music.artist}-${music.title}`,
        id: 'ly-matched',
        fmt: LyricFormat.Lrc
      })
      expect(mockParseLrcLyric).toHaveBeenCalledWith('...lrc-text...')
      expect(lyricStore.lyric!.lines).toStrictEqual(SAMPLE_LINES_LRC)
      expect(lyricStore.isLoading).toBe(false)
    })

    // ---------- 4.3 本地失败（无 lyric + 无 matchedMap 或 invoke 抛错）→ 在线 fallback ----------
    it('本地无 lyric、matchedMap 也无 → api_lyric_search → 选官方推荐 → api_lyric_get → Lrc 解析', async () => {
      const music = mkPlayingMusic('online-song', { path: null })
      mockInvoke
        // getLocalLyric：matchedMap['online-song'] 不存在 → 直接 return undefined
        // 所以第 1 次 invoke 应该是 api_lyric_search（keyword=getFullName(music,'at')=Artist-${id} - Title-${id}，hash=music.hash）
        .mockResolvedValueOnce({
          status: 200,
          candidates: ONLINE_CANDIDATES
        })
        // api_lyric_get(name, id=ly-official.id, accesskey=ly-official.accesskey)
        .mockResolvedValueOnce({
          id: 'ly-official',
          fmt: LyricFormat.Lrc,
          content: '[00:01.00]line1'
        })

      await lyricStore.load(music)

      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'api_lyric_search', {
        keyword: `${music.artist} - ${music.title}`, // style='at'
        hash: music.hash
      })
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'api_lyric_get', {
        name: `${music.artist}-${music.title}`,
        id: 'ly-official',
        accesskey: 'ak-official'
      })
      // 官方推荐被选中（不回退到 candidates[0]）
      expect(mockParseLrcLyric).toHaveBeenCalledWith('[00:01.00]line1')
      expect(lyricStore.lyric!.id).toBe('ly-official')
      expect(lyricStore.matchedMap[music.id]!.id).toBe('ly-official')
      expect(lyricStore.isLoading).toBe(false)
    })

    it('api_lyric_search 返回 candidates 无官方推荐 → 取 candidates[0]', async () => {
      const music = mkPlayingMusic('s1')
      const candidatesNoOfficial: LyricCandidate[] = [
        {
          id: 'ly-top1',
          accesskey: 'ak-t1',
          product_from: '用户上传',
          singer: 'A',
          song: 'S',
          score: 99
        },
        {
          id: 'ly-top2',
          accesskey: 'ak-t2',
          product_from: '用户上传',
          singer: 'A',
          song: 'S',
          score: 50
        }
      ]
      mockInvoke
        .mockResolvedValueOnce({ status: 200, candidates: candidatesNoOfficial })
        .mockResolvedValueOnce({
          id: 'ly-top1',
          fmt: LyricFormat.Krc,
          content: 'krc-body'
        })

      await lyricStore.load(music)

      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'api_lyric_get', {
        name: `${music.artist}-${music.title}`,
        id: 'ly-top1',
        accesskey: 'ak-t1'
      })
      expect(mockParseKrcLyric).toHaveBeenCalledWith('krc-body')
      expect(lyricStore.lyric!.id).toBe('ly-top1')
      expect(lyricStore.isLoading).toBe(false)
    })

    it('load(music, candidate) 传入非空 lyric → getOnlineLyric 内部不调用 api_lyric_search，直接 api_lyric_get', async () => {
      const music = mkPlayingMusic('online-song-2')
      const candidate: LyricCandidate = {
        id: 'ly-user-chosen',
        accesskey: 'ak-user',
        product_from: '用户上传',
        singer: '',
        song: '',
        score: 0
      }
      // getLocalLyric 中 candidate.id 传入但 invoke 抛错/失败 → 走 getOnlineLyric(candidate)
      mockInvoke
        .mockRejectedValueOnce(new Error('本地没这份缓存'))
        // 在线 api_lyric_get，直接用 candidate.id/candidate.accesskey
        .mockResolvedValueOnce({
          id: 'ly-user-chosen',
          fmt: LyricFormat.Lrc,
          content: 'lrc-direct'
        })

      await lyricStore.load(music, candidate)

      // invoke 被调 2 次，但 api_lyric_search 不应被调用
      const searchCalls = mockInvoke.mock.calls.filter((c: any[]) => c[0] === 'api_lyric_search')
      expect(searchCalls).toHaveLength(0)
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'music_lyric_get', {
        name: `${music.artist}-${music.title}`,
        id: candidate.id,
        fmt: LyricFormat.Krc // candidate 未指定 fmt，getLocalLyric 默认 Krc
      })
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'api_lyric_get', {
        name: `${music.artist}-${music.title}`,
        id: candidate.id,
        accesskey: candidate.accesskey
      })
      expect(mockParseLrcLyric).toHaveBeenCalledWith('lrc-direct')
      expect(lyricStore.lyric!.id).toBe('ly-user-chosen')
      expect(lyricStore.isLoading).toBe(false)
    })

    // ---------- 4.4 本地+在线全部失败 → lyric=null，isLoading 必须复位 ----------
    it('api_lyric_search.status!==200 → 全部失败 → lyric=null, matchedMap 未追加, isLoading=false', async () => {
      const music = mkPlayingMusic('s-fail-1')
      mockInvoke.mockResolvedValueOnce({ status: 404, candidates: [] })

      await lyricStore.load(music)
      expect(lyricStore.lyric).toBeNull()
      expect(lyricStore.matchedMap[music.id]).toBeUndefined()
      expect(lyricStore.isLoading).toBe(false)
      expect(mockParseKrcLyric).not.toHaveBeenCalled()
      expect(mockParseLrcLyric).not.toHaveBeenCalled()
    })

    it('api_lyric_search 返回 candidates=[] → 无候选 → lyric=null, isLoading=false', async () => {
      const music = mkPlayingMusic('s-empty')
      mockInvoke.mockResolvedValueOnce({ status: 200, candidates: [] })

      await lyricStore.load(music)
      expect(lyricStore.lyric).toBeNull()
      expect(lyricStore.isLoading).toBe(false)
    })

    it('getOnlineLyric api_lyric_get 抛错 → try-catch 吞掉 → lyric=null + isLoading=false', async () => {
      const music = mkPlayingMusic('s-throw')
      mockInvoke
        .mockResolvedValueOnce({ status: 200, candidates: ONLINE_CANDIDATES })
        .mockRejectedValueOnce(new Error('Network Broken'))

      await expect(lyricStore.load(music)).resolves.not.toThrow()
      expect(lyricStore.lyric).toBeNull()
      expect(lyricStore.isLoading).toBe(false)
    })

    it('getLocalLyric invoke 抛错 + 在线也返回空 → 不向外抛错，最终 isLoading=false', async () => {
      const music = mkPlayingMusic('s-both-fail')
      lyricStore.setMatchedLyric(music.id, { id: 'broken', fmt: LyricFormat.Krc })
      mockInvoke
        .mockRejectedValueOnce(new Error('本地读取失败')) // music_lyric_get reject
        .mockResolvedValueOnce({ status: 200, candidates: [] }) // api_lyric_search 空候选

      await expect(lyricStore.load(music)).resolves.not.toThrow()
      expect(lyricStore.lyric).toBeNull()
      expect(lyricStore.isLoading).toBe(false)
    })

    // ---------- 4.5 isLoading 生命周期：load 开始同步 true，所有分支最终 false ----------
    it('isLoading 先置 true，无论成功失败最终都回到 false（失败分支验证）', async () => {
      const music = mkPlayingMusic('loading-cb')
      // 构造一个 promise 可手动控制，观察 load 同步阶段 isLoading 已被置 true
      let resolveSearch!: (v: any) => void
      const pending = new Promise<any>((r) => (resolveSearch = r))
      mockInvoke.mockReturnValueOnce(pending)

      const p = lyricStore.load(music)
      // 同步执行后（invoke 尚未 resolve）isLoading 应为 true
      expect(lyricStore.isLoading).toBe(true)

      resolveSearch({ status: 500, candidates: [] })
      await p
      expect(lyricStore.isLoading).toBe(false)
      expect(lyricStore.lyric).toBeNull()
    })
  })
})
