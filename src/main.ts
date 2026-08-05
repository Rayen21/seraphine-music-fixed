import App from './App.vue'
import router from '@/router/index'
import '@/styles/global.css'
import { disableHotkeys, invoke } from '@/utils/tools'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'

// 注册设备
invoke('api_register_dev')
disableHotkeys()

createApp(App).use(createPinia().use(piniaPluginPersistedstate)).use(router).mount('#app')
