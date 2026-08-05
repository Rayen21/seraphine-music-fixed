<script lang="ts" setup>
import Card from './Card.vue'
import ActionButton from '@/components/ActionButton.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import { useObserver } from '@/utils/hooks'
import { BreakPoint, ColCount, Interval } from '@/utils/params'
import { useThrottleFn, useWindowSize } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'

interface Props {
  /** 列表加载中 */
  loading?: boolean
  /** 列表数据 */
  data: ColList
  /** 列表行数 */
  rows?: number
  /** 不显示更多按钮 */
  notMore?: boolean
}

interface IEmits {
  load: []
  refresh: []
  more: [data: ColList]
}

const { data, loading, rows = 3, notMore } = defineProps<Props>()
const emits = defineEmits<IEmits>()

const { width: windowWidth } = useWindowSize()
const listRef = useTemplateRef('listRef')

const TotalHeight = 4.825 + 4.5 * rows

const isIntersecting = ref(false)

const cols = computed(() => {
  if (windowWidth.value > BreakPoint.LG) return ColCount.LG
  else if (windowWidth.value > BreakPoint.MD) return ColCount.MD
  else return ColCount.SM
})
const visibleList = computed(() => data.list.slice(0, cols.value))

const handleRefresh = useThrottleFn(() => emits('refresh'), Interval.Sec, true)

const handleMore = () => {
  if (notMore) return
  emits('more', data)
}

const { unobserve } = useObserver(listRef, (entry) => {
  if (!entry.isIntersecting) return

  isIntersecting.value = true
  emits('load')
  unobserve()
})
</script>

<template>
  <!-- 未到视口状态 -->
  <div
    v-if="!isIntersecting"
    ref="listRef"
    :style="{ width: '100%', height: `${TotalHeight}rem` }"></div>

  <!-- 加载状态 -->
  <div v-if="loading">
    <div class="flex justify-between">
      <div class="flex h-6 flex-1 items-center gap-3">
        <div class="h-full w-1 rounded-lg bg-minor"></div>
        <div class="h-full w-24 rounded-lg bg-card"></div>
      </div>

      <SvgIcon class="action-icon size-6" name="Refresh" @click="handleRefresh" />
    </div>

    <div class="mt-3 flex gap-3">
      <div v-for="col in cols" :key="col" class="card border-none flex-1 p-2">
        <div class="flex justify-center">
          <div class="h-6 w-24 rounded-lg bg-card"></div>
        </div>

        <div v-for="row in rows" :key="row" class="mt-2 h-16 rounded-lg bg-card" />
      </div>
    </div>
  </div>

  <!-- 无数据状态 -->
  <div
    v-else-if="!data"
    class="flex items-center justify-center card gap-3"
    :style="{ height: `${TotalHeight}rem` }">
    <div class="font-bold text-xl">无数据或请求失败</div>

    <ActionButton
      class="text-xl px-1 hover:text-info"
      mode="text"
      theme="info"
      suffix-icon="Refresh"
      size="20"
      @click="handleRefresh">
      重试
    </ActionButton>
  </div>

  <!-- 存在数据状态 -->
  <div v-else>
    <div class="flex items-center justify-between gap-3">
      <div class="flex h-6 flex-1 items-center gap-3 overflow-hidden whitespace-nowrap">
        <div class="h-full w-1 rounded bg-minor"></div>
        <div class="font-bold text-base">{{ data.info.title }}</div>

        <div
          class="card border-info text-info text-xs rounded px-1 leading-4 font-bold"
          v-for="(tag, index) in data.info.tags"
          :key="index">
          {{ tag }}
        </div>
      </div>

      <div class="flex h-6 items-center gap-2">
        <SvgIcon class="action-icon size-6" name="Refresh" @click="handleRefresh" />

        <ActionButton
          v-if="!notMore"
          class="px-1 hover:text-minor text-sm h-6"
          mode="text"
          suffix-icon="Right"
          @click="handleMore">
          更多
        </ActionButton>
      </div>
    </div>

    <div class="mt-3 flex gap-3">
      <div v-for="(list, index) in visibleList" :key="index" class="card space-y-2 flex-1 p-2">
        <div class="text-center font-bold truncate text-base">{{ list.info.title }}</div>

        <Card
          v-for="(item, childIndex) in list.list.slice(0, rows)"
          :key="childIndex"
          :data="item"
          :info="list.info"
          :list="list.list.slice(0, rows)" />
      </div>
    </div>
  </div>
</template>
