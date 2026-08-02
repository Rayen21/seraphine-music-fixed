import { notify } from '@/components/Notification.vue'
import { ApiInvokeStatus } from '@/utils/params'
import { invoke } from '@/utils/tools'

export const useUserStore = defineStore(
  'user',
  () => {
    const isHydrated = ref(false) // store 持久化的水合状态

    const isVip = ref(false)
    const userinfo = ref<UserInfo>()
    const userPlaylist = ref<Playlist[]>([])

    watch(
      isHydrated,
      () => {
        if (!userinfo.value) return

        getVipState()
      },
      { once: true }
    )

    const getVipState = async () => {
      try {
        const youth_union_vip = await invoke('api_youth_union_vip')
        if (youth_union_vip.status !== ApiInvokeStatus.Success) return

        isVip.value = youth_union_vip.data.busi_vip.some(
          (item) => item.product_type === 'svip' && item.is_vip === 1
        )
      } catch (error) {
        console.error(error)
        notify.error('获取会员状态失败')
      }
    }

    const setVipStatus = (newVipStatus: boolean) => {
      isVip.value = newVipStatus
    }

    const login = async (newUserinfo: UserInfo) => {
      userinfo.value = newUserinfo

      await getVipState()
      notify.success('登录成功')
    }

    const logout = async () => {
      notify.warning('退出中...')

      try {
        await invoke('api_login_out')
        await invoke('api_register_dev')

        userinfo.value = undefined
        notify.success('已退出登录')
      } catch (error) {
        console.error(error)
        notify.error('退出登录失败')
      }
    }

    const setUserPlaylist = (newUserPlaylist: Playlist[]) => {
      userPlaylist.value = newUserPlaylist
    }

    return {
      isHydrated,
      isVip,
      userinfo,
      userPlaylist,

      getVipState,
      setVipStatus,
      login,
      logout,
      setUserPlaylist
    }
  },
  {
    persist: {
      key: 'user-store',
      pick: ['userinfo'],
      afterHydrate: (ctx) => (ctx.store.isHydrated = true)
    }
  }
)
