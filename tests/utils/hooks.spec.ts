import { useObserver } from '@/utils/hooks'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

// ============================================================================
// Mock IntersectionObserver（必须用 vi.hoisted 在模块加载前注入，
// 因为 hooks.ts 的 observerManager 单例在 import 时就 new IntersectionObserver()）
// ============================================================================
const MockIntersectionObserver = vi.hoisted(() => {
  class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = []
    static observeCalls: Element[] = []
    static unobserveCalls: Element[] = []
    static disconnectCalls = 0

    callback: (entries: any[], observer: any) => void
    constructor(cb: (entries: any[], observer: any) => void) {
      this.callback = cb
      MockIntersectionObserver.instances.push(this)
    }
    observe(target: Element) {
      MockIntersectionObserver.observeCalls.push(target)
    }
    unobserve(target: Element) {
      MockIntersectionObserver.unobserveCalls.push(target)
    }
    disconnect() {
      MockIntersectionObserver.disconnectCalls++
    }

    /** 测试辅助：模拟目标进入视口，触发回调 */
    static trigger(target: Element, isIntersecting: boolean) {
      const instance = MockIntersectionObserver.instances[0]
      if (!instance) return
      const entry = {
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0
      } as any
      instance.callback([entry], instance as any)
    }
  }
  // 在模块加载前注入到全局
  ;(globalThis as any).IntersectionObserver = MockIntersectionObserver
  return MockIntersectionObserver
})

// ============================================================================
describe('utils/hooks — useObserver / useListContext（M5.1）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 注意：不清空 instances（ObserverManager 是模块级单例，其 observer 引用
    // 指向第一次创建的 MockIntersectionObserver 实例，清空会导致 trigger 找不到）
    MockIntersectionObserver.observeCalls.length = 0
    MockIntersectionObserver.unobserveCalls.length = 0
    MockIntersectionObserver.disconnectCalls = 0
  })

  // ==========================================================================
  // 1. useObserver：observe / unobserve / disconnect
  // ==========================================================================
  describe('1. useObserver：observe / unobserve / disconnect', () => {
    it('mount 后自动 observe 元素 + 回调可触发', async () => {
      const onVisible = vi.fn()
      const elRef = shallowRef<HTMLDivElement | null>(null)
      const TestComp = defineComponent({
        setup() {
          useObserver(elRef, onVisible)
          return () => h('div', { ref: elRef })
        }
      })

      const wrapper = mount(TestComp)
      await nextTick()
      await nextTick()

      expect(MockIntersectionObserver.observeCalls.length).toBeGreaterThanOrEqual(1)
      const observedTarget = MockIntersectionObserver.observeCalls[0]

      MockIntersectionObserver.trigger(observedTarget, true)
      expect(onVisible).toHaveBeenCalledTimes(1)
      const [entry, observer] = onVisible.mock.calls[0]
      expect(entry.target).toBe(observedTarget)
      expect(entry.isIntersecting).toBe(true)
      expect(observer).toBeDefined()

      wrapper.unmount()
    })

    it('回调参数 isIntersecting=false 时正常传递', async () => {
      const onVisible = vi.fn()
      const elRef = shallowRef<HTMLDivElement | null>(null)
      const TestComp = defineComponent({
        setup() {
          useObserver(elRef, onVisible)
          return () => h('div', { ref: elRef })
        }
      })

      const wrapper = mount(TestComp)
      await nextTick()
      await nextTick()

      const target = MockIntersectionObserver.observeCalls[0]
      MockIntersectionObserver.trigger(target, false)
      expect(onVisible).toHaveBeenCalledTimes(1)
      expect(onVisible.mock.calls[0][0].isIntersecting).toBe(false)

      wrapper.unmount()
    })

    it('elementRef.value 为 null 时不 observe', async () => {
      const onVisible = vi.fn()
      const elRef = shallowRef<HTMLDivElement | null>(null)
      const TestComp = defineComponent({
        setup() {
          useObserver(elRef, onVisible)
          // 不绑定 ref，elRef.value 保持 null
          return () => h('div')
        }
      })

      const wrapper = mount(TestComp)
      await nextTick()
      await nextTick()

      expect(MockIntersectionObserver.observeCalls).toHaveLength(0)
      wrapper.unmount()
    })

    it('返回 unobserve 函数，手动调用可取消观察', async () => {
      const onVisible = vi.fn()
      const elRef = shallowRef<HTMLDivElement | null>(null)
      let unobserveFn: (() => void) | undefined
      const TestComp = defineComponent({
        setup() {
          const { unobserve } = useObserver(elRef, onVisible)
          unobserveFn = unobserve
          return () => h('div', { ref: elRef })
        }
      })

      const wrapper = mount(TestComp)
      await nextTick()
      await nextTick()

      const target = MockIntersectionObserver.observeCalls[0]
      unobserveFn!()

      expect(MockIntersectionObserver.unobserveCalls).toContain(target)
      wrapper.unmount()
    })

    it('手动 unobserve 后 trigger 不再触发回调', async () => {
      const onVisible = vi.fn()
      const elRef = shallowRef<HTMLDivElement | null>(null)
      let unobserveFn: (() => void) | undefined
      const TestComp = defineComponent({
        setup() {
          const { unobserve } = useObserver(elRef, onVisible)
          unobserveFn = unobserve
          return () => h('div', { ref: elRef })
        }
      })

      const wrapper = mount(TestComp)
      await nextTick()
      await nextTick()

      const target = MockIntersectionObserver.observeCalls[0]
      unobserveFn!()

      // unobserve 后 callbackMap 已删除该 target 的 cb
      MockIntersectionObserver.trigger(target, true)
      expect(onVisible).not.toHaveBeenCalled()

      wrapper.unmount()
    })
  })
})
