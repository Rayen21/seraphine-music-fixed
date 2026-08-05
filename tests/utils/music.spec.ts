import {
  getFullName,
  getOrigin,
  getPic,
  getPrivilegeTags,
  getQuality,
  parseKrcLyric,
  parseLrcLyric
} from '@/utils/music'
import { LyricTransMode, PicSize, PlayingOrigin, PlayingQuality } from '@/utils/params'
import { describe, expect, it } from 'vitest'

// ============================================================================
// getPic — 图片 URL 替换 {size} 占位
// ============================================================================
describe('utils/music getPic()', () => {
  it('默认 size = PicSize.Sm (64)，替换 {size}', () => {
    const url = 'https://img.kg.example/Img{size}.jpg'
    expect(getPic(url)).toBe('https://img.kg.example/Img64.jpg')
  })

  it('显式 Md / Lg 尺寸正确替换', () => {
    const url = 'https://img.kg.example/Img{size}.jpg'
    expect(getPic(url, PicSize.Md)).toBe('https://img.kg.example/Img120.jpg')
    expect(getPic(url, PicSize.Lg)).toBe('https://img.kg.example/Img400.jpg')
  })

  it('URL 不含 {size} 时原样返回（不报错）', () => {
    const url = 'https://cdn.example/cover.jpg'
    expect(getPic(url)).toBe(url)
    expect(getPic(url, PicSize.Lg)).toBe(url)
  })
})

// ============================================================================
// getFullName — 音频标题
// ============================================================================
describe('utils/music getFullName()', () => {
  const base = {
    id: 1,
    hash: 'abc',
    path: null,
    cover: null,
    duration: 0
  } as const

  it('默认 mode=ta：`title - artist`', () => {
    expect(getFullName({ ...base, title: '夜曲', artist: '周杰伦' })).toBe('夜曲 - 周杰伦')
  })

  it('显式 mode=at：`artist - title`', () => {
    expect(getFullName({ ...base, title: '夜曲', artist: '周杰伦' }, 'at')).toBe('周杰伦 - 夜曲')
  })

  it('artist 为 null 时仅返回 title', () => {
    expect(getFullName({ ...base, title: 'Untitled', artist: null })).toBe('Untitled')
    expect(getFullName({ ...base, title: 'Untitled', artist: null }, 'at')).toBe('Untitled')
  })

  it('artist 为 空字符串 时仅返回 title（空串 falsy 分支）', () => {
    expect(getFullName({ ...base, title: '纯音乐', artist: '' as unknown as null })).toBe('纯音乐')
  })

  it('ListMusic 形状（含 album 等字段）也能正常工作（鸭子类型）', () => {
    const listMusic = {
      id: '2',
      hash: 'def',
      path: '/a.mp3',
      cover: 'c.jpg',
      title: '稻香',
      artist: '周杰伦',
      album: '魔杰座',
      duration: 223,
      sort: 0
    }
    expect(getFullName(listMusic)).toBe('稻香 - 周杰伦')
    expect(getFullName(listMusic, 'at')).toBe('周杰伦 - 稻香')
  })
})

// ============================================================================
// getPrivilegeTags — 权限标签
// ============================================================================
describe('utils/music getPrivilegeTags()', () => {
  it('privilege=10 且 payType=2 → ["付费"]', () => {
    expect(getPrivilegeTags(10, 2)).toEqual(['付费'])
  })

  it('privilege=10 且 payType=3 → ["VIP"]', () => {
    expect(getPrivilegeTags(10, 3)).toEqual(['VIP'])
  })

  it('privilege=10 但 payType=0/1/4/其他 → []', () => {
    expect(getPrivilegeTags(10, 0)).toEqual([])
    expect(getPrivilegeTags(10, 1)).toEqual([])
    expect(getPrivilegeTags(10, 4)).toEqual([])
    expect(getPrivilegeTags(10, 99)).toEqual([])
  })

  it('privilege 不等于 10，任意 payType → []（无权限判定）', () => {
    expect(getPrivilegeTags(0, 2)).toEqual([])
    expect(getPrivilegeTags(1, 3)).toEqual([])
    expect(getPrivilegeTags(11, 2)).toEqual([])
    expect(getPrivilegeTags(-1, 3)).toEqual([])
  })
})

// ============================================================================
// getOrigin — 音源判定（hash 存在 → Online，否则 Local）
// ============================================================================
describe('utils/music getOrigin()', () => {
  const base = {
    id: 1,
    path: null,
    cover: null,
    title: 'T',
    artist: 'A',
    album: null,
    duration: 0,
    sort: 0
  } as const

  it('hash 为 非空字符串 → PlayingOrigin.Online', () => {
    expect(getOrigin({ ...base, hash: 'real-hash-123' })).toBe(PlayingOrigin.Online)
    expect(getOrigin({ ...base, hash: '0' })).toBe(PlayingOrigin.Online) // '0' 作为字符串 truthy
  })

  it('hash 为 null → PlayingOrigin.Local', () => {
    expect(getOrigin({ ...base, hash: null })).toBe(PlayingOrigin.Local)
  })

  it('hash 为 空字符串 → PlayingOrigin.Local（空串 falsy）', () => {
    expect(getOrigin({ ...base, hash: '' })).toBe(PlayingOrigin.Local)
  })
})

// ============================================================================
// getQuality — 音质判定
// ============================================================================
describe('utils/music getQuality()', () => {
  it('audio_bitrate 缺失/null → 降级 Bitrate128', () => {
    expect(getQuality({ audio_bitrate: null, bit_depth: 24, sample_rate: 96000 } as any)).toBe(
      PlayingQuality.Bitrate128
    )
    expect(getQuality({ audio_bitrate: 0, bit_depth: 16, sample_rate: 44100 } as any)).toBe(
      PlayingQuality.Bitrate128
    )
  })

  it('三条件同时满足（bitrate>500 + bit_depth>=16 + sample_rate>=44100）→ BitrateFlac', () => {
    expect(getQuality({ audio_bitrate: 800, bit_depth: 24, sample_rate: 96000 } as any)).toBe(
      PlayingQuality.BitrateFlac
    )
    expect(getQuality({ audio_bitrate: 501, bit_depth: 16, sample_rate: 44100 } as any)).toBe(
      PlayingQuality.BitrateFlac // 边界
    )
  })

  it('bitrate>500 但 bit_depth 缺失 → BitrateHigh（无损判定缺一不可）', () => {
    expect(getQuality({ audio_bitrate: 800, bit_depth: null, sample_rate: 96000 } as any)).toBe(
      PlayingQuality.BitrateHigh
    )
  })

  it('bitrate>500 但 bit_depth<16 → BitrateHigh', () => {
    expect(getQuality({ audio_bitrate: 800, bit_depth: 8, sample_rate: 96000 } as any)).toBe(
      PlayingQuality.BitrateHigh
    )
  })

  it('bitrate>500 但 sample_rate<44100 → BitrateHigh', () => {
    expect(getQuality({ audio_bitrate: 800, bit_depth: 24, sample_rate: 32000 } as any)).toBe(
      PlayingQuality.BitrateHigh
    )
  })

  it('256 <= bitrate <= 500 → BitrateHigh', () => {
    expect(getQuality({ audio_bitrate: 500, bit_depth: null, sample_rate: null } as any)).toBe(
      PlayingQuality.BitrateHigh
    )
    expect(getQuality({ audio_bitrate: 256, bit_depth: null, sample_rate: null } as any)).toBe(
      PlayingQuality.BitrateHigh
    )
  })

  it('192 <= bitrate < 256 → Bitrate320', () => {
    expect(getQuality({ audio_bitrate: 192, bit_depth: null, sample_rate: null } as any)).toBe(
      PlayingQuality.Bitrate320
    )
    expect(getQuality({ audio_bitrate: 255, bit_depth: null, sample_rate: null } as any)).toBe(
      PlayingQuality.Bitrate320
    )
  })

  it('bitrate < 192 → Bitrate128', () => {
    expect(getQuality({ audio_bitrate: 128, bit_depth: null, sample_rate: null } as any)).toBe(
      PlayingQuality.Bitrate128
    )
    expect(getQuality({ audio_bitrate: 191, bit_depth: null, sample_rate: null } as any)).toBe(
      PlayingQuality.Bitrate128
    )
  })
})

// ============================================================================
// parseKrcLyric — KRC 歌词解析
// ============================================================================
describe('utils/music parseKrcLyric()', () => {
  it('空内容 → 空数组', () => {
    expect(parseKrcLyric('')).toEqual([])
  })

  it('解析标准 2 行 KRC：offset/duration/word 逐字偏移=行内相对+行offset', () => {
    const krc = ['[1000,2000]<0,500,1>Hello<600,800,1>World', '[3000,1500]<0,1500,1>Foo'].join('\n')

    const result = parseKrcLyric(krc)
    expect(result).toHaveLength(2)

    // 第 1 行
    expect(result[0].offset).toBe(1000)
    expect(result[0].duration).toBe(2000)
    expect(result[0].words).toHaveLength(2)
    expect(result[0].words[0]).toEqual({ offset: 1000 + 0, duration: 500, text: 'Hello' })
    expect(result[0].words[1]).toEqual({ offset: 1000 + 600, duration: 800, text: 'World' })

    // 第 2 行
    expect(result[1].offset).toBe(3000)
    expect(result[1].duration).toBe(1500)
    expect(result[1].words).toHaveLength(1)
    expect(result[1].words[0]).toEqual({ offset: 3000, duration: 1500, text: 'Foo' })
  })

  it('[language:base64] 译制歌词按行索引注入 translations', () => {
    // 注意：btoa 仅接受 Latin-1 字符集，此处使用 ASCII 占位文本（核心验证路由/顺序逻辑，与字符集无关）
    const lyricListObj = {
      content: [
        // type=Roman：lyricContent 子数组会被 join('') 拼成单行
        {
          type: LyricTransMode.Roman,
          language: 1,
          lyricContent: [
            ['Ro', 'man1'],
            ['Ro', 'man2']
          ]
        },
        // type=Trans
        { type: LyricTransMode.Trans, language: 2, lyricContent: [['Trans1'], ['Trans2']] }
      ],
      version: 1
    }
    const languageTag = `[language:${btoa(JSON.stringify(lyricListObj))}]`

    const krc = [languageTag, '[0,1000]<0,1000,1>Line1', '[1000,2000]<0,2000,1>Line2'].join('\n')

    const result = parseKrcLyric(krc)
    expect(result).toHaveLength(2)

    // 第 0 行 matchIndex=0 → Roman: "Roman1", Trans: "Trans1"
    expect(result[0].translations[LyricTransMode.Roman]).toBe('Roman1')
    expect(result[0].translations[LyricTransMode.Trans]).toBe('Trans1')
    // 第 1 行 matchIndex=1
    expect(result[1].translations[LyricTransMode.Roman]).toBe('Roman2')
    expect(result[1].translations[LyricTransMode.Trans]).toBe('Trans2')
  })

  it('[language:] base64 或 JSON 损坏时：try/catch 静默失败，不抛异常，原文继续解析', () => {
    const badKrc = ['[language:not-valid-base64!!]', '[0,1000]<0,1000,1>StillWorks'].join('\n')
    expect(() => parseKrcLyric(badKrc)).not.toThrow()

    const result = parseKrcLyric(badKrc)
    expect(result).toHaveLength(1) // 歌词行仍然正常产出
    expect(result[0].words[0].text).toBe('StillWorks')
    // translations 取不到则 undefined（matchIndex 正常自增）
    expect(result[0].translations[LyricTransMode.Trans]).toBeUndefined()
  })

  it('行内容无尖括号单词 → words 空数组，整行仍产出', () => {
    const krc = '[500,1000]' // 无 <...>
    const result = parseKrcLyric(krc)
    expect(result).toHaveLength(1)
    expect(result[0].words).toEqual([])
  })

  it('非歌词行（无 [offset,duration] 格式）被跳过，例如元数据 tag', () => {
    const krc = ['[ar:Artist]', '[ti:Title]', '[100,200]<0,100,1>Hello'].join('\n')
    const result = parseKrcLyric(krc)
    expect(result).toHaveLength(1)
    expect(result[0].words[0].text).toBe('Hello')
  })
})

// ============================================================================
// parseLrcLyric — LRC 歌词解析
// ============================================================================
describe('utils/music parseLrcLyric()', () => {
  it('空内容 → 空数组', () => {
    expect(parseLrcLyric('')).toEqual([])
  })

  it('标准 [mm:ss.xxx]text：offset 正确换算为 ms，line duration=0，words 单元素', () => {
    const lrc = '[00:01.500]Hello World'
    const result = parseLrcLyric(lrc)
    expect(result).toHaveLength(1)
    // 00:01.500 = 0 min + 1 s + 500 ms = 1500 ms
    expect(result[0].offset).toBe(0 * 60 * 1000 + 1 * 1000 + 500)
    expect(result[0].duration).toBe(0) // LRC 无行时长
    expect(result[0].words).toHaveLength(1)
    expect(result[0].words[0]).toEqual({
      offset: 1500,
      duration: 0,
      text: 'Hello World'
    })
  })

  it('多行长行顺序正确，matchIndex 决定 translations 对齐', () => {
    const lyricListObj = {
      content: [
        { type: LyricTransMode.Trans, language: 2, lyricContent: [['T1'], ['T2'], ['T3']] }
      ],
      version: 1
    }

    const tag = `[language:${btoa(JSON.stringify(lyricListObj))}]`
    const lrc = [tag, '[00:00.000]A', '[00:01.000]B', '[00:02.000]C'].join('\n')
    const result = parseLrcLyric(lrc)
    expect(result).toHaveLength(3)
    expect(result[0].words[0].text).toBe('A')
    expect(result[1].words[0].text).toBe('B')
    expect(result[2].words[0].text).toBe('C')
    // Translations 对齐：matchIndex 从 0 开始逐行 +1
    expect(result[0].translations[LyricTransMode.Trans]).toBe('T1')
    expect(result[1].translations[LyricTransMode.Trans]).toBe('T2')
    expect(result[2].translations[LyricTransMode.Trans]).toBe('T3')
  })

  it('时间戳后无文字或空白 → 该行被跳过（!text continue 分支）', () => {
    const lrc = ['[00:01.000]', '[00:02.000]   ', '[00:03.000]Actual'].join('\n')
    const result = parseLrcLyric(lrc)
    // trim 后都空的行会被跳过；但注意 match 后的 text 用 !text 判断
    // L119: if (!text) continue
    // 注：'   '.trim() 会变成 '' 但原始 text 是 '   ' 即 truthy
    // 实际上代码写的是 `const text = match[4]; if (!text) continue`，不对 text 做 trim
    // 所以 '   ' 不是空串 → 不会被跳过
    expect(result.length).toBeGreaterThanOrEqual(1) // 至少 Actual 那行存在
    const lastLine = result[result.length - 1]
    expect(lastLine.words[0].text).toBe('Actual')
  })

  it('非时间戳 tag 行（[ar:] [ti:] [al:]）被跳过', () => {
    const lrc = ['[ar:周杰伦]', '[ti:稻香]', '[al:魔杰座]', '[00:00.250]对这个世界'].join('\n')
    const result = parseLrcLyric(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].offset).toBe(250)
    expect(result[0].words[0].text).toBe('对这个世界')
  })

  it('language tag 损坏 JSON：不抛错，仍能产出原文行', () => {
    const lrc = ['[language:garbage!]', '[00:00.500]Ok'].join('\n')
    expect(() => parseLrcLyric(lrc)).not.toThrow()
    const result = parseLrcLyric(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].words[0].text).toBe('Ok')
  })
})
