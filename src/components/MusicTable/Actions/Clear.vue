<script lang="ts" setup>
import ActionButton from '@/components/ActionButton.vue'
import Modal from '@/components/Modal.vue'
import { useListStore } from '@/stores/list'
import { ListType } from '@/utils/params'
import { computed, inject, ref } from 'vue'

const listType = inject<ListType>('listType', ListType.Show)

const listStore = useListStore()

const visible = ref(false)

const list = computed(() => listStore[listType])

const handleCancel = () => {
  visible.value = false
}

const handleConfirm = () => {
  listStore.clearList(listType)
  handleCancel()
}
</script>

<template>
  <ActionButton
    theme="error"
    prefix-icon="Bin"
    :disabled="list.list.length === 0"
    @click="visible = true">
    清空
  </ActionButton>

  <Modal
    v-model="visible"
    class="w-80"
    title="清空"
    @cancel="handleCancel"
    @confirm="handleConfirm">
    <div class="px-4 font-bold">确认清空列表?</div>
    <div class="px-4 py-2">tips: 仅删除显示, 不删除本地文件</div>
  </Modal>
</template>
