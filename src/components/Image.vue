<script lang="ts" setup>
import SvgIcon from '@/components/SvgIcon.vue'
import { IconName } from '@/utils/icons'
import { cn } from '@/utils/tools'
import { ref, useAttrs, watch } from 'vue'

interface Props {
  img: string
  icon?: IconName
  iconSize?: number
}

const { img, icon = 'Music', iconSize = 20 } = defineProps<Props>()

const attrs = useAttrs()
const isLoaded = ref(false)

const handlePreload = (img: string) => {
  if (!img) {
    isLoaded.value = false
    return
  }

  // 先标记为加载中，让 <img> 正常显示
  isLoaded.value = true

  const image = new Image()
  image.src = img

  // 预加载成功确认
  image.onload = () => (isLoaded.value = true)
  // 预加载失败不强制隐藏，图片可能仍可加载
  image.onerror = () => { /* 保留当前显示状态 */ }
}

watch(() => img, handlePreload, { immediate: true })
</script>

<template>
  <img
    v-if="isLoaded"
    :class="cn('card', attrs.class)"
    :src="img"
    loading="lazy"
    decoding="async"
    alt=""
    :draggable="false"
    @error="isLoaded = false"
    @load="isLoaded = true" />
  <SvgIcon v-else :class="cn('card ', attrs.class)" :name="icon" :size="iconSize" />
</template>
