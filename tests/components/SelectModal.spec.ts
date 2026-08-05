import SelectModal from '@/components/SelectModal.vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

// ============================================================================
// 夹具
// ============================================================================
const mkOption = (
  value: string | number,
  label: string,
  extra: Partial<SelectOption> = {}
): SelectOption => ({
  label,
  value,
  ...extra
})

const mkOptions = (count: number): SelectOption[] =>
  Array.from({ length: count }, (_, i) => mkOption(`v${i}`, `选项 ${i + 1}`))

describe('components/SelectModal — 下拉选择组件（M6 P1）', () => {
  // ==========================================================================
  // 1. 渲染与可见性
  // ==========================================================================
  describe('1. 渲染与可见性', () => {
    it('visible=false → 不渲染 ul', () => {
      const wrapper = mount(SelectModal, {
        props: { visible: false, options: mkOptions(3) }
      })
      expect(wrapper.find('ul').exists()).toBe(false)
    })

    it('visible=true → 渲染 ul + 所有 li', () => {
      const wrapper = mount(SelectModal, {
        props: { visible: true, options: mkOptions(3) }
      })
      expect(wrapper.find('ul').exists()).toBe(true)
      expect(wrapper.findAll('li')).toHaveLength(3)
    })

    it('默认 transition="zoom-fade"', () => {
      const wrapper = mount(SelectModal, {
        props: { visible: true, options: [] }
      })
      // Transition 组件的 name 通过 attribute 透传
      expect(wrapper.html()).toContain('zoom-fade')
    })

    it('自定义 transition="zoom-top"', () => {
      const wrapper = mount(SelectModal, {
        props: { visible: true, options: [], transition: 'zoom-top' }
      })
      expect(wrapper.html()).toContain('zoom-top')
    })
  })

  // ==========================================================================
  // 2. 选项渲染
  // ==========================================================================
  describe('2. 选项渲染', () => {
    it('每个 li 渲染对应 label 文本', () => {
      const options = [mkOption('a', '选项 A'), mkOption('b', '选项 B'), mkOption('c', '选项 C')]
      const wrapper = mount(SelectModal, {
        props: { visible: true, options }
      })
      const lis = wrapper.findAll('li')
      expect(lis[0].text()).toContain('选项 A')
      expect(lis[1].text()).toContain('选项 B')
      expect(lis[2].text()).toContain('选项 C')
    })

    it('options=[] → 显示"暂无数据"', () => {
      const wrapper = mount(SelectModal, {
        props: { visible: true, options: [] }
      })
      expect(wrapper.text()).toContain('暂无数据')
    })

    it('options=[] → 不渲染 li', () => {
      const wrapper = mount(SelectModal, {
        props: { visible: true, options: [] }
      })
      expect(wrapper.findAll('li')).toHaveLength(0)
    })

    it('disabled=true → li data-disabled="true"', () => {
      const options = [mkOption('a', '禁用项', { disabled: true })]
      const wrapper = mount(SelectModal, {
        props: { visible: true, options }
      })
      expect(wrapper.find('li').attributes('data-disabled')).toBe('true')
    })

    it('当前选中项 → li 含 card-actived class', () => {
      const options = mkOptions(3)
      const selection = options[1]
      const wrapper = mount(SelectModal, {
        props: { visible: true, options, selection }
      })
      const lis = wrapper.findAll('li')
      expect(lis[1].classes()).toContain('card-actived')
      expect(lis[0].classes()).not.toContain('card-actived')
    })

    it('无 selection → 所有 li 都是 card-hover', () => {
      const options = mkOptions(2)
      const wrapper = mount(SelectModal, {
        props: { visible: true, options }
      })
      const lis = wrapper.findAll('li')
      lis.forEach((li) => {
        expect(li.classes()).toContain('card-hover')
        expect(li.classes()).not.toContain('card-actived')
      })
    })
  })

  // ==========================================================================
  // 3. select 事件
  // ==========================================================================
  describe('3. select 事件', () => {
    it('点击 li → emit select(value, option)', async () => {
      const options = [mkOption('a', '选项 A'), mkOption('b', '选项 B')]
      const wrapper = mount(SelectModal, {
        props: { visible: true, options }
      })
      await wrapper.findAll('li')[1].trigger('click')

      const events = wrapper.emitted('select')
      expect(events).toBeTruthy()
      expect(events![0][0]).toBe('b') // value
      expect(events![0][1]).toEqual(options[1]) // option 对象
    })

    it('点击不同 li → emit 不同 value', async () => {
      const options = mkOptions(3)
      const wrapper = mount(SelectModal, {
        props: { visible: true, options }
      })
      await wrapper.findAll('li')[0].trigger('click')
      await wrapper.findAll('li')[2].trigger('click')

      const events = wrapper.emitted('select')
      expect(events![0][0]).toBe('v0')
      expect(events![1][0]).toBe('v2')
    })

    it('disabled li 也能 emit（组件未阻止点击）', async () => {
      const options = [mkOption('a', '禁用项', { disabled: true })]
      const wrapper = mount(SelectModal, {
        props: { visible: true, options }
      })
      await wrapper.find('li').trigger('click')
      // 组件未阻止 disabled 的点击，仍会 emit
      expect(wrapper.emitted('select')).toBeTruthy()
    })
  })

  // ==========================================================================
  // 4. 数值类型 value
  // ==========================================================================
  describe('4. 数值类型 value', () => {
    it('value 为 number 类型 → 正常 emit', async () => {
      const options = [mkOption(1, '一'), mkOption(2, '二')]
      const wrapper = mount(SelectModal, {
        props: { visible: true, options }
      })
      await wrapper.findAll('li')[1].trigger('click')
      expect(wrapper.emitted('select')![0][0]).toBe(2)
    })
  })
})
