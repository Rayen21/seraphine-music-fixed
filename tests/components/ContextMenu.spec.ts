import ContextMenu from '@/components/ContextMenu.vue'
import { useContextMenuStore } from '@/stores/context-menu'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// Mock SvgIcon（避免引入 unplugin-icons）
vi.mock('@/components/SvgIcon.vue', () => ({
  default: {
    name: 'SvgIcon',
    props: ['name', 'size', 'disabled'],
    template: '<div class="mock-svg-icon" :data-name="name"></div>'
  }
}))

// Mock @vueuse/components 的 vOnClick 指令
vi.mock('@vueuse/components', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    vOnClickOutside: {
      mounted() {},
      unmounted() {}
    }
  }
})

// Mock @vueuse/core 的 useWindowSize（useEventListener 用真实实现）
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    useWindowSize: () => ({
      width: { value: 1920 },
      height: { value: 1080 }
    })
  }
})

vi.mock('@/stores/setting', () => ({
  useSettingStore: () => ({
    fontFamily: 'system-ui'
  })
}))

// ============================================================================
// 夹具
// ============================================================================
const mkOption = (label: string, extra: Partial<ContextMenuOption> = {}): ContextMenuOption => ({
  label,
  ...extra
})

describe('components/ContextMenu — 右键菜单组件（M6 P0）', () => {
  let contextMenuStore: ReturnType<typeof useContextMenuStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    // 清理 Teleport 到 body 的残留 DOM（前一个测试 unmount 后可能残留）
    document.body.innerHTML = ''
    contextMenuStore = useContextMenuStore()
  })

  // ==========================================================================
  // 1. 可见性
  // ==========================================================================
  describe('1. 可见性', () => {
    it('visible=false → 不渲染 ul', () => {
      mount(ContextMenu)
      expect(document.querySelector('ul.fixed')).toBeNull()
    })

    it('visible=true → 渲染 ul', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [mkOption('选项 1', { onClick: vi.fn() })]
      })
      await flushPromises()
      expect(document.querySelector('ul.fixed')).not.toBeNull()
      wrapper.unmount()
    })
  })

  // ==========================================================================
  // 2. 选项渲染
  // ==========================================================================
  describe('2. 选项渲染', () => {
    it('渲染所有非 divider 选项的 label', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [
          mkOption('选项 A', { onClick: vi.fn() }),
          mkOption('选项 B', { onClick: vi.fn() }),
          mkOption('选项 C', { onClick: vi.fn() })
        ]
      })
      await flushPromises()

      const text = document.querySelector('ul.fixed')!.textContent
      expect(text).toContain('选项 A')
      expect(text).toContain('选项 B')
      expect(text).toContain('选项 C')

      wrapper.unmount()
    })

    it('divider=true → 渲染为分割线 li（不含 label）', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [
          mkOption('选项 A', { onClick: vi.fn() }),
          { divider: true },
          mkOption('选项 B', { onClick: vi.fn() })
        ]
      })
      await flushPromises()

      const lis = document.querySelectorAll('ul.fixed > li')
      // 第二个 li 是分割线
      expect(lis[1].querySelector('.h-px')).not.toBeNull()
      expect(lis[1].textContent).not.toContain('选项')

      wrapper.unmount()
    })

    it('disabled=true → li data-disabled="true"', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [mkOption('禁用项', { disabled: true, onClick: vi.fn() })]
      })
      await flushPromises()

      const li = document.querySelector('ul.fixed > li') as HTMLElement
      expect(li.getAttribute('data-disabled')).toBe('true')

      wrapper.unmount()
    })
  })

  // ==========================================================================
  // 3. 点击行为
  // ==========================================================================
  describe('3. 点击行为', () => {
    it('点击选项 → 调用 option.onClick + hide', async () => {
      const onClick = vi.fn()
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [mkOption('选项 A', { onClick })]
      })
      await flushPromises()

      const li = document.querySelector('ul.fixed > li') as HTMLElement
      li.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(onClick).toHaveBeenCalledTimes(1)
      expect(contextMenuStore.visible).toBe(false)

      wrapper.unmount()
    })

    it('onClick 未定义 → 不报错（但也不 hide，因 handleClick 提前 return）', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [mkOption('无回调')]
      })
      await flushPromises()
      await nextTick()

      const li = document.querySelector('ul.fixed > li') as HTMLElement
      expect(() => li.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow()
      await flushPromises()

      // handleClick: if (!option.onClick) return → 不调用 hide
      expect(contextMenuStore.visible).toBe(true)

      wrapper.unmount()
    })
  })

  // ==========================================================================
  // 4. 位置计算
  // ==========================================================================
  describe('4. 位置计算', () => {
    it('正常位置（不超出视口）→ top/left = position', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [mkOption('选项', { onClick: vi.fn() })]
      })
      await flushPromises()

      const ul = document.querySelector('ul.fixed') as HTMLElement
      expect(ul.style.top).toBe('100px')
      expect(ul.style.left).toBe('100px')

      wrapper.unmount()
    })

    it('y 超出视口高度 → top = position.y - containerHeight（向上展开）', async () => {
      const wrapper = mount(ContextMenu)
      // mock windowHeight=1080，y=1080-50=1030 + containerHeight（4+32+4=40）=1070 < 1080，不触发
      // 需要 y + containerHeight > windowHeight
      contextMenuStore.show({
        x: 100,
        y: 1050,
        options: [mkOption('选项', { onClick: vi.fn() })]
      })
      await flushPromises()

      const ul = document.querySelector('ul.fixed') as HTMLElement
      // 1050 + 40 = 1090 > 1080 → top = 1050 - 40 = 1010
      expect(ul.style.top).toBe('1010px')

      wrapper.unmount()
    })

    it('x 超出视口宽度 → left = position.x - containerWidth', async () => {
      const wrapper = mount(ContextMenu)
      // containerWidth=176，windowWidth=1920，x=1800+176=1976>1920
      contextMenuStore.show({
        x: 1800,
        y: 100,
        options: [mkOption('选项', { onClick: vi.fn() })]
      })
      await flushPromises()

      const ul = document.querySelector('ul.fixed') as HTMLElement
      // 1800 + 176 = 1976 > 1920 → left = 1800 - 176 = 1624
      expect(ul.style.left).toBe('1624px')

      wrapper.unmount()
    })
  })

  // ==========================================================================
  // 5. 子菜单
  // ==========================================================================
  describe('5. 子菜单', () => {
    it('mouseenter 带 children 的选项 → 显示子菜单 ul', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [
          mkOption('父级', {
            onClick: vi.fn(),
            children: [mkOption('子级 1', { onClick: vi.fn() })]
          })
        ]
      })
      await flushPromises()
      await nextTick()

      // 初始子菜单不可见
      expect(document.querySelectorAll('ul.fixed ul').length).toBe(0)

      // mouseenter 触发 handleChildrenShow
      const li = document.querySelector('ul.fixed > li') as HTMLElement
      li.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      await nextTick()

      // 子菜单出现
      const subUls = document.querySelectorAll('ul.fixed ul')
      expect(subUls.length).toBeGreaterThan(0)
      expect(subUls[0].textContent).toContain('子级 1')

      wrapper.unmount()
    })

    it('mouseleave → activedIndex 重置（子菜单消失）', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [
          mkOption('父级', {
            onClick: vi.fn(),
            children: [mkOption('子级 1', { onClick: vi.fn() })]
          })
        ]
      })
      await flushPromises()
      await nextTick()

      const li = document.querySelector('ul.fixed > li') as HTMLElement
      li.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      await nextTick()
      expect(document.querySelectorAll('ul.fixed ul').length).toBeGreaterThan(0)

      li.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      await nextTick()
      expect(document.querySelectorAll('ul.fixed ul').length).toBe(0)

      wrapper.unmount()
    })

    it('点击子菜单项 → 调用 childOption.onClick + hide', async () => {
      const childOnClick = vi.fn()
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [
          mkOption('父级', {
            onClick: vi.fn(),
            children: [mkOption('子级 1', { onClick: childOnClick })]
          })
        ]
      })
      await flushPromises()
      await nextTick()

      const li = document.querySelector('ul.fixed > li') as HTMLElement
      li.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      await nextTick()

      const childLi = document.querySelector('ul.fixed ul li') as HTMLElement
      childLi.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(childOnClick).toHaveBeenCalledTimes(1)
      expect(contextMenuStore.visible).toBe(false)

      wrapper.unmount()
    })
  })

  // ==========================================================================
  // 6. prefixIcon / suffixIcon
  // ==========================================================================
  describe('6. 图标渲染', () => {
    it('prefixIcon → 渲染前缀 SvgIcon', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [mkOption('选项', { prefixIcon: 'Play', onClick: vi.fn() })]
      })
      await flushPromises()

      const icons = document.querySelectorAll('.mock-svg-icon')
      expect(icons.length).toBeGreaterThan(0)
      expect(icons[0].getAttribute('data-name')).toBe('Play')

      wrapper.unmount()
    })

    it('suffixIcon → 渲染后缀 SvgIcon', async () => {
      const wrapper = mount(ContextMenu)
      contextMenuStore.show({
        x: 100,
        y: 100,
        options: [mkOption('选项', { suffixIcon: 'Close', onClick: vi.fn() })]
      })
      await flushPromises()

      const icons = document.querySelectorAll('.mock-svg-icon')
      expect(icons.length).toBeGreaterThan(0)
      expect(icons[0].getAttribute('data-name')).toBe('Close')

      wrapper.unmount()
    })
  })
})
