<script lang="ts" setup>
import Image from '@/components/Image.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import { useListStore } from '@/stores/list'
import { getPic } from '@/utils/music'
import { ListType } from '@/utils/params'
import { convertFileSrc } from '@tauri-apps/api/core'
import { computed, inject } from 'vue'

const listType = inject<ListType>('listType', ListType.Show)

const listStore = useListStore()

const list = computed(() => listStore[listType])
const cover = computed(() => {
  if (!list.value.info.cover) return ''

  return listType === ListType.Local
    ? convertFileSrc(list.value.info.cover, 'md')
    : getPic(list.value.info.cover)
})
</script>

<template>
  <div class="flex w-full gap-3 px-8">
    <!-- 加载状态 -->
    <template v-if="listStore.isLoading">
      <div class="size-16 rounded-lg bg-card"></div>
      <div class="py-1">
        <div class="h-6 w-32 rounded-md bg-card"></div>
        <div class="mt-2 h-6 w-24 rounded-md bg-card"></div>
      </div>
    </template>

    <!-- 无数据状态 -->
    <template v-else-if="!list.info">
      <SvgIcon class="card size-16" name="Music" :size="32" />
      <div class="text-xl font-bold leading-8">播放列表</div>
    </template>

    <!-- 有数据状态 -->
    <template v-else>
      <Image class="size-16" :img="cover" :icon-size="32" />

      <div class="flex-1">
        <div class="flex h-8 items-baseline">
          <div class="truncate text-xl font-bold leading-8">
            {{ list.info.title || '播放列表' }}
          </div>
          <div class="ml-4 flex-1">共 {{ list.info.count || 0 }} 首</div>
        </div>

        <div class="flex h-8 items-center gap-2 whitespace-nowrap">
          <div class="font-bold leading-8">{{ list.info.artist }}</div>

          <div
            class="card border-info text-info text-xs rounded px-1 leading-4 font-bold"
            v-for="(tag, index) in list.info.tags"
            :key="index">
            {{ tag }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
