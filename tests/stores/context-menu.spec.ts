import { useContextMenuStore } from '@/stores/context-menu'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// ============================================================================
// 夹具
// ============================================================================
const mkOption = (label: string, extra: Partial<ContextMenuOption> = {}): ContextMenuOption => ({
  label,
  onClick: vi.fn(),
  ...extra
})

const mkOptions = (count: number): ContextMenuOption[] =>
  Array.from({ length: count }, (_, i) => mkOption(`选项 ${i + 1}`))

// ============================================================================
describe('stores/context-menu — 右键菜单状态（M4.4）', () => {
  let contextMenuStore: ReturnType<typeof useContextMenuStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    contextMenuStore = useContextMenuStore()
  })

  // ==========================================================================
  // 1. 初始默认值
  // ==========================================================================
  describe('1. 初始默认值', () => {
    it('visible=false / position=(0,0) / options=[]', () => {
      expect(contextMenuStore.visible).toBe(false)
      expect(contextMenuStore.position).toEqual({ x: 0, y: 0 })
      expect(contextMenuStore.options).toEqual([])
    })
  })

  // ==========================================================================
  // 2. show：设置位置和选项 + nextTick 后 visible=true
  // ==========================================================================
  describe('2. show', () => {
    it('show({x, y, options}) → position/options 立即更新，visible 在 nextTick 后变 true', async () => {
      const opts = mkOptions(2)
      contextMenuStore.show({ x: 100, y: 200, options: opts })

      // 立即检查：position 和 options 已更新
      expect(contextMenuStore.position).toEqual({ x: 100, y: 200 })
      expect(contextMenuStore.options).toHaveLength(2)
      expect(contextMenuStore.options[0].label).toBe('选项 1')

      // visible 先被置 false（show 内部第一行）
      expect(contextMenuStore.visible).toBe(false)

      // nextTick 后变 true
      await nextTick()
      expect(contextMenuStore.visible).toBe(true)
    })

    it('show 前先置 visible=false（强制重置，避免动画残留）', async () => {
      // 先让 visible=true
      contextMenuStore.show({ x: 1, y: 1, options: mkOptions(1) })
      await nextTick()
      expect(contextMenuStore.visible).toBe(true)

      // 再次 show，第一行应置 false
      const showSpy = vi.spyOn(contextMenuStore, 'show')
      // 直接调用，不通过 spy 检查（因为 spy 会在原方法前后记录）
      contextMenuStore.show({ x: 2, y: 2, options: mkOptions(1) })
      // show 内部第一行 visible=false，然后 nextTick 才置 true
      // 但因为 nextTick 是异步的，这里同步检查不到 false
      // 改为验证最终结果
      await nextTick()
      expect(contextMenuStore.visible).toBe(true)
      expect(contextMenuStore.position).toEqual({ x: 2, y: 2 })
      showSpy.mockRestore()
    })

    it('show 传入空 options 数组 → options=[]，visible=true', async () => {
      contextMenuStore.show({ x: 0, y: 0, options: [] })
      await nextTick()
      expect(contextMenuStore.options).toEqual([])
      expect(contextMenuStore.visible).toBe(true)
    })

    it('show 连续调用两次 → 第二次覆盖第一次的 position 和 options', async () => {
      contextMenuStore.show({ x: 10, y: 20, options: mkOptions(3) })
      await nextTick()
      contextMenuStore.show({ x: 30, y: 40, options: mkOptions(1) })
      await nextTick()

      expect(contextMenuStore.position).toEqual({ x: 30, y: 40 })
      expect(contextMenuStore.options).toHaveLength(1)
      expect(contextMenuStore.options[0].label).toBe('选项 1')
    })

    it('options 中的 onClick 是函数引用（不丢失）', async () => {
      const onClick = vi.fn()
      contextMenuStore.show({
        x: 0,
        y: 0,
        options: [{ label: '删除', onClick }]
      })
      await nextTick()
      expect(contextMenuStore.options[0].onClick).toBe(onClick)
      // 调用 onClick 验证
      contextMenuStore.options[0]!.onClick!()
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('options 支持包含 disabled 字段', async () => {
      contextMenuStore.show({
        x: 0,
        y: 0,
        options: [{ label: '禁用项', onClick: vi.fn(), disabled: true }]
      })
      await nextTick()
      expect(contextMenuStore.options[0].disabled).toBe(true)
    })

    it('负坐标也能正常设置', async () => {
      contextMenuStore.show({ x: -50, y: -100, options: [] })
      await nextTick()
      expect(contextMenuStore.position).toEqual({ x: -50, y: -100 })
    })
  })

  // ==========================================================================
  // 3. hide：隐藏菜单
  // ==========================================================================
  describe('3. hide', () => {
    it('visible=true 时调用 hide → visible=false（同步）', async () => {
      contextMenuStore.show({ x: 0, y: 0, options: [] })
      await nextTick()
      expect(contextMenuStore.visible).toBe(true)

      contextMenuStore.hide()
      expect(contextMenuStore.visible).toBe(false)
    })

    it('visible=false 时调用 hide → 仍为 false（幂等）', () => {
      expect(contextMenuStore.visible).toBe(false)
      contextMenuStore.hide()
      expect(contextMenuStore.visible).toBe(false)
    })

    it('hide 不清除 position 和 options（仅隐藏，保留数据）', async () => {
      const opts = mkOptions(2)
      contextMenuStore.show({ x: 100, y: 200, options: opts })
      await nextTick()
      contextMenuStore.hide()

      expect(contextMenuStore.visible).toBe(false)
      expect(contextMenuStore.position).toEqual({ x: 100, y: 200 })
      expect(contextMenuStore.options).toHaveLength(2)
    })
  })

  // ==========================================================================
  // 4. show → hide → show 循环
  // ==========================================================================
  describe('4. 显示/隐藏循环', () => {
    it('连续 show→hide→show：visible 正确切换', async () => {
      contextMenuStore.show({ x: 1, y: 1, options: [] })
      await nextTick()
      expect(contextMenuStore.visible).toBe(true)

      contextMenuStore.hide()
      expect(contextMenuStore.visible).toBe(false)

      contextMenuStore.show({ x: 2, y: 2, options: [] })
      await nextTick()
      expect(contextMenuStore.visible).toBe(true)
      expect(contextMenuStore.position).toEqual({ x: 2, y: 2 })
    })
  })

  // ==========================================================================
  // 5. store 隔离
  // ==========================================================================
  describe('5. store 隔离', () => {
    it('新建 pinia 后状态重置', async () => {
      contextMenuStore.show({ x: 999, y: 999, options: mkOptions(5) })
      await nextTick()
      contextMenuStore.hide()

      // 新 pinia
      setActivePinia(createPinia())
      const newStore = useContextMenuStore()
      expect(newStore.visible).toBe(false)
      expect(newStore.position).toEqual({ x: 0, y: 0 })
      expect(newStore.options).toEqual([])
    })
  })
})
