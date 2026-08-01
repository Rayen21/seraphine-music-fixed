import DesktopLyricWindow from './DesktopLyric.vue'
import '@/styles/global.css'
import { disableHotkeys } from '@/utils/tools'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'

disableHotkeys()

createApp(DesktopLyricWindow).use(createPinia().use(piniaPluginPersistedstate)).mount('#app')
