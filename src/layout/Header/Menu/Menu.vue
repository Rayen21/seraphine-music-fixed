<script lang="ts" setup>
import Modal from '@/components/Modal.vue'
import { notify } from '@/components/Notification.vue'
import SelectModal from '@/components/SelectModal.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import { useUpdaterStore } from '@/stores/updater'
import { useUserStore } from '@/stores/user'
import { MenuAction } from '@/utils/params'
import { invoke } from '@/utils/tools'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { vOnClickOutside } from '@vueuse/components'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const userStore = useUserStore()
const updaterStore = useUpdaterStore()

const menuOptions = computed<Array<SelectOption<MenuAction>>>(() => [
  { label: '恢复默认窗口', value: MenuAction.Restore, prefixIcon: 'Restart' },
  { label: '检查更新', value: MenuAction.Update, prefixIcon: 'Refresh' },
  { label: '设置', value: MenuAction.Setting, prefixIcon: 'Setting' },
  {
    label: '退出登录',
    value: MenuAction.Logout,
    prefixIcon: 'Logout',
    disabled: !userStore.userinfo
  },
  { label: '退出播放器', value: MenuAction.Exit, prefixIcon: 'Exit' }
])

const menuVisible = ref(false)
const updateModalVisible = ref(false)

const handleSelect = async (action: MenuAction) => {
  switch (action) {
    case MenuAction.Restore:
      try {
        await invoke('system_setting_restore_window')
      } catch (error) {
        console.error(error)
        notify.error('恢复默认窗口失败')
      }
      break
    case MenuAction.Update:
      handleCheckUpdate()
      break
    case MenuAction.Setting:
      router.push('/setting')
      break
    case MenuAction.Logout:
      userStore.logout()
      break
    case MenuAction.Exit:
      getCurrentWindow().close()
      break
  }

  menuVisible.value = false
}

/** 从菜单触发的更新检查 */
const handleCheckUpdate = async () => {
  await updaterStore.checkUpdate() // 静默检查，我们自己处理 UI

  if (!updaterStore.updateInfo) return

  if (updaterStore.updateInfo.has_update) {
    updateModalVisible.value = true
  }
}

/** 确认更新：开始下载并跳转设置页 */
const handleUpdateConfirm = () => {
  updateModalVisible.value = false
  updaterStore.startDownload() // 不 await，后台下载
  router.push('/setting')
}

/** 取消更新 */
const handleUpdateCancel = () => {
  updateModalVisible.value = false
}
</script>

<template>
  <div class="relative" v-on-click-outside="() => (menuVisible = false)">
    <SvgIcon class="action-icon" name="Menu" size="20" @click="menuVisible = !menuVisible" />

    <SelectModal
      class="absolute left-1/2 -translate-x-1/2 top-full"
      transition="zoom-top"
      :visible="menuVisible"
      :options="menuOptions"
      @select="handleSelect" />

    <!-- 更新确认弹窗 -->
    <Modal
      class="w-80"
      v-model="updateModalVisible"
      title="版本更新"
      :confirm-label="'下载更新'"
      @confirm="handleUpdateConfirm"
      @cancel="handleUpdateCancel">
      <div class="px-4">
        <p>
          发现新版本
          <span class="text-green-500 font-bold">
            {{ updaterStore.updateInfo?.latest_version }}
          </span>
        </p>
      </div>
    </Modal>
  </div>
</template>
