<script lang="ts" setup>
import ActionButton from '@/components/ActionButton.vue'
import { useListStore } from '@/stores/list'
import { ListType } from '@/utils/params'
import { computed, inject } from 'vue'

const listType = inject<ListType>('listType', ListType.Show)

const listStore = useListStore()

const list = computed(() => listStore[listType])
const isChecked = computed(
  () => listStore.checkedList.length > 0 && listStore.checkedList.length == list.value.list.length
)

const handleClick = () => {
  listStore.setChecked(isChecked.value ? [] : list.value.list.map((item) => item.id))
}
</script>

<template>
  <ActionButton
    :prefix-icon="isChecked ? 'UnreadBold' : 'Unread'"
    :disabled="list.list.length === 0"
    @click="handleClick">
    全选
  </ActionButton>
</template>
