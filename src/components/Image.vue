<script lang="ts" setup>
import SvgIcon from '@/components/SvgIcon.vue'
import { IconName } from '@/utils/icons'
import { cn } from '@/utils/tools'
import { ref, useAttrs } from 'vue'

interface Props {
  img: string
  icon?: IconName
  iconSize?: number
}

const { img, icon = 'Music', iconSize = 20 } = defineProps<Props>()

const attrs = useAttrs()
const isError = ref(false)

const handleError = () => (isError.value = true)
const handleLoad = () => (isError.value = false)
</script>

<template>
  <div class="card relative overflow-hidden" :class="cn(attrs.class)">
    <img
      :src="img"
      loading="lazy"
      decoding="async"
      alt=""
      :draggable="false"
      class="size-full object-cover"
      @error="handleError"
      @load="handleLoad" />
    <SvgIcon v-if="isError" :name="icon" :size="iconSize" class="size-full absolute inset-0 flex items-center justify-center" />
  </div>
</template>
