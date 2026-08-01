<script lang="ts" setup>
import Modal from '@/components/Modal.vue'
import { notify } from '@/components/Notification.tsx'
import SvgIcon from '@/components/SvgIcon.vue'
import { useMiniPlayerBridge } from '@/composables/useMiniPlayerBridge'
import { useSettingStore } from '@/stores/setting'
import { CloseStatus, WindowTarget, miniPlayerSize } from '@/utils/params'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useColorMode } from '@vueuse/core'

const mainWindow = getCurrentWindow()

const colorMode = useColorMode()
const settingStore = useSettingStore()

const miniWindow = ref<WebviewWindow>()
const closeVisible = ref(false)
const closeStatus = ref(settingStore.closeStatus ?? CloseStatus.Hide)

const miniBridge = useMiniPlayerBridge(miniWindow, mainWindow)

const handleColor = () => {
  colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'
}

const handleMiniPlayer = async () => {
  if (!miniWindow.value) {
    const scaleFactor = await mainWindow.scaleFactor()

    const { width, height } = miniPlayerSize
    const { x, y } = settingStore.miniPlayerPosition
    const logicalX = x / scaleFactor || Math.round(window.screen.availWidth - width - 16)
    const logicalY = y / scaleFactor || 48

    miniWindow.value = new WebviewWindow(WindowTarget.MiniPlayer, {
      title: '迷你播放器',
      url: '/mini-player.html',
      width,
      height,
      x: logicalX,
      y: logicalY,
      transparent: true,
      decorations: false,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false
    })

    miniWindow.value.once('tauri://created', () => {
      miniBridge.start()
      mainWindow.hide()
    })
    miniWindow.value.once('tauri://error', () => {
      notify.error('迷你播放器创建失败')
      miniWindow.value = undefined
    })
  } else {
    miniBridge.stop()
  }
}

// 最小化
const handleMinimize = () => {
  mainWindow.minimize()
}

// 最大化
const handleMaximize = async () => {
  await mainWindow.toggleMaximize()

  const isMaximized = await mainWindow.isMaximized()
  settingStore.toggleMaximizedState(isMaximized)
}

const handleCloseStatus = (closeStatus: CloseStatus) => {
  switch (closeStatus) {
    case CloseStatus.Hide:
      mainWindow.hide()
      break
    case CloseStatus.Exit:
      mainWindow.close()
      break
  }
}

const handleClose = () => {
  if (settingStore.closeStatus === undefined) {
    closeVisible.value = true
  } else {
    handleCloseStatus(settingStore.closeStatus)
  }
}

const handleCancel = () => {
  closeVisible.value = false
}

const handleConfirm = () => {
  settingStore.setCloseStatus(closeStatus.value)
  handleCloseStatus(closeStatus.value)
  handleCancel()
}
</script>

<template>
  <SvgIcon
    class="action-icon"
    :name="colorMode === 'dark' ? 'Moon' : 'Sun'"
    title="主题"
    size="18"
    @click="handleColor" />

  <SvgIcon class="action-icon" name="PIP" size="18" title="迷你播放器" @click="handleMiniPlayer" />

  <SvgIcon class="action-icon" name="Minimize" @click="handleMinimize" />

  <SvgIcon
    class="action-icon"
    :name="!settingStore.isMaximized ? 'Maximize' : 'Restore'"
    size="14"
    @click="handleMaximize" />

  <SvgIcon class="action-icon hover:text-error" name="Close" size="14" @click="handleClose" />

  <Modal
    v-model="closeVisible"
    class="w-80"
    title="关闭"
    @cancel="handleCancel"
    @confirm="handleConfirm">
    <div class="px-6">
      <label class="flex items-center gap-2">
        <input type="radio" name="closeAction" v-model="closeStatus" :value="CloseStatus.Hide" />
        最小化到托盘
      </label>

      <label class="flex items-center mt-2 gap-2">
        <input type="radio" name="closeAction" v-model="closeStatus" :value="CloseStatus.Exit" />
        退出程序
      </label>
    </div>
  </Modal>
</template>
