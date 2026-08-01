import {
  LyricBaseColor,
  LyricFontSize,
  LyricFormat,
  LyricOffset,
  LyricPageMode,
  LyricTextAlign,
  LyricTransMode
} from '@/utils/params'
import { getFullName, invoke, parseKrcLyric, parseLrcLyric } from '@/utils/tools'

type MatchedMap = Record<ID, { id: string; fmt: LyricFormat }>
type OffsetMap = Record<ID, number>

export const useLyricStore = defineStore(
  'lyric',
  () => {
    const pageVisible = ref(false) // 歌词页可见性
    const pageMode = ref(LyricPageMode.Cover) // 歌词页背景模式

    const isLoading = ref(false)
    const lyric = ref<LyricInfo>()
    const setting = ref<LyricSetting>({
      fontFamily: 'system-ui',
      fontSize: LyricFontSize.Default,
      textColor: LyricBaseColor.Blue,
      textAlign: LyricTextAlign.Left,
      transMode: LyricTransMode.Off
    })
    const matchedMap = ref<MatchedMap>({}) // 歌词匹配列表, 记录歌曲使用的歌词id
    const offsetMap = ref<OffsetMap>({}) // 歌词偏移量列表

    const togglePageVisible = () => {
      pageVisible.value = !pageVisible.value
    }
    const setPageMode = (newMode: LyricPageMode) => {
      pageMode.value = newMode
    }
    const setLyric = (newLyric: LyricInfo | undefined) => {
      lyric.value = newLyric
    }
    const setFontFamily = (newFontFamily: FontValue) => {
      setting.value.fontFamily = newFontFamily
    }
    const setFontSize = (mode: 'add' | 'sub' | 'restart') => {
      switch (mode) {
        case 'add':
          setting.value.fontSize += LyricFontSize.Step
          break
        case 'sub':
          setting.value.fontSize -= LyricFontSize.Step
          break
        case 'restart':
          setting.value.fontSize = LyricFontSize.Default
          break
      }
    }
    const setTextColor = (newColor: string) => {
      setting.value.textColor = newColor
    }
    const setTextAlign = (newTextAlign: LyricTextAlign) => {
      setting.value.textAlign = newTextAlign
    }
    const setTransMode = (newTransMode: LyricTransMode) => {
      setting.value.transMode = newTransMode
    }
    const setMatchedLyric = (musicId: ID, lyricId: string, fmt: LyricFormat) => {
      matchedMap.value[musicId] = { id: lyricId, fmt }
    }
    const setOffsetMap = (mode: 'add' | 'sub' | 'restart') => {
      if (!lyric.value) return

      switch (mode) {
        case 'add':
          offsetMap.value[lyric.value.id] += LyricOffset.Step
          break
        case 'sub':
          offsetMap.value[lyric.value.id] -= LyricOffset.Step
          break
        case 'restart':
          offsetMap.value[lyric.value.id] = LyricOffset.Default
          break
      }
    }

    const load = async (music: PlayingMusic, lyric?: LyricCandidate) => {
      isLoading.value = true
      setLyric(undefined)

      let lyricInfo: LyricInfo | undefined = undefined

      let lyricGet = await getLocalLyric(music, lyric)
      if (!lyricGet) lyricGet = await getOnlineLyric(music, lyric)

      if (lyricGet) {
        let lyricLines: LyricLine[] = []

        switch (lyricGet.fmt) {
          case LyricFormat.Krc:
            lyricLines = parseKrcLyric(lyricGet.content)
            break
          case LyricFormat.Lrc:
            lyricLines = parseLrcLyric(lyricGet.content)
            break
        }

        lyricInfo = {
          id: lyricGet.id,
          fmt: lyricGet.fmt,
          lines: lyricLines
        }
      }

      if (lyricInfo) {
        setLyric(lyricInfo)
        setMatchedLyric(music.id, lyricInfo.id, lyricInfo.fmt)
      }

      isLoading.value = false
    }

    // 获取本地歌词
    const getLocalLyric = async (music: PlayingMusic, lyric?: LyricCandidate) => {
      let id = ''
      let fmt = LyricFormat.Krc

      if (lyric) {
        id = lyric.id
      } else {
        const matchedLyric = matchedMap.value[music.id]
        if (!matchedLyric) return

        id = matchedLyric.id
        fmt = matchedLyric.fmt
      }

      try {
        return await invoke('music_lyric_get', { name: getFullName(music), id, fmt })
      } catch (error) {
        console.error(error)
      }
    }

    // 获取网络歌词
    const getOnlineLyric = async (music: PlayingMusic, lyric?: LyricCandidate) => {
      try {
        if (!lyric) {
          // 搜索歌词列表
          const lyric_search = await invoke('api_lyric_search', {
            keyword: getFullName(music, 'at'),
            hash: music.hash
          })
          if (lyric_search.status !== 200 || lyric_search.candidates.length === 0) return

          // 默认选择官方推荐, 其次评分最高的(即第一个)
          lyric =
            lyric_search.candidates.find((item) => item.product_from === '官方推荐歌词') ||
            lyric_search.candidates[0]
        }

        return await invoke('api_lyric_get', {
          name: getFullName(music),
          id: lyric.id,
          accesskey: lyric.accesskey
        })
      } catch (error) {
        console.error(error)
      }
    }

    return {
      pageVisible,
      pageMode,
      isLoading,
      lyric,
      setting,
      matchedMap,
      offsetMap,

      togglePageVisible,
      setPageMode,
      setLyric,
      setFontFamily,
      setFontSize,
      setTextColor,
      setTextAlign,
      setTransMode,
      setMatchedLyric,
      setOffsetMap,
      load
    }
  },
  {
    persist: {
      key: 'lyric-store',
      pick: ['pageMode', 'setting', 'matchedMap', 'offsetMap']
    }
  }
)
