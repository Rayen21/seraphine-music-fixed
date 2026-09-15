<script lang="ts" setup>
import Image from '@/components/Image.vue'
import { notify } from '@/components/Notification.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import { useContextMenuStore } from '@/stores/context-menu'
import { useListStore } from '@/stores/list'
import { useMusicStore } from '@/stores/music'
import { useUserStore } from '@/stores/user'
import { getOrigin, getPic } from '@/utils/music'
import { ApiInvokeStatus, ListType } from '@/utils/params'
import { invoke } from '@/utils/tools'
import { useRouter } from 'vue-router'

interface Props {
  data: CardInfo
  info: ListInfo
  list: CardInfo[]
}

const { data, info, list } = defineProps<Props>()

const router = useRouter()

const musicStore = useMusicStore()
const listStore = useListStore()
const userStore = useUserStore()
const contextMenuStore = useContextMenuStore()

const handlePlay = () => {
  if (!data.musicInfo) return

  const playList: ListMusic[] = []
  list.forEach((item) => item.musicInfo && playList.push(item.musicInfo))

  listStore.setList(ListType.Play, { info, list: playList })
  musicStore.setMusic(data.musicInfo, { origin: getOrigin(data.musicInfo) })
}

const handleClick = () => {
  if (data.musicInfo) {
    handlePlay()
  } else if (data.artistInfo) {
    const { id, cover, name } = data.artistInfo
    router.push({ path: '/artist-list-table', query: { id, cover, name } })
  } else if (data.playlistInfo) {
    const { id, cover, title } = data.playlistInfo
    router.push({ path: '/top-playlist-table', query: { id, cover, title } })
  }
}

const handleContextMenu = (e: MouseEvent) => {
  if (!data.musicInfo) return

  const addNext = () => {
    listStore.addNextList(
      listStore.play.list.findIndex((item) => item.id === musicStore.music?.id),
      data.musicInfo!
    )
  }

  const download = () => {
    console.log('TODO: 下载')
  }

  contextMenuStore.show({
    x: e.clientX,
    y: e.clientY,
    options: [
      { label: '播放', prefixIcon: 'Play', onClick: handlePlay },
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
            if (!data.musicInfo) return

            try {
              const playlist_tracks_add = await invoke('api_playlist_tracks_add', {
                listId: list.list_create_listid,
                musicList: [{ name: data.musicInfo.title, hash: data.musicInfo.hash }]
              })
              if (playlist_tracks_add.status !== ApiInvokeStatus.Success) {
                notify.error('添加失败')
                return
              }

              notify.success('添加成功')
              // 如果是添加到我喜欢,同步列表
              if (list.is_def === 2) listStore.addLikeList(data.musicInfo.id)
            } catch (error) {
              console.error(error)
              notify.error('添加失败')
            }
          }
        }))
      },
      { label: '下载', prefixIcon: 'Download', disabled: true, onClick: download }
    ]
  })
}
</script>

<template>
  <div
    class="card-hover relative transition-colors group/card flex h-16 cursor-pointer items-center gap-2 rounded-lg px-2"
    @click="handleClick"
    @contextmenu.prevent="handleContextMenu">
    <Image class="size-12" :img="getPic(data.cover)" />

    <SvgIcon
      v-if="data.musicInfo"
      class="absolute left-2 top-2 card size-12 bg-black/30 text-neutral-50 flex justify-center items-center transition-opacity opacity-0 group-hover/card:opacity-100"
      name="PlayBold"
      size="20" />

    <div class="flex h-12 w-0 flex-1 flex-col justify-center">
      <div class="music-title">{{ data.title }}</div>
      <div v-if="data.artist" class="music-artist">{{ data.artist }}</div>
    </div>
  </div>
</template>
