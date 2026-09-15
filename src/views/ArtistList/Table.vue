<script lang="ts" setup>
import MusicActions from '@/components/MusicTable/MusicActions.vue'
import MusicHeader from '@/components/MusicHeader.vue'
import MusicTable from '@/components/MusicTable/MusicTable.vue'
import { useListStore } from '@/stores/list'
import { getPrivilegeTags } from '@/utils/music'
import { ApiInvokeStatus, ListType, PageSize } from '@/utils/params'
import { invoke } from '@/utils/tools'
import { onMounted, onUnmounted, provide, ref } from 'vue'
import { useRoute } from 'vue-router'

provide('listType', ListType.Show)

const route = useRoute()
const listStore = useListStore()

const isFinished = ref(false)
const page = ref(1)

const handleLoad = async () => {
  if (!route.query.id) return
  listStore.isLoading = true

  try {
    const api_artist_audios = await invoke('api_artist_audios', {
      id: Number(route.query.id),
      pageSize: PageSize.Default
    })
    if (api_artist_audios.status !== ApiInvokeStatus.Success) {
      // TODO: 后续路由只传递 id, 其他数据请求 歌手详情 获取
      const info: ListInfo = {
        id: String(route.query.id),
        cover: String(route.query.cover),
        title: String(route.query.name),
        artist: '',
        tags: [],
        count: api_artist_audios.extra.page_total
      }
      const list: ListMusic[] = []

      api_artist_audios.data.forEach((song, index) => {
        if (!song.audio_id) return

        list.push({
          id: song.audio_id,
          path: null,
          hash: song.hash,
          cover: song.trans_param.union_cover,
          title: song.audio_name,
          artist: song.author_name,
          album: song.album_name,
          duration: song.timelength / 1000,
          sort: index,
          privilegeTags: getPrivilegeTags(song.privilege, song.pay_type)
        })
      })

      listStore.setList(ListType.Show, { info, list })
    }
  } catch (error) {
    console.log(error)
  } finally {
    listStore.isLoading = false
  }
}

const handleInfinite = async () => {
  if (!route.query.id || isFinished.value) return

  try {
    const api_artist_audios = await invoke('api_artist_audios', {
      id: Number(route.query.id),
      page: ++page.value,
      pageSize: PageSize.Default
    })
    if (api_artist_audios.status !== ApiInvokeStatus.Success) {
      const list: ListMusic[] = []
      api_artist_audios.data.map((song, index) => {
        if (!song.audio_id) return

        list.push({
          id: song.audio_id,
          path: null,
          hash: song.hash,
          cover: song.trans_param.union_cover,
          title: song.audio_name,
          artist: song.author_name,
          album: song.album_name,
          duration: song.timelength / 1000,
          sort: index,
          privilegeTags: getPrivilegeTags(song.privilege, song.pay_type)
        })
      })

      listStore.addList(ListType.Show, list, false)

      if (api_artist_audios.data.length < PageSize.Default) isFinished.value = true
    }
  } catch (error) {
    console.log(error)
  } finally {
    listStore.isLoading = false
  }
}

onMounted(handleLoad)
onUnmounted(() => listStore.resetList(ListType.Show))
</script>

<template>
  <div class="relative space-y-3 pt-4 w-full h-full flex flex-col">
    <MusicHeader />
    <MusicActions />
    <MusicTable class="h-0 flex-1" @infinite="handleInfinite" />
  </div>
</template>
