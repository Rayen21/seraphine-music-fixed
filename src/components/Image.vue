<script lang="ts" setup>
import SvgIcon from '@/components/SvgIcon.vue'
import { IconName } from '@/utils/icons'
import { cn, invoke } from '@/utils/tools'
import { ref, useAttrs, watch } from 'vue'

interface Props {
  img: string
  icon?: IconName
  iconSize?: number
}

const { img, icon = 'Music', iconSize = 20 } = defineProps<Props>()

const attrs = useAttrs()
const isLoaded = ref(false)
const dataUrl = ref('') // 后端代理返回的 base64

// 判断是否为本地文件路径（非 http/https）
const isLocalPath = (url: string) => !/^https?:\/\//i.test(url)

const handlePreload = async (img: string) => {
  isLoaded.value = false
  dataUrl.value = ''
  
  if (!img) return

  // 本地文件：直接用浏览器加载（Tauri convertFileSrc 已处理）
  if (isLocalPath(img)) {
    const image = new Image()
    image.src = img
    
    if (image.complete) {
      isLoaded.value = true
      return
    }

    image.onload = () => (isLoaded.value = true)
    image.onerror = () => (isLoaded.value = false)
    return
  }

  // 在线图片：走后端代理下载，避免 CORS 问题
  try {
    const base64 = await invoke('api_download_image', { url: img })
    dataUrl.value = 'data:image/jpeg;base64,' + base64
    isLoaded.value = true
  } catch (error) {
    console.error('[Image] 加载失败:', error)
    // 降级：尝试直接浏览器加载（部分 CDN 可能允许）
    const image = new Image()
    image.src = img
    image.onload = () => { isLoaded.value = true; dataUrl.value = '' }
    image.onerror = () => (isLoaded.value = false)
  }
}

watch(() => img, handlePreload, { immediate: true })
</script>

<template>
  <img
    v-if="isLoaded"
    :class="cn('card', attrs.class)"
    :src="dataUrl || img"
    loading="lazy"
    decoding="async"
    alt=""
    :draggable="false" />
  <SvgIcon v-else :class="cn('card ', attrs.class)" :name="icon" :size="iconSize" />
</template>
