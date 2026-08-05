// 纯函数测试无 Tauri 依赖，但 tools.ts 顶部 import 了 @tauri-apps/*，需在 import 被测函数前 mock 掉避免解析失败
import { cn, formatDuration, formatFileSize, isEnglishText } from '@/utils/tools'
import { vi } from 'vitest'
import { describe, expect, it } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setTitle: vi.fn() }) }))

// ============================================================================
// cn — class 合并（clsx + tailwind-merge）
// ============================================================================
describe('utils/tools cn()', () => {
  it('空输入 / 全 falsy 输入返回空字符串', () => {
    expect(cn()).toBe('')
    expect(cn(null)).toBe('')
    expect(cn(false, undefined, null, 0, NaN, '')).toBe('')
  })

  it('单个字符串原样返回', () => {
    expect(cn('flex')).toBe('flex')
    expect(cn('w-full h-10')).toBe('w-full h-10')
  })

  it('条件 class 中条件为 false 的项被过滤，条件为 true 的保留', () => {
    expect(cn('base', true && 'active', false && 'hidden')).toBe('base active')
    expect(cn([true && 'a', false && 'b'], 'c')).toBe('a c')
  })

  it('嵌套数组会被展开并拼接', () => {
    expect(cn(['a', ['b', ['c', 'd'], 'e']])).toBe('a b c d e')
  })

  it('Tailwind 冲突类被 tailwind-merge 去重（px-2 px-4 → 只保留后者）', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('class 对象写法: { active: true, disabled: false } 过滤 false 保留 true', () => {
    // clsx 按参数从左到右拼接：先处理对象 → active，再处理字符串 → base → 结果为 'active base'
    expect(cn({ active: true, disabled: false }, 'base')).toBe('active base')
    // 相反顺序验证
    expect(cn('base', { active: true, disabled: false })).toBe('base active')
  })
})

// ============================================================================
// isEnglishText — 英文判断
// ============================================================================
describe('utils/tools isEnglishText()', () => {
  it('纯英文字母 + 空格 → true', () => {
    expect(isEnglishText('Hello')).toBe(true)
    expect(isEnglishText('Hello World')).toBe(true)
  })

  it('允许的标点符号组合 → true', () => {
    // 允许: -_ ' , . ! ? ; : ( ) " [ ]
    expect(isEnglishText("Don't stop - just do_it. ")).toBe(true)
    expect(isEnglishText("Hello, World! How are you? (I'm fine.)")).toBe(true)
    expect(isEnglishText('"Quoted"; [brackets]: yes.')).toBe(true)
  })

  it('首尾空白字符修剪后再判断', () => {
    expect(isEnglishText('   Hello   ')).toBe(true)
  })

  it('空字符串 / 纯空白 → false', () => {
    expect(isEnglishText('')).toBe(false)
    expect(isEnglishText('     ')).toBe(false)
  })

  it('包含中文字符 → false', () => {
    expect(isEnglishText('Hello 你好')).toBe(false)
    expect(isEnglishText('测试')).toBe(false)
  })

  it('包含数字 / 非允许符号 @ $ # % & * → false', () => {
    expect(isEnglishText('Price is 5')).toBe(false)
    expect(isEnglishText('hello@world')).toBe(false)
    expect(isEnglishText('$100')).toBe(false)
    expect(isEnglishText('a #tag')).toBe(false)
    expect(isEnglishText('foo & bar')).toBe(false)
  })
})

// ============================================================================
// formatDuration — 秒 → mm:ss
// ============================================================================
describe('utils/tools formatDuration()', () => {
  it('边界值：≤0 一律返回 00:00', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(-1)).toBe('00:00')
    expect(formatDuration(-999)).toBe('00:00')
  })

  it('秒数不足 1 分钟：补前导 0', () => {
    expect(formatDuration(1)).toBe('00:01')
    expect(formatDuration(59)).toBe('00:59')
  })

  it('整点分钟', () => {
    expect(formatDuration(60)).toBe('01:00')
    expect(formatDuration(120)).toBe('02:00')
    expect(formatDuration(600)).toBe('10:00')
  })

  it('分钟与秒都有', () => {
    expect(formatDuration(119)).toBe('01:59')
    expect(formatDuration(3661)).toBe('61:01') // 61 分 1 秒，不限制小时位
  })

  it('浮点输入向下取整', () => {
    // 59.999 秒 → 00:59
    expect(formatDuration(59.999)).toBe('00:59')
    // 60.999 秒 → 01:00
    expect(formatDuration(60.999)).toBe('01:00')
  })
})

// ============================================================================
// formatFileSize — 字节 → 带单位格式化
// SizeUnits = ['B','KB','MB','GB','TB','PB','EB','ZB','YB'] (index 0..8)
// ============================================================================
describe('utils/tools formatFileSize()', () => {
  it('非法 / 零输入 → 0 B', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(-1)).toBe('0 B')
    expect(formatFileSize(NaN)).toBe('0 B')
    expect(formatFileSize(Infinity)).toBe('0 B')
  })

  it('字节阶段 (0 < bytes < 1024 → B', () => {
    expect(formatFileSize(1)).toBe('1.00 B')
    expect(formatFileSize(1023)).toBe('1023.00 B')
  })

  it('单位进位准确：1024 = 1.00 KB', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB')
  })

  it('KB → MB → GB → TB → PB 每阶 1024 递增', () => {
    const KiB = 1024
    expect(formatFileSize(KiB * KiB)).toBe('1.00 MB')
    expect(formatFileSize(KiB * KiB * KiB)).toBe('1.00 GB')
    expect(formatFileSize(Math.pow(KiB, 4))).toBe('1.00 TB')
    expect(formatFileSize(Math.pow(KiB, 5))).toBe('1.00 PB')
    expect(formatFileSize(Math.pow(KiB, 6))).toBe('1.00 EB')
    expect(formatFileSize(Math.pow(KiB, 8))).toBe('1.00 YB') // 最大单位 YB
  })

  it('小数倍数的正确显示', () => {
    // 1.5 MiB
    expect(formatFileSize(Math.floor(1.5 * 1024 * 1024))).toBe('1.50 MB')
    // 2.25 KB
    expect(formatFileSize(Math.floor(2.25 * 1024))).toBe('2.25 KB')
  })

  it('超过 YB 时不再进位，保持在最大单位 YB', () => {
    const YB = Math.pow(1024, 8)
    expect(formatFileSize(YB * 9999)).toBe('9999.00 YB')
  })

  describe('decimals 参数：小数位', () => {
    it('默认 2 位', () => {
      expect(formatFileSize(1536)).toBe('1.50 KB')
    })

    it('显式 decimals = 0 取整', () => {
      expect(formatFileSize(1536, 0)).toBe('2 KB')
    })

    it('显式 decimals = 3 保留 3 位', () => {
      expect(formatFileSize(1024 + 1, 3)).toBe('1.001 KB')
    })

    it('decimals = 负数 clamp 到 0', () => {
      expect(formatFileSize(1536, -5)).toBe('2 KB')
    })
  })
})
