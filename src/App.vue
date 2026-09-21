<script lang="ts" setup>
import { onMounted, ref } from 'vue'
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
