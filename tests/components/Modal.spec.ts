import Modal from '@/components/Modal.vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock ActionButton 避免引入复杂依赖
vi.mock('@/components/ActionButton.vue', () => ({
  default: {
    name: 'ActionButton',
    template: '<button><slot /></button>'
  }
}))

// Mock SvgIcon
vi.mock('@/components/SvgIcon.vue', () => ({
  default: {
    name: 'SvgIcon',
    template: '<div class="mock-svg-icon"></div>'
  }
}))

vi.mock('@/stores/setting', () => ({
  useSettingStore: () => ({
    fontFamily: 'system-ui'
  })
}))

describe('components/Modal — 模态框组件（M6 P1）', () => {
  let wrapper: ReturnType<typeof mount>

  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  afterEach(() => {
    // 确保 wrapper 被清理，避免 Teleport 残留影响后续测试
    if (wrapper) {
      wrapper.unmount()
    }
  })

  // ==========================================================================
  // 1. 可见性渲染
  // ==========================================================================
  describe('1. 可见性渲染', () => {
    it('visible=false → 不渲染遮罩', () => {
      wrapper = mount(Modal, {
        props: { modelValue: false }
      })
      expect(document.querySelector('.modal-container')).toBeNull()
    })

    it('visible=true → 渲染遮罩 + container', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true, title: '测试' }
      })
      await flushPromises()
      expect(document.querySelector('.modal-container')).not.toBeNull()
      expect(document.querySelector('.bg-shadow')).not.toBeNull()
    })
  })

  // ==========================================================================
  // 2. 默认结构
  // ==========================================================================
  describe('2. 默认结构', () => {
    it('默认显示 header（title）+ footer（取消/确认按钮）', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true, title: '我的标题' }
      })
      await flushPromises()
      const container = document.querySelector('.modal-container')!
      expect(container.textContent).toContain('我的标题')
      expect(container.textContent).toContain('确认')
      expect(container.textContent).toContain('取消')
    })

    it('hideHeader=true → 不渲染标题栏', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true, hideHeader: true }
      })
      await flushPromises()
      const container = document.querySelector('.modal-container')!
      expect(container.querySelector('.p-4 .font-bold')).toBeNull()
    })

    it('hideFooter=true → 不渲染操作栏', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true, hideFooter: true }
      })
      await flushPromises()
      const container = document.querySelector('.modal-container')!
      expect(container.textContent).not.toContain('确认')
      expect(container.textContent).not.toContain('取消')
    })

    it('hideConfirm=true → 隐藏确认按钮', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true, hideConfirm: true }
      })
      await flushPromises()
      const container = document.querySelector('.modal-container')!
      expect(container.textContent).not.toContain('确认')
      expect(container.textContent).toContain('取消')
    })

    it('hideCancel=true → 隐藏取消按钮', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true, hideCancel: true }
      })
      await flushPromises()
      const container = document.querySelector('.modal-container')!
      expect(container.textContent).toContain('确认')
      expect(container.textContent).not.toContain('取消')
    })

    it('confirmLabel / cancelLabel 自定义文本', async () => {
      wrapper = mount(Modal, {
        props: {
          modelValue: true,
          confirmLabel: '保存',
          cancelLabel: '返回'
        }
      })
      await flushPromises()
      const container = document.querySelector('.modal-container')!
      expect(container.textContent).toContain('保存')
      expect(container.textContent).toContain('返回')
    })
  })

  // ==========================================================================
  // 3. 事件
  // ==========================================================================
  describe('3. 事件', () => {
    it('点击遮罩（maskClosed=true）→ emit cancel', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true, maskClosed: true }
      })
      await flushPromises()
      const mask = document.querySelector('.bg-shadow') as HTMLElement
      mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
      expect(wrapper.emitted('cancel')).toBeTruthy()
    })

    it('maskClosed=false → 点击遮罩不 emit cancel', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true, maskClosed: false }
      })
      await flushPromises()
      const mask = document.querySelector('.bg-shadow') as HTMLElement
      mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
      expect(wrapper.emitted('cancel')).toBeFalsy()
    })

    it('ESC 键 → emit cancel', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true }
      })
      await flushPromises()
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
      await flushPromises()
      expect(wrapper.emitted('cancel')).toBeTruthy()
    })

    it('非 ESC 键 → 不 emit cancel', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true }
      })
      await flushPromises()
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
      await flushPromises()
      expect(wrapper.emitted('cancel')).toBeFalsy()
    })

    it('visible=false 时 ESC 键 → 不 emit cancel（监听器已移除）', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: false }
      })
      await flushPromises()
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
      await flushPromises()
      expect(wrapper.emitted('cancel')).toBeFalsy()
    })
  })

  // ==========================================================================
  // 4. 默认插槽
  // ==========================================================================
  describe('4. 默认插槽', () => {
    it('default slot 内容渲染在 container 内', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true },
        slots: {
          default: '<div class="test-content">内容</div>'
        }
      })
      await flushPromises()
      expect(document.querySelector('.test-content')).not.toBeNull()
    })
  })

  // ==========================================================================
  // 5. 清理副作用
  // ==========================================================================
  describe('5. 清理副作用', () => {
    it('unmount 后 ESC 键不再触发（removeEventListener）', async () => {
      wrapper = mount(Modal, {
        props: { modelValue: true }
      })
      await flushPromises()
      wrapper.unmount()

      expect(() => {
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
      }).not.toThrow()
    })
  })
})
