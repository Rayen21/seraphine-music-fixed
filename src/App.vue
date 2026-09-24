<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { hide } from '@tauri-apps/api/app'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { relaunch } from '@tauri-apps/plugin-process'
import { notify } from '@/components/Notification.vue'

const showAccessibilityPrompt = ref(false)

async function checkAccessibility(): Promise<boolean> {
  try {
    await register('F7', () => {})
    await unregister('F7')
    return true
  } catch {
    return false
  }
}

onMounted(async () => {
  const hasAccess = await checkAccessibility()
  if (!hasAccess) {
    showAccessibilityPrompt.value = true
    notify.info(
      '检测到 macOS 辅助功能权限未授权，全局快捷键（F7/F9 切歌等）可能无法使用。请在"系统设置 → 隐私与安全 → 辅助功能"中授权 Seraphine Music。'
    )
  }

  // Cmd+W / Cmd+M 快捷键处理（macOS 系统快捷键，需 JS 层拦截）
  const win = getCurrentWindow()
  // 使用 window + document 双监听 + beforeunload 兜底，确保 WKWebView 拦截时也能生效
  const onKeydown = (e: KeyboardEvent) => {
    if (e.metaKey && e.key === 'w') {
      e.preventDefault()
      e.stopPropagation()
      // Cmd+W: 隐藏主窗口回到托盘
      win.hide()
    }
    if (e.metaKey && e.key === 'm') {
      e.preventDefault()
      e.stopPropagation()
      // Cmd+M: 隐藏整个应用回到托盘
      hide()
    }
  }
  // 双端监听：window 优先捕获（WKWebView 可能不派发 document 级事件），document 兜底
  window.addEventListener('keydown', onKeydown, true)
  document.addEventListener('keydown', onKeydown, true)
  // WKWebView Cmd+W 可能直接触发 page unload，用 beforeunload 兜底
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault()
    e.returnValue = ''
    // 不关闭页面，改为隐藏窗口
    win.hide()
  })
})
</script>

<template>
  <RouterView />
  <div
    v-if="showAccessibilityPrompt"
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
    <div class="w-80 rounded-lg bg-white p-6 text-center dark:bg-zinc-900">
      <div class="text-xl font-bold">需要辅助功能权限</div>
      <p class="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        macOS 安全机制阻止了全局快捷键注册，F7/F9 切歌等功能将无法使用。
      </p>
      <p class="mt-2 text-sm">
        请打开 <code class="rounded bg-zinc-200 px-1 dark:bg-zinc-700">系统设置 → 隐私与安全 → 辅助功能</code>，为 <code class="rounded bg-zinc-200 px-1 dark:bg-zinc-700">Seraphine Music</code> 勾选授权。
      </p>
      <button
        class="mt-3 rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        @click="showAccessibilityPrompt = false">
        知道了
      </button>
      <button
        class="mt-2 rounded bg-zinc-200 px-5 py-2 text-sm text-zinc-700 transition hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
        @click="showAccessibilityPrompt = false; relaunch()">
        重启以启用
      </button>
    </div>
  </div>
</template>
