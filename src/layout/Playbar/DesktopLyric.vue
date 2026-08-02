<script lang="ts" setup>
import { notify } from '@/components/Notification.vue'
import { useDesktopLyricBridge } from '@/composables/useDesktopLyricBridge'
import { useMusicStore } from '@/stores/music'
import { useSettingStore } from '@/stores/setting'
import { WindowTarget, desktopLyricSize } from '@/utils/params'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'

const musicStore = useMusicStore()
const settingStore = useSettingStore()

const lyricWindow = ref<WebviewWindow>()

const lyricBridge = useDesktopLyricBridge(lyricWindow)

const handleDesktopLyric = async () => {
  if (!lyricWindow.value) {
    const scaleFactor = await getCurrentWindow().scaleFactor()

    const { width, height } = desktopLyricSize
    const { x, y } = settingStore.desktopLyricPosition
    const logicalX = x / scaleFactor || Math.round((window.screen.availWidth - width) / 2)
    const logicalY = y / scaleFactor || Math.round(window.screen.availHeight - height)

    lyricWindow.value = new WebviewWindow(WindowTarget.DesktopLyric, {
      title: '桌面歌词',
      url: '/desktop-lyric.html',
      width,
      height,
      x: logicalX,
      y: logicalY,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      shadow: false,
      skipTaskbar: true,
      resizable: false
    })

    lyricWindow.value.setIgnoreCursorEvents(true)

    lyricWindow.value.once('tauri://created', () => {
      lyricBridge.start()
    })
    lyricWindow.value.once('tauri://error', () => {
      notify.error('桌面歌词创建失败')
      lyricWindow.value = undefined
    })
  } else {
    lyricBridge.stop()
  }
}
</script>

<template>
  <div
    class="action-icon text-center font-bold leading-8"
    :class="lyricWindow ? 'text-info' : ''"
    title="桌面歌词"
    :data-disabled="!musicStore.music"
    @click="handleDesktopLyric">
    词
  </div>
</template>
