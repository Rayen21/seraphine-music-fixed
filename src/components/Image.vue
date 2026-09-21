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
const imageDataUrl = ref('')
const isError = ref(false)

// 简单缓存：避免重复请求同一 URL
const cache = new Map<string, string>()

const loadImg = async (url: string) => {
  if (!url) {
    imageDataUrl.value = ''
    isError.value = false
    return
  }

  // 命中缓存直接返回
  if (cache.has(url)) {
    imageDataUrl.value = cache.get(url)!
    isError.value = false
    return
  }

  // CDN 图片可能走代理失败，HTTP → HTTPS 重试
  let finalUrl = url
  // Kugou CDN
  if (url.startsWith('http://') && url.includes('.kugou.com/')) {
    const httpsUrl = url.replace('http://', 'https://')
    try {
      const result = await invoke('fetch_image', { url: httpsUrl })
      cache.set(httpsUrl, result.url)
      imageDataUrl.value = result.url
      isError.value = false
      return
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`[Image] HTTPS ${httpsUrl} failed: ${msg}, falling back to HTTP`)
    }
  }
  // Kuwo CDN
  if (url.startsWith('http://') && (url.includes('kuwo.cn') || url.includes('kuwoimg.com'))) {
    const httpsUrl = url.replace('http://', 'https://')
    try {
      const result = await invoke('fetch_image', { url: httpsUrl })
      cache.set(httpsUrl, result.url)
      imageDataUrl.value = result.url
      isError.value = false
      return
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`[Image] HTTPS Kuwo ${httpsUrl} failed: ${msg}, falling back to HTTP`)
    }
  }

  try {
    const result = await invoke('fetch_image', { url: finalUrl })
    cache.set(finalUrl, result.url)
    imageDataUrl.value = result.url
    isError.value = false
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[Image] fetch_image failed: ${msg}`)
    imageDataUrl.value = ''
    isError.value = true
  }
}

watch(() => img, (v) => loadImg(v), { immediate: true })
</script>

<template>
  <div class="card relative overflow-hidden" :class="cn(attrs.class)">
    <img
      v-if="imageDataUrl"
      :src="imageDataUrl"
      loading="lazy"
      decoding="async"
      alt=""
      :draggable="false"
      class="size-full object-cover"
      @error="isError = true" />
    <SvgIcon
      v-if="isError"
      :name="icon"
      :size="iconSize"
      class="size-full absolute inset-0 flex items-center justify-center" />
  </div>
</template>
