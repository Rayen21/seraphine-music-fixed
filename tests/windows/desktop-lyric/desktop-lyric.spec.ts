import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 读取入口源码文本，用于静态约束断言
const entrySource = readFileSync(
  resolve(process.cwd(), 'src/windows/desktop-lyric/desktop-lyric.ts'),
  'utf-8'
)

// ============================================================================
// Mock：入口在 import 时执行 createApp(DesktopLyric).use(pinia).mount('#app')
// 必须在动态 import 入口前完成所有 mock 注册
// vi.mock 会被提升到文件顶部，所有 mock 变量必须通过 vi.hoisted 创建，
// 否则 factory 执行时变量处于 TDZ，引发 "Cannot access 'xxx' before initialization"
// ============================================================================

const {
  createAppMock,
  appUseMock,
  appMountMock,
  createPiniaMock,
  piniaPluginPersistedstateMock,
  disableHotkeysMock
} = vi.hoisted(() => ({
  createAppMock: vi.fn(),
  appUseMock: vi.fn().mockReturnThis(),
  appMountMock: vi.fn(),
  createPiniaMock: vi.fn(() => {
    const instance = { __isPinia: true }
    ;(instance as any).use = (plugin: unknown) => {
      if (typeof plugin === 'function') plugin()
      return instance
    }
    return instance
  }),
  piniaPluginPersistedstateMock: vi.fn(() => ({ __isPersistPlugin: true })),
  disableHotkeysMock: vi.fn()
}))

vi.mock('vue', () => ({
  createApp: (...args: unknown[]) => {
    createAppMock(...args)
    return {
      use: appUseMock,
      mount: appMountMock
    }
  }
}))

vi.mock('pinia', () => ({
  createPinia: createPiniaMock
}))

vi.mock('pinia-plugin-persistedstate', () => ({
  default: piniaPluginPersistedstateMock
}))

vi.mock('@/utils/tools', () => ({
  disableHotkeys: disableHotkeysMock
}))

// 入口 import 的 CSS，避免 vite 处理样式
vi.mock('@/styles/global.css', () => ({}))

// 入口组件静态依赖（避免触发 DesktopLyric.vue 内部对 Tauri API 的调用）
vi.mock('@/windows/desktop-lyric/DesktopLyric.vue', () => ({
  default: { name: 'DesktopLyric', template: '<div>mock</div>' }
}))

describe('windows/desktop-lyric/desktop-lyric.ts — 桌面歌词入口（M7.2）', () => {
  beforeEach(async () => {
    createAppMock.mockClear()
    appUseMock.mockClear()
    appMountMock.mockClear()
    createPiniaMock.mockClear()
    piniaPluginPersistedstateMock.mockClear()
    disableHotkeysMock.mockClear()

    // 重置模块缓存，确保入口副作用在每个用例中重新执行
    vi.resetModules()

    // 动态 import 入口，触发副作用执行
    await import('@/windows/desktop-lyric/desktop-lyric')
  })

  // ==========================================================================
  // 1. 入口初始化
  // ==========================================================================
  describe('1. 入口初始化', () => {
    it('调用 disableHotkeys() 拦截浏览器快捷键', () => {
      expect(disableHotkeysMock).toHaveBeenCalledTimes(1)
      expect(disableHotkeysMock).toHaveBeenCalledWith()
    })

    it('调用 createApp(DesktopLyric) 创建应用实例', () => {
      expect(createAppMock).toHaveBeenCalledTimes(1)
      const component = createAppMock.mock.calls[0][0]
      expect(component).toBeTruthy()
      expect((component as any).name).toBe('DesktopLyric')
    })

    it('createPinia() 创建 pinia 实例', () => {
      expect(createPiniaMock).toHaveBeenCalledTimes(1)
    })

    it('pinia-plugin-persistedstate 被作为插件应用', () => {
      expect(piniaPluginPersistedstateMock).toHaveBeenCalledTimes(1)
    })

    it('app.use(pinia + persistedstate 插件) 链式调用', () => {
      expect(appUseMock).toHaveBeenCalledTimes(1)
      const piniaInstance = appUseMock.mock.calls[0][0]
      expect(piniaInstance).toBeTruthy()
      expect((piniaInstance as any).__isPinia).toBe(true)
    })

    it("app.mount('#app') 挂载到根节点", () => {
      expect(appMountMock).toHaveBeenCalledTimes(1)
      expect(appMountMock.mock.calls[0][0]).toBe('#app')
    })
  })

  // ==========================================================================
  // 2. 静态约束：不引用主窗口 store
  // ==========================================================================
  describe('2. 静态约束：不引用主窗口 store', () => {
    it('入口源码不 import @/main 任何模块', () => {
      // 子窗口禁止直接引用主窗口业务，避免循环依赖与状态污染
      expect(entrySource).not.toMatch(/from\s+['"]@\/main\b/)
    })

    it('入口源码不 import @/stores/music', () => {
      expect(entrySource).not.toMatch(/from\s+['"]@\/stores\/music['"]/)
    })

    it('入口源码不 import @/stores/list', () => {
      expect(entrySource).not.toMatch(/from\s+['"]@\/stores\/list['"]/)
    })

    it('入口源码不 import @/stores/lyric', () => {
      expect(entrySource).not.toMatch(/from\s+['"]@\/stores\/lyric['"]/)
    })

    it('入口源码不 import @/stores/user', () => {
      expect(entrySource).not.toMatch(/from\s+['"]@\/stores\/user['"]/)
    })

    it('入口源码不 import @/stores/setting', () => {
      expect(entrySource).not.toMatch(/from\s+['"]@\/stores\/setting['"]/)
    })

    it('入口源码不 import @/stores/playing', () => {
      expect(entrySource).not.toMatch(/from\s+['"]@\/stores\/playing['"]/)
    })

    it('入口源码仅引用子窗口本地 store（./stores/desktop-lyric）', () => {
      // 桌面歌词窗口的业务 store 必须是子窗口本地 store，而非主窗口 store
      expect(entrySource).not.toMatch(/from\s+['"]@\/stores\/desktop-lyric['"]/)
    })
  })

  // ==========================================================================
  // 3. 依赖范围
  // ==========================================================================
  describe('3. 依赖范围', () => {
    it('入口源码 import 入口组件 ./DesktopLyric.vue', () => {
      expect(entrySource).toMatch(/from\s+['"]\.\/DesktopLyric\.vue['"]/)
    })

    it('入口源码 import 全局样式 @/styles/global.css（side-effect import）', () => {
      expect(entrySource).toMatch(/import\s+['"]@\/styles\/global\.css['"]/)
    })

    it('入口源码 import disableHotkeys 自 @/utils/tools', () => {
      expect(entrySource).toMatch(/from\s+['"]@\/utils\/tools['"]/)
      expect(entrySource).toMatch(/\bdisableHotkeys\b/)
    })

    it('入口源码 import createPinia 自 pinia', () => {
      // desktop-lyric.ts 显式 import createPinia（与 mini-player.ts 不同）
      expect(entrySource).toMatch(/from\s+['"]pinia['"]/)
      expect(entrySource).toMatch(/\bcreatePinia\b/)
    })

    it('入口源码 import pinia-plugin-persistedstate', () => {
      expect(entrySource).toMatch(/from\s+['"]pinia-plugin-persistedstate['"]/)
    })

    it('入口源码 import createApp 自 vue', () => {
      expect(entrySource).toMatch(/from\s+['"]vue['"]/)
      expect(entrySource).toMatch(/\bcreateApp\b/)
    })
  })
})
