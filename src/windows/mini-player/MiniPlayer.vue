<script lang="ts" setup>
import Image from '@/components/Image.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import VirtualList from '@/components/VirtualList.vue'
import { getFullName, getPic } from '@/utils/music'
import {
  Interval,
  MiniPlayerEmit,
  PlayingOrigin,
  WindowEvent,
  WindowTarget,
  miniPlayerSize
} from '@/utils/params'
import { convertFileSrc } from '@tauri-apps/api/core'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useColorMode, useThrottleFn } from '@vueuse/core'
import { computed, ref } from 'vue'

// 同步主题
useColorMode()

const miniWindow = getCurrentWindow()

const tableColumns: TableColumn[] = [
  { key: 'index', slot: true, width: '3rem', padding: 0 },
  { key: 'info', slot: true, width: 'auto' }
]

const audio = ref<MiniPlayerAudio>({
  isPlaying: false,
  isLoading: false,
  music: null,
  origin: PlayingOrigin.Local
})
const lyric = ref('')
const playlist = ref<ListMusic[]>([])
const playlistVisible = ref(false)

const cover = computed(() => {
  if (!audio.value.music?.cover) return ''

  return audio.value.origin === PlayingOrigin.Local
    ? convertFileSrc(audio.value.music?.cover)
    : getPic(audio.value.music?.cover)
})

const showContent = computed(
  () => lyric.value || (audio.value.music ? getFullName(audio.value.music) : 'Seraphine')
)

const isPlaying = (id: ID) => id === audio.value.music?.id

const handleSend = (type: MiniPlayerEmit, data?: any) => {
  emitTo(WindowTarget.Main, WindowEvent.MiniPlayer, { type, data })
}

const showPlaylist = () => {
  playlistVisible.value = !playlistVisible.value

  const height = playlistVisible.value ? miniPlayerSize.width : miniPlayerSize.height
  miniWindow.setSize(new LogicalSize(miniPlayerSize.width, height))
}

// 向主窗口发送位置信息并缓存
miniWindow.onMoved(useThrottleFn((e) => handleSend(MiniPlayerEmit.Pos, e.payload), Interval.Long))
// 向主窗口发送初始化请求
emitTo(WindowTarget.Main, WindowEvent.MiniPlayer, { type: MiniPlayerEmit.Init })
listen<{ type: MiniPlayerEmit; data: unknown }>(WindowEvent.MiniPlayer, (e) => {
  switch (e.payload.type) {
    case MiniPlayerEmit.Audio:
      audio.value = e.payload.data as MiniPlayerAudio
      break
    case MiniPlayerEmit.Lyric:
      lyric.value = e.payload.data as string
      break
    case MiniPlayerEmit.Playlist:
      playlist.value = e.payload.data as ListMusic[]
      break
  }
})
</script>

<template>
  <div
    class="h-screen w-screen flex border border-border flex-col rounded-lg bg-background select-none">
    <!-- 主体内容 -->
    <div class="flex items-center">
      <!-- 专辑封面 -->
      <Image data-tauri-drag-region class="size-16 cursor-move" :img="cover" />

      <!-- 歌名/歌词区域 -->
      <div class="group w-0 flex-1 relative px-3">
        <div class="font-bold line-clamp-2">{{ showContent }}</div>

        <div
          class="absolute inset-0 bg-background pr-2 pl-6 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div class="flex items-center gap-2">
            <SvgIcon
              class="action-icon"
              name="PreviousBold"
              size="20"
              @click="handleSend(MiniPlayerEmit.Prev)" />
            <SvgIcon
              v-if="!audio.isLoading"
              class="action-icon"
              :name="audio.isPlaying ? 'PauseBold' : 'PlayBold'"
              size="24"
              @click="handleSend(audio.isPlaying ? MiniPlayerEmit.Pause : MiniPlayerEmit.Play)" />
            <SvgIcon v-else class="action-icon pointer-events-none" name="Ring" size="24" />
            <SvgIcon
              class="action-icon"
              name="NextBold"
              size="20"
              @click="handleSend(MiniPlayerEmit.Next)" />
          </div>

          <div class="flex items-center">
            <SvgIcon
              class="action-icon"
              name="Playlist"
              title="播放列表"
              size="20"
              @click="showPlaylist" />
            <SvgIcon
              class="action-icon shrink-0 hover:text-error"
              name="Close"
              size="20"
              @click="handleSend(MiniPlayerEmit.Close)" />
          </div>
        </div>
      </div>
    </div>

    <VirtualList
      v-if="playlistVisible"
      class="mt-2 h-0 flex-1 px-2"
      :line-height="40"
      :columns="tableColumns"
      :list="playlist"
      @lineDblClick="handleSend(MiniPlayerEmit.Set, $event)">
      <template #index="row">
        <SvgIcon v-if="isPlaying(row.id)" class="text-info" name="Music" />
        <div v-else class="truncate text-center text-minor">{{ row.index + 1 }}</div>
      </template>

      <template #info="row">
        <div class="flex">
          <div
            class="w-0 flex-1 truncate font-bold leading-10"
            :class="isPlaying(row.id) ? 'text-info' : ''">
            {{ getFullName(row) }}
          </div>

          <div
            class="hidden items-center pl-2 group-hover/line:flex"
            @dblclick.stop
            @contextmenu.stop>
            <SvgIcon class="action-icon" name="Play" @click="handleSend(MiniPlayerEmit.Set, row)" />
          </div>
        </div>
      </template>
    </VirtualList>
  </div>
</template>
