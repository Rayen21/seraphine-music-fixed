<script lang="ts" setup>
import MusicDetail from './MusicDetail.vue'
import Image from '@/components/Image.vue'
import Modal from '@/components/Modal.vue'
import { notify } from '@/components/Notification.vue'
import ToTartget from '@/components/ToTartget.vue'
import ToTop from '@/components/ToTop.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import VirtualList from '@/components/VirtualList.vue'
import { useContextMenuStore } from '@/stores/context-menu'
import { useListStore } from '@/stores/list.ts'
import { useMusicStore } from '@/stores/music'
import { useUserStore } from '@/stores/user'
import { getOrigin, getPic } from '@/utils/music.ts'
import { ApiInvokeStatus, ListType } from '@/utils/params'
import { cn, formatDuration, invoke } from '@/utils/tools'
import { convertFileSrc } from '@tauri-apps/api/core'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { computed, inject, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'

interface Emits {
  infinite: []
}

const emits = defineEmits<Emits>()

const listType = inject<ListType>('listType', ListType.Show)

const route = useRoute()

const listStore = useListStore()
const musicStore = useMusicStore()
const userStore = useUserStore()
const contextMenuStore = useContextMenuStore()

const musicTableRef = useTemplateRef('musicTableRef')

const tableColumns: TableColumn[] = [
  { key: 'index', slot: true, width: '3rem', padding: 0 },
  { key: 'info', slot: true, width: 'auto' },
  { key: 'album', width: '35%' },
  { key: 'duration', slot: true, width: '10%' }
]

const contextMenuMusic = ref<ListMusic>()
const musicDetailVisible = ref(false)
const removeVisible = ref(false)

const list = computed(() => listStore[listType])
const getCover = computed(() =>
  // 目前只考虑整个表的类型, 不支持混合类型
  listType === ListType.Local
    ? (cover: string) => convertFileSrc(cover)
    : (cover: string) => getPic(cover)
)

const isPlaying = (id: ID) => {
  return musicStore.music?.id == id
}

const isLike = (id: ID) => {
  return listStore.like.list.includes(id)
}

const handleInfinite = () => {
  emits('infinite')
}

const handleCheck = <T,>(value: T) => {
  listStore.handleChecked(value)
}

const handleContextMenu = (e: MouseEvent, music: ListMusic) => {
  contextMenuMusic.value = music

  const play = () => handlePlay(music)

  const addNext = () => {
    listStore.addNextList(
      listStore.play.list.findIndex((item) => item.id === musicStore.music?.id),
      music
    )
  }

  const download = () => {
    console.log('TODO: 下载')
  }

  const showMusicDetail = () => {
    musicDetailVisible.value = true
  }

  const setMusicInfo = () => {
    console.log('TODO: 歌曲设置')
  }

  const openPath = async () => {
    if (!music.path) return

    try {
      await revealItemInDir(music.path)
    } catch (error) {
      console.error(error)
      notify.error('打开文件目录失败')
    }
  }

  const showRemove = () => {
    removeVisible.value = true
  }

  contextMenuStore.show({
    x: e.clientX,
    y: e.clientY,
    options: [
      { label: '播放', prefixIcon: 'Play', onClick: play },
      { label: '下一首播放', prefixIcon: 'Playlist', onClick: addNext },
      { divider: true },
      {
        label: '添加到',
        prefixIcon: 'Add',
        suffixIcon: 'Right',
        disabled: !userStore.userinfo,
        children: userStore.userPlaylist.map((list) => ({
          label: list.name,
          onClick: async () => {
            try {
              const playlist_tracks_add = await invoke('api_playlist_tracks_add', {
                listId: list.list_create_listid,
                musicList: [{ name: music.title, hash: music.hash }]
              })
              if (playlist_tracks_add.status !== ApiInvokeStatus.Success) {
                notify.error('添加失败')
                return
              }

              notify.success('添加成功')
              // 如果是添加到我喜欢,同步列表
              if (list.is_def === 2) listStore.addLikeList(music.id)
            } catch (error) {
              console.error(error)
              notify.error('添加失败')
            }
          }
        }))
      },
      { label: '下载', prefixIcon: 'Download', disabled: true, onClick: download },
      { divider: true },
      { label: '歌曲详情', prefixIcon: 'Info', disabled: !!music.hash, onClick: showMusicDetail },
      { label: '歌曲设置', prefixIcon: 'Setting', disabled: true, onClick: setMusicInfo },
      { label: '打开文件目录', prefixIcon: 'Folder', disabled: !!music.hash, onClick: openPath },
      { label: '从列表中删除', prefixIcon: 'Bin', onClick: showRemove }
    ]
  })
}

const handlePlay = (music: ListMusic) => {
  musicStore.setMusic(music, { origin: getOrigin(music) })

  // 如果播放列表不是当前列表，则切换
  if (listStore.play.info.id !== list.value.info.id) {
    listStore.setList(ListType.Play, { info: list.value.info, list: [...list.value.list] })
  }
}

const handleLike = async (music: ListMusic) => {
  try {
    const playlist_tracks_add = await invoke('api_playlist_tracks_add', {
      listId: listStore.like.info.id,
      musicList: [{ name: music.title, hash: music.hash }]
    })
    if (playlist_tracks_add.status !== ApiInvokeStatus.Success) {
      notify.error('收藏失败')
      return
    }

    notify.success('收藏成功')
    listStore.addLikeList(music.id)
  } catch (error) {
    console.error(error)
    notify.error('收藏失败')
  }
}

const handleUnlike = async (music: ListMusic) => {
  try {
    const playlist_tracks_del = await invoke('api_playlist_tracks_del', {
      listId: listStore.show.info.id,
      fileIds: [music.id]
    })
    if (playlist_tracks_del.status !== ApiInvokeStatus.Success) {
      notify.error('取消收藏失败')
      return
    }

    notify.success('取消收藏成功')
    listStore.removeLikeList(music.id)
  } catch (error) {
    console.error(error)
    notify.error('取消收藏失败')
  }
}

const handleRemoveConfirm = async () => {
  if (!contextMenuMusic.value) return

  // 用户歌单中的处理
  if (route.path === '/user-playlist-table') {
    await invoke('api_playlist_tracks_del', {
      listId: listStore.show.info.id,
      fileIds: [contextMenuMusic.value.id]
    })
  }

  listStore.removeList(listType, contextMenuMusic.value.id)
  removeVisible.value = false
}

const handleRemoveCancel = () => {
  removeVisible.value = false
}

const handleToTarget = () => {
  musicTableRef.value?.scrollToTarget(musicStore.music?.id)
}
const handleToTop = () => {
  musicTableRef.value?.scrollToTop()
}

onMounted(handleToTarget)
onUnmounted(() => listStore.clearSearch())
</script>

<template>
  <VirtualList
    ref="musicTableRef"
    :class="cn('w-full h-full pl-8 pr-[1.625rem]', $attrs.class)"
    :columns="tableColumns"
    :loading="listStore.isLoading"
    :list="listStore.searchList || list.list"
    :checking="listStore.isChecking"
    :checkedList="listStore.checkedList"
    @infinite="handleInfinite"
    @check="handleCheck"
    @contextmenu="handleContextMenu"
    @lineDblClick="handlePlay">
    <template #index="row">
      <SvgIcon v-if="isPlaying(row.id)" class="text-info" name="Music" />
      <div v-else class="truncate text-center text-minor">{{ row.index + 1 }}</div>
    </template>

    <template #info="row">
      <div class="flex items-center gap-3">
        <Image class="size-12" :img="row.cover ? getCover(row.cover) : ''" />

        <div class="w-0 flex-1 overflow-hidden">
          <div class="flex items-center gap-3">
            <div class="music-title" :class="isPlaying(row.id) ? 'text-info' : ''">
              {{ row.title }}
            </div>

            <div
              class="card border-info text-info text-xs rounded px-1 leading-4 font-bold"
              v-for="(tag, index) in row.privilegeTags"
              :key="index">
              {{ tag }}
            </div>
          </div>

          <div class="music-artist">{{ row.artist }}</div>
        </div>

        <div
          v-if="!listStore.isChecking"
          class="hidden items-center pl-2 group-hover/line:flex"
          @dblclick.stop
          @contextmenu.stop>
          <SvgIcon class="action-icon" name="Play" @click="handlePlay(row)" />

          <template v-if="userStore.userinfo && row.hash">
            <SvgIcon
              v-if="isLike(row.id)"
              class="action-icon text-error"
              name="HeartBold"
              @click="handleUnlike(row)" />
            <SvgIcon v-else class="action-icon" name="Heart" @click="handleLike(row)" />
          </template>

          <SvgIcon class="action-icon" name="More" @click="handleContextMenu($event, row)" />
        </div>
      </div>
    </template>

    <template #duration="row">
      <div class="text-minor text-center">{{ formatDuration(row.duration) }}</div>
    </template>
  </VirtualList>

  <div class="absolute right-4 bottom-4">
    <ToTartget v-if="musicStore.music" @click="handleToTarget" />
    <ToTop class="mt-3" @click="handleToTop" />
  </div>

  <MusicDetail v-model="musicDetailVisible" :path="contextMenuMusic?.path || ''" />

  <Modal
    v-model="removeVisible"
    class="w-80"
    title="删除"
    @confirm="handleRemoveConfirm"
    @cancel="handleRemoveCancel">
    <div class="px-4">
      确认从列表删除 <span class="font-bold">{{ contextMenuMusic?.title }}</span> ?
    </div>
    <div v-if="listType === ListType.Local" class="px-4 py-2">tips: 仅删除显示, 不删除本地文件</div>
  </Modal>
</template>
