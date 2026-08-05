import {
  AlbumTypes,
  AreaTypes,
  BreakPoint,
  ColCount,
  DefaultSystemFonts,
  FORWARD_DURATION,
  Interval,
  ListType,
  LyricAccentColor,
  LyricBaseColor,
  LyricFontSize,
  LyricFormat,
  LyricOffset,
  LyricTextAlign,
  PageSize,
  PicSize,
  PlayingQuality,
  PresetsColors,
  SearchType,
  SexTypes,
  SizeUnits,
  ThemeMode,
  WindowEvent,
  WindowTarget,
  desktopLyricSize,
  miniPlayerSize
} from '@/utils/params'
// isolatedModules: true 下，const enum 不能直接作为值用在 Object.keys/Object.values/函数实参中
// 通过 namespace import + Reflect.get 间接获取 const enum 对象，绕过 TS2475
// （esbuild 转译后 const enum 在运行时存在，Reflect.get 返回 any 再断言为目标类型）
import * as P from '@/utils/params'
import { describe, expect, it } from 'vitest'

/** 把 const enum 当作 Record 对象使用（绕过 TS2475） */
const enumRecord = (name: keyof typeof P): Record<string, unknown> =>
  Reflect.get(P, name) as Record<string, unknown>

// ============================================================================
// 1. SizeUnits — 与 tools.ts formatFileSize 严格对齐（顺序/内容一字不差）
// ============================================================================
describe('utils/params SizeUnits（formatFileSize 依赖）', () => {
  it('内容 & 顺序精确匹配：B→KB→MB→GB→TB→PB→EB→ZB→YB', () => {
    expect(SizeUnits).toEqual(['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'])
  })

  it('length=9 且每一项均为非空大写字符串', () => {
    expect(SizeUnits).toHaveLength(9)
    SizeUnits.forEach((unit) => {
      expect(typeof unit).toBe('string')
      expect(unit.length).toBeGreaterThan(0)
      expect(unit).toBe(unit.toUpperCase())
    })
  })
})

// ============================================================================
// 2. LyricFontSize / LyricOffset — 歌词字号 & 偏移边界一致性
// ============================================================================
describe('utils/params 歌词字号/偏移边界约束', () => {
  it('LyricFontSize：Min ≤ Default ≤ Max，Step 为正数且能让 Default-Min 整除 Step', () => {
    // 具体值回归保护（配置面板 UI 严格依赖）
    expect(LyricFontSize.Min).toBe(16)
    expect(LyricFontSize.Max).toBe(36)
    expect(LyricFontSize.Default).toBe(26)
    expect(LyricFontSize.Step).toBe(2)
    // 数学不变量
    expect(LyricFontSize.Min).toBeLessThanOrEqual(LyricFontSize.Default)
    expect(LyricFontSize.Default).toBeLessThanOrEqual(LyricFontSize.Max)
    expect(LyricFontSize.Step).toBeGreaterThan(0)
    // 步长可以从 Min 按 Step 加正好到达 Max（UI 滑条无断点）
    expect((LyricFontSize.Max - LyricFontSize.Min) % LyricFontSize.Step).toBe(0)
    expect((LyricFontSize.Default - LyricFontSize.Min) % LyricFontSize.Step).toBe(0)
  })

  it('LyricOffset：Step=0.2、Default=0', () => {
    expect(LyricOffset.Default).toBe(0)
    expect(LyricOffset.Step).toBe(0.2)
    expect(LyricOffset.Step).toBeGreaterThan(0)
  })

  it('FORWARD_DURATION = 150 ms（歌词提前显示时长）', () => {
    expect(FORWARD_DURATION).toBe(150)
  })
})

// ============================================================================
// 3. 歌词配色：BaseColor / AccentColor / PresetsColors 三向一致性
// ============================================================================
describe('utils/params 歌词配色方案', () => {
  const HEX_RE = /^#[0-9a-f]{6}$/i

  it('LyricBaseColor 7 种颜色，所有值都是合法 6 位 hex', () => {
    const obj = enumRecord('LyricBaseColor') as Record<string, string>
    const keys = Object.keys(obj)
    expect(keys).toEqual(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple'])
    for (const k of keys) {
      expect(obj[k]).toMatch(HEX_RE)
    }
  })

  it('LyricAccentColor 7 种同名颜色，所有值合法 hex', () => {
    const obj = enumRecord('LyricAccentColor') as Record<string, string>
    const keys = Object.keys(obj)
    expect(keys).toEqual(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple'])
    for (const k of keys) {
      expect(obj[k]).toMatch(HEX_RE)
    }
  })

  it('PresetsColors 恰好 7 套配色，与两枚举一一对应（顺序 / 值完全一致）', () => {
    expect(PresetsColors).toHaveLength(7)
    const pairs = [
      [LyricBaseColor.Red, LyricAccentColor.Red],
      [LyricBaseColor.Orange, LyricAccentColor.Orange],
      [LyricBaseColor.Yellow, LyricAccentColor.Yellow],
      [LyricBaseColor.Green, LyricAccentColor.Green],
      [LyricBaseColor.Cyan, LyricAccentColor.Cyan],
      [LyricBaseColor.Blue, LyricAccentColor.Blue],
      [LyricBaseColor.Purple, LyricAccentColor.Purple]
    ]
    expect(PresetsColors).toEqual(pairs)
  })

  it('LyricTextAlign 对应 Tailwind CSS class 名称（text-left/center/right）', () => {
    expect(LyricTextAlign.Left).toBe('text-left')
    expect(LyricTextAlign.Center).toBe('text-center')
    expect(LyricTextAlign.Right).toBe('text-right')
  })
})

// ============================================================================
// 4. 尺寸常量：miniPlayer / desktopLyric / BreakPoint / ColCount / PageSize / Interval
// ============================================================================
describe('utils/params 尺寸/间距/分页/帧间隔数值契约', () => {
  it('miniPlayerSize = 298×66 (+ border:1px 契约)', () => {
    expect(miniPlayerSize.width).toBe(298)
    expect(miniPlayerSize.height).toBe(66)
    expect(miniPlayerSize.width).toBeGreaterThan(0)
    expect(miniPlayerSize.height).toBeGreaterThan(0)
  })

  it('desktopLyricSize = 608×112', () => {
    expect(desktopLyricSize.width).toBe(608)
    expect(desktopLyricSize.height).toBe(112)
  })

  it('BreakPoint: MD=1280 < LG=1536（单调递增）', () => {
    expect(BreakPoint.MD).toBe(1280)
    expect(BreakPoint.LG).toBe(1536)
    expect(BreakPoint.MD).toBeLessThan(BreakPoint.LG)
  })

  it('ColCount: SM=3 < MD=4 < LG=5（与断点同步递增）', () => {
    expect(ColCount.SM).toBe(3)
    expect(ColCount.MD).toBe(4)
    expect(ColCount.LG).toBe(5)
    expect(ColCount.SM).toBeLessThan(ColCount.MD)
    expect(ColCount.MD).toBeLessThan(ColCount.LG)
  })

  it('PageSize: Min=10 ≤ Default=30 ≤ Max=300', () => {
    expect(PageSize.Min).toBe(10)
    expect(PageSize.Default).toBe(30)
    expect(PageSize.Max).toBe(300)
    expect(PageSize.Min).toBeLessThanOrEqual(PageSize.Default)
    expect(PageSize.Default).toBeLessThanOrEqual(PageSize.Max)
  })

  it('Interval 帧间隔：16 < 33 < 100 < 1000 < 2000', () => {
    expect(Interval.Short).toBe(16)
    expect(Interval.Medium).toBe(33)
    expect(Interval.Long).toBe(100)
    expect(Interval.Sec).toBe(1000)
    expect(Interval.PoN).toBe(2000)
    expect(Interval.Short).toBeLessThan(Interval.Medium)
    expect(Interval.Medium).toBeLessThan(Interval.Long)
    expect(Interval.Long).toBeLessThan(Interval.Sec)
    expect(Interval.Sec).toBeLessThan(Interval.PoN)
  })
})

// ============================================================================
// 5. 字符串枚举（跨窗口 / Tauri events / 后端接口请求序列化 关键字符串）
// ============================================================================
describe('utils/params 字符串枚举（序列化契约，变更即破坏兼容性）', () => {
  it('WindowTarget：三个窗口名必须与 HTML 文件名 / capabilities 名完全对应', () => {
    expect(WindowTarget.Main).toBe('main')
    expect(WindowTarget.MiniPlayer).toBe('mini-player') // ← 对应 mini-player.html / capabilities/mini-player.json
    expect(WindowTarget.DesktopLyric).toBe('desktop-lyric') // ← desktop-lyric.html / capabilities/desktop-lyric.json
  })

  it('WindowEvent：Tauri emit 通道名（三窗口 IPC 事件）', () => {
    expect(WindowEvent.MiniPlayer).toBe('mini-player:handler')
    expect(WindowEvent.DesktopLyric).toBe('desktop-lyric:handler')
  })

  it('ListType — Local/Show/Play — 列表 store 三类类型字符串', () => {
    expect(ListType.Local).toBe('local')
    expect(ListType.Show).toBe('show')
    expect(ListType.Play).toBe('play')
  })

  it('ThemeMode — Light/Dark/Auto（setting store themeMode 持久化字符串）', () => {
    expect(ThemeMode.Light).toBe('light')
    expect(ThemeMode.Dark).toBe('dark')
    expect(ThemeMode.Auto).toBe('auto')
  })

  it('LyricFormat 字符串值：Krc / Lrc', () => {
    expect(LyricFormat.Krc).toBe('Krc')
    expect(LyricFormat.Lrc).toBe('Lrc')
  })

  it('SearchType 7 项全量枚举（与 kg 后端接口关键字段名）', () => {
    expect(SearchType.Song).toBe('song')
    expect(SearchType.Album).toBe('album')
    expect(SearchType.Author).toBe('author')
    expect(SearchType.Mv).toBe('mv')
    expect(SearchType.Lyric).toBe('lyric')
    expect(SearchType.Special).toBe('special')
    expect(SearchType.Collect).toBe('collect')
  })

  it('PicSize 三档尺寸字符串（与 getPic 默认使用）', () => {
    expect(PicSize.Sm).toBe('64')
    expect(PicSize.Md).toBe('120')
    expect(PicSize.Lg).toBe('400')
  })

  it('PlayingQuality 14 档字符串值（向后端请求 quality 关键字段）', () => {
    const values = Object.values(enumRecord('PlayingQuality') as Record<string, string>)
    expect(values).toHaveLength(14)
    // 核心四档
    expect(PlayingQuality.Bitrate128).toBe('128')
    expect(PlayingQuality.Bitrate320).toBe('320')
    expect(PlayingQuality.BitrateHigh).toBe('high')
    expect(PlayingQuality.BitrateFlac).toBe('flac')
    // VIP 增强
    expect(PlayingQuality.ViperAtmos).toBe('viper_atmos')
    expect(PlayingQuality.ViperClear).toBe('viper_clear')
    expect(PlayingQuality.ViperTape).toBe('viper_tape')
    expect(PlayingQuality.SuperBsd).toBe('super')
    // 魔音 7 种：Piano/Acappella/Subwoofer/Ancient/Surnay/Dj
    expect(PlayingQuality.MagicPiano).toBe('piano')
    expect(PlayingQuality.MagicAcappella).toBe('acappella')
    expect(PlayingQuality.MagicSubwoofer).toBe('subwoofer')
    expect(PlayingQuality.MagicAncient).toBe('ancient')
    expect(PlayingQuality.MagicSurnay).toBe('surnay')
    expect(PlayingQuality.MagicDj).toBe('dj')
    // 无重复值
    expect(new Set(values).size).toBe(values.length)
  })
})

// ============================================================================
// 6. 数字枚举（成员数量保护，防止新增/删除模式产生 switch 遗漏）
// ============================================================================
describe('utils/params 数值枚举成员数量回归保护（区分数字/字符串枚举）', () => {
  // 数字枚举 TS 编译：{ 0:'Name', Name:0 }，Object.keys长度=2N；字符串枚举：每个成员只占 1 个 key
  const countEnum = (e: object) => {
    const keys = Object.keys(e)
    const reverseNumericKeys = keys.filter((k) => /^\d+$/.test(k)).length // 数字枚举专属"反向映射"键（纯数字的那些）
    return keys.length - reverseNumericKeys
  }

  it('PlayingMode 5 种（顺序/单曲顺序/顺序循环/单曲循环/随机）', () => {
    expect(countEnum(enumRecord('PlayingMode') as object)).toBe(5)
  })

  it('SortType 5 种（Default/Title/Artist/Album/Duration）', () => {
    expect(countEnum(enumRecord('SortType') as object)).toBe(5)
  })

  it('SortOrder 2 种（ASC/DESC）', () => {
    expect(countEnum(enumRecord('SortOrder') as object)).toBe(2)
  })

  it('LyricPageMode 3 种（Cover/Record/Photo）', () => {
    expect(countEnum(enumRecord('LyricPageMode') as object)).toBe(3)
  })

  it('LyricTransMode 3 种（Roman/Trans/Off）', () => {
    expect(countEnum(enumRecord('LyricTransMode') as object)).toBe(3)
  })

  it('PlayingOrigin 2 种（Local/Online）', () => {
    expect(countEnum(enumRecord('PlayingOrigin') as object)).toBe(2)
  })

  it('ScanStatus 4 种 Ready/Loading/Fail/Success', () => {
    expect(countEnum(enumRecord('ScanStatus') as object)).toBe(4)
  })

  it('QrcodeStatus 5 种 Ready/Scan/Timeout/Confirm/Fail', () => {
    expect(countEnum(enumRecord('QrcodeStatus') as object)).toBe(5)
  })

  it('QrcodeType 3 种 KG/QQ/WX', () => {
    expect(countEnum(enumRecord('QrcodeType') as object)).toBe(3)
  })

  it('LoginMode 2 种 Code/Form', () => {
    expect(countEnum(enumRecord('LoginMode') as object)).toBe(2)
  })

  it('PlaylistType 2 种 User/Collection', () => {
    expect(countEnum(enumRecord('PlaylistType') as object)).toBe(2)
  })

  it('AddPlaylistType 2 种 Add/Import', () => {
    expect(countEnum(enumRecord('AddPlaylistType') as object)).toBe(2)
  })

  it('AddMusicType 2 种 Add/Scan', () => {
    expect(countEnum(enumRecord('AddMusicType') as object)).toBe(2)
  })

  it('CloseStatus 2 种 Hide/Exit', () => {
    expect(countEnum(enumRecord('CloseStatus') as object)).toBe(2)
  })

  it('UserAction 3 种 Info/Logout/Vip', () => {
    expect(countEnum(enumRecord('UserAction') as object)).toBe(3)
  })

  it('MenuAction 5 种 Restore/Update/Setting/Logout/Exit', () => {
    expect(countEnum(enumRecord('MenuAction') as object)).toBe(5)
  })

  it('MiniPlayerEmit 11 种：Init/Pos/Audio/Lyric/Playlist/Play/Pause/Prev/Next/Set/Close', () => {
    expect(countEnum(enumRecord('MiniPlayerEmit') as object)).toBe(11)
  })

  it('DesktopLyricEmit 12 种：Init/Pos/Audio/Lyric/Progress/Fonts/Main/Prev/Next/Play/Pause/Close', () => {
    expect(countEnum(enumRecord('DesktopLyricEmit') as object)).toBe(12)
  })

  it('ShortcutKey 8 种：PlayOrPause/AddVolumn/SubVolumn/Mute/Prev/Next/Forward/Backward', () => {
    expect(countEnum(enumRecord('ShortcutKey') as object)).toBe(8)
  })

  it('AutoStartMode 2 种 Foreground/Background', () => {
    expect(countEnum(enumRecord('AutoStartMode') as object)).toBe(2)
  })

  it('ApiInvokeStatus 1 种 Success=1', () => {
    expect(countEnum(enumRecord('ApiInvokeStatus') as object)).toBe(1)
  })
})

// ============================================================================
// 7. 预设常量表（AreaTypes/SexTypes/AlbumTypes/DefaultSystemFonts — 长度 & 字段完整性
// ============================================================================
describe('utils/params 预设常量表（后端映射）', () => {
  it('AreaTypes 8 项，每项 id 4 字段：id/type/musician/title（去重 id 连续 1..8', () => {
    expect(AreaTypes).toHaveLength(8)
    AreaTypes.forEach((area, idx) => {
      expect(area.id).toBe(idx + 1)
      expect(typeof area.type).toBe('number')
      expect(typeof area.musician).toBe('number')
      expect(typeof area.title).toBe('string')
      expect(area.title.length).toBeGreaterThan(0)
    })
  })

  it('SexTypes 4 项 key0全部/1男/2女/3组合', () => {
    expect(SexTypes).toHaveLength(4)
    expect(SexTypes.map((s) => s.key)).toEqual([0, 1, 2, 3])
  })

  it('AlbumTypes 4 项（华语chn/欧美eur/日本jpn/韩国kor）', () => {
    expect(AlbumTypes).toHaveLength(4)
    expect(AlbumTypes.map((a) => a.type)).toEqual(['chn', 'eur', 'jpn', 'kor'])
  })

  it('DefaultSystemFonts 字体对结构：每项 [中文名, 英文名] 且两项都是非空字符串', () => {
    // 字体列表项不能空（预设列表长度依赖 UI 展示）
    expect(DefaultSystemFonts.length).toBeGreaterThanOrEqual(40)
    DefaultSystemFonts.forEach(([cn, en], idx) => {
      expect(typeof cn).toBe('string')
      expect(typeof en).toBe('string')
      expect(cn.length).toBeGreaterThan(0)
      expect(en.length).toBeGreaterThan(0)
      // 首行作为默认字体"system-ui" 第一项
      if (idx === 0) expect(en).toBe('system-ui')
    })
  })
})
