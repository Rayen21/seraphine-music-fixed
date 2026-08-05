import { useUserStore } from '@/stores/user'
import { ApiInvokeStatus } from '@/utils/params'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock（vi.hoisted：vi.mock 会被提升到文件顶部，所有 mock 变量必须在此创建）
// ============================================================================
const { mockInvoke, mockNotifySuccess, mockNotifyError, mockNotifyWarning } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockNotifySuccess: vi.fn(),
  mockNotifyError: vi.fn(),
  mockNotifyWarning: vi.fn()
}))

vi.mock('@/utils/tools', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    invoke: mockInvoke
  }
})

vi.mock('@/components/Notification.vue', () => ({
  notify: {
    success: mockNotifySuccess,
    error: mockNotifyError,
    warning: mockNotifyWarning,
    info: vi.fn()
  }
}))

// ============================================================================
// 夹具
// ============================================================================
const mkUserInfo = (uid: number, extra: Partial<UserInfo> = {}): UserInfo => ({
  userid: uid,
  nickname: `User-${uid}`,
  pic: `https://cdn/avatar-${uid}.jpg`,
  ...extra
})

const mkPlaylist = (id: number, extra: Partial<Playlist> = {}): Playlist => ({
  list_create_gid: `gid-${id}`,
  list_create_listid: id,
  list_create_username: `u-${id}`,
  pic: `https://cdn/pl-${id}.jpg`,
  name: `Playlist-${id}`,
  count: 10 * id,
  sort: id,
  musiclib_tags: [{ tag_name: '流行' }],
  is_pri: 0,
  type: 0,
  ...extra
})

const SAMPLE_USER = mkUserInfo(10086)
const SAMPLE_PLAYLISTS: Playlist[] = [mkPlaylist(1), mkPlaylist(2)]

// api_youth_union_vip 的返回壳
const vipOk = (busiVipItems: Array<{ product_type: string; is_vip: number }>) => ({
  status: ApiInvokeStatus.Success,
  data: {
    busi_vip: busiVipItems
  }
})

// ============================================================================
describe('stores/user — 用户登录态/会员状态/歌单列表（M3：user store）', () => {
  let userStore: ReturnType<typeof useUserStore>

  beforeEach(() => {
    setActivePinia(createPinia())

    mockInvoke.mockReset()
    mockNotifySuccess.mockReset()
    mockNotifyError.mockReset()
    mockNotifyWarning.mockReset()

    userStore = useUserStore()
  })

  // ==========================================================================
  // 1. 初始默认值
  // ==========================================================================
  describe('1. 初始默认值：isHydrated/isVip/userinfo/userPlaylist', () => {
    it('全部为空/默认值', () => {
      // persist.afterHydrate 未被调用 → false
      expect(userStore.isHydrated).toBe(false)
      expect(userStore.isVip).toBe(false)
      expect(userStore.userinfo).toBeUndefined()
      expect(userStore.userPlaylist).toEqual([])
    })
  })

  // ==========================================================================
  // 2. setters：直接字段赋值
  // ==========================================================================
  describe('2. 基础 setter（setVipStatus / setUserPlaylist）', () => {
    it('setVipStatus(true/false)：直接改 isVip 字段', () => {
      userStore.setVipStatus(true)
      expect(userStore.isVip).toBe(true)
      userStore.setVipStatus(false)
      expect(userStore.isVip).toBe(false)
    })

    it('setUserPlaylist：整表覆盖 userPlaylist，多次写入互相覆盖', () => {
      userStore.setUserPlaylist(SAMPLE_PLAYLISTS)
      expect(userStore.userPlaylist).toHaveLength(2)
      expect(userStore.userPlaylist[0].list_create_listid).toBe(1)

      const single = [mkPlaylist(42)]
      userStore.setUserPlaylist(single)
      expect(userStore.userPlaylist).toHaveLength(1)
      expect(userStore.userPlaylist[0].list_create_listid).toBe(42)
    })
  })

  // ==========================================================================
  // 3. getVipState：api_youth_union_vip + 4 分支
  // ==========================================================================
  describe('3. getVipState：api_youth_union_vip 4 种分支', () => {
    it('成功 + busi_vip 含 svip && is_vip=1 → isVip=true', async () => {
      mockInvoke.mockResolvedValueOnce(
        vipOk([
          { product_type: 'normal', is_vip: 1 },
          { product_type: 'svip', is_vip: 1 }
        ])
      )
      await userStore.getVipState()
      expect(mockInvoke).toHaveBeenCalledWith('api_youth_union_vip')
      expect(userStore.isVip).toBe(true)
    })

    it('成功但无匹配 svip 项 → isVip=false（不改动 isVip 的默认 false）', async () => {
      mockInvoke.mockResolvedValueOnce(
        vipOk([
          { product_type: 'normal', is_vip: 1 },
          { product_type: 'svip', is_vip: 0 }
        ])
      )
      await userStore.getVipState()
      expect(userStore.isVip).toBe(false)
    })

    it('status !== Success → 提前 return，isVip 保持原值（不重置）', async () => {
      userStore.setVipStatus(true) // 先手动置 true
      mockInvoke.mockResolvedValueOnce({ status: 500 })
      await userStore.getVipState()
      expect(userStore.isVip).toBe(true) // 不被还原
    })

    it('invoke 抛错 → try-catch → notify.error("获取会员状态失败") + 不向外抛', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('network disconnected'))
      await expect(userStore.getVipState()).resolves.not.toThrow()
      expect(mockNotifyError).toHaveBeenCalledWith('获取会员状态失败')
    })
  })

  // ==========================================================================
  // 4. login：userinfo 赋值 → getVipState → notify.success
  // ==========================================================================
  describe('4. login 异步链路：写入 userinfo + 拉取 vip + 登录成功通知', () => {
    it('login(user)：userinfo 被写入；getVipState 返回 svip=1 → isVip=true；notify.success("登录成功")', async () => {
      mockInvoke.mockResolvedValueOnce(vipOk([{ product_type: 'svip', is_vip: 1 }]))
      await userStore.login(mkUserInfo(123))
      expect(userStore.userinfo?.userid).toBe(123)
      expect(userStore.userinfo?.nickname).toBe('User-123')
      expect(mockInvoke).toHaveBeenCalledWith('api_youth_union_vip')
      expect(userStore.isVip).toBe(true)
      expect(mockNotifySuccess).toHaveBeenCalledWith('登录成功')
      expect(mockNotifyError).not.toHaveBeenCalled()
    })

    it('login 期间 getVipState 内部抛错 → getVipState 自己吞（try-catch）→ login 仍成功 resolve + notify.success', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('getVip fail'))
      await expect(userStore.login(SAMPLE_USER)).resolves.not.toThrow()
      expect(userStore.userinfo?.userid).toBe(SAMPLE_USER.userid)
      expect(mockNotifyError).toHaveBeenCalledWith('获取会员状态失败') // getVipState 的 notify
      expect(mockNotifySuccess).toHaveBeenCalledWith('登录成功') // login 仍然 success
    })

    it('login 连续调用两次：第二次覆写 userinfo，getVipState 再次调用', async () => {
      mockInvoke
        .mockResolvedValueOnce(vipOk([{ product_type: 'svip', is_vip: 0 }])) // 第 1 个 login 调 getVipState → 非 vip
        .mockResolvedValueOnce(vipOk([{ product_type: 'svip', is_vip: 1 }])) // 第 2 个 → 是 vip
      await userStore.login(mkUserInfo(1))
      await userStore.login(mkUserInfo(2))
      expect(userStore.userinfo?.userid).toBe(2)
      expect(userStore.isVip).toBe(true)
      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockNotifySuccess).toHaveBeenCalledTimes(2)
    })
  })

  // ==========================================================================
  // 5. logout：warning → api_login_out → api_register_dev → userinfo=undefined → success
  //   + 失败分支（两个 invoke 分别抛错）
  // ==========================================================================
  describe('5. logout 异步链路（4 种分支）', () => {
    beforeEach(() => {
      // 先登录一个初始态，验证 userinfo 确实被清或保留
      userStore = useUserStore()
      ;(userStore as any).userinfo = SAMPLE_USER
      expect(userStore.userinfo?.userid).toBe(SAMPLE_USER.userid) // 夹具确认
    })

    it('正常：notify.warning("退出中...") → api_login_out → api_register_dev → userinfo=undefined → notify.success("已退出登录")', async () => {
      mockInvoke
        .mockResolvedValueOnce({}) // api_login_out
        .mockResolvedValueOnce({}) // api_register_dev
      await userStore.logout()

      expect(mockNotifyWarning).toHaveBeenCalledWith('退出中...')
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'api_login_out')
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'api_register_dev')
      expect(userStore.userinfo).toBeUndefined()
      expect(mockNotifySuccess).toHaveBeenCalledWith('已退出登录')
      expect(mockNotifyError).not.toHaveBeenCalled()
    })

    it('api_login_out reject → catch 走 notify.error；userinfo 保持原值（清空写在 try 最后一步）', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('logout reject'))
      await expect(userStore.logout()).resolves.not.toThrow()
      expect(mockNotifyWarning).toHaveBeenCalledTimes(1)
      expect(mockNotifyError).toHaveBeenCalledWith('退出登录失败')
      expect(userStore.userinfo).toStrictEqual(SAMPLE_USER) // 保留登录态
      // api_register_dev 未被调用
      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(mockNotifySuccess).not.toHaveBeenCalled()
    })

    it('api_login_out OK 但 api_register_dev reject → catch 走 error，userinfo 保持原值', async () => {
      mockInvoke
        .mockResolvedValueOnce({}) // login_out OK
        .mockRejectedValueOnce(new Error('register_dev failed'))
      await expect(userStore.logout()).resolves.not.toThrow()
      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockNotifyError).toHaveBeenCalledWith('退出登录失败')
      expect(userStore.userinfo).toStrictEqual(SAMPLE_USER)
      expect(mockNotifySuccess).not.toHaveBeenCalled()
    })

    it('logout 调用前已退出（userinfo=undefined）→ 仍按流程走一遍 notify/warning/2 次 invoke/清 userinfo/success', async () => {
      ;(userStore as any).userinfo = undefined
      mockInvoke
        .mockResolvedValueOnce({ status: ApiInvokeStatus.Success })
        .mockResolvedValueOnce({})
      await userStore.logout()
      expect(mockNotifyWarning).toHaveBeenCalledWith('退出中...')
      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockNotifySuccess).toHaveBeenCalledWith('已退出登录')
      expect(userStore.userinfo).toBeUndefined()
    })
  })

  // ==========================================================================
  // 6. watch(isHydrated, { once: true })：仅在首次 hydrated=true 且 userinfo≠undefined 时调 getVipState
  // ==========================================================================
  describe('6. watch(isHydrated)：once 特性 + userinfo 守卫', () => {
    it('isHydrated=true 但 userinfo=undefined → 不调 getVipState', async () => {
      ;(userStore as any).isHydrated = true
      // Pinia/Vue watch 走 queueFlush（微任务），两层 Promise 链确保调度执行完毕
      await Promise.resolve()
      await Promise.resolve()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('isHydrated=true + userinfo 有值 → 首次调一次 getVipState（api_youth_union_vip）', async () => {
      mockInvoke.mockResolvedValueOnce(vipOk([]))
      // 先写 userinfo，再 hydrated（保证 watch 触发时两个条件都满足）
      ;(userStore as any).userinfo = SAMPLE_USER
      ;(userStore as any).isHydrated = true
      await Promise.resolve()
      expect(mockInvoke).toHaveBeenCalledWith('api_youth_union_vip')
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('once: true — 再次切换 isHydrated=false → true 不会再次触发 getVipState', async () => {
      mockInvoke.mockResolvedValue(vipOk([]))
      ;(userStore as any).userinfo = SAMPLE_USER
      // 第一次 hydrated
      ;(userStore as any).isHydrated = true
      await Promise.resolve()
      const callsAfter1 = mockInvoke.mock.calls.length
      // 翻转到 false
      ;(userStore as any).isHydrated = false
      await Promise.resolve()
      // 再次 hydrated=true（模拟下一次持久化恢复？实际不会发生，但 watch once 只调一次）
      ;(userStore as any).isHydrated = true
      await Promise.resolve()
      const callsAfter2 = mockInvoke.mock.calls.length
      expect(callsAfter2).toBe(callsAfter1) // 没增长
    })
  })
})
