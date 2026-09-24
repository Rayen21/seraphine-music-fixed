<script lang="ts" setup>
import SvgIcon from '@/components/SvgIcon.vue'
import { IconName } from '@/utils/icons'
import { cn } from '@/utils/tools'
import { invoke } from '@/utils/tools'
import { ref, useAttrs, watch, nextTick } from 'vue'

interface Props {
  img: string
  icon?: IconName
  iconSize?: number
}

const { img, icon = 'Music', iconSize = 20 } = defineProps<Props>()

const attrs = useAttrs()
const isLoaded = ref(false)
const imageRef = ref<HTMLImageElement | null>(null)

const isImageBlank = (img: HTMLImageElement): boolean => {
  if (img.naturalWidth === 0 || img.naturalHeight === 0) return true
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    // 统计接近白色的像素比例（阈值 240）
    let whiteCount = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= 240 && data[i + 1] >= 240 && data[i + 2] >= 240) {
        whiteCount++
      } else if (data[i + 3] === 0) {
        whiteCount++
      }
    }
    return whiteCount / (canvas.width * canvas.height) >= 0.99
  } catch {
    return true
  }
}

const handleImageLoad = () => {
  if (!imageRef.value) {
    isLoaded.value = false
    return
  }
  if (isImageBlank(imageRef.value)) {
    isLoaded.value = false
  } else {
    isLoaded.value = true
  }
}

// 直接预加载图片（适用于普通 HTTP/HTTPS 图片）
const handlePreload = (url: string) => {
  if (!url) {
    isLoaded.value = false
    return
  }

  const image = new Image()
  image.src = url
  image.onload = () => (isLoaded.value = true)
  image.onerror = () => { /* 预加载失败仍显示图片，让浏览器原生 <img> 加载（可能是 CORS 但浏览器能加载） */ isLoaded.value = true }
}

// Kugou CDN 需要后端代理（因为需要特定 cookies）
const handlePreloadKugou = async (url: string) => {
  if (!url) {
    isLoaded.value = false
    return
  }

  try {
    const result = await invoke('fetch_image', { url })
    await nextTick()
    const imgEl = imageRef.value
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
    await nextTick()
    const imgEl = imageRef.value
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
  isLoaded.value = false;
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
      ref="imageRef"
      :src="img"
      class="absolute inset-0 size-full object-cover"
      loading="lazy"
      decoding="async"
      alt=""
      :draggable="false"
      :style="{ opacity: isLoaded ? 1 : 0, transition: 'opacity 0.2s ease', position: 'absolute' }"
      @error="isLoaded = false"
      @load="handleImageLoad"
    />
    <SvgIcon v-if="!isLoaded" :name="icon" :size="iconSize" class="absolute inset-0 size-full flex items-center justify-center" />
  </div>
</template>
