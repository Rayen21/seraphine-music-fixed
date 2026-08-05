import { IconMap, type IconName } from '@/utils/icons'
import { describe, expect, it } from 'vitest'

describe('utils/icons — 图标映射稳定性（M5.2）', () => {
  // ==========================================================================
  // 1. IconMap 完整性
  // ==========================================================================
  describe('1. IconMap 完整性', () => {
    it('所有图标值都是定义（非空、非 undefined）', () => {
      const keys = Object.keys(IconMap) as IconName[]
      expect(keys.length).toBeGreaterThan(0)

      keys.forEach((key) => {
        const value = IconMap[key]
        expect(value, `图标 ${key} 的值不应为 undefined`).toBeDefined()
        expect(value, `图标 ${key} 的值不应为 null`).not.toBeNull()
      })
    })

    it('关键图标存在（验证常见图标名不被误删）', () => {
      const requiredKeys: IconName[] = [
        'Add',
        'Close',
        'Play',
        'Pause',
        'Next',
        'Previous',
        'Search',
        'Setting',
        'Download',
        'Music',
        'Heart',
        'VolumeLoud',
        'VolumeOff',
        'FullScreen',
        'Refresh',
        'Folder',
        'More'
      ]
      requiredKeys.forEach((key) => {
        expect(IconMap).toHaveProperty(key)
      })
    })

    it('图标数量在合理区间（70-100，防止误删或误增）', () => {
      const count = Object.keys(IconMap).length
      expect(count).toBeGreaterThanOrEqual(70)
      expect(count).toBeLessThanOrEqual(100)
    })
  })

  // ==========================================================================
  // 2. 命名一致性
  // ==========================================================================
  describe('2. 命名一致性', () => {
    it('所有 key 都是合法的 PascalCase 标识符', () => {
      const keys = Object.keys(IconMap)
      const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*$/
      keys.forEach((key) => {
        expect(key, `图标 key "${key}" 应为 PascalCase`).toMatch(pascalCaseRegex)
      })
    })

    it('Bold / Linear 后缀图标成对出现', () => {
      // Play 和 PlayBold
      expect(IconMap.Play).toBeDefined()
      expect(IconMap.PlayBold).toBeDefined()
      // Pause 和 PauseBold
      expect(IconMap.Pause).toBeDefined()
      expect(IconMap.PauseBold).toBeDefined()
      // Next 和 NextBold
      expect(IconMap.Next).toBeDefined()
      expect(IconMap.NextBold).toBeDefined()
      // Previous 和 PreviousBold
      expect(IconMap.Previous).toBeDefined()
      expect(IconMap.PreviousBold).toBeDefined()
      // Heart 和 HeartBold
      expect(IconMap.Heart).toBeDefined()
      expect(IconMap.HeartBold).toBeDefined()
      // Unread 和 UnreadBold
      expect(IconMap.Unread).toBeDefined()
      expect(IconMap.UnreadBold).toBeDefined()
    })

    it('音量三档齐全（VolumeOff / VolumeSmall / VolumeLoud）', () => {
      expect(IconMap.VolumeOff).toBeDefined()
      expect(IconMap.VolumeSmall).toBeDefined()
      expect(IconMap.VolumeLoud).toBeDefined()
    })

    it('对齐方式三档齐全（AlignLeft / AlignRight / AlignCenter）', () => {
      expect(IconMap.AlignLeft).toBeDefined()
      expect(IconMap.AlignRight).toBeDefined()
      expect(IconMap.AlignCenter).toBeDefined()
    })

    it('方向四档齐全（Up / Down / Left / Right）', () => {
      expect(IconMap.Up).toBeDefined()
      expect(IconMap.Down).toBeDefined()
      expect(IconMap.Left).toBeDefined()
      expect(IconMap.Right).toBeDefined()
    })

    it('播放模式四档齐全（OrderPlay / RepeatAll / SinglePlay / RandomPlay）', () => {
      expect(IconMap.OrderPlay).toBeDefined()
      expect(IconMap.RepeatAll).toBeDefined()
      expect(IconMap.SinglePlay).toBeDefined()
      expect(IconMap.RandomPlay).toBeDefined()
    })

    it('眼睛开合成对（Eye / EyeClosed）', () => {
      expect(IconMap.Eye).toBeDefined()
      expect(IconMap.EyeClosed).toBeDefined()
    })

    it('全屏切换成对（FullScreen / QuitFullScreen）', () => {
      expect(IconMap.FullScreen).toBeDefined()
      expect(IconMap.QuitFullScreen).toBeDefined()
    })

    it('排序三档齐全（Sort / SortUp / SortDown）', () => {
      expect(IconMap.Sort).toBeDefined()
      expect(IconMap.SortUp).toBeDefined()
      expect(IconMap.SortDown).toBeDefined()
    })

    it('快进快退成对（ForwardLeft / ForwardRight）', () => {
      expect(IconMap.ForwardLeft).toBeDefined()
      expect(IconMap.ForwardRight).toBeDefined()
    })
  })

  // ==========================================================================
  // 3. 类型导出稳定性
  // ==========================================================================
  describe('3. IconName 类型', () => {
    it('IconName 包含 IconMap 的所有 key', () => {
      const keys = Object.keys(IconMap) as IconName[]
      // 抽样验证几个 key 能被 IconName 接受
      const sample: IconName = 'Play'
      expect(keys).toContain(sample)
    })

    it('IconName 是 string 子类型（用于动态查找）', () => {
      const name: IconName = 'Add'
      expect(typeof name).toBe('string')
      expect(IconMap[name]).toBeDefined()
    })
  })

  // ==========================================================================
  // 4. 动态访问安全性
  // ==========================================================================
  describe('4. 动态访问', () => {
    it('通过字符串 key 访问 IconMap 返回有效图标', () => {
      const dynamicKey: string = 'Play'
      const icon = (IconMap as Record<string, unknown>)[dynamicKey]
      expect(icon).toBeDefined()
    })

    it('访问不存在的 key 返回 undefined（不抛错）', () => {
      const icon = (IconMap as Record<string, unknown>)['NonExistentIcon']
      expect(icon).toBeUndefined()
    })
  })
})
