import {
  LyricAccentColor,
  LyricBaseColor,
  LyricFontSize,
  LyricOffset,
  LyricTransMode
} from '@/utils/params'
import { useDesktopLyricStore } from '@/windows/desktop-lyric/stores/desktop-lyric'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

// 读取 store 源码用于断言持久化配置（避免依赖运行时反射）
const storeSource = readFileSync(
  resolve(process.cwd(), 'src/windows/desktop-lyric/stores/desktop-lyric.ts'),
  'utf-8'
)

describe('stores/desktop-lyric — 桌面歌词 store（M7.3）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ==========================================================================
  // 1. 默认值
  // ==========================================================================
  describe('1. 默认值', () => {
    it('fontFamily 默认 system-ui', () => {
      const store = useDesktopLyricStore()
      expect(store.fontFamily).toBe('system-ui')
    })

    it('fontSize 默认 LyricFontSize.Default', () => {
      const store = useDesktopLyricStore()
      expect(store.fontSize).toBe(LyricFontSize.Default)
    })

    it('textBaseColor 默认 LyricBaseColor.Blue', () => {
      const store = useDesktopLyricStore()
      expect(store.textBaseColor).toBe(LyricBaseColor.Blue)
    })

    it('textAccentColor 默认 LyricAccentColor.Blue', () => {
      const store = useDesktopLyricStore()
      expect(store.textAccentColor).toBe(LyricAccentColor.Blue)
    })

    it('transMode 默认 LyricTransMode.Off', () => {
      const store = useDesktopLyricStore()
      expect(store.transMode).toBe(LyricTransMode.Off)
    })

    it('offsetMap 默认空对象', () => {
      const store = useDesktopLyricStore()
      expect(store.offsetMap).toStrictEqual({})
    })
  })

  // ==========================================================================
  // 2. setFontFamily
  // ==========================================================================
  describe('2. setFontFamily', () => {
    it('设置新字体 → fontFamily 更新', () => {
      const store = useDesktopLyricStore()
      store.setFontFamily('Microsoft YaHei')
      expect(store.fontFamily).toBe('Microsoft YaHei')
    })

    it('重复设置同值 → 仍写入（无去重逻辑）', () => {
      const store = useDesktopLyricStore()
      store.setFontFamily('system-ui')
      expect(store.fontFamily).toBe('system-ui')
    })
  })

  // ==========================================================================
  // 3. setFontSize
  // ==========================================================================
  describe('3. setFontSize', () => {
    it("mode='add' → fontSize += Step", () => {
      const store = useDesktopLyricStore()
      const before = store.fontSize
      store.setFontSize('add')
      expect(store.fontSize).toBe(before + LyricFontSize.Step)
    })

    it("mode='sub' → fontSize -= Step", () => {
      const store = useDesktopLyricStore()
      const before = store.fontSize
      store.setFontSize('sub')
      expect(store.fontSize).toBe(before - LyricFontSize.Step)
    })

    it("mode='restart' → fontSize = Default", () => {
      const store = useDesktopLyricStore()
      store.setFontSize('add')
      store.setFontSize('add')
      store.setFontSize('restart')
      expect(store.fontSize).toBe(LyricFontSize.Default)
    })

    it('连续 add 多次 → 累加（无上限拦截）', () => {
      const store = useDesktopLyricStore()
      store.setFontSize('add')
      store.setFontSize('add')
      store.setFontSize('add')
      expect(store.fontSize).toBe(LyricFontSize.Default + LyricFontSize.Step * 3)
    })

    it('连续 sub 多次 → 累减（无下限拦截）', () => {
      const store = useDesktopLyricStore()
      store.setFontSize('sub')
      store.setFontSize('sub')
      expect(store.fontSize).toBe(LyricFontSize.Default - LyricFontSize.Step * 2)
    })
  })

  // ==========================================================================
  // 4. setTextColors
  // ==========================================================================
  describe('4. setTextColors', () => {
    it('设置 [base, accent] 元组 → 同时更新两个字段', () => {
      const store = useDesktopLyricStore()
      store.setTextColors([LyricBaseColor.Red, LyricAccentColor.Red])
      expect(store.textBaseColor).toBe(LyricBaseColor.Red)
      expect(store.textAccentColor).toBe(LyricAccentColor.Red)
    })

    it('设置不同色对 → 同时更新（如 base=Green, accent=Yellow）', () => {
      const store = useDesktopLyricStore()
      store.setTextColors([LyricBaseColor.Green, LyricAccentColor.Yellow])
      expect(store.textBaseColor).toBe(LyricBaseColor.Green)
      expect(store.textAccentColor).toBe(LyricAccentColor.Yellow)
    })
  })

  // ==========================================================================
  // 5. setTransMode
  // ==========================================================================
  describe('5. setTransMode', () => {
    it('设置 Roman → transMode = Roman', () => {
      const store = useDesktopLyricStore()
      store.setTransMode(LyricTransMode.Roman)
      expect(store.transMode).toBe(LyricTransMode.Roman)
    })

    it('设置 Trans → transMode = Trans', () => {
      const store = useDesktopLyricStore()
      store.setTransMode(LyricTransMode.Trans)
      expect(store.transMode).toBe(LyricTransMode.Trans)
    })

    it('设置 Off → transMode = Off', () => {
      const store = useDesktopLyricStore()
      store.setTransMode(LyricTransMode.Trans)
      store.setTransMode(LyricTransMode.Off)
      expect(store.transMode).toBe(LyricTransMode.Off)
    })
  })

  // ==========================================================================
  // 6. setOffsetMap
  // ==========================================================================
  describe('6. setOffsetMap', () => {
    it('id 为 0 → 直接 return（不写入）', () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('add', 0)
      expect(store.offsetMap).toStrictEqual({})
    })

    it("id 为 '' → 直接 return（不写入）", () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('add', '')
      expect(store.offsetMap).toStrictEqual({})
    })

    it('首次 add → offset = Default + Step', () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('add', 'song-1')
      expect(store.offsetMap['song-1']).toBe(LyricOffset.Default + LyricOffset.Step)
    })

    it('首次 sub → offset = Default - Step', () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('sub', 'song-1')
      expect(store.offsetMap['song-1']).toBe(LyricOffset.Default - LyricOffset.Step)
    })

    it('首次 restart → offset = Default（0）', () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('restart', 'song-1')
      expect(store.offsetMap['song-1']).toBe(LyricOffset.Default)
    })

    it('已存在 offset → add 在原值基础上累加', () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('add', 'song-1')
      store.setOffsetMap('add', 'song-1')
      store.setOffsetMap('add', 'song-1')
      expect(store.offsetMap['song-1']).toBe(LyricOffset.Default + LyricOffset.Step * 3)
    })

    it('已存在 offset → sub 在原值基础上累减', () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('add', 'song-1')
      store.setOffsetMap('sub', 'song-1')
      expect(store.offsetMap['song-1']).toBe(LyricOffset.Default)
    })

    it('已存在 offset → restart 重置为 Default', () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('add', 'song-1')
      store.setOffsetMap('add', 'song-1')
      store.setOffsetMap('restart', 'song-1')
      expect(store.offsetMap['song-1']).toBe(LyricOffset.Default)
    })

    it('不同 id 互不干扰', () => {
      const store = useDesktopLyricStore()
      store.setOffsetMap('add', 'song-1')
      store.setOffsetMap('sub', 'song-2')
      expect(store.offsetMap['song-1']).toBe(LyricOffset.Default + LyricOffset.Step)
      expect(store.offsetMap['song-2']).toBe(LyricOffset.Default - LyricOffset.Step)
    })

    it('负偏移也允许（无下限拦截）', () => {
      const store = useDesktopLyricStore()
      for (let i = 0; i < 10; i++) store.setOffsetMap('sub', 'song-1')
      // 浮点累减存在精度误差，使用 toBeCloseTo
      expect(store.offsetMap['song-1']).toBeCloseTo(LyricOffset.Default - LyricOffset.Step * 10, 10)
    })
  })

  // ==========================================================================
  // 7. 持久化配置
  // ==========================================================================
  describe('7. 持久化配置', () => {
    it('源码声明 persist.key 为 "desktop-lyric-store"', () => {
      // 通过源码文本断言，避免依赖 pinia-plugin-persistedstate 运行时反射
      expect(storeSource).toMatch(/key:\s*['"]desktop-lyric-store['"]/)
    })

    it('源码声明 persist.pick 包含全部 6 个字段（按顺序）', () => {
      expect(storeSource).toMatch(
        /pick:\s*\[\s*['"]fontSize['"]\s*,\s*['"]fontFamily['"]\s*,\s*['"]textBaseColor['"]\s*,\s*['"]textAccentColor['"]\s*,\s*['"]transMode['"]\s*,\s*['"]offsetMap['"]\s*\]/
      )
    })

    it('store 暴露所有 pick 字段对应的 state', () => {
      const store = useDesktopLyricStore()
      // pick 中声明的字段必须能在 store 上访问到
      expect(store).toHaveProperty('fontSize')
      expect(store).toHaveProperty('fontFamily')
      expect(store).toHaveProperty('textBaseColor')
      expect(store).toHaveProperty('textAccentColor')
      expect(store).toHaveProperty('transMode')
      expect(store).toHaveProperty('offsetMap')
    })

    it('store 暴露全部 5 个 setter', () => {
      const store = useDesktopLyricStore()
      expect(typeof store.setFontFamily).toBe('function')
      expect(typeof store.setFontSize).toBe('function')
      expect(typeof store.setTextColors).toBe('function')
      expect(typeof store.setTransMode).toBe('function')
      expect(typeof store.setOffsetMap).toBe('function')
    })
  })

  // ==========================================================================
  // 8. store id 与约束
  // ==========================================================================
  describe('8. store id 与约束', () => {
    it('store id 为 "desktop-lyric"', () => {
      const store = useDesktopLyricStore()
      expect(store.$id).toBe('desktop-lyric')
    })
  })
})
