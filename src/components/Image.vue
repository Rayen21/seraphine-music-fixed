<script lang="ts" setup>
import SvgIcon from '@/components/SvgIcon.vue'
import { IconName } from '@/utils/icons'
import { cn } from '@/utils/tools'
import { invoke } from '@/utils/tools'
import { ref, useAttrs, watch } from 'vue'

interface Props {
  img: string
  icon?: IconName
  iconSize?: number
}

const { img, icon = 'Music', iconSize = 20 } = defineProps<Props>()

const attrs = useAttrs()
const isLoaded = ref(false)

// 直接预加载图片（适用于普通 HTTP/HTTPS 图片）
const handlePreload = (url: string) => {
  if (!url) {
    isLoaded.value = false
    return
  }

  const image = new Image()
  image.src = url
  image.onload = () => (isLoaded.value = true)
  image.onerror = () => (isLoaded.value = false)
}

// Kugou CDN 需要后端代理（因为需要特定 cookies）
const handlePreloadKugou = async (url: string) => {
  if (!url) {
    isLoaded.value = false
    return
  }

  try {
    const result = await invoke('fetch_image', { url })
    isLoaded.value = true
    // 替换 img 的 src 为后端返回的 data URL
    const imgEl = document.querySelector('.image-container img') as HTMLImageElement
    if (imgEl && result.url) {
      imgEl.src = result.url
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`[Image] Kugou fetch_image failed: ${msg}, falling back to direct preload`)
    // 降级：尝试直接加载
    handlePreload(url)
  }
}

// Kuwo CDN 也需要后端代理（kw_token / Referer）
const handlePreloadKuwo = async (url: string) => {
  if (!url) {
    isLoaded.value = false
    return
  }

  try {
    const result = await invoke('fetch_image', { url })
    isLoaded.value = true
    const imgEl = document.querySelector('.image-container img') as HTMLImageElement
    if (imgEl && result.url) {
      imgEl.src = result.url
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`[Image] Kuwo fetch_image failed: ${msg}, falling back to direct preload`)
    // 降级：尝试直接加载
    handlePreload(url)
  }
}

const loadImage = (url: string) => {
  if (!url) {
    isLoaded.value = false
    return
  }

  // Kugou CDN 使用后端代理（带 cookie）
  if (url.includes('.kugou.com/')) {
    handlePreloadKugou(url)
    return
  }

  // Kuwo CDN 也使用后端代理（带 kw_token / Referer）
  if (url.includes('kuwo.cn') || url.includes('kuwoimg.com')) {
    handlePreloadKuwo(url)
    return
  }

  // 其他 CDN（普通 HTTP/HTTPS）直接加载
  handlePreload(url)
}

watch(() => img, loadImage, { immediate: true })
</script>

<template>
  <div class="card relative overflow-hidden" :class="cn(attrs.class)">
    <img
      v-if="isLoaded"
      class="size-full object-cover"
      :src="img"
      loading="lazy"
      decoding="async"
      alt=""
      :draggable="false"
      @error="isLoaded = false" />
    <SvgIcon v-else :name="icon" :size="iconSize" class="size-full flex items-center justify-center" />
  </div>
</template>
