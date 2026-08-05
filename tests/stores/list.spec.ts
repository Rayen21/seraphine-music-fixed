import { useListStore } from '@/stores/list'
import { ListType, SortOrder, SortType } from '@/utils/params'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock: crypto.randomUUID（addNextList 使用，Node/Vitest 默认环境无 window.crypto）
// ============================================================================
const { mockRandomUUID } = vi.hoisted(() => ({
  mockRandomUUID: vi.fn()
}))

// globalThis.crypto 在 Node/Vitest 环境下通常有 getter，用 Object.defineProperty 覆写
beforeAll(() => {
  const base = (globalThis as any).crypto ?? {}
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...base,
      randomUUID: (...args: any[]) => mockRandomUUID(...args)
    }
  })
})
afterAll(() => {
  mockRandomUUID.mockReset()
})

// ============================================================================
// 夹具
// ============================================================================
const mkListMusic = (id: string, extra: Partial<ListMusic> = {}): ListMusic => ({
  id,
  hash: null,
  path: id.startsWith('local') ? `C:/${id}.mp3` : null,
  cover: null,
  title: `Title-${id}`,
  artist: `Artist-${id}`,
  album: `Album-${id}`,
  duration: id === 's1' ? 100 : id === 's2' ? 200 : id === 's3' ? 300 : 150,
  sort: id === 's1' ? 2 : id === 's2' ? 1 : id === 's3' ? 3 : 0,
  ...extra
})

const S1 = mkListMusic('s1', {
  sort: 2,
  title: 'Banana',
  artist: 'Zed',
  album: 'Yell',
  duration: 300
})
const S2 = mkListMusic('s2', {
  sort: 1,
  title: 'Apple',
  artist: 'Ada',
  album: 'Zoom',
  duration: 100
})
const S3 = mkListMusic('s3', {
  sort: 3,
  title: 'Cherry',
  artist: 'Bob',
  album: 'Alpha',
  duration: 200
})
// S4 用于 handleSearch 测试 - 没有 artist/album 也可匹配 title
const S4 = mkListMusic('s4', { title: 'Dragon', artist: null, album: null })
const DEFAULT_SONGS: ListMusic[] = [S1, S2, S3]

const mkMusicList = (id: string, list: ListMusic[] = []): MusicList => ({
  info: {
    id,
    cover: '',
    title: `List-${id}`,
    artist: '',
    count: list.length,
    tags: []
  },
  list
})

// ============================================================================
describe('stores/list — 列表数据层（M3：列表/搜索/排序/框选核心动作）', () => {
  let listStore: ReturnType<typeof useListStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    mockRandomUUID.mockReset()
    mockRandomUUID.mockReturnValue('u-u-i-d')
    listStore = useListStore()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // 1. 初始默认值
  // ==========================================================================
  describe('1. 初始默认值 & 状态字段', () => {
    it('四个核心列表：local/play/show/like 基础结构', () => {
      // local
      expect(listStore.local.info.id).toBe('local')
      expect(listStore.local.info.title).toBe('本地歌曲')
      expect(listStore.local.list).toEqual([])
      expect(listStore.local.info.count).toBe(0)

      // play / show
      for (const key of ['play', 'show'] as const) {
        expect(listStore[key].info.id).toBe('')
        expect(listStore[key].info.title).toBe('')
        expect(listStore[key].list).toEqual([])
        expect(listStore[key].info.count).toBe(0)
      }

      // like（list 类型是 ID[]）
      expect(listStore.like.info.id).toBe('like')
      expect(listStore.like.info.title).toBe('我喜欢')
      expect(listStore.like.list).toEqual([])
      expect(listStore.like.info.count).toBe(0)
    })

    it('状态字段：isLoading/isInfiniting/isChecking + 空 checked/search/sort', () => {
      expect(listStore.isLoading).toBe(false)
      expect(listStore.isInfiniting).toBe(false)
      expect(listStore.isChecking).toBe(false)
      expect(listStore.checkedList).toEqual([])
      expect(listStore.searchList).toBeUndefined()
      expect(listStore.sortMap).toEqual({})
    })
  })

  // ==========================================================================
  // 2. addList / setList / removeList / clearList / resetList
  // ==========================================================================
  describe('2. 列表基础 CRUD（add/set/remove/clear/reset）', () => {
    it('addList start=false：追加到末尾 + 去重 + 返回新增数量 + count 更新', () => {
      const added = listStore.addList(ListType.Play, [S1, S2], false)
      expect(added).toBe(2)
      expect(listStore.play.list.map((m) => m.id)).toEqual(['s1', 's2'])
      expect(listStore.play.info.count).toBe(2)

      // 追加 S3 + 重复的 S1 → 仅 S3 被加
      const added2 = listStore.addList(ListType.Play, [S3, S1], false)
      expect(added2).toBe(1)
      expect(listStore.play.list.map((m) => m.id)).toEqual(['s1', 's2', 's3'])
      expect(listStore.play.info.count).toBe(3)
    })

    it('addList start=true：插入到列表开头，重复项仍去重', () => {
      listStore.addList(ListType.Local, [S3], true)
      listStore.addList(ListType.Local, [S1, S2, S3], true)
      // 顺序：[S1,S2]（S3 被去重） prepend 到原 [S3] 之前
      expect(listStore.local.list.map((m) => m.id)).toEqual(['s1', 's2', 's3'])
      expect(listStore.local.info.count).toBe(3)
    })

    it('addList 守卫：空 newList / 无效 type → 返回 0 或无副作用', () => {
      expect(listStore.addList(ListType.Play, [])).toBe(0)
      expect(listStore.addList(ListType.Play, [])).toBe(0)
      expect(listStore.addList('not-exist-type' as any, [S1])).toBe(0)
      expect(listStore.play.list).toEqual([])
    })

    it('setList：整表覆盖 target.value；若 sortMap[id] 存在 → 自动 handleSort', () => {
      listStore.setSortMap('playlist', { type: SortType.Default, order: SortOrder.ASC })
      const ml = mkMusicList('playlist', [S1, S2, S3])
      listStore.setList(ListType.Play, ml)
      expect(listStore.play.info.id).toBe('playlist')
      expect(listStore.play.info.count).toBe(3)
      // SortType.Default 按 sort 升序：S2(sort=1) → S1(sort=2) → S3(sort=3)
      expect(listStore.play.list.map((m) => m.id)).toEqual(['s2', 's1', 's3'])
    })

    it('removeList：移除指定 id，同时从 checkedList 中移除，count--', () => {
      listStore.addList(ListType.Local, [S1, S2, S3], false)
      // 模拟 checked
      listStore.toggleChecked()
      listStore.handleChecked(S1.id)
      listStore.handleChecked(S2.id)
      expect(listStore.checkedList).toContain(S1.id)
      expect(listStore.checkedList).toContain(S2.id)

      listStore.removeList(ListType.Local, S2.id)
      expect(listStore.local.list.map((m) => m.id)).toEqual(['s1', 's3'])
      expect(listStore.local.info.count).toBe(2)
      expect(listStore.checkedList).not.toContain(S2.id)
      expect(listStore.checkedList).toContain(S1.id)
    })

    it('removeList 守卫：空 id / 无效 type → 无副作用', () => {
      listStore.addList(ListType.Play, [S1], false)
      listStore.removeList(ListType.Play, '')
      expect(listStore.play.list.length).toBe(1)
      listStore.removeList('bad-type' as any, S1.id)
      expect(listStore.play.list.length).toBe(1)
    })

    it('clearList：list.length=0 count=0，同时触发 clearChecked（checkedList 清空但 isChecking 保留）', () => {
      listStore.addList(ListType.Play, [S1, S2], false)
      listStore.toggleChecked()
      listStore.handleChecked(S1.id)
      expect(listStore.checkedList.length).toBeGreaterThan(0)
      listStore.clearList(ListType.Play)
      expect(listStore.play.list).toEqual([])
      expect(listStore.play.info.count).toBe(0)
      expect(listStore.checkedList).toEqual([])
      expect(listStore.isChecking).toBe(true) // 保留，只 clear 不 reset
    })

    it('resetList：覆盖为默认空 MusicList 并调用 resetChecked（isChecking=false + 清空）', () => {
      listStore.addList(ListType.Show, [S1], false)
      listStore.toggleChecked()
      listStore.handleChecked(S1.id)
      listStore.resetList(ListType.Show)
      expect(listStore.show.info.id).toBe('')
      expect(listStore.show.info.title).toBe('')
      expect(listStore.show.list).toEqual([])
      expect(listStore.show.info.count).toBe(0)
      expect(listStore.isChecking).toBe(false)
      expect(listStore.checkedList).toEqual([])
    })

    it('无效 type 下 clearList / resetList / setList 均无副作用', () => {
      listStore.addList(ListType.Play, [S1], false)
      listStore.clearList('xxx' as any)
      expect(listStore.play.list.length).toBe(1)
      listStore.resetList('xxx' as any)
      expect(listStore.play.list.length).toBe(1)
      listStore.setList('xxx' as any, mkMusicList('abc', [S2]))
      expect(listStore.play.list[0].id).toBe('s1')
    })
  })

  // ==========================================================================
  // 3. addNextList（下一首插入 play 列表）
  // ==========================================================================
  describe('3. addNextList：下一首插入 + 同一首歌 ID 追加 UUID 避免冲突', () => {
    beforeEach(() => {
      listStore.addList(ListType.Play, [S1, S2, S3], false)
    })

    it('插入 index=0 后 → 新元素在 index=1；新 id = music.id + 「-」 + UUID', () => {
      mockRandomUUID.mockReturnValueOnce('uuid1')
      listStore.addNextList(0, S1) // S1 的 id 是 s1，插入位置 0+1=1
      expect(listStore.play.list.map((m) => m.id)).toEqual(['s1', 's1-uuid1', 's2', 's3'])
      expect(listStore.play.info.count).toBe(4)
      // 新元素内容 = ...S1
      expect(listStore.play.list[1].title).toBe(S1.title)
      expect(mockRandomUUID).toHaveBeenCalledTimes(1)
    })

    it('插入末尾之前 index=2(最后一个) → 插入位置 index=3', () => {
      mockRandomUUID.mockReturnValueOnce('T')
      listStore.addNextList(2, S3)
      const ids = listStore.play.list.map((m) => m.id)
      expect(ids).toEqual(['s1', 's2', 's3', 's3-T'])
    })
  })

  // ==========================================================================
  // 4. 我喜欢列表（like：ID[] 数组，不是 ListMusic[]）
  // ==========================================================================
  describe('4. 我喜欢列表（set/add/remove/clear）', () => {
    it('setLikeList：整表覆盖 info + list', () => {
      listStore.setLikeList({
        info: { id: 'like', cover: '', title: '我喜欢', artist: '', count: 2, tags: [] },
        list: ['a', 'b']
      })
      expect(listStore.like.list).toEqual(['a', 'b'])
      expect(listStore.like.info.count).toBe(2)
    })

    it('addLikeList / removeLikeList：count 与 list 一致变化', () => {
      listStore.addLikeList('id1')
      listStore.addLikeList('id2')
      expect(listStore.like.list).toEqual(['id1', 'id2'])
      expect(listStore.like.info.count).toBe(2)

      listStore.removeLikeList('id1')
      expect(listStore.like.list).toEqual(['id2'])
      expect(listStore.like.info.count).toBe(1)
    })

    it('clearLikeList：list + count 同时归零', () => {
      listStore.addLikeList('x')
      listStore.clearLikeList()
      expect(listStore.like.list).toEqual([])
      expect(listStore.like.info.count).toBe(0)
    })
  })

  // ==========================================================================
  // 5. 框选模块（toggleChecked/handleChecked/setChecked/removeCheckedList 等）
  // ==========================================================================
  describe('5. 框选模块（toggle/handle/set/clear/reset/removeChecked）', () => {
    beforeEach(() => {
      listStore.addList(ListType.Local, [S1, S2, S3], false)
    })

    it('toggleChecked：每次翻转 isChecking；翻转同时 clearChecked', () => {
      // 先手动塞一个 checkedList
      listStore.checkedList.push(S1.id)
      listStore.toggleChecked()
      expect(listStore.isChecking).toBe(true)
      expect(listStore.checkedList).toEqual([])
      // 再塞一次再 toggle 回来
      listStore.checkedList.push(S2.id)
      listStore.toggleChecked()
      expect(listStore.isChecking).toBe(false)
      expect(listStore.checkedList).toEqual([])
    })

    it('handleChecked：仅 isChecking=true + checked 有值 → toggle 单个元素；isChecking=false 忽略', () => {
      listStore.handleChecked(S1.id) // ignored
      expect(listStore.checkedList).toEqual([])
      listStore.toggleChecked()
      listStore.handleChecked(S1.id)
      expect(listStore.checkedList).toEqual([S1.id])
      // 再次 = toggle 移除
      listStore.handleChecked(S1.id)
      expect(listStore.checkedList).toEqual([])
      listStore.handleChecked(S2.id)
      listStore.handleChecked(S3.id)
      expect(listStore.checkedList).toEqual([S2.id, S3.id])

      // null/undefined 忽略
      listStore.handleChecked(null as any)
      listStore.handleChecked(undefined as any)
      expect(listStore.checkedList).toEqual([S2.id, S3.id])
    })

    it('setChecked：仅 isChecking=true → 覆盖 checkedList；false 时忽略', () => {
      listStore.setChecked([S1.id, S2.id])
      expect(listStore.checkedList).toEqual([]) // ignored
      listStore.toggleChecked()
      listStore.setChecked([S1.id, S2.id])
      expect(listStore.checkedList).toEqual([S1.id, S2.id])
    })

    it('clearChecked：只清空 checkedList，不修改 isChecking；resetList 内部会 resetChecked（同时置 isChecking=false）', () => {
      listStore.toggleChecked()
      listStore.handleChecked(S1.id)
      listStore.clearChecked()
      expect(listStore.checkedList).toEqual([])
      expect(listStore.isChecking).toBe(true) // isChecking 保留

      // 再塞一项
      listStore.handleChecked(S2.id)
      expect(listStore.checkedList).toEqual([S2.id])
      // resetList 会调用内部 resetChecked：isChecking=false + 清空 checkedList
      listStore.resetList(ListType.Local)
      expect(listStore.checkedList).toEqual([])
      expect(listStore.isChecking).toBe(false)
    })

    it('removeCheckedList：isChecking=false 或空 checkedList → 提前 return 不修改', () => {
      listStore.removeCheckedList(ListType.Local) // isChecking=false
      expect(listStore.local.list.length).toBe(3)

      listStore.toggleChecked()
      listStore.removeCheckedList(ListType.Local) // checkedList empty
      expect(listStore.local.list.length).toBe(3)

      listStore.handleChecked(S1.id)
      listStore.handleChecked(S3.id)
      listStore.removeCheckedList('bad-type' as any)
      expect(listStore.local.list.length).toBe(3)
    })

    it('removeCheckedList：批量删除 + count 更新 + clearChecked', () => {
      listStore.toggleChecked()
      listStore.handleChecked(S1.id)
      listStore.handleChecked(S3.id)
      listStore.removeCheckedList(ListType.Local)
      expect(listStore.local.list.map((m) => m.id)).toEqual([S2.id])
      expect(listStore.local.info.count).toBe(1)
      expect(listStore.checkedList).toEqual([]) // clearChecked
    })
  })

  // ==========================================================================
  // 6. handleSearch / clearSearch
  // ==========================================================================
  describe('6. 搜索（handleSearch/clearSearch）', () => {
    beforeEach(() => {
      listStore.addList(ListType.Play, [S1, S2, S3, S4], false)
    })

    it('handleSearch 空 query → searchList=undefined（不返回空数组）', () => {
      listStore.handleSearch(ListType.Play, '')
      expect(listStore.searchList).toBeUndefined()
    })

    it('handleSearch：匹配 title / artist / album 任一（忽略字段为 null 的项但不抛错）', () => {
      // Title='Apple' → S2
      listStore.handleSearch(ListType.Play, 'Apple')
      expect(listStore.searchList?.map((m) => m.id)).toEqual(['s2'])

      // Artist='Ada' → S2
      listStore.handleSearch(ListType.Play, 'Ada')
      expect(listStore.searchList?.map((m) => m.id)).toEqual(['s2'])

      // Album='Alpha' → S3
      listStore.handleSearch(ListType.Play, 'Alpha')
      expect(listStore.searchList?.map((m) => m.id)).toEqual(['s3'])

      // 全部无匹配 → []
      listStore.handleSearch(ListType.Play, 'NeverExists')
      expect(listStore.searchList).toEqual([])

      // S4 的 title='Dragon' 即使 artist/album 都 null 也能 match
      listStore.handleSearch(ListType.Play, 'Dragon')
      expect(listStore.searchList?.map((m) => m.id)).toEqual(['s4'])
    })

    it('handleSearch 无效 type → 直接 return，searchList 保持原状', () => {
      listStore.handleSearch(ListType.Play, 'Apple')
      const snapshot = listStore.searchList
      listStore.handleSearch('bad' as any, 'Apple')
      expect(listStore.searchList).toBe(snapshot)
    })

    it('clearSearch：searchList 回到 undefined', () => {
      listStore.handleSearch(ListType.Play, 'Apple')
      expect(listStore.searchList).toBeDefined()
      listStore.clearSearch()
      expect(listStore.searchList).toBeUndefined()
    })
  })

  // ==========================================================================
  // 7. 排序：setSortMap + handleSort（5 SortType × 2 SortOrder）
  // ==========================================================================
  describe('7. 排序 setSortMap / handleSort（5 SortType × 2 SortOrder）', () => {
    const initialOrderIds = ['s1', 's2', 's3']
    beforeEach(() => {
      listStore.addList(ListType.Play, DEFAULT_SONGS, false)
      expect(listStore.play.list.map((m) => m.id)).toEqual(initialOrderIds)
    })

    // 辅助：设置 sortInfo → handleSort → 返回排序后的 id 列表
    const runSort = (type: SortType, order: SortOrder): ID[] => {
      listStore.setSortMap('playList', { type, order })
      // 临时改 info.id 让 sortMap[id] 能命中（play 的默认 id 是空串）
      listStore.play.info.id = 'playList'
      listStore.handleSort(ListType.Play)
      return listStore.play.list.map((m) => m.id)
    }

    it('SortType.Default：按 sort 字段；ASC → 升序；DESC → 降序', () => {
      expect(runSort(SortType.Default, SortOrder.ASC)).toEqual([
        // S2.sort=1, S1.sort=2, S3.sort=3
        's2',
        's1',
        's3'
      ])
      expect(runSort(SortType.Default, SortOrder.DESC)).toEqual(['s3', 's1', 's2'])
    })

    it('SortType.Title：按 title.localeCompare；Apple < Banana < Cherry', () => {
      expect(runSort(SortType.Title, SortOrder.ASC)).toEqual([
        's2' /* Apple */,
        's1' /* Banana */,
        's3' /* Cherry */
      ])
      expect(runSort(SortType.Title, SortOrder.DESC)).toEqual(['s3', 's1', 's2'])
    })

    it('SortType.Artist：按 artist，null/undefined 安全 fallback 到空字符串', () => {
      listStore.addList(ListType.Show, [S1, S2, S3, S4], false)
      listStore.setSortMap('show-list', { type: SortType.Artist, order: SortOrder.ASC })
      listStore.show.info.id = 'show-list'
      listStore.handleSort(ListType.Show)
      const ids = listStore.show.list.map((m) => m.id)
      // S4.artist=null → ''(空字符串最小); S2.artist='Ada'; S3='Bob'; S1='Zed'
      expect(ids.indexOf('s4')).toBeLessThan(ids.indexOf('s2'))
      expect(ids.indexOf('s2')).toBeLessThan(ids.indexOf('s3'))
      expect(ids.indexOf('s3')).toBeLessThan(ids.indexOf('s1'))

      // DESC：翻转顺序
      listStore.setSortMap('show-list', { type: SortType.Artist, order: SortOrder.DESC })
      listStore.handleSort(ListType.Show)
      const idsDesc = listStore.show.list.map((m) => m.id)
      expect(idsDesc.indexOf('s1')).toBeLessThan(idsDesc.indexOf('s3'))
      expect(idsDesc.indexOf('s3')).toBeLessThan(idsDesc.indexOf('s2'))
      expect(idsDesc.indexOf('s2')).toBeLessThan(idsDesc.indexOf('s4'))
    })

    it('SortType.Album：按 album，null 安全 fallback 到空字符串', () => {
      // S3=Alpha, S1=Yell, S2=Zoom; S4=''
      listStore.addList(ListType.Show, [S1, S2, S3, S4], false)
      listStore.setSortMap('ab', { type: SortType.Album, order: SortOrder.ASC })
      listStore.show.info.id = 'ab'
      listStore.handleSort(ListType.Show)
      const ids = listStore.show.list.map((m) => m.id)
      // ''(s4) < Alpha(s3) < Yell(s1) < Zoom(s2)
      expect(ids).toEqual(['s4', 's3', 's1', 's2'])

      listStore.setSortMap('ab', { type: SortType.Album, order: SortOrder.DESC })
      listStore.handleSort(ListType.Show)
      expect(listStore.show.list.map((m) => m.id)).toEqual(['s2', 's1', 's3', 's4'])
    })

    it('SortType.Duration：按 duration 数字', () => {
      // S1=300, S2=100, S3=200
      expect(runSort(SortType.Duration, SortOrder.ASC)).toEqual([
        's2' /* 100 */,
        's3' /* 200 */,
        's1' /* 300 */
      ])
      expect(runSort(SortType.Duration, SortOrder.DESC)).toEqual(['s1', 's3', 's2'])
    })

    it('handleSort 守卫：无效 type / sortMap[id] 不存在 → 不改变顺序', () => {
      const before = [...listStore.play.list]
      // sortMap[''] 不存在
      listStore.handleSort(ListType.Play)
      expect(listStore.play.list).toEqual(before)

      // 无效 type
      listStore.setSortMap('abc', { type: SortType.Title, order: SortOrder.ASC })
      listStore.handleSort('bad' as any)
      expect(listStore.play.list).toEqual(before)
    })

    it('setList → sortMap[id] 存在 → 自动 handleSort 一次', () => {
      listStore.setSortMap('auto-id', { type: SortType.Title, order: SortOrder.ASC })
      listStore.setList(ListType.Play, mkMusicList('auto-id', DEFAULT_SONGS))
      // Title ASC: Apple(Banana→Cherry = s2→s1→s3
      expect(listStore.play.list.map((m) => m.id)).toEqual(['s2', 's1', 's3'])
    })
  })
})
