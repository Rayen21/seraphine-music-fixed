<script lang="ts" setup>
import SvgIcon from '@/components/SvgIcon.vue'
import { IconName } from '@/utils/icons'
import { cn, invoke } from '@/utils/tools'
import { convertFileSrc } from '@tauri-apps/api/core'
import { ref, useAttrs, watch, computed } from 'vue'

interface Props {
  img: string
  icon?: IconName
  iconSize?: number
}

const { img, icon = 'Music', iconSize = 20 } = defineProps<Props>()

const attrs = useAttrs()
const isLoaded = ref(false)
const dataUrl = ref('') // 后端代理返回的 base64
const localSrc = ref('') // 本地文件转换后的 asset: URL

// 判断是否为本地文件路径（非 http/https）
const isLocalPath = (url: string) => !/^https?:\/\//i.test(url)

watch(() => img, handlePreload, { immediate: true })

async function handlePreload(imgVal: string) {
  isLoaded.value = false
  dataUrl.value = ''
  localSrc.value = ''

  if (!imgVal) return

  // 本地文件：使用 convertFileSrc 转换为 asset: 协议，macOS WebKit 需要
  if (isLocalPath(imgVal)) {
    const converted = convertFileSrc(imgVal)
    localSrc.value = converted
    const image = new Image()
    image.src = converted

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
    const base64 = await invoke('api_download_image', { url: imgVal })
    dataUrl.value = 'data:image/jpeg;base64,' + base64
    isLoaded.value = true
  } catch (error) {
    console.error('[Image] 加载失败:', error)
    // 降级：尝试直接浏览器加载（部分 CDN 可能允许）
    const image = new Image()
    image.src = imgVal
    image.onload = () => { isLoaded.value = true; dataUrl.value = '' }
    image.onerror = () => (isLoaded.value = false)
  }
}

// 模板使用的 src，优先用预加载结果
const resolvedSrc = computed(() => {
  if (dataUrl.value) return dataUrl.value
  if (localSrc.value) return localSrc.value
  return img || ''
})
</script>

<template>
  <img
    v-if="isLoaded"
    :class="cn('card', attrs.class)"
    :src="resolvedSrc"
    loading="lazy"
    decoding="async"
    alt=""
    :draggable="false" />
  <SvgIcon v-else :class="cn('card ', attrs.class)" :name="icon" :size="iconSize" />
</template>
