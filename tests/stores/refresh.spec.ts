import { useRefreshStore } from '@/stores/refresh'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

describe('stores/refresh — 视图刷新计数器（M4.3）', () => {
  let refreshStore: ReturnType<typeof useRefreshStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    refreshStore = useRefreshStore()
  })

  // ==========================================================================
  // 1. 初始默认值
  // ==========================================================================
  describe('1. 初始默认值', () => {
    it('key 初始为 0', () => {
      expect(refreshStore.key).toBe(0)
    })
  })

  // ==========================================================================
  // 2. refresh：自增计数器
  // ==========================================================================
  describe('2. refresh', () => {
    it('调用一次 → key=1', () => {
      refreshStore.refresh()
      expect(refreshStore.key).toBe(1)
    })

    it('连续调用 3 次 → key=3', () => {
      refreshStore.refresh()
      refreshStore.refresh()
      refreshStore.refresh()
      expect(refreshStore.key).toBe(3)
    })

    it('多次调用后 key 持续递增（不重置）', () => {
      for (let i = 0; i < 10; i++) {
        refreshStore.refresh()
      }
      expect(refreshStore.key).toBe(10)
    })
  })

  // ==========================================================================
  // 3. store 隔离：不同 pinia 实例互不影响
  // ==========================================================================
  describe('3. store 隔离', () => {
    it('新建 pinia 后 key 重新从 0 开始', () => {
      refreshStore.refresh()
      refreshStore.refresh()
      expect(refreshStore.key).toBe(2)

      // 新建 pinia 实例
      setActivePinia(createPinia())
      const newStore = useRefreshStore()
      expect(newStore.key).toBe(0)
    })
  })
})
