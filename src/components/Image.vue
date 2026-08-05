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
  isLoaded.value = false
  if (!img) return

  const image = new Image()
  image.src = img

  image.onload = () => (isLoaded.value = true)
  image.onerror = () => (isLoaded.value = false)
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
    :draggable="false" />
  <SvgIcon v-else :class="cn('card ', attrs.class)" :name="icon" :size="iconSize" />
</template>
