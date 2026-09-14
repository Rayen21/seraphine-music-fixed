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
const resolvedSrc = ref('')

// 通过后端代理加载外部图片（使用 Cookie）
const handlePreload = async (img: string) => {
  isLoaded.value = false
  if (!img) return

  // 如果是本地文件路径，直接使用 convertFileSrc
  if (img.startsWith('asset:') || img.startsWith('file:')) {
    resolvedSrc.value = img
    isLoaded.value = true
    return
  }

  try {
    const base64 = await invoke<string>('api_download_image', { url: img })
    resolvedSrc.value = `data:image/jpeg;base64,${base64}`
    isLoaded.value = true
  } catch {
    // 代理失败时回退到直接加载
    const image = new Image()
    image.src = img
    image.onload = () => (isLoaded.value = true)
    image.onerror = () => (isLoaded.value = false)
  }
}

watch(() => img, handlePreload, { immediate: true })
</script>

<template>
  <img
    v-if="isLoaded"
    :class="cn('card', attrs.class)"
    :src="resolvedSrc || img"
    loading="lazy"
    decoding="async"
    alt=""
    :draggable="false" />
  <SvgIcon v-else :class="cn('card ', attrs.class)" :name="icon" :size="iconSize" />
</template>
