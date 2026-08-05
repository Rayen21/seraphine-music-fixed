import SvgIcon from '@/components/SvgIcon.vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

// unplugin-icons 在测试环境中通过 vite alias 解析，
// 这里直接用真实 IconMap 渲染，验证 component :is 渲染逻辑

describe('components/SvgIcon — 图标组件（M6 P2）', () => {
  // ==========================================================================
  // 1. 渲染基础
  // ==========================================================================
  describe('1. 渲染基础', () => {
    it('默认 size=16：渲染为 16x16', () => {
      const wrapper = mount(SvgIcon, {
        props: { name: 'Play' }
      })
      const svg = wrapper.find('svg')
      expect(svg.exists()).toBe(true)
      expect(svg.attributes('height')).toBe('16')
      expect(svg.attributes('width')).toBe('16')
    })

    it('自定义 size=24：渲染为 24x24', () => {
      const wrapper = mount(SvgIcon, {
        props: { name: 'Pause', size: 24 }
      })
      const svg = wrapper.find('svg')
      expect(svg.attributes('height')).toBe('24')
      expect(svg.attributes('width')).toBe('24')
    })

    it('size 为字符串 "32"：也能正常渲染', () => {
      const wrapper = mount(SvgIcon, {
        props: { name: 'Next', size: '32' }
      })
      const svg = wrapper.find('svg')
      expect(svg.attributes('height')).toBe('32')
      expect(svg.attributes('width')).toBe('32')
    })

    it('disabled=true → data-disabled="true"', () => {
      const wrapper = mount(SvgIcon, {
        props: { name: 'Play', disabled: true }
      })
      expect(wrapper.attributes('data-disabled')).toBe('true')
    })

    it('disabled=false → data-disabled="false"', () => {
      const wrapper = mount(SvgIcon, {
        props: { name: 'Play', disabled: false }
      })
      expect(wrapper.attributes('data-disabled')).toBe('false')
    })

    it('根元素含 flex items-center justify-center class', () => {
      const wrapper = mount(SvgIcon, {
        props: { name: 'Play' }
      })
      expect(wrapper.classes()).toContain('flex')
      expect(wrapper.classes()).toContain('items-center')
      expect(wrapper.classes()).toContain('justify-center')
    })
  })

  // ==========================================================================
  // 2. 图标动态渲染
  // ==========================================================================
  describe('2. 图标动态渲染', () => {
    it('不同 name 渲染不同 svg 内容', () => {
      const w1 = mount(SvgIcon, { props: { name: 'Play' } })
      const w2 = mount(SvgIcon, { props: { name: 'Pause' } })

      const svg1 = w1.find('svg').html()
      const svg2 = w2.find('svg').html()
      // 不同图标应有不同 html（路径不同）
      expect(svg1).not.toBe(svg2)
    })

    it('切换 name prop → 更新渲染的图标', async () => {
      const wrapper = mount(SvgIcon, {
        props: { name: 'Play' }
      })
      const html1 = wrapper.find('svg').html()

      await wrapper.setProps({ name: 'Pause' })
      const html2 = wrapper.find('svg').html()

      expect(html1).not.toBe(html2)
    })

    it('渲染所有关键图标（不抛错）', () => {
      const keys = [
        'Add',
        'Close',
        'Play',
        'Pause',
        'Next',
        'Previous',
        'Search',
        'Setting'
      ] as const
      keys.forEach((name) => {
        expect(() => mount(SvgIcon, { props: { name } })).not.toThrow()
      })
    })
  })

  // ==========================================================================
  // 3. 点击事件
  // ==========================================================================
  describe('3. 点击事件', () => {
    it('点击根元素 → 调用 onClick 回调', async () => {
      const onClick = vi.fn()
      const wrapper = mount(SvgIcon, {
        props: { name: 'Play', onClick }
      })
      await wrapper.trigger('click')
      expect(onClick).toHaveBeenCalledTimes(1)
      expect(onClick.mock.calls[0][0]).toBeInstanceOf(MouseEvent)
    })

    it('未传 onClick → 点击不抛错', async () => {
      const wrapper = mount(SvgIcon, {
        props: { name: 'Play' }
      })
      await expect(wrapper.trigger('click')).resolves.not.toThrow()
    })
  })
})
