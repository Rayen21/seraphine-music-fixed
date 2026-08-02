import App from './App.vue'
import router from '@/router/index'
import '@/styles/global.css'
import { disableHotkeys, invoke } from '@/utils/tools'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// 注册设备
invoke('api_register_dev')
disableHotkeys()

createApp(App).use(createPinia().use(piniaPluginPersistedstate)).use(router).mount('#app')
