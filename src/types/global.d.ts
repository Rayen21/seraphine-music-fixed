import { IconName } from '@/utils/icons'
import {
  DefaultSystemFonts,
  LyricBaseColor,
  LyricFormat,
  LyricTextAlign,
  LyricTransMode,
  PlayingQuality,
  SearchType,
  SortOrder,
  SortType
} from '@/utils/params'

export {}
declare global {
  type ID = string | number
  type FontName = (typeof DefaultSystemFonts)[number][0]
  type FontValue = (typeof DefaultSystemFonts)[number][1]
  type FontItem = [FontName, FontValue]
  type InvokeCmd = keyof Invoke
  type InvokeArgs<C extends InvokeCmd> = Invoke[C]['args']
  type InvokeReturn<C extends InvokeCmd> = Invoke[C]['return']

  /** 后端接口第一层返回结果 */
  interface ApiResponse<T = any> {
    status: number
    data: T
  }

  /** 滚动事件配置 */
  interface ScrollOptions {
    position?: 'top' | 'center' | 'bottom'
    behavior?: ScrollBehavior
  }

  /** 表格配置项 */
  interface TableColumn {
    // label: string;
    key: Key | string
    /**
     * 是否为 `插槽` 形式
     * @default false
     */
    slot?: boolean
    /**
     * 列宽度
     * @default 'auto'
     * @description `number` 类型使用 `px`, `string` 类型需要带上单位, 如果值为 `auto`, 则使用 `flex-1`
     */
    width?: number | string
    /**
     * 列对齐方式
     * @default 'left'
     */
    align?: 'left' | 'center' | 'right'
    /**
     * 列内边距
     * @default '8px'
     * @description `number` 类型使用 `px`, `string` 类型需要带上单位
     */
    padding?: number | string
  }

  /** SelectModal 配置项 */
  interface SelectOption<T = any> {
    label: string
    value: T
    /** 前缀图标 */
    prefixIcon?: IconName
    /** 后缀图标 */
    suffixIcon?: IconName
    /** 禁用 */
    disabled?: boolean
  }

  /** Slidebar 的配置项 */
  interface SlideOption<T = any> {
    label: string
    value: T
    /** 前缀图标 */
    prefixIcon?: IconName
    /** 后缀图标 */
    suffixIcon?: IconName
    /** 禁用 */
    disabled?: boolean

    [key: string]: any
  }

  interface ColList {
    info: ListInfo
    list: RowList[]
  }

  interface RowList {
    info: ListInfo
    list: CardInfo[]
  }

  /** 列表的card信息 */
  interface CardInfo {
    id: ID
    cover: string
    title: string
    artist: string

    /** 音频信息 */
    musicInfo?: ListMusic
    /** 歌手信息 */
    artistInfo?: ArtistInfo
    /** 歌单信息 */
    playlistInfo?: PlaylistInfo
  }

  /** 歌手信息 */
  interface ArtistInfo {
    id: number
    cover: string
    name: string
    fanscount: number
    descibe: string
    url: string
  }

  /** 歌单信息 */
  interface PlaylistInfo {
    id: string
    cover: string
    title: string
    artist: string
    /** 播放次数 */
    play_count: number
  }

  interface MusicList<T = ListMusic> {
    info: ListInfo
    list: T[]
  }

  /** 列表信息 */
  interface ListInfo {
    id: ID
    cover: string
    title: string
    artist: string
    count: number
    tags: string[]
  }

  /** 列表音频信息 */
  interface ListMusic {
    id: ID
    hash: string | null
    path: string | null
    cover: string | null
    title: string
    artist: string | null
    album: string | null
    duration: number
    sort: number
    /** 音频标签 */
    tags?: string[]
    /** 权限标签 */
    privilegeTags?: string[]
  }

  /** 播放音频信息 */
  interface PlayingMusic {
    id: ID
    hash: string | null
    path: string | null
    cover: string | null
    title: string
    artist: string | null
    duration: number
  }

  interface MusicDetail {
    path: string // 路径
    cover: string | null // 封面
    title: string // 标题
    artist: string | null // 歌手
    album: string | null // 专辑
    genre: string | null // 流派
    duration: number // 时长
    overall_bitrate: number | null // 总比特率(kbps)
    audio_bitrate: number | null // 音频比特率(kbps)
    sample_rate: number | null // 采样率(Hz)
    bit_depth: number | null // 比特深度(bits)
    channels: number | null // 声道
    format: string | null // 文件格式
    size: number // 文件大小
  }

  /** 排序信息 */
  interface SortInfo {
    /** 排序类型 */
    type: SortType
    /** 排序顺序 */
    order: SortOrder
  }

  /** 翻译列表 */
  type Translation = Record<LyricTransMode.Roman | LyricTransMode.Trans, string[]>

  /** 歌词行信息 */
  interface LyricLine {
    /** 行偏移时间(ms) */
    offset: number
    /** 行时长(ms) */
    duration: number
    /** 单词列表 */
    words: LyricWord[]
    /** 翻译列表 */
    translations: Record<LyricTransMode.Roman | LyricTransMode.Trans, string>
  }

  /** 单词信息 */
  interface LyricWord {
    /** 单词偏移时间(ms) */
    offset: number
    /** 单词时长(ms) */
    duration: number
    /** 单词文本 */
    text: string
  }

  /** 翻译歌词列表 */
  interface LyricLanguageList {
    /** 歌词列表 */
    content: LyricLanguageItem[]
    /** 歌词版本 */
    version: number
  }

  /** 翻译歌词信息 */
  interface LyricLanguageItem {
    type: number
    language: number
    lyricContent: string[][]
  }

  /** 用户信息 */
  interface UserInfo {
    /** 用户id */
    userid: number
    /** 用户昵称 */
    nickname: string
    /** 头像 */
    pic: string
  }

  /** 右键菜单项 */
  interface ContextMenuOption {
    label?: string
    /** 前缀图标 */
    prefixIcon?: IconName
    /** 后缀图标 */
    suffixIcon?: IconName
    /** 是否禁用 */
    disabled?: boolean
    /** 是否为分割线 */
    divider?: boolean
    children?: ContextMenuOption[]

    onClick?: () => any | Promise<any>
  }

  interface LyricInfo {
    id: string
    fmt: LyricFormat
    lines: LyricLine[]
  }

  interface LyricSetting {
    fontFamily: FontValue
    fontSize: number
    textColor: LyricBaseColor | string
    textAlign: LyricTextAlign
    transMode: LyricTransMode
  }

  /** 迷你播放器音频状态载荷 */
  interface MiniPlayerAudio {
    isPlaying: boolean
    isLoading: boolean
    music: PlayingMusic | null
    origin: PlayingOrigin
  }

  /** 迷你播放器歌词载荷 */
  interface MiniPlayerLyric {
    text: string
  }

  /** 迷你播放器播放列表载荷 */
  interface MiniPlayerPlaylist {
    list: ListMusic[]
  }

  /** 桌面歌词音频状态载荷 */
  interface DesktopLyricAudio {
    isPlaying: boolean
    isLoading: boolean
    music: PlayingMusic | null
  }

  /** invoke函数的 key 和 params */
  interface Invoke {
    http_config_clear: {
      args: undefined
      return: undefined
    }
    system_setting_restore_window: {
      args: undefined
      return: undefined
    }
    system_path_all: {
      args: undefined
      return: {
        current_dir: string
        temp_dir: string
        lyric_dir: string
        cover_dir: string
      }
    }
    music_scan_type: {
      args: undefined
      return: string[]
    }
    music_scan_dir: {
      args: { dirPaths: string[]; scanTypes: string[]; startIndex: number }
      return: LocalMusic[]
    }
    music_scan_file: {
      args: { filePaths: string[]; startIndex: usize }
      return: LocalMusic[]
    }
    music_scan_cancel: {
      args: undefined
      return: undefined
    }
    music_file_detail: {
      args: { filePath: string }
      return: MusicDetail
    }
    system_path_clear: {
      args: { dirPath: string }
      return: undefined
    }
    music_player_get_device: {
      args: undefined
      return: deviceInfo
    }
    music_player_set_device: {
      args: { id: string }
      return: undefined
    }
    music_player_get_devices: {
      args: undefined
      return: deviceInfo[]
    }
    music_player_load_file: {
      args: { path: string }
      return: undefined
    }
    music_player_load_url: {
      args: { path: string; hash: string }
      return: undefined
    }
    music_player_monitor_download: {
      args: { channel: Channel<number> }
      return: undefined
    }
    music_player_monitor_play: {
      args: { channel: Channel<number> }
      return: undefined
    }
    music_player_play: {
      args: undefined
      return: undefined
    }

    music_player_pause: {
      args: undefined
      return: undefined
    }
    music_player_stop: {
      args: undefined
      return: undefined
    }
    music_player_seek: {
      args: { pos: number }
      return: undefined
    }
    music_player_set_volume: {
      args: { volume: number }
      return: undefined
    }
    music_lyric_get: {
      args: { name: string; id: string; fmt?: LyricFormat }
      return: LyricGet
    }
    http_mode_list: {
      args: undefined
      return: Array<{ label: string; value: string; disabled: boolean }>
    }
    http_mode_get: {
      args: undefined
      return: string
    }
    http_mode_set: {
      args: { mode: string }
      return: undefined
    }
    api_lyric_search: {
      args: { keyword: string; hash: string | null; album_audio_id?: string; man?: 'yse' | 'no' }
      return: { status: u32; candidates: LyricCandidate[] }
    }
    api_lyric_get: {
      args: {
        name: string
        id: string
        accesskey: string
        fmt?: LyricFormat
        decode?: boolean
        client?: 'android'
      }
      return: LyricGet
    }
    api_music_everyday: {
      args: undefined
      return: ApiResponse<{
        song_list_size: number
        song_list: Array<{
          songid: number
          hash: string
          trans_param: { union_cover: string }
          songname: string
          author_name: string
          time_length: number
        }>
      }>
    }
    api_personal_fm: {
      args: undefined
      return: ApiResponse<{
        song_list: Array<{
          songid: number
          hash: string
          trans_param: { union_cover: string }
          songname: string
          author_name: string
          time_length: number
        }>
      }>
    }
    api_album_songs: {
      args: { id: number; is_buy?: string; page?: number; pageSize?: number }
      return: ApiResponse
    }
    api_artist_list: {
      args: {
        sexType?: number
        areaType?: number
        musician?: number
        page?: number
        pageSize?: number
      }
      return: ApiResponse<{
        info: Array<{
          singerid: number
          singername: string
          imgurl: string
          fanscount: number
          descibe: string
          url: string
        }>
      }>
    }
    api_artist_audios: {
      args: { id: number; sort?: number; page?: number; pageSize?: number }
      return: {
        status: number
        data: Array<{
          audio_id: number
          hash: string
          trans_param: { union_cover: string }
          audio_name: string
          author_name: string
          album_name: string
          timelength: number
          pay_type: number
          privilege: number
        }>
        extra: { group: number; page_total: number }
      }
    }
    api_audio_info: {
      args: { hashs: string[] }
      return: ApiResponse
    }
    api_login: {
      args: { username: string; password: string }
      return: undefined
    }
    api_login_qr_key: {
      args: { app_type: 'web' }
      return: ApiResponse<{ qrcode: string; qrcode_img: string }>
    }
    api_login_qr_create: {
      args: { key: string }
      return: string
    }
    api_login_qr_check: {
      args: { key: string }
      return: ApiResponse<{ status: number; userid: number; nickname: string; pic: string }>
    }
    api_login_wx_create: {
      args: undefined
      return: {
        errcode: number
        errmsg: string
        uuid: string
        appname: string
        qrcode: { qrcodeurl: string }
      }
    }
    api_login_wx_check: {
      args: { uuid: string }
      return: { wx_errcode: number; wx_code: string }
    }
    api_login_openplat: {
      args: { code: string }
      return: ApiResponse<{ userid: number; nickname: string; pic: string }>
    }
    api_login_captcha: {
      args: { mobile: string }
      return: ApiResponse<{ count: number }>
    }
    api_login_cellphone: {
      args: { mobile: string; code: string; userid?: string }
      return: ApiResponse<{ userid: number; nickname: string; pic: string }>
    }
    api_login_token: {
      args: undefined
      return: ApiResponse
    }
    api_login_out: {
      args: undefined
      return: undefined
    }
    api_playlist_tags: {
      args: undefined
      return: ApiResponse<PlaylistTag[]>
    }
    api_playlist_user: {
      args: { page?: number; pageSize?: number }
      return: ApiResponse<{ info: Playlist[] }>
    }
    api_playlist_detail: {
      args: { gids: string[] }
      return: ApiResponse<Playlist[]>
    }
    api_playlist_add: {
      args: {
        name: string
        listCreateUserid: number
        isPri?: number
        listType?: number
        listCreateGid?: number
        listCreateListid?: number
        source?: number
      }
      return: ApiResponse
    }
    api_playlist_del: {
      args: { listid: number }
      return: ApiResponse
    }
    api_playlist_tracks_all: {
      args: { gid: string; page?: number; pageSize?: number }
      return: ApiResponse<{
        begin_idx: number
        pagesize: number
        count: number
        list_info: Playlist
        songs: PlaylistSong[]
      }>
    }
    api_playlist_tracks_all_new: {
      args: { listid: number }
      return: ApiResponse
    }
    api_playlist_tracks_add: {
      args: {
        listId: ID
        musicList: Array<{
          name: string
          hash: string | null
          albumId?: number
          mixsongid?: number
        }>
      }
      return: ApiResponse
    }
    api_playlist_tracks_del: {
      args: { listId: ID; fileIds: ID[] }
      return: ApiResponse
    }
    api_privilege_lite: {
      args: { hashes: string[] }
      return: ApiResponse
    }
    api_rank_list: {
      args: { withsong: 0 | 1 }
      return: ApiResponse
    }
    api_rank_top: {
      args: undefined
      return: ApiResponse<{
        list: Array<{
          rankid: number
          rankname: string
          imgurl: string
          intro: string
        }>
      }>
    }
    api_rank_audio: {
      args: { rankId: number; rankCid?: number; page?: number; pageSize?: number }
      return: ApiResponse<{
        songlist: Array<{
          audio_id: number
          audio_info: { hash_128: string; duration_128: number }
          trans_param: { union_cover: string }
          songname: string
          author_name: string
          album_info: { album_name: string }
          business: { original_index: number }
          privilege_download: { privilege: number }
          deprecated: { pay_type: number }
        }>
      }>
    }
    api_register_dev: {
      args: undefined
      return: undefined
    }
    api_search: {
      args: { keywords: string; searchType?: SearchType; page?: number; pageSize?: number }
      return: ApiResponse<{
        total: number
        lists: Array<
          {
            Audioid: number
            FileHash: string
            trans_param: { union_cover: string }
            SingerName: string
            OriSongName: string
            AlbumName: string
            Duration: number
            PayType: number
            AlbumPrivilege: number
          } & {
            AuthorId: number
            Avatar: string
            AuthorName: string
            FansNum: number
          } & {
            gid: string
            img: string
            specialname: string
            nickname: string
            play_count: number
          }
        >
      }>
    }
    api_search_complex: {
      args: { keywords: string; page?: number; pageSize?: number }
      return: ApiResponse<{ lists: Array<{ lists: any[]; total: number; type: SearchType }> }>
    }
    api_song_url: {
      args: {
        hash: string
        quality?: PlayingQuality
        albumId?: number
        albumAudioId?: number
        freePart?: 0 | 1
      }
      return: { status: number; backupUrl?: string[] }
    }
    api_top_card: {
      args: { cardId: number }
      return: ApiResponse<{
        rec_desc: string
        song_list: Array<{
          songid: number
          hash: string
          trans_param: { union_cover: string }
          songname: string
          author_name: string
          album_name: string
          time_length: number
        }>
      }>
    }
    api_top_playlist: {
      args: {
        categoryId: string
        moduleId?: number
        withtag?: number
        withsong?: number
        sort?: number
        page?: number
        pageSize?: number
      }
      return: ApiResponse<{
        special_list: Array<{
          global_collection_id: string
          flexible_cover: string
          specialname: string
          nickname: string
          play_count: number
        }>
      }>
    }
    api_top_album: {
      args: { page?: number; pageSize?: number }
      return: ApiResponse<TopAlbum>
    }
    api_user_detail: {
      args: undefined
      return: ApiResponse
    }
    api_youth_union_vip: {
      args: undefined
      return: ApiResponse<{
        busi_vip: Array<{ is_vip: number; product_type: string }>
        is_vip: number
      }>
    }
    api_youth_day_vip: {
      args: { receiveDay?: string }
      return: ApiResponse
    }
    api_youth_day_upgrade: {
      args: undefined
      return: ApiResponse
    }
  }

  interface LyricGet {
    id: string
    fmt: LyricFormat
    content: string
  }

  interface deviceInfo {
    id: string
    name: string
  }

  interface LyricCandidate {
    id: string
    accesskey: string
    product_from: string
    singer: string
    song: string
    score: number
  }

  interface PlaylistTag {
    parent_id: string
    sort: string
    tag_id: string
    tag_name: string
    son: Array<Omit<PlaylistTag, 'son'>>
  }

  interface TopAlbum {
    chn: Array<{ albumid: number; albumname: string; imgurl: string; singername: string }>
    eur: Array<{ albumid: number; albumname: string; imgurl: string; singername: string }>
    jpn: Array<{ albumid: number; albumname: string; imgurl: string; singername: string }>
    kor: Array<{ albumid: number; albumname: string; imgurl: string; singername: string }>
  }

  interface Playlist {
    list_create_gid: string
    list_create_listid: number
    list_create_username: string
    pic: string
    name: string
    count: number
    sort: number
    musiclib_tags: Array<{ tag_name: string }>
    is_def?: number
    is_pri: number
    type: number
  }

  interface PlaylistSong {
    fileid: number
    hash: string
    trans_param: { union_cover: string }
    name: string
    albuminfo: { name: string }
    timelen: number
    sort: number
    privilege: number
    download: Array<{ pay_type: number }>
  }
}
