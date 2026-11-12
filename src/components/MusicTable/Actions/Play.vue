<script lang="ts" setup>
import ActionButton from '@/components/ActionButton.vue'
import { useListStore } from '@/stores/list'
import { useMusicStore } from '@/stores/music'
import { getOrigin } from '@/utils/music'
import { ListType } from '@/utils/params'
import { computed, inject } from 'vue'

const listType = inject<ListType>('listType', ListType.Show)

const listStore = useListStore()

const musicStore = useMusicStore()

const list = computed(() => listStore[listType])

const handlePlay = async () => {
  if (list.value.list.length === 0) return

  if (listStore.play.info.id === list.value.info.id && musicStore.music) {
    if (!musicStore.isPlaying) await musicStore.play()
    return
  }

  const currentList = { info: list.value.info, list: [...list.value.list] }
  listStore.setList(ListType.Play, currentList)
  await musicStore.setMusic(currentList.list[0], { origin: getOrigin(currentList.list[0]) })
}
</script>

<template>
  <ActionButton prefix-icon="Play" @click="handlePlay">播放</ActionButton>
</template>
