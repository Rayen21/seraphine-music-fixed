import ProgressRange from '@/components/ProgressRange.vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

describe('components/ProgressRange — 进度条组件（M6 P0）', () => {
  // ==========================================================================
  // 1. 渲染与默认值
  // ==========================================================================
  describe('1. 渲染与默认值', () => {
    it('默认渲染：horizontal 方向 + always 显示模式', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50 }
      })
      const root = wrapper.find('div[data-disabled]')
      expect(root.exists()).toBe(true)
      // input range 存在
      const input = wrapper.find('input[type="range"]')
      expect(input.exists()).toBe(true)
      expect(input.attributes('max')).toBe('100')
      expect(input.attributes('step')).toBe('1')
      expect(input.attributes('min')).toBe('0')
    })

    it('disabled=true → data-disabled="true"', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 0, disabled: true }
      })
      expect(wrapper.find('div[data-disabled]').attributes('data-disabled')).toBe('true')
    })

    it('disabled=false → data-disabled="false"', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 0, disabled: false }
      })
      expect(wrapper.find('div[data-disabled]').attributes('data-disabled')).toBe('false')
    })

    it('direction=vertical → 根元素 h-full class', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50, direction: 'vertical' }
      })
      expect(wrapper.classes()).toContain('h-full')
    })

    it('direction=horizontal → 根元素 w-full class', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50, direction: 'horizontal' }
      })
      expect(wrapper.classes()).toContain('w-full')
    })

    it('showMode=hover → input 含 opacity-0 class', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50, showMode: 'hover' }
      })
      const input = wrapper.find('input[type="range"]')
      expect(input.classes()).toContain('opacity-0')
      expect(input.classes()).toContain('group-hover:opacity-100')
    })

    it('showMode=always → input 不含 opacity-0 class', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50, showMode: 'always' }
      })
      const input = wrapper.find('input[type="range"]')
      expect(input.classes()).not.toContain('opacity-0')
    })

    it('自定义 max 和 step → 透传到 input', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 5, max: 10, step: 0.5 }
      })
      const input = wrapper.find('input[type="range"]')
      expect(input.attributes('max')).toBe('10')
      expect(input.attributes('step')).toBe('0.5')
    })
  })

  // ==========================================================================
  // 2. ratio / loadingRatio 计算
  // ==========================================================================
  describe('2. ratio / loadingRatio 计算', () => {
    it('ratio = progress / max * 100（50/100 → 50%）', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50, max: 100 }
      })
      const bars = wrapper.findAll('.absolute')
      // 第三个 .absolute 是当前进度条
      const currentBar = bars[2]
      expect(currentBar.attributes('style')).toContain('--size: 50%')
    })

    it('ratio 上限 100%（progress > max 时）', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 150, max: 100 }
      })
      const bars = wrapper.findAll('.absolute')
      expect(bars[2].attributes('style')).toContain('--size: 100%')
    })

    it('ratio 下限 0%（progress < 0 时）', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: -10, max: 100 }
      })
      const bars = wrapper.findAll('.absolute')
      expect(bars[2].attributes('style')).toContain('--size: 0%')
    })

    it('loadingRatio = loadingProgress * 100', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 30, loadingProgress: 0.7 }
      })
      const bars = wrapper.findAll('.absolute')
      // 第二个 .absolute 是加载进度条
      expect(bars[1].attributes('style')).toContain('--size: 70%')
    })

    it('loadingRatio 上限 100%', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 30, loadingProgress: 1.5 }
      })
      const bars = wrapper.findAll('.absolute')
      expect(bars[1].attributes('style')).toContain('--size: 100%')
    })

    it('max=200 + progress=100 → ratio=50%', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 100, max: 200 }
      })
      const bars = wrapper.findAll('.absolute')
      expect(bars[2].attributes('style')).toContain('--size: 50%')
    })
  })

  // ==========================================================================
  // 3. v-model 双向绑定
  // ==========================================================================
  describe('3. v-model 双向绑定', () => {
    it('input 值变化 → emit update:modelValue', async () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 30 }
      })
      const input = wrapper.find('input[type="range"]')
      await input.setValue(75)
      const updateEvents = wrapper.emitted('update:modelValue')
      expect(updateEvents).toBeTruthy()
      expect(updateEvents![0]).toEqual([75])
    })

    it('v-model.number 修饰符：emit number 类型', async () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 0 }
      })
      const input = wrapper.find('input[type="range"]')
      await input.setValue('42')
      const emittedValue = wrapper.emitted('update:modelValue')![0][0]
      expect(typeof emittedValue).toBe('number')
      expect(emittedValue).toBe(42)
    })
  })

  // ==========================================================================
  // 4. startChange / stopChange 事件
  // ==========================================================================
  describe('4. startChange / stopChange 事件', () => {
    it('mousedown → emit startChange(value, event)', async () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50 }
      })
      const input = wrapper.find('input[type="range"]')
      await input.trigger('mousedown')

      const events = wrapper.emitted('startChange')
      expect(events).toBeTruthy()
      expect(events![0][0]).toBe(50) // value
      expect(events![0][1]).toBeInstanceOf(MouseEvent) // event
    })

    it('mouseup → emit stopChange(value, event)', async () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50 }
      })
      const input = wrapper.find('input[type="range"]')
      await input.trigger('mouseup')

      const events = wrapper.emitted('stopChange')
      expect(events).toBeTruthy()
      expect(events![0][0]).toBe(50)
      expect(events![0][1]).toBeInstanceOf(MouseEvent)
    })

    it('修改 value 后 mousedown → startChange emit 新值', async () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 30 }
      })
      const input = wrapper.find('input[type="range"]')
      await input.setValue(80)
      await input.trigger('mousedown')

      const events = wrapper.emitted('startChange')
      expect(events![0][0]).toBe(80)
    })
  })

  // ==========================================================================
  // 5. 加载/当前进度条的层级关系
  // ==========================================================================
  describe('5. 进度条层级', () => {
    it('三个 .absolute 子元素：总进度 / 加载进度 / 当前进度', () => {
      const wrapper = mount(ProgressRange, {
        props: { modelValue: 50, loadingProgress: 0.7 }
      })
      const bars = wrapper.findAll('.absolute')
      expect(bars).toHaveLength(3)
      // 总进度条（无 --size style，使用 w-full / h-full）
      const bar0Style = bars[0].attributes('style') || ''
      expect(bar0Style).not.toContain('--size')
      // 加载进度条
      expect(bars[1].attributes('style')).toContain('--size: 70%')
      // 当前进度条
      expect(bars[2].attributes('style')).toContain('--size: 50%')
    })
  })
})
