import { AppTheme, DeviceMode, Song, MenuNode, PlaybackMode, SleepTimerEndAction } from './types';
import React from 'react';
import { Activity, BookOpen, Mic, PlayCircle, Film, Image as ImageIcon, Radio as RadioIcon, Settings, Shuffle, Clock, FileText, Calendar, Info, Volume2, RefreshCw, RotateCcw } from 'lucide-react';
import { LocalMusicSourceMode, LocalMusicTrack, LocalMusicTrackSource } from './native/localMusic';
import { MediaLibraryItem } from './native/mediaLibrary';
import { VoiceMemoItem } from './native/voiceMemos';
import { RadioStation, RadioStatus } from './native/radio';
import { AppleMusicPlaylist, AppleMusicSong } from './services/appleMusic';
import { SpotifyPlaylist, SpotifyPlaylistTrack, SpotifyShortcut, SpotifyTrack } from './services/spotify';
import { LOCALE_OPTIONS, Locale, localeLabel, normalizeLocale, t, text } from './i18n';
import { buildAlphaIndexedList } from './alphaIndex';
import whiteKnightBody from './ebooks/the-trail-of-the-white-knight.txt?raw';

const tx = (
  locale: Locale | string | undefined,
  en: string,
  zhCN: string,
  values: Record<string, string | number> = {},
) => text(locale, { en, 'zh-CN': zhCN }, values);

const countText = (
  locale: Locale,
  count: number,
  singular: string,
  plural: string,
  zhUnit: string,
) => locale === 'zh-CN'
  ? `${count} ${zhUnit}`
  : `${count} ${count === 1 ? singular : plural}`;

const unknownArtist = (locale: Locale) => tx(locale, 'Unknown Artist', '未知艺人');
const unknownAlbum = (locale: Locale) => tx(locale, 'Unknown Album', '未知专辑');
const unknownAuthor = (locale: Locale) => tx(locale, 'Unknown Author', '未知作者');

export const DUMMY_SONGS: Song[] = [
  {
    id: 's1',
    title: 'Neon Nights',
    artist: 'Synthwave Boy',
    album: 'Retro Future',
    duration: 214,
    coverUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 's2',
    title: 'Ocean Breeze',
    artist: 'Chill Vibes',
    album: 'Summer Hits',
    duration: 185,
    coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 's3',
    title: 'Urban Explorer',
    artist: 'The Striders',
    album: 'City Limits',
    duration: 250,
    coverUrl: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 's4',
    title: 'Midnight Drive',
    artist: 'Synthwave Boy',
    album: 'Retro Future',
    duration: 198,
    coverUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 's5',
    title: 'Sunset Boulevard',
    artist: 'The Striders',
    album: 'California Dreaming',
    duration: 210,
    coverUrl: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&q=80&w=400',
  }
];

export interface AppleMusicMenuState {
  status?: string;
  message?: string;
  hasUserToken?: boolean;
  defaultSearchTerm?: string;
  catalogResults?: AppleMusicSong[];
  libraryResults?: AppleMusicSong[];
  allMusic?: AppleMusicSong[];
  playlists?: AppleMusicPlaylist[];
  playlistTracks?: Record<string, AppleMusicSong[]>;
  lastSyncedAt?: number;
  usingCachedLibrary?: boolean;
  isSyncing?: boolean;
}

export interface SpotifyMenuState {
  status?: string;
  message?: string;
  connected?: boolean;
  spotifyInstalled?: boolean;
  clientId?: string;
  redirectUri?: string;
  shortcuts?: SpotifyShortcut[];
  playlists?: SpotifyPlaylist[];
  tracksByPlaylist?: Record<string, SpotifyPlaylistTrack[]>;
  allTracks?: SpotifyPlaylistTrack[];
  lastSyncedAt?: number;
  hasWebToken?: boolean;
  currentTrack?: SpotifyTrack;
  canPlayOnDemand?: boolean;
  isWorking?: boolean;
  isSyncing?: boolean;
}

export interface LocalMusicMenuState {
  status?: string;
  message?: string;
  tracks?: LocalMusicTrack[];
  musicDirectory?: string;
  publicMusicDirectory?: string;
  sourceMode?: LocalMusicSourceMode;
  sourceCounts?: Partial<Record<LocalMusicTrackSource, number>>;
  currentTrack?: LocalMusicTrack;
  continuationMode?: 'album' | 'library';
  isScanning?: boolean;
  uiSoundVolume?: number;
  autoScan?: boolean;
  playbackMode?: PlaybackMode;
  photos?: MediaLibraryItem[];
  videos?: MediaLibraryItem[];
  mediaStatus?: string;
  mediaMessage?: string;
  isMediaScanning?: boolean;
  radioStatus?: RadioStatus;
  radioStations?: RadioStation[];
  radioPresets?: RadioStation[];
  radioMessage?: string;
  isRadioWorking?: boolean;
  voiceMemos?: VoiceMemoItem[];
  voiceMemoStatus?: string;
  voiceMemoMessage?: string;
  isVoiceMemoRecording?: boolean;
  ebooks?: EbookEntry[];
  ebookImportStatus?: string;
  ebookImportMessage?: string;
  isEbookImporting?: boolean;
  workouts?: WorkoutEntry[];
  contacts?: ContactEntry[];
  notes?: NoteEntry[];
  noteDraft?: NoteEntry;
  calendarEvents?: CalendarEventEntry[];
  calendarFocusDate?: string;
  sleepTimer?: SleepTimerMenuState;
  mainMenuEnabled?: Record<string, boolean>;
  mainMenuOrder?: string[];
  mainMenuSettingsOrder?: string[];
  mainMenuReorderKey?: string;
  backlightTimer?: string;
  eqPreset?: string;
  compilationsEnabled?: boolean;
  language?: Locale;
  deviceMode?: DeviceMode;
  theme?: AppTheme;
}

export interface ContactEntry {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface NoteEntry {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  pinned?: boolean;
  attachedSongTitle?: string;
  attachedSongArtist?: string;
  isDraft?: boolean;
}

export interface CalendarEventEntry {
  id: string;
  date: string;
  time?: string;
  title: string;
  notes?: string;
  updatedAt: number;
}

export interface EbookEntry {
  id: string;
  title: string;
  author?: string;
  body: string;
  progress?: number;
  currentChapterIndex?: number;
  updatedAt: number;
}

export interface WorkoutEntry {
  id: string;
  title: string;
  date: string;
  notes?: string;
  updatedAt: number;
}

export const DEFAULT_EBOOKS: EbookEntry[] = [
  {
    id: 'gutenberg_78700_white_knight',
    title: 'The trail of the White Knight by Bruce Graeme',
    author: 'Bruce Graeme',
    updatedAt: 1778976000000,
    body: whiteKnightBody,
  },
  {
    id: 'demo_book_alice_wonderland',
    title: 'Alice in Wonderland',
    author: 'Lewis Carroll',
    updatedAt: 1711929600000,
    body: [
      '# Down the rabbit-hole',
      '',
      'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.',
      '',
      'Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it. "What is the use of a book," thought Alice, "without pictures or conversations?"',
      '',
      'So she was considering in her own mind whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.',
      '',
      'There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, "Oh dear! Oh dear! I shall be late!"',
      '',
      '# The hall of doors',
      '',
      'Alice found herself in a long, low hall, which was lit up by a row of lamps hanging from the roof.',
      '',
      'There were doors all round the hall, but they were all locked. Alice walked sadly down the middle, wondering how she was ever to get out again.',
      '',
      '# Reading note',
      '',
      'This public-domain excerpt is bundled as a SquarePod demo book so every fresh install has real reading content under Books.',
    ].join('\n'),
  },
];

export interface SleepTimerMenuState {
  status: 'off' | 'running' | 'completed';
  startedAt?: number;
  durationMs?: number;
  endAction: SleepTimerEndAction;
}

export const MAIN_MENU_ITEM_ORDER = [
  'music',
  'videos',
  'photos',
  'radio',
  'fitness',
  'voice_memos',
  'ebooks',
  'notes',
  'ex_clock',
  'ex_contacts',
  'ex_calendar',
  'ex_stopwatch',
  'ex_screen_lock',
  'shuffle_songs',
] as const;

export type MainMenuItemKey = typeof MAIN_MENU_ITEM_ORDER[number];

const DEFAULT_MAIN_MENU_ENABLED: Record<MainMenuItemKey, boolean> = {
  music: true,
  videos: true,
  photos: true,
  radio: true,
  fitness: true,
  voice_memos: true,
  ebooks: true,
  notes: true,
  ex_clock: false,
  ex_contacts: false,
  ex_calendar: false,
  ex_stopwatch: false,
  ex_screen_lock: false,
  shuffle_songs: true,
};

export const normalizeMainMenuOrder = (order?: string[]) => {
  const valid = new Set<string>(MAIN_MENU_ITEM_ORDER);
  const seen = new Set<string>();
  const normalized = (order || []).filter(key => {
    if (!valid.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [
    ...normalized,
    ...MAIN_MENU_ITEM_ORDER.filter(key => !seen.has(key)),
  ];
};

export const isMainMenuItemEnabled = (
  enabled: Record<string, boolean> | undefined,
  key: string,
) => enabled?.[key] ?? DEFAULT_MAIN_MENU_ENABLED[key as MainMenuItemKey] ?? false;

const songToMenuNode = (song: Song): MenuNode => ({
  id: `song_${song.id}`,
  title: song.title,
  type: 'nowPlaying',
});

const appleSongToMenuNode = (song: AppleMusicSong, source: 'catalog' | 'library'): MenuNode => ({
  id: `apple_${source}_${song.id}`,
  title: song.title,
  type: 'menu',
  previewImage: song.artworkUrl,
  appleMusicSongId: song.catalogId || song.id,
  appleMusicSong: song,
  detailLines: [
    song.artist,
    song.album,
    source === 'catalog' ? 'Catalog result' : 'In your Playlists',
  ],
});

const normalizedKeyText = (value: string | undefined, fallback: string) => (
  (value || fallback).trim().toLowerCase()
);

const knownAlbumArtistKey = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === '<unknown>' || normalized === 'unknown artist' || normalized === 'unknown album artist') return undefined;
  return normalized;
};

const uniqueDisplayValues = (values: Array<string | undefined>) => {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach(value => {
    const trimmed = value?.trim();
    const key = knownAlbumArtistKey(trimmed);
    if (!trimmed || !key || seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });

  return result;
};

const normalizeAlbumKey = (song: AppleMusicSong) => {
  const album = normalizedKeyText(song.album, 'Unknown Album');
  const albumArtist = knownAlbumArtistKey(song.albumArtist);
  return albumArtist ? `${album}|albumartist:${albumArtist}` : `album:${album}`;
};

const appleAlbumArtistLabel = (songs: AppleMusicSong[]) => {
  const albumArtists = uniqueDisplayValues(songs.map(song => song.albumArtist));
  if (albumArtists.length === 1) return albumArtists[0];
  const artists = uniqueDisplayValues(songs.map(song => song.artist));
  return artists.length === 1 ? artists[0] : 'Various Artists';
};

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const stableNodeId = (prefix: string, value: string) => `${prefix}_${stableHash(value || 'unknown')}`;

const normalizeLocalSourceMode = (mode?: LocalMusicSourceMode): LocalMusicSourceMode => (
  mode === 'android' || mode === 'all' ? mode : 'squarepod'
);

const librarySourceLabel = (mode: LocalMusicSourceMode | undefined, locale: Locale = 'en') => {
  switch (normalizeLocalSourceMode(mode)) {
    case 'android':
      return tx(locale, 'Android', 'Android');
    case 'all':
      return tx(locale, 'All', '全部');
    case 'squarepod':
    default:
      return 'SquarePod';
  }
};

const librarySourceDetail = (mode: LocalMusicSourceMode | undefined, locale: Locale = 'en') => {
  switch (normalizeLocalSourceMode(mode)) {
    case 'android':
      return tx(locale, 'Android media library only.', '仅 Android 媒体库。');
    case 'all':
      return tx(locale, 'SquarePod folders and Android media library.', 'SquarePod 文件夹和 Android 媒体库。');
    case 'squarepod':
    default:
      return tx(locale, 'SquarePod folders only.', '仅 SquarePod 音乐文件夹。');
  }
};

const normalizeLocalAlbumKey = (track: LocalMusicTrack, compilationsEnabled = true) => {
  const album = normalizedKeyText(track.album, 'Unknown Album');
  const albumArtist = knownAlbumArtistKey(track.albumArtist);

  if (track.albumId?.trim()) return `id:${track.albumId.trim().toLowerCase()}`;
  if (albumArtist) return `${album}|albumartist:${albumArtist}`;
  if (compilationsEnabled) return `album:${album}`;
  return `${album}|artist:${normalizedKeyText(track.artist, 'Unknown Artist')}`;
};

const localTrackToMenuNode = (track: LocalMusicTrack, locale: Locale = 'en'): MenuNode => ({
  id: stableNodeId('local_track', track.id || track.uri || `${track.title}|${track.artist}|${track.album}`),
  title: track.title || t(locale, 'title'),
  type: 'songDetail',
  previewImage: track.artworkUri,
  localTrack: track,
  detailLines: [
    track.artist || unknownArtist(locale),
    track.album || unknownAlbum(locale),
    tx(locale, 'Local audio file', '本地音频文件'),
  ],
});

const sortLocalTracks = (tracks: LocalMusicTrack[]) => [...tracks].sort((left, right) => {
  const artistSort = (left.artist || '').localeCompare(right.artist || '', undefined, { sensitivity: 'base' });
  if (artistSort) return artistSort;
  const albumSort = (left.album || '').localeCompare(right.album || '', undefined, { sensitivity: 'base' });
  if (albumSort) return albumSort;
  const trackSort = (left.trackNumber || 0) - (right.trackNumber || 0);
  if (trackSort) return trackSort;
  return (left.title || '').localeCompare(right.title || '', undefined, { sensitivity: 'base' });
});

const sortLocalAlbumTracks = (tracks: LocalMusicTrack[]) => [...tracks].sort((left, right) => {
  const leftTrack = left.trackNumber || Number.MAX_SAFE_INTEGER;
  const rightTrack = right.trackNumber || Number.MAX_SAFE_INTEGER;
  const trackSort = leftTrack - rightTrack;
  if (trackSort) return trackSort;
  return (left.title || '').localeCompare(right.title || '', undefined, { sensitivity: 'base' });
});

const localAlbumArtistLabel = (tracks: LocalMusicTrack[], locale: Locale) => {
  const albumArtists = uniqueDisplayValues(tracks.map(track => track.albumArtist));
  if (albumArtists.length === 1) return albumArtists[0];
  const artists = uniqueDisplayValues(tracks.map(track => track.artist));
  if (artists.length === 1) return artists[0];
  return tx(locale, 'Various Artists', '群星');
};

const generateLocalCoverFlowNode = (tracks: LocalMusicTrack[], locale: Locale, compilationsEnabled = true): MenuNode => {
  const albumMap = new Map<string, LocalMusicTrack[]>();

  sortLocalTracks(tracks).forEach(track => {
    const key = normalizeLocalAlbumKey(track, compilationsEnabled);
    const albumTracks = albumMap.get(key) || [];
    albumTracks.push(track);
    albumMap.set(key, albumTracks);
  });

  const albums = [...albumMap.entries()]
    .sort(([, left], [, right]) => {
      const albumSort = (left[0].album || '').localeCompare(right[0].album || '', undefined, { sensitivity: 'base' });
      return albumSort || (left[0].artist || '').localeCompare(right[0].artist || '', undefined, { sensitivity: 'base' });
    })
    .map(([key, albumTracks], index): MenuNode => {
      const sortedAlbumTracks = sortLocalAlbumTracks(albumTracks);
      const firstTrack = sortedAlbumTracks[0];
      const artworkTrack = sortedAlbumTracks.find(track => Boolean(track.artworkUri)) || firstTrack;

      return {
        id: stableNodeId('cover_album', key || String(index)),
        title: firstTrack.album || unknownAlbum(locale),
        type: 'menu',
        previewImage: artworkTrack.artworkUri,
        localAlbumKey: key,
        detailLines: [
          localAlbumArtistLabel(sortedAlbumTracks, locale),
          countText(locale, sortedAlbumTracks.length, 'song', 'songs', '首歌曲'),
        ],
        children: sortedAlbumTracks.map(track => localTrackToMenuNode(track, locale)),
      };
    });

  return {
    id: 'local_cover_flow',
    title: t(locale, 'coverFlow'),
    type: 'coverFlow',
    detailLines: albums.length
      ? [countText(locale, albums.length, 'album', 'albums', '张专辑'), tx(locale, 'Browse local albums.', '浏览本地专辑。')]
      : [t(locale, 'scanLocalMusicFirst')],
    children: albums,
  };
};

const groupLocalTracks = (
  tracks: LocalMusicTrack[],
  idPrefix: string,
  getKey: (track: LocalMusicTrack) => string,
  getTitle: (track: LocalMusicTrack) => string,
  locale: Locale,
  sortGroupTracks: (tracks: LocalMusicTrack[]) => LocalMusicTrack[] = sortLocalTracks,
): MenuNode[] => {
  const groups = new Map<string, LocalMusicTrack[]>();

  sortLocalTracks(tracks).forEach(track => {
    const key = getKey(track);
    const groupTracks = groups.get(key) || [];
    groupTracks.push(track);
    groups.set(key, groupTracks);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .map(([key, groupTracks]) => {
      const sortedGroupTracks = sortGroupTracks(groupTracks);
      return {
        id: stableNodeId(idPrefix, key),
        title: getTitle(sortedGroupTracks[0]),
        type: 'menu',
        previewImage: sortedGroupTracks.find(track => Boolean(track.artworkUri))?.artworkUri,
        detailLines: [countText(locale, sortedGroupTracks.length, 'song', 'songs', '首歌曲')],
        children: sortedGroupTracks.map(track => localTrackToMenuNode(track, locale)),
      };
    });
};

const generateLocalMusicChildren = (state: LocalMusicMenuState = {}): MenuNode[] => {
  const locale = normalizeLocale(state.language);
  const tracks = sortLocalTracks(state.tracks || []);
  const compilationsEnabled = state.compilationsEnabled !== false;
  const alphaSongs = buildAlphaIndexedList(tracks, track => track.title || t(locale, 'title'));
  const artistNodes = tracks.length
    ? groupLocalTracks(
        tracks,
        'local_artist',
        track => track.artist || unknownArtist(locale),
        track => track.artist || unknownArtist(locale),
        locale,
      )
    : [];
  const alphaArtists = buildAlphaIndexedList(artistNodes, node => node.title);
  const albumNodes = tracks.length
    ? groupLocalTracks(
        tracks,
        'local_album',
        track => normalizeLocalAlbumKey(track, compilationsEnabled),
        track => track.album || unknownAlbum(locale),
        locale,
        sortLocalAlbumTracks,
      )
    : [];
  const alphaAlbums = buildAlphaIndexedList(albumNodes, node => node.title);
  const statusTone = state.status === 'success' || state.status === 'ready'
    ? 'success'
    : state.status === 'error' || state.status === 'needsPermission' ? 'error' : 'warning';

  return [
    {
      id: 'now_playing_menu',
      title: t(locale, 'nowPlaying'),
      type: 'nowPlaying',
      detailLines: [
        state.currentTrack ? `${state.currentTrack.title} - ${state.currentTrack.artist}` : t(locale, 'noLocalSongPlaying'),
        t(locale, 'selectSwitchesPlaybackMode'),
      ],
    },
    generateLocalCoverFlowNode(tracks, locale, compilationsEnabled),
    {
      id: 'local_all_songs',
      title: t(locale, 'allSongs'),
      type: 'menu',
      detailLines: [
        countText(locale, tracks.length, 'local song', 'local songs', '首本地歌曲'),
        librarySourceDetail(state.sourceMode, locale),
      ],
      children: tracks.length
        ? alphaSongs.items.map(track => localTrackToMenuNode(track, locale))
        : [{
            id: 'local_no_all_songs',
            title: t(locale, 'noSongs'),
            type: 'localMusicStatus',
            statusTone: 'warning',
            detailLines: [t(locale, 'scanFirst')],
          }],
      alphaSections: tracks.length ? alphaSongs.sections : undefined,
    },
    {
      id: 'local_artists',
      title: t(locale, 'artists'),
      type: 'menu',
      children: tracks.length
        ? alphaArtists.items
        : [{
            id: 'local_no_artists',
            title: t(locale, 'noArtists'),
            type: 'localMusicStatus',
            statusTone: 'warning',
            detailLines: [t(locale, 'scanFirst')],
          }],
      alphaSections: tracks.length ? alphaArtists.sections : undefined,
    },
    {
      id: 'local_albums',
      title: t(locale, 'albums'),
      type: 'menu',
      children: tracks.length
        ? alphaAlbums.items
        : [{
            id: 'local_no_albums',
            title: t(locale, 'noAlbums'),
            type: 'localMusicStatus',
            statusTone: 'warning',
            detailLines: [t(locale, 'scanFirst')],
          }],
      alphaSections: tracks.length ? alphaAlbums.sections : undefined,
    },
    {
      id: 'local_scan',
      title: state.isScanning ? t(locale, 'scanning') : t(locale, 'scan'),
      type: 'localMusicStatus',
      action: 'local_music_scan',
      isLoading: state.isScanning,
      statusTone,
      detailLines: [
        state.message || tx(locale, 'Scan local audio files.', '扫描本地音频文件。'),
        countText(locale, tracks.length, 'song cached', 'songs cached', '首歌曲已缓存'),
        tx(locale, 'Source: {source}', '来源：{source}', { source: librarySourceLabel(state.sourceMode, locale) }),
        state.publicMusicDirectory
          ? tx(locale, 'Music folder: {path}', '音乐文件夹：{path}', { path: state.publicMusicDirectory })
          : state.musicDirectory
            ? tx(locale, 'App folder: {path}', '应用文件夹：{path}', { path: state.musicDirectory })
            : librarySourceDetail(state.sourceMode, locale),
      ],
    },
  ];
};

const generateCoverFlowNode = (songs: AppleMusicSong[]): MenuNode => {
  const albumMap = new Map<string, AppleMusicSong[]>();

  songs.forEach(song => {
    const key = normalizeAlbumKey(song);
    const albumSongs = albumMap.get(key) || [];
    albumSongs.push(song);
    albumMap.set(key, albumSongs);
  });

  const albums = [...albumMap.entries()]
    .sort((left, right) => {
      const albumSort = left[1][0].album.localeCompare(right[1][0].album, undefined, { sensitivity: 'base' });
      return albumSort || appleAlbumArtistLabel(left[1]).localeCompare(appleAlbumArtistLabel(right[1]), undefined, { sensitivity: 'base' });
    })
    .map(([key, albumSongs], index): MenuNode => {
      const firstSong = albumSongs[0];
      const artworkSong = albumSongs.find(song => Boolean(song.artworkUrl)) || firstSong;

      return {
        id: stableNodeId('cover_album', key || String(index)),
        title: firstSong.album,
        type: 'menu',
        previewImage: artworkSong.artworkUrl,
        detailLines: [
          appleAlbumArtistLabel(albumSongs),
          `${albumSongs.length} song${albumSongs.length === 1 ? '' : 's'}`,
        ],
        children: albumSongs.map(song => appleSongToMenuNode(song, 'library')),
      };
    });

  return {
    id: 'cover_flow',
    title: 'Cover Flow',
    type: 'coverFlow',
    detailLines: albums.length
      ? [`${albums.length} albums`, 'Browse synced playlist albums.']
      : ['Sync Apple Music first.'],
    children: albums,
  };
};

const applePlaylistToMenuNode = (
  playlist: AppleMusicPlaylist,
  playlistSongs: AppleMusicSong[] | undefined,
): MenuNode => ({
  id: `apple_playlist_${playlist.id}`,
  title: playlist.name,
  type: 'menu',
  previewImage: playlist.artworkUrl,
  appleMusicPlaylistId: playlist.id,
  detailLines: [
    playlist.description || 'Apple Music playlist',
    `${playlistSongs?.length ?? playlist.trackCount ?? 0} songs`,
  ],
  children: playlistSongs?.length
    ? playlistSongs.map(song => appleSongToMenuNode(song, 'library'))
    : [{
        id: `apple_playlist_${playlist.id}_empty`,
        title: 'No Songs',
        type: 'appleMusicStatus',
        detailLines: ['No songs returned for this playlist.'],
      }],
});

const generateAppleMusicChildren = (state: AppleMusicMenuState = {}): MenuNode[] => {
  const catalogResults = state.catalogResults || [];
  const allMusic = state.allMusic || [];
  const playlists = state.playlists || [];
  const playlistTracks = state.playlistTracks || {};
  const playlistTrackCount = Object.values(playlistTracks)
    .reduce((total, tracks) => total + tracks.length, 0);
  const defaultSearchTerm = state.defaultSearchTerm || 'Daft Punk';
  const syncLine = state.lastSyncedAt
    ? `${state.usingCachedLibrary ? 'Cached' : 'Synced'} ${new Date(state.lastSyncedAt).toLocaleString()}`
    : 'Not synced yet';
  const searchChildren: MenuNode[] = [
    {
      id: 'apple_search_catalog_run',
      title: 'Search Catalog',
      type: 'appleMusicStatus',
      action: 'apple_music_search_catalog',
      detailLines: [
        `Query: ${defaultSearchTerm}`,
        'Search Apple Music Catalog.',
      ],
    },
    {
      id: 'apple_catalog_results',
      title: 'Results',
      type: 'menu',
      children: catalogResults.length
        ? catalogResults.map(song => appleSongToMenuNode(song, 'catalog'))
        : [{ id: 'apple_no_catalog_results', title: 'No Results', type: 'appleMusicStatus', detailLines: ['Run Search Catalog first.'] }],
    },
  ];

  if (!state.hasUserToken) {
    return [
      {
        id: 'music_sign_in',
        title: 'Sign In',
        type: 'appleMusicStatus',
        action: 'apple_music_sign_in',
        statusTone: 'warning',
        detailLines: [
          'Apple Music sign-in is required.',
          'Select to start sign-in.',
          'Uses MusicKit for Android.',
          'Apple Music app must be installed and logged in.',
        ],
      },
      {
        id: 'apple_connection',
        title: 'Connection',
        type: 'appleMusicStatus',
        statusTone: state.status === 'success' ? 'success' : state.status === 'error' || state.status === 'needsConfig' ? 'error' : 'warning',
        detailLines: [
          state.message || 'Apple Music is not connected.',
          `Search: ${defaultSearchTerm}`,
          'User token: missing',
        ],
      },
    ];
  }

  return [
    {
      id: 'now_playing_menu',
      title: 'Now Playing',
      type: 'nowPlaying',
      detailLines: [
        state.message || 'Apple Music is connected.',
        'Select switches playback mode.',
      ],
    },
    generateCoverFlowNode(allMusic),
    {
      id: 'apple_all_songs',
      title: 'All Music',
      type: 'menu',
      children: allMusic.length
        ? allMusic.map(song => appleSongToMenuNode(song, 'library'))
        : [{ id: 'apple_no_library_results', title: 'No Songs', type: 'appleMusicStatus', detailLines: ['Run Sync first.'] }],
    },
    {
      id: 'apple_playlists',
      title: 'Playlists',
      type: 'menu',
      children: playlists.length
        ? playlists.map(playlist => applePlaylistToMenuNode(playlist, playlistTracks[playlist.id]))
        : [{ id: 'apple_no_playlists', title: 'No Playlists', type: 'appleMusicStatus', detailLines: ['Run Sync first.'] }],
    },
    {
      id: 'apple_favorite_current',
      title: 'Favorite',
      type: 'appleMusicStatus',
      action: 'apple_music_favorite_current',
      detailLines: [
        'Favorite the current song.',
        'Uses Apple Music favorites.',
      ],
    },
    {
      id: 'apple_search',
      title: 'Search',
      type: 'menu',
      children: searchChildren,
    },
    {
      id: 'apple_load_library',
      title: state.isSyncing ? 'Syncing...' : 'Sync',
      type: 'appleMusicStatus',
      action: 'apple_music_load_library',
      isLoading: state.isSyncing,
      statusTone: state.status === 'error' || state.status === 'needsConfig' ? 'error' : state.usingCachedLibrary ? 'warning' : 'neutral',
      detailLines: [
        state.isSyncing ? 'Refreshing playlists and tracks.' : 'Refresh playlists and playlist tracks.',
        `${allMusic.length} playlist songs`,
        `${playlists.length} playlists / ${playlistTrackCount} playlist tracks`,
        syncLine,
      ],
    },
  ];
};

export const generateAppleMusicMenu = (state: AppleMusicMenuState = {}): MenuNode => ({
  id: 'apple_music',
  title: 'Apple Music',
  type: 'menu',
  previewIcon: <PlayCircle className="w-16 h-16 text-red-500" />,
  children: generateAppleMusicChildren(state),
});

const spotifyShortcutToMenuNode = (shortcut: SpotifyShortcut): MenuNode => ({
  id: shortcut.id,
  title: shortcut.title,
  type: 'menu',
  spotifyUri: shortcut.uri,
  spotifyShortcut: shortcut,
  detailLines: [
    shortcut.subtitle || 'Spotify URI shortcut',
    shortcut.uri,
  ],
});

const spotifyTrackToMenuNode = (track: SpotifyTrack): MenuNode => ({
  id: `spotify_track_${track.uri.replace(/[^a-zA-Z0-9]+/g, '_')}`,
  title: track.title,
  type: 'menu',
  previewImage: track.artworkUrl,
  spotifyUri: track.uri,
  spotifyTrack: track,
  detailLines: [
    track.artist,
    track.album,
    'Current Spotify track',
  ],
});

const spotifyPlaylistTrackToMenuNode = (track: SpotifyPlaylistTrack): MenuNode => ({
  id: `spotify_playlist_track_${track.playlistId}_${track.position}_${track.uri.replace(/[^a-zA-Z0-9]+/g, '_')}`,
  title: track.title,
  type: 'menu',
  previewImage: track.artworkUrl,
  spotifyUri: track.uri,
  spotifyPlaylistTrack: track,
  spotifyTrack: track,
  detailLines: [
    track.artist,
    track.album,
    track.playlistName,
  ],
});

const spotifyPlaylistToMenuNode = (
  playlist: SpotifyPlaylist,
  tracks: SpotifyPlaylistTrack[] | undefined,
): MenuNode => ({
  id: `spotify_playlist_${playlist.id}`,
  title: playlist.name,
  type: 'menu',
  previewImage: playlist.imageUrl,
  spotifyUri: playlist.uri,
  spotifyPlaylist: playlist,
  detailLines: [
    playlist.ownerName ? `By ${playlist.ownerName}` : 'Spotify playlist',
    `${tracks?.length ?? playlist.trackTotal} songs`,
    playlist.description || playlist.uri,
  ],
  children: tracks?.length
    ? tracks.map(spotifyPlaylistTrackToMenuNode)
    : [{
        id: `spotify_playlist_${playlist.id}_empty`,
        title: 'No Songs',
        type: 'spotifyStatus',
        detailLines: ['Sync this playlist again.'],
      }],
});

const generateSpotifyCoverFlowNode = (
  playlists: SpotifyPlaylist[],
  tracksByPlaylist: Record<string, SpotifyPlaylistTrack[]>,
): MenuNode => ({
  id: 'spotify_cover_flow',
  title: 'Cover Flow',
  type: 'coverFlow',
  detailLines: playlists.length
    ? [`${playlists.length} playlists`, 'Browse synced Spotify playlists.']
    : ['Sync Spotify playlists first.'],
  children: playlists.map(playlist => spotifyPlaylistToMenuNode(playlist, tracksByPlaylist[playlist.id])),
});

const generateSpotifyChildren = (state: SpotifyMenuState = {}): MenuNode[] => {
  const shortcuts = state.shortcuts || [];
  const playlists = state.playlists || [];
  const tracksByPlaylist = state.tracksByPlaylist || {};
  const allTracks = state.allTracks || [];
  const needsConfig = !state.clientId || !state.spotifyInstalled;
  const syncLine = state.lastSyncedAt
    ? `Synced ${new Date(state.lastSyncedAt).toLocaleString()}`
    : 'Not synced yet';
  const statusTone = state.status === 'success' || state.status === 'ready'
    ? 'success'
    : state.status === 'error' || state.status === 'needsConfig' ? 'error' : 'warning';

  const connectionNodes: MenuNode[] = [
    {
      id: 'spotify_connect',
      title: state.connected ? 'Connected' : 'Connect',
      type: 'spotifyStatus',
      action: 'spotify_connect',
      isLoading: state.isWorking,
      statusTone,
      detailLines: [
        state.message || 'Connect to the local Spotify app.',
        state.spotifyInstalled ? 'Spotify app: installed' : 'Spotify app: missing',
        state.clientId ? 'Client ID: configured' : 'Client ID: missing',
      ],
    },
  ];

  if (needsConfig) {
    return [
      ...connectionNodes,
      {
        id: 'spotify_setup',
        title: 'Setup',
        type: 'spotifyStatus',
        statusTone: 'warning',
        detailLines: [
          'Install Spotify and set VITE_SPOTIFY_CLIENT_ID.',
          `Redirect URI: ${state.redirectUri || 'squarepod://spotify-callback'}`,
          'Whitelist package and SHA fingerprint in Spotify Dashboard.',
        ],
      },
    ];
  }

  return [
    {
      id: 'now_playing_menu',
      title: 'Now Playing',
      type: 'nowPlaying',
      detailLines: [
        state.connected ? 'Spotify remote is connected.' : 'Connect Spotify first.',
        'Select switches playback mode.',
      ],
    },
    ...connectionNodes,
    generateSpotifyCoverFlowNode(playlists, tracksByPlaylist),
    {
      id: 'spotify_all_songs',
      title: 'All Songs',
      type: 'menu',
      detailLines: [
        `${allTracks.length} cached songs`,
        'Unique tracks from synced playlists.',
      ],
      children: allTracks.length
        ? allTracks.map(spotifyPlaylistTrackToMenuNode)
        : [{
            id: 'spotify_no_all_songs',
            title: 'No Songs',
            type: 'spotifyStatus',
            detailLines: ['Run Sync first.'],
          }],
    },
    {
      id: 'spotify_current_track',
      title: 'Current Track',
      type: 'menu',
      children: state.currentTrack
        ? [spotifyTrackToMenuNode(state.currentTrack)]
        : [{
            id: 'spotify_no_current_track',
            title: 'No Track',
            type: 'spotifyStatus',
            detailLines: ['Start Spotify playback first.'],
          }],
    },
    {
      id: 'spotify_shortcuts',
      title: 'Shortcuts',
      type: 'menu',
      detailLines: [
        'Spotify playlist, album, artist, or track URIs.',
        'Set VITE_SPOTIFY_URIS to customize.',
      ],
      children: shortcuts.length
        ? shortcuts.map(spotifyShortcutToMenuNode)
        : [{
            id: 'spotify_no_shortcuts',
            title: 'No Shortcuts',
            type: 'spotifyStatus',
            detailLines: ['Set VITE_SPOTIFY_DEFAULT_URI or VITE_SPOTIFY_URIS.'],
          }],
    },
    {
      id: 'spotify_sync_library',
      title: state.isSyncing ? 'Syncing...' : 'Sync',
      type: 'spotifyStatus',
      action: 'spotify_sync_library',
      isLoading: state.isSyncing,
      statusTone: state.hasWebToken ? 'neutral' : 'warning',
      detailLines: [
        state.hasWebToken ? 'Refresh Spotify playlists and tracks.' : 'Sign in to Spotify Web API, then sync.',
        `${playlists.length} playlists`,
        `${allTracks.length} cached songs`,
        syncLine,
      ],
    },
    {
      id: 'spotify_capabilities',
      title: 'Account',
      type: 'spotifyStatus',
      statusTone: state.canPlayOnDemand ? 'success' : 'warning',
      detailLines: [
        state.canPlayOnDemand ? 'On-demand playback available.' : 'On-demand track playback may require Premium.',
        'Offline playback depends on Spotify app downloads.',
        'SquarePod does not cache Spotify audio.',
      ],
    },
  ];
};

export const generateSpotifyMenu = (spotify: SpotifyMenuState = {}): MenuNode => ({
  id: 'spotify',
  title: 'Spotify',
  type: 'menu',
  previewIcon: <PlayCircle className="w-16 h-16 text-green-500" />,
  children: generateSpotifyChildren(spotify),
});

export const generateMusicMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  return {
    id: 'music',
    title: t(locale, 'music'),
    type: 'menu',
    previewIcon: <PlayCircle className="w-16 h-16 text-green-500" />,
    children: generateLocalMusicChildren(local)
  };
};

const mediaItemToNode = (item: MediaLibraryItem, locale: Locale): MenuNode => ({
  id: item.id,
  title: item.title || (item.kind === 'photo' ? t(locale, 'photos') : t(locale, 'videos')),
  type: item.kind === 'photo' ? 'photoDetail' : 'videoDetail',
  previewImage: item.thumbnailUri || item.uri,
  mediaItem: item,
  detailLines: [
    item.bucket || 'Android MediaStore',
    item.kind === 'video' && item.duration ? tx(locale, '{count} sec', '{count} 秒', { count: Math.round(item.duration / 1000) }) : `${item.width || 0} x ${item.height || 0}`,
    item.mimeType || item.uri,
  ],
});

const generateVideosMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const videos = local.videos || [];
  const tone = local.mediaStatus === 'success'
    ? 'success'
    : local.mediaStatus === 'error' || local.mediaStatus === 'needsPermission' ? 'error' : 'warning';

  return {
    id: 'videos',
    title: t(locale, 'videos'),
    type: 'menu',
    previewIcon: <Film className="w-16 h-16 text-purple-500" />,
    detailLines: [countText(locale, videos.length, 'local video', 'local videos', '个本地视频'), local.mediaMessage || tx(locale, 'Reads Android MediaStore videos.', '读取 Android MediaStore 视频。')],
    children: [
      {
        id: 'v_all',
        title: t(locale, 'videos'),
        type: 'menu',
        previewImage: videos[0]?.thumbnailUri,
        detailLines: [
          countText(locale, videos.length, 'video', 'videos', '个视频'),
          videos[0]?.title ? tx(locale, 'Latest: {name}', '最新：{name}', { name: videos[0].title }) : local.mediaMessage || tx(locale, 'Open the local video library.', '打开本地视频库。'),
        ],
        children: videos.length
          ? videos.map(item => mediaItemToNode(item, locale))
          : [{
              id: 'v_no_videos',
              title: t(locale, 'noVideos'),
              type: 'localMusicStatus',
              statusTone: tone,
              detailLines: [local.mediaMessage || tx(locale, 'No local videos found.', '未找到本地视频。')],
            }],
      },
      {
        id: 'v_scan',
        title: local.isMediaScanning ? t(locale, 'scanning') : `${t(locale, 'scan')} ${t(locale, 'videos')}`,
        type: 'localMusicStatus',
        action: 'media_scan',
        isLoading: local.isMediaScanning,
        statusTone: tone,
        detailLines: [
          local.mediaMessage || tx(locale, 'Refresh Android image/video library.', '刷新 Android 图片/视频库。'),
          countText(locale, videos.length, 'video cached', 'videos cached', '个视频已缓存'),
        ],
      },
    ],
  };
};

const generatePhotosMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const photos = local.photos || [];
  const tone = local.mediaStatus === 'success'
    ? 'success'
    : local.mediaStatus === 'error' || local.mediaStatus === 'needsPermission' ? 'error' : 'warning';

  return {
    id: 'photos',
    title: t(locale, 'photos'),
    type: 'menu',
    previewIcon: <ImageIcon className="w-16 h-16 text-orange-500" />,
    detailLines: [countText(locale, photos.length, 'local photo', 'local photos', '张本地照片'), local.mediaMessage || tx(locale, 'Reads Android MediaStore images.', '读取 Android MediaStore 图片。')],
    children: [
      {
        id: 'p_library',
        title: t(locale, 'photoLibrary'),
        type: 'photoGrid',
        previewImage: photos[0]?.thumbnailUri || photos[0]?.uri,
        detailLines: [
          countText(locale, photos.length, 'photo', 'photos', '张照片'),
          photos[0]?.bucket ? tx(locale, 'Latest album: {name}', '最新相册：{name}', { name: photos[0].bucket }) : local.mediaMessage || tx(locale, 'Open the local photo grid.', '打开本地照片网格。'),
        ],
        children: photos.length
          ? photos.map(item => mediaItemToNode(item, locale))
          : [{
              id: 'p_no_photos',
              title: t(locale, 'noPhotos'),
              type: 'localMusicStatus',
              statusTone: tone,
              detailLines: [local.mediaMessage || tx(locale, 'No local photos found.', '未找到本地照片。')],
            }],
      },
      {
        id: 'p_scan',
        title: local.isMediaScanning ? t(locale, 'scanning') : `${t(locale, 'scan')} ${t(locale, 'photos')}`,
        type: 'localMusicStatus',
        action: 'media_scan',
        isLoading: local.isMediaScanning,
        statusTone: tone,
        detailLines: [
          local.mediaMessage || tx(locale, 'Refresh Android image/video library.', '刷新 Android 图片/视频库。'),
          countText(locale, photos.length, 'photo cached', 'photos cached', '张照片已缓存'),
        ],
      },
    ],
  };
};

const formatDurationMs = (duration = 0) => {
  const totalSeconds = Math.max(0, Math.round(duration / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const voiceMemoToNode = (memo: VoiceMemoItem, locale: Locale): MenuNode => ({
  id: `voice_memo_${memo.id}`,
  title: memo.title,
  type: 'menu',
  voiceMemoId: memo.id,
  detailLines: [
    formatDurationMs(memo.duration),
    new Date(memo.createdAt).toLocaleString(),
    memo.uri,
  ],
  children: [
    {
      id: `voice_memo_play_${memo.id}`,
      title: tx(locale, 'Play', '播放'),
      type: 'localMusicStatus',
      action: 'voice_memos_play',
      voiceMemoId: memo.id,
      statusTone: 'neutral',
      detailLines: [memo.title, formatDurationMs(memo.duration)],
    },
    {
      id: `voice_memo_delete_${memo.id}`,
      title: t(locale, 'delete'),
      type: 'localMusicStatus',
      action: 'voice_memos_delete',
      voiceMemoId: memo.id,
      statusTone: 'warning',
      detailLines: [memo.title],
    },
  ],
});

const generateVoiceMemosMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const memos = local.voiceMemos || [];
  const recording = Boolean(local.isVoiceMemoRecording);
  const latestMemo = [...memos].sort((left, right) => right.createdAt - left.createdAt)[0];
  return {
    id: 'voice_memos',
    title: tx(locale, 'Voice Memos', '语音备忘录'),
    type: 'menu',
    previewIcon: <Mic className="w-16 h-16 text-red-500" />,
    detailLines: [local.voiceMemoMessage || countText(locale, memos.length, 'voice memo', 'voice memos', '条语音备忘录'), recording ? tx(locale, 'Recording', '录音中') : tx(locale, 'Ready', '就绪')],
    children: [
      {
        id: 'voice_memos_record',
        title: recording ? tx(locale, 'Stop', '停止') : tx(locale, 'Record', '录音'),
        type: 'localMusicStatus',
        action: 'voice_memos_toggle_record',
        statusTone: recording ? 'error' : 'neutral',
        detailLines: [recording ? tx(locale, 'Recording now. Tap to stop and save.', '正在录音。再次轻点停止并保存。') : tx(locale, 'Tap once to record. Tap again to save.', '轻点开始录音，再次轻点保存。')],
      },
      latestMemo ? {
        id: 'voice_memos_latest',
        title: tx(locale, 'Latest Recording', '最新录音'),
        type: 'menu' as const,
        detailLines: [latestMemo.title, formatDurationMs(latestMemo.duration)],
        children: voiceMemoToNode(latestMemo, locale).children,
      } : {
        id: 'voice_memos_latest_empty',
        title: tx(locale, 'Latest Recording', '最新录音'),
        type: 'localMusicStatus' as const,
        statusTone: 'warning' as const,
        detailLines: [tx(locale, 'No saved recordings yet.', '还没有保存的录音。')],
      },
      {
        id: 'voice_memos_list',
        title: tx(locale, 'All Recordings', '全部录音'),
        type: 'menu',
        detailLines: [countText(locale, memos.length, 'memo', 'memos', '条录音')],
        children: memos.length
          ? [...memos].sort((left, right) => right.createdAt - left.createdAt).map(memo => voiceMemoToNode(memo, locale))
          : [{
              id: 'voice_memos_empty',
              title: tx(locale, 'No Voice Memos', '无语音备忘录'),
              type: 'localMusicStatus',
              statusTone: local.voiceMemoStatus === 'error' ? 'error' : 'warning',
              detailLines: [local.voiceMemoMessage || tx(locale, 'Record a memo first.', '请先录制一条备忘录。')],
            }],
      },
      {
        id: 'voice_memos_refresh',
        title: tx(locale, 'Sync Files', '同步文件'),
        type: 'localMusicStatus',
        action: 'voice_memos_refresh',
        statusTone: 'neutral',
        detailLines: [local.voiceMemoMessage || tx(locale, 'Reload voice memo files.', '重新载入语音备忘录文件。')],
      },
    ],
  };
};

interface EbookChapter {
  title: string;
  body: string;
  startRatio: number;
}

const splitEbookChapters = (body: string, locale: Locale): EbookChapter[] => {
  const lines = body.split(/\r?\n/);
  const chapters: Array<{ title: string; lines: string[]; startLine: number }> = [];
  let current: { title: string; lines: string[]; startLine: number } | undefined;

  lines.forEach((line, index) => {
    const heading = line.match(/^\s{0,3}#{1,3}\s+(.+?)\s*$/);
    if (heading) {
      if (current) chapters.push(current);
      current = { title: heading[1], lines: [], startLine: index };
      return;
    }
    if (!current) current = { title: tx(locale, 'Start', '开始'), lines: [], startLine: 0 };
    current.lines.push(line);
  });

  if (current) chapters.push(current);

  if (chapters.length <= 1) {
    const paragraphs = body.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    if (paragraphs.length <= 3) {
      return [{
        title: tx(locale, 'Start', '开始'),
        body,
        startRatio: 0,
      }];
    }
    const chunkSize = Math.ceil(paragraphs.length / Math.min(6, Math.ceil(paragraphs.length / 3)));
    return Array.from({ length: Math.ceil(paragraphs.length / chunkSize) }, (_, index) => {
      const start = index * chunkSize;
      return {
        title: tx(locale, 'Part {count}', '第 {count} 部分', { count: index + 1 }),
        body: paragraphs.slice(start, start + chunkSize).join('\n\n'),
        startRatio: start / Math.max(1, paragraphs.length),
      };
    });
  }

  return chapters.map(chapter => ({
    title: chapter.title,
    body: chapter.lines.join('\n').trim(),
    startRatio: chapter.startLine / Math.max(1, lines.length),
  }));
};

const ebookReaderNode = (ebook: EbookEntry, title: string, locale: Locale, chapterIndex?: number): MenuNode => ({
  id: `ebook_read_${ebook.id}_${chapterIndex ?? 'continue'}`,
  title,
  type: 'ebookReader',
  ebookId: ebook.id,
  ebookAuthor: ebook.author,
  ebookBody: ebook.body,
  ebookChapterIndex: chapterIndex,
  ebookProgress: ebook.progress,
  detailLines: [ebook.author || unknownAuthor(locale)],
});

const ebookToNode = (ebook: EbookEntry, locale: Locale): MenuNode => {
  const chapters = splitEbookChapters(ebook.body, locale);
  const progress = Math.round((ebook.progress || 0) * 100);

  return {
    id: `ebook_${ebook.id}`,
    title: ebook.title,
    type: 'menu',
    ebookId: ebook.id,
    detailLines: [
      ebook.author || unknownAuthor(locale),
      progress ? tx(locale, '{count}% read', '已读 {count}%', { count: progress }) : countText(locale, chapters.length, 'chapter', 'chapters', '章'),
      new Date(ebook.updatedAt).toLocaleString(),
    ],
    children: [
      ebookReaderNode(ebook, progress ? tx(locale, 'Continue ({count}%)', '继续阅读（{count}%）', { count: progress }) : tx(locale, 'Start Reading', '开始阅读'), locale),
      {
        id: `ebook_chapters_${ebook.id}`,
        title: tx(locale, 'Chapters', '章节'),
        type: 'menu',
        detailLines: [countText(locale, chapters.length, 'chapter', 'chapters', '章'), tx(locale, 'Open a chapter directly.', '直接打开章节。')],
        children: chapters.map((chapter, index) => ebookReaderNode(ebook, chapter.title, locale, index)),
      },
      {
        id: `ebook_info_${ebook.id}`,
        title: tx(locale, 'Book Details', '图书详情'),
        type: 'localMusicStatus',
        ebookId: ebook.id,
        detailLines: [
          ebook.author || unknownAuthor(locale),
          countText(locale, chapters.length, 'chapter', 'chapters', '章'),
          tx(locale, '{count} characters', '{count} 个字符', { count: ebook.body.length }),
          t(locale, 'updated', { date: new Date(ebook.updatedAt).toLocaleString() }),
        ],
      },
      {
        id: `ebook_edit_${ebook.id}`,
        title: tx(locale, 'Edit Text', '编辑文本'),
        type: 'localMusicStatus',
        action: 'ebook_edit',
        ebookId: ebook.id,
        detailLines: [tx(locale, 'Update title, author, or pasted text.', '更新标题、作者或粘贴文本。')],
      },
      {
        id: `ebook_delete_${ebook.id}`,
        title: t(locale, 'delete'),
        type: 'menu',
        ebookId: ebook.id,
        statusTone: 'warning',
        detailLines: [tx(locale, 'Select again to confirm delete.', '再次选择以确认删除。'), ebook.title],
        children: [{
          id: `ebook_delete_confirm_${ebook.id}`,
          title: tx(locale, 'Confirm Delete', '确认删除'),
          type: 'localMusicStatus' as const,
          action: 'ebook_delete_confirm' as const,
          ebookId: ebook.id,
          statusTone: 'warning' as const,
          detailLines: [tx(locale, 'This book and its reading progress will be removed.', '此图书及其阅读进度将被移除。')],
        }],
      },
    ],
  };
};

const generateEbooksMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const ebooks = local.ebooks || [];
  return {
    id: 'ebooks',
    title: tx(locale, 'Books', '图书'),
    type: 'menu',
    previewIcon: <BookOpen className="w-16 h-16 text-sky-600" />,
    detailLines: [local.ebookImportMessage || countText(locale, ebooks.length, 'book', 'books', '本书'), tx(locale, 'Import EPUB or plain text, then read with chapters and progress.', '导入 EPUB 或纯文本，并按章节和进度阅读。')],
    children: [
      {
        id: 'ebook_import',
        title: local.isEbookImporting ? tx(locale, 'Importing...', '导入中...') : tx(locale, 'Import Book File', '导入图书文件'),
        type: 'localMusicStatus',
        action: 'ebook_import',
        isLoading: local.isEbookImporting,
        statusTone: local.ebookImportStatus === 'error' ? 'error' : local.ebookImportStatus === 'success' ? 'success' : 'neutral',
        detailLines: [
          local.ebookImportMessage || tx(locale, 'Choose an EPUB, TXT, or Markdown file.', '选择 EPUB、TXT 或 Markdown 文件。'),
          tx(locale, 'EPUB chapters are extracted from the book file.', 'EPUB 章节会从图书文件中提取。'),
        ],
      },
      {
        id: 'ebook_add',
        title: tx(locale, 'Paste Book Text', '粘贴图书文本'),
        type: 'localMusicStatus',
        action: 'ebook_add',
        detailLines: [tx(locale, 'Add a title, author, and plain text. Use # headings for chapters.', '添加标题、作者和纯文本。使用 # 标题作为章节。')],
      },
      ...(ebooks.length ? ebooks.map(ebook => ebookToNode(ebook, locale)) : [{
        id: 'ebooks_empty',
        title: tx(locale, 'No Books', '无图书'),
        type: 'localMusicStatus' as const,
        statusTone: 'warning' as const,
        detailLines: [tx(locale, 'Paste a plain-text book first.', '请先粘贴一本纯文本图书。')],
      }]),
    ],
  };
};

const workoutToNode = (workout: WorkoutEntry, locale: Locale): MenuNode => ({
  id: `workout_${workout.id}`,
  title: workout.title,
  type: 'menu',
  workoutId: workout.id,
  detailLines: [workout.date, workout.notes || t(locale, 'noNotes')],
  children: [
    {
      id: `workout_edit_${workout.id}`,
      title: tx(locale, 'Edit', '编辑'),
      type: 'localMusicStatus',
      action: 'workout_edit',
      workoutId: workout.id,
      detailLines: [workout.title, workout.date],
    },
    {
      id: `workout_delete_${workout.id}`,
      title: t(locale, 'delete'),
      type: 'localMusicStatus',
      action: 'workout_delete',
      workoutId: workout.id,
      statusTone: 'warning',
      detailLines: [workout.title],
    },
  ],
});

const workoutSummaryLines = (workouts: WorkoutEntry[], locale: Locale) => {
  const today = todayInputValueFromDate(new Date());
  const lastSevenDays = Date.now() - 6 * 24 * 60 * 60 * 1000;
  const recentCount = workouts.filter(workout => new Date(`${workout.date}T00:00:00`).getTime() >= lastSevenDays).length;
  const todayCount = workouts.filter(workout => workout.date === today).length;
  const lastWorkout = [...workouts].sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt - left.updatedAt)[0];

  return [
    tx(locale, '{count} logged today', '今天记录 {count} 条', { count: todayCount }),
    tx(locale, '{count} in the last 7 days', '最近 7 天 {count} 条', { count: recentCount }),
    lastWorkout ? tx(locale, 'Last: {name} / {date}', '最近：{name} / {date}', { name: lastWorkout.title, date: lastWorkout.date }) : tx(locale, 'No workout history yet', '还没有健身记录'),
  ];
};

const generateFitnessMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const workouts = local.workouts || [];
  const sortedWorkouts = [...workouts].sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt - left.updatedAt);
  return {
    id: 'fitness',
    title: tx(locale, 'Fitness', '健身'),
    type: 'menu',
    previewIcon: <Activity className="w-16 h-16 text-emerald-600" />,
    detailLines: workoutSummaryLines(workouts, locale),
    children: [
      {
        id: 'workout_add',
        title: tx(locale, 'Log Workout', '记录健身'),
        type: 'localMusicStatus',
        action: 'workout_add',
        detailLines: [tx(locale, 'Record type, date, and notes.', '记录类型、日期和备注。')],
      },
      {
        id: 'workout_quick_walk',
        title: tx(locale, 'Quick: Walk', '快速：步行'),
        type: 'localMusicStatus',
        action: 'workout_add_walk',
        detailLines: [tx(locale, 'Preset title and today date. Add distance or time in notes.', '预设标题和今天日期，在备注中添加距离或时间。')],
      },
      {
        id: 'workout_quick_run',
        title: tx(locale, 'Quick: Run', '快速：跑步'),
        type: 'localMusicStatus',
        action: 'workout_add_run',
        detailLines: [tx(locale, 'Preset title and today date. Add distance or time in notes.', '预设标题和今天日期，在备注中添加距离或时间。')],
      },
      {
        id: 'workout_quick_strength',
        title: tx(locale, 'Quick: Strength', '快速：力量'),
        type: 'localMusicStatus',
        action: 'workout_add_strength',
        detailLines: [tx(locale, 'Preset title and today date. Add sets or focus in notes.', '预设标题和今天日期，在备注中添加组数或训练重点。')],
      },
      {
        id: 'workout_summary',
        title: tx(locale, 'Summary', '摘要'),
        type: 'localMusicStatus',
        statusTone: workouts.length ? 'success' : 'warning',
        detailLines: workoutSummaryLines(workouts, locale),
      },
      {
        id: 'workout_history',
        title: tx(locale, 'History', '历史'),
        type: 'menu',
        detailLines: [countText(locale, workouts.length, 'workout', 'workouts', '条健身记录')],
        children: workouts.length ? sortedWorkouts.map(workout => workoutToNode(workout, locale)) : [{
          id: 'workouts_empty',
          title: tx(locale, 'No Workouts', '无健身记录'),
          type: 'localMusicStatus' as const,
          statusTone: 'warning' as const,
          detailLines: [tx(locale, 'Log a workout first.', '请先记录一次健身。')],
        }],
      },
      ...(sortedWorkouts.slice(0, 3).map(workout => workoutToNode(workout, locale))),
      ...(!workouts.length ? [{
        id: 'workouts_empty',
        title: tx(locale, 'No Recent Workouts', '无最近健身记录'),
        type: 'localMusicStatus' as const,
        statusTone: 'warning' as const,
        detailLines: [tx(locale, 'Use Log Workout or a quick preset.', '使用记录健身或快速预设。')],
      }] : []),
    ],
  };
};

const radioTone = (status?: RadioStatus): 'neutral' | 'success' | 'warning' | 'error' => {
  if (!status) return 'warning';
  if (!status.wiredHeadsetConnected || !status.radioHardwareFeaturePresent || !status.radioBackendAvailable) return 'error';
  return status.isPlaying ? 'success' : 'neutral';
};

const radioStatusLines = (local: LocalMusicMenuState = {}) => {
  const locale = normalizeLocale(local.language);
  const status = local.radioStatus;
  return [
    status?.message || local.radioMessage || tx(locale, 'Checking radio hardware...', '正在检查收音机硬件...'),
    tx(locale, 'Wired headset: {value}', '有线耳机：{value}', { value: status?.wiredHeadsetConnected ? tx(locale, 'connected', '已连接') : tx(locale, 'required', '必需') }),
    tx(locale, 'Broadcast hardware: {value}', '广播硬件：{value}', { value: status?.radioHardwareFeaturePresent ? tx(locale, 'present', '存在') : tx(locale, 'missing', '缺失') }),
    tx(locale, 'Radio backend: {value}', '收音机后端：{value}', { value: status?.radioBackendAvailable ? tx(locale, 'available', '可用') : tx(locale, 'unavailable', '不可用') }),
  ];
};

const radioStationNode = (station: RadioStation, locale: Locale, preset = false): MenuNode => ({
  id: `${preset ? 'radio_preset' : 'radio_station'}_${station.frequency.toFixed(1).replace('.', '_')}`,
  title: station.title || `${station.frequency.toFixed(1)} MHz`,
  type: 'radioTune',
  action: 'radio_tune',
  radioFrequency: station.frequency,
  detailLines: [`${station.frequency.toFixed(1)} MHz`, preset ? tx(locale, 'Saved preset', '已保存预设') : tx(locale, 'Scanned station', '扫描到的电台')],
});

const generateRadioMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const status = local.radioStatus;
  const stations = local.radioStations || [];
  const presets = local.radioPresets || [];
  const frequency = status?.frequency;
  const tuneChildren: MenuNode[] = [
    { id: 'radio_manual_875', title: '87.5 MHz', type: 'radioTune', action: 'radio_tune', radioFrequency: 87.5 },
    { id: 'radio_manual_900', title: '90.0 MHz', type: 'radioTune', action: 'radio_tune', radioFrequency: 90.0 },
    { id: 'radio_manual_945', title: '94.5 MHz', type: 'radioTune', action: 'radio_tune', radioFrequency: 94.5 },
    { id: 'radio_manual_981', title: '98.1 MHz', type: 'radioTune', action: 'radio_tune', radioFrequency: 98.1 },
    { id: 'radio_manual_1067', title: '106.7 MHz', type: 'radioTune', action: 'radio_tune', radioFrequency: 106.7 },
  ];

  return {
    id: 'radio',
    title: t(locale, 'radio'),
    type: 'menu',
    previewIcon: <RadioIcon className="w-16 h-16 text-purple-600" />,
    detailLines: radioStatusLines(local),
    children: [
      {
        id: 'radio_now_playing',
        title: t(locale, 'nowPlaying'),
        type: 'radioNowPlaying',
        detailLines: radioStatusLines(local),
      },
      {
        id: 'radio_stations',
        title: t(locale, 'stations'),
        type: 'radioStationList',
        children: stations.length
          ? stations.map(station => radioStationNode(station, locale))
          : [{
              id: 'radio_no_stations',
              title: t(locale, 'noStations'),
              type: 'radioStatus',
              statusTone: radioTone(status),
              detailLines: [tx(locale, 'Run Scan Stations when a real backend is available.', '真实后端可用时运行扫描电台。')],
            }],
      },
      {
        id: 'radio_scan',
        title: local.isRadioWorking ? t(locale, 'scanning') : `${t(locale, 'scan')} ${t(locale, 'stations')}`,
        type: 'radioStatus',
        action: 'radio_scan',
        isLoading: local.isRadioWorking,
        statusTone: radioTone(status),
        detailLines: radioStatusLines(local),
      },
      {
        id: 'radio_manual_tune',
        title: t(locale, 'manualTune'),
        type: 'menu',
        children: tuneChildren,
      },
      {
        id: 'radio_presets',
        title: t(locale, 'presets'),
        type: 'menu',
        children: [
          {
            id: 'radio_save_preset',
            title: frequency ? `${t(locale, 'save')} ${frequency.toFixed(1)}` : t(locale, 'savePreset'),
            type: 'radioStatus',
            action: 'radio_save_preset',
            statusTone: radioTone(status),
            detailLines: frequency ? [`${t(locale, 'save')} ${frequency.toFixed(1)} MHz`] : [t(locale, 'tuneFrequencyFirst')],
          },
          ...(
            presets.length
              ? presets.flatMap(preset => [
                  radioStationNode(preset, locale, true),
                  {
                    id: `radio_delete_preset_${preset.frequency.toFixed(1).replace('.', '_')}`,
                    title: `${t(locale, 'delete')} ${preset.frequency.toFixed(1)}`,
                    type: 'radioStatus' as const,
                    action: 'radio_delete_preset' as const,
                    radioFrequency: preset.frequency,
                    detailLines: [`${t(locale, 'delete')} ${preset.frequency.toFixed(1)} MHz`],
                  },
                ])
              : [{
                  id: 'radio_no_presets',
                  title: t(locale, 'noPresets'),
                  type: 'radioStatus' as const,
                  statusTone: 'warning' as const,
                  detailLines: [tx(locale, 'Saved presets appear here.', '保存的预设会显示在这里。')],
                }]
          ),
        ],
      },
      {
        id: 'radio_status',
        title: `${t(locale, 'radio')} ${t(locale, 'status')}`,
        type: 'radioStatus',
        statusTone: radioTone(status),
        detailLines: radioStatusLines(local),
      },
    ],
  };
};

const formatPercent = (value = 0) => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

const playbackModeLabel = (mode: PlaybackMode = 'sequential', locale: Locale = 'en') => {
  switch (mode) {
    case 'shuffle':
      return t(locale, 'shuffle');
    case 'repeatAll':
      return t(locale, 'repeatAll');
    case 'repeatOne':
      return t(locale, 'repeatOne');
    case 'sequential':
    default:
      return t(locale, 'sequential');
  }
};

const enabledLabel = (enabled = true, locale: Locale = 'en') => enabled ? t(locale, 'on') : t(locale, 'off');

const backlightLabel = (value: string | undefined, locale: Locale) => (
  value === 'Always On' ? t(locale, 'alwaysOn') : value || t(locale, 'alwaysOn')
);

const deviceModeLabel = (mode: DeviceMode | undefined, locale: Locale) => {
  const touch = mode === 'nano6Touch';
  return touch ? tx(locale, 'iPod nano 6 Touch', 'iPod nano 6 触摸') : tx(locale, 'Click Wheel', '滚轮');
};

const themeLabel = (theme: AppTheme | undefined, locale: Locale) => (
  theme === 'dark' ? tx(locale, 'Dark', '深色') : tx(locale, 'Light', '浅色')
);

const generateMainMenuSettings = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const titles: Record<string, string> = {
    music: t(locale, 'music'),
    videos: t(locale, 'videos'),
    photos: t(locale, 'photos'),
    radio: t(locale, 'radio'),
    fitness: tx(locale, 'Fitness', '健身'),
    voice_memos: tx(locale, 'Voice Memos', '语音备忘录'),
    ebooks: tx(locale, 'Books', '图书'),
    notes: t(locale, 'notes'),
    ex_clock: t(locale, 'clock'),
    ex_contacts: t(locale, 'contacts'),
    ex_calendar: t(locale, 'calendar'),
    ex_stopwatch: t(locale, 'stopwatch'),
    ex_screen_lock: t(locale, 'screenLock'),
    shuffle_songs: t(locale, 'shuffleSongs'),
  };
  const order = normalizeMainMenuOrder(local.mainMenuSettingsOrder || local.mainMenuOrder);

  return {
    id: 'set_main_menu',
    title: t(locale, 'mainMenu'),
    type: 'menu',
    children: order.map(key => {
      const title = titles[key] || key;
      const enabled = isMainMenuItemEnabled(local.mainMenuEnabled, key);
      const reorderActive = local.mainMenuReorderKey === key;
      return {
      id: `set_main_menu_${key}`,
      title,
      type: 'localMusicStatus',
      action: 'settings_toggle_main_menu_item',
      settingKey: key,
      switchValue: enabled,
      reorderActive,
      statusTone: reorderActive ? 'success' : 'neutral',
      detailLines: [
        t(locale, 'visibilityControl', { name: title }),
        reorderActive ? t(locale, 'moveWithWheel') : t(locale, 'selectReorder'),
        reorderActive ? t(locale, 'selectApplyOrder') : t(locale, 'playPauseToggles'),
      ],
    } satisfies MenuNode;
    }),
  };
};

const generateContactsMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const contacts = local.contacts || [];
  return {
    id: 'ex_contacts',
    title: t(locale, 'contacts'),
    type: 'contactList',
    children: [
      {
        id: 'contact_add',
        title: t(locale, 'newContact'),
        type: 'localMusicStatus',
        action: 'contact_add',
        statusTone: 'neutral',
        detailLines: [tx(locale, 'Creates a local SquarePod contact.', '创建本地 SquarePod 联系人。')],
      },
      ...contacts.map(contact => ({
        id: `contact_${contact.id}`,
        title: contact.name,
        type: 'contactDetail' as const,
        contactId: contact.id,
        detailLines: [
          contact.phone || t(locale, 'noPhone'),
          contact.email || t(locale, 'noEmail'),
        ],
        children: [
          {
            id: `contact_edit_${contact.id}`,
            title: t(locale, 'editContact'),
            type: 'localMusicStatus' as const,
            action: 'contact_edit' as const,
            contactId: contact.id,
            statusTone: 'neutral' as const,
            detailLines: [t(locale, 'updateContact', { name: contact.name })],
          },
          {
            id: `contact_delete_${contact.id}`,
            title: t(locale, 'deleteContact'),
            type: 'localMusicStatus' as const,
            action: 'contact_delete' as const,
            contactId: contact.id,
            statusTone: 'warning' as const,
            detailLines: [`${t(locale, 'deleteContact')}: ${contact.name}`],
          },
        ],
      })),
    ],
  };
};

const sleepActionLabel = (action: SleepTimerEndAction, locale: Locale) => {
  switch (action) {
    case 'fadePause':
      return tx(locale, 'Fade Out + Pause', '淡出并暂停');
    case 'lock':
      return tx(locale, 'Lock Screen', '锁定屏幕');
    case 'pause':
    default:
      return tx(locale, 'Pause Playback', '暂停播放');
  }
};

const sleepRemainingMs = (timer?: SleepTimerMenuState) => {
  if (!timer || timer.status !== 'running' || !timer.startedAt || !timer.durationMs) return 0;
  return Math.max(0, timer.startedAt + timer.durationMs - Date.now());
};

const formatDurationLabel = (durationMs: number) => {
  const minutes = Math.round(durationMs / 60000);
  return `${minutes} min`;
};

const generateClockMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const timer = local.sleepTimer;
  const remaining = sleepRemainingMs(timer);
  const timerRunning = timer?.status === 'running';
  const timerCompleted = timer?.status === 'completed';
  const timerLines = timerRunning
    ? [tx(locale, '{count} min left', '剩余 {count} 分钟', { count: Math.ceil(remaining / 60000) }), tx(locale, 'Ends with: {action}', '结束时执行：{action}', { action: sleepActionLabel(timer.endAction, locale) })]
    : timerCompleted
      ? [tx(locale, 'Timer expired.', '定时器已结束。'), tx(locale, 'Ended with: {action}', '已执行：{action}', { action: sleepActionLabel(timer.endAction, locale) })]
      : [tx(locale, 'Select a duration.', '选择时长。'), tx(locale, 'Ends with: {action}', '结束时执行：{action}', { action: sleepActionLabel(timer?.endAction || 'pause', locale) })];

  return {
    id: 'ex_clock',
    title: t(locale, 'clock'),
    type: 'menu',
    previewIcon: <Clock className="w-16 h-16" />,
    detailLines: timerLines,
    children: [
      { id: 'clk_local', title: tx(locale, 'Local Time', '本地时间'), type: 'clock', detailLines: [tx(locale, 'Current device time.', '当前设备时间。')] },
      {
        id: timerRunning ? 'sleep_timer_running' : timerCompleted ? 'sleep_timer_completed' : 'sleep_timer',
        title: timerRunning ? tx(locale, 'Sleep Timer: On', '睡眠定时：开启') : timerCompleted ? tx(locale, 'Sleep Timer: Done', '睡眠定时：完成') : tx(locale, 'Sleep Timer', '睡眠定时'),
        type: 'clock',
        statusTone: timerRunning ? 'success' : timerCompleted ? 'warning' : 'neutral',
        detailLines: timerLines,
        sleepTimerDurationMs: timer?.durationMs,
        sleepTimerStartedAt: timer?.startedAt,
        children: [
          ...(timerRunning || timerCompleted ? [
            {
              id: 'sleep_timer_cancel',
              title: timerCompleted ? tx(locale, 'Clear Timer', '清除定时器') : tx(locale, 'Cancel Timer', '取消定时器'),
              type: 'localMusicStatus' as const,
              action: 'sleep_timer_cancel' as const,
              statusTone: 'warning' as const,
              detailLines: [tx(locale, 'Stop the timer without changing playback.', '停止定时器，不改变播放状态。')],
            },
            {
              id: 'sleep_timer_end_now',
              title: tx(locale, 'End Now', '立即结束'),
              type: 'localMusicStatus' as const,
              action: 'sleep_timer_end_now' as const,
              statusTone: 'warning' as const,
              detailLines: [tx(locale, 'Run action now: {action}.', '立即执行：{action}。', { action: sleepActionLabel(timer.endAction, locale) })],
            },
          ] : [
            ...[15, 30, 45, 60].map(minutes => ({
              id: `sleep_timer_${minutes}`,
              title: `${minutes} min`,
              type: 'localMusicStatus' as const,
              action: 'sleep_timer_start' as const,
              sleepTimerDurationMs: minutes * 60000,
              sleepTimerMode: 'duration' as const,
              statusTone: 'neutral' as const,
              detailLines: [tx(locale, 'Start a {count} minute sleep timer.', '启动 {count} 分钟睡眠定时器。', { count: minutes }), tx(locale, 'Ends with: {action}', '结束时执行：{action}', { action: sleepActionLabel(timer?.endAction || 'pause', locale) })],
            })),
          ]),
          {
            id: 'sleep_timer_action',
            title: tx(locale, 'End Action: {action}', '结束操作：{action}', { action: sleepActionLabel(timer?.endAction || 'pause', locale) }),
            type: 'localMusicStatus',
            action: 'sleep_timer_cycle_action',
            statusTone: 'neutral',
            detailLines: [tx(locale, 'Select cycles Pause / Fade Out + Pause / Lock Screen.', 'Select 循环切换暂停 / 淡出并暂停 / 锁定屏幕。')],
          },
        ],
      },
      { id: 'clk_stopwatch', title: t(locale, 'stopwatch'), type: 'stopwatch', detailLines: [tx(locale, 'Select to start, pause, or resume.', 'Select 开始、暂停或继续。')] },
      {
        id: 'world_clocks',
        title: tx(locale, 'World Clock', '世界时钟'),
        type: 'menu',
        detailLines: ['New York, London, Tokyo'],
        children: [
          { id: 'clk_new_york', title: 'New York', type: 'clock', detailLines: ['America/New_York'] },
          { id: 'clk_london', title: 'London', type: 'clock', detailLines: ['Europe/London'] },
          { id: 'clk_tokyo', title: 'Tokyo', type: 'clock', detailLines: ['Asia/Tokyo'] },
        ],
      },
    ],
  };
};

const generateNotesMenu = (local: LocalMusicMenuState = {}, id = 'notes'): MenuNode => {
  const locale = normalizeLocale(local.language);
  const draft = local.noteDraft;
  const notes = [...(local.notes || [])].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return right.updatedAt - left.updatedAt;
  });
  return {
    id,
    title: t(locale, 'notes'),
    type: 'noteList',
    previewIcon: <FileText className="w-16 h-16" />,
    children: [
      {
        id: 'note_quick',
        title: draft ? tx(locale, 'Continue Draft', '继续草稿') : tx(locale, 'Quick Note', '快速备忘录'),
        type: 'localMusicStatus',
        action: 'note_quick',
        statusTone: draft ? 'warning' : 'neutral',
        detailLines: draft ? [draft.title || tx(locale, 'Unsaved draft', '未保存草稿'), tx(locale, 'Select to continue.', 'Select 继续。')] : [tx(locale, 'Create a note, optionally attached to the current song.', '创建备忘录，可附加到当前歌曲。')],
      },
      {
        id: 'note_add',
        title: t(locale, 'newNote'),
        type: 'localMusicStatus',
        action: 'note_add',
        statusTone: 'neutral',
        detailLines: [tx(locale, 'Create a clean note without song context.', '创建不带歌曲上下文的空白备忘录。')],
      },
      ...(draft ? [{
        id: 'note_discard_draft',
        title: tx(locale, 'Discard Draft', '丢弃草稿'),
        type: 'localMusicStatus' as const,
        action: 'note_discard_draft' as const,
        statusTone: 'warning' as const,
        detailLines: [tx(locale, 'Delete the unsaved draft.', '删除未保存草稿。')],
      }] : []),
      ...notes.map(note => ({
        id: `note_${note.id}`,
        title: `${note.pinned ? '★ ' : ''}${note.title}`,
        type: 'noteDetail' as const,
        noteId: note.id,
        detailLines: [
          note.attachedSongTitle ? `${note.attachedSongArtist || t(locale, 'nowPlaying')} - ${note.attachedSongTitle}` : '',
          note.body,
          t(locale, 'updated', { date: new Date(note.updatedAt).toLocaleDateString() }),
        ].filter(Boolean),
        children: [
          {
            id: `note_edit_${note.id}`,
            title: t(locale, 'editNote'),
            type: 'localMusicStatus' as const,
            action: 'note_edit' as const,
            noteId: note.id,
            statusTone: 'neutral' as const,
            detailLines: [t(locale, 'updateNote', { name: note.title })],
          },
          {
            id: `note_delete_${note.id}`,
            title: t(locale, 'deleteNote'),
            type: 'noteDetail' as const,
            noteId: note.id,
            statusTone: 'warning' as const,
            detailLines: [tx(locale, 'Select again to confirm delete.', '再次选择以确认删除。'), note.title],
            children: [{
              id: `note_delete_confirm_${note.id}`,
              title: tx(locale, 'Confirm Delete', '确认删除'),
              type: 'localMusicStatus' as const,
              action: 'note_delete_confirm' as const,
              noteId: note.id,
              statusTone: 'warning' as const,
              detailLines: [tx(locale, 'This cannot be undone.', '此操作无法撤销。')],
            }],
          },
        ],
      })),
    ],
  };
};

const formatEventDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString();
};

const todayInputValueFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayKey = () => todayInputValueFromDate(new Date());

const calendarEventToNode = (event: CalendarEventEntry, locale: Locale): MenuNode => ({
  id: `calendar_event_${event.id}`,
  title: event.time ? `${event.time} ${event.title}` : event.title,
  type: 'calendarEventDetail',
  calendarEventId: event.id,
  calendarEventDate: event.date,
  calendarEventTime: event.time,
  detailLines: [
    formatEventDate(event.date),
    event.time || t(locale, 'allDay'),
    event.notes || t(locale, 'noNotes'),
    t(locale, 'updated', { date: new Date(event.updatedAt).toLocaleDateString() }),
  ],
  children: [
    {
      id: `calendar_event_edit_${event.id}`,
      title: t(locale, 'editEvent'),
      type: 'localMusicStatus',
      action: 'calendar_event_edit',
      calendarEventId: event.id,
      statusTone: 'neutral',
      detailLines: [t(locale, 'updateEvent', { name: event.title })],
    },
    {
      id: `calendar_event_delete_${event.id}`,
      title: t(locale, 'deleteEvent'),
      type: 'calendarEventDetail',
      calendarEventId: event.id,
      statusTone: 'warning',
      detailLines: [tx(locale, 'Select again to confirm delete.', '再次选择以确认删除。'), event.title],
      children: [{
        id: `calendar_event_delete_confirm_${event.id}`,
        title: tx(locale, 'Confirm Delete', '确认删除'),
        type: 'localMusicStatus',
        action: 'calendar_event_delete_confirm',
        calendarEventId: event.id,
        statusTone: 'warning',
        detailLines: [tx(locale, 'This cannot be undone.', '此操作无法撤销。')],
      }],
    },
  ],
});

const generateCalendarMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const now = local.calendarFocusDate ? new Date(`${local.calendarFocusDate}T00:00:00`) : new Date();
  const today = todayKey();
  const focusDate = todayInputValueFromDate(now);
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const allEvents = [...(local.calendarEvents || [])].sort((left, right) => {
    const dateSort = left.date.localeCompare(right.date);
    if (dateSort) return dateSort;
    return (left.time || '').localeCompare(right.time || '');
  });
  const monthEvents = allEvents.filter(event => event.date.startsWith(currentMonthPrefix));
  const todayEvents = allEvents.filter(event => event.date === focusDate);
  const upcomingEvents = allEvents.filter(event => event.date >= today).slice(0, 20);
  const eventNodes = monthEvents.map(event => calendarEventToNode(event, locale));

  return {
    id: 'ex_calendar',
    title: t(locale, 'calendar'),
    type: 'calendarEventList',
    previewIcon: <Calendar className="w-16 h-16" />,
    children: [
      {
        id: 'calendar_today',
        title: focusDate === today ? tx(locale, 'Today', '今天') : formatEventDate(focusDate),
        type: 'calendarEventList',
        calendarEventDate: focusDate,
        detailLines: todayEvents.length ? [countText(locale, todayEvents.length, 'event', 'events', '个日程'), tx(locale, 'Next/Previous changes day.', 'Next/Previous 切换日期。')] : [tx(locale, 'No events on this day.', '这一天没有日程。'), tx(locale, 'Long Select is not required: use New Event.', '无需长按 Select：使用新建日程。')],
        children: todayEvents.length
          ? todayEvents.map(event => calendarEventToNode(event, locale))
          : [{
              id: 'calendar_today_empty',
              title: t(locale, 'newEvent'),
              type: 'localMusicStatus',
              action: 'calendar_event_add',
              calendarEventDate: focusDate,
              detailLines: [tx(locale, 'Create an event for this day.', '为这一天创建日程。')],
            }],
      },
      {
        id: 'calendar_upcoming',
        title: tx(locale, 'Upcoming', '即将到来'),
        type: 'calendarEventList',
        detailLines: upcomingEvents.length ? [tx(locale, '{count} upcoming events', '{count} 个即将到来的日程', { count: upcomingEvents.length })] : [tx(locale, 'No upcoming events.', '没有即将到来的日程。')],
        children: upcomingEvents.length
          ? upcomingEvents.map(event => calendarEventToNode(event, locale))
          : [{
              id: 'calendar_upcoming_empty',
              title: t(locale, 'newEvent'),
              type: 'localMusicStatus',
              action: 'calendar_event_add',
              detailLines: [tx(locale, 'Create the next event.', '创建下一个日程。')],
            }],
      },
      {
        id: 'calendar_event_add',
        title: t(locale, 'newEvent'),
        type: 'localMusicStatus',
        action: 'calendar_event_add',
        statusTone: 'neutral',
        detailLines: [tx(locale, 'Creates a local SquarePod calendar event.', '创建本地 SquarePod 日程。')],
      },
      {
        id: 'calendar_month',
        title: t(locale, 'monthView'),
        type: 'calendar',
        calendarEventDate: focusDate,
        detailLines: monthEvents.length
          ? [t(locale, 'eventsThisMonth', { count: monthEvents.length, plural: monthEvents.length === 1 ? '' : 's' }), tx(locale, 'Next/Previous changes month.', 'Next/Previous 切换月份。')]
          : [t(locale, 'noEventsThisMonth')],
        children: eventNodes,
      },
    ],
  };
};

const generateSettingsMenu = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const trackCount = local.tracks?.length || 0;
  const compilationsEnabled = local.compilationsEnabled !== false;
  const albumCount = new Set((local.tracks || []).map(track => normalizeLocalAlbumKey(track, compilationsEnabled))).size;
  const artistCount = new Set((local.tracks || []).map(track => track.artist || 'Unknown Artist')).size;

  return {
    id: 'settings',
    title: t(locale, 'settings'),
    type: 'menu',
    previewIcon: <Settings className="w-16 h-16 text-gray-400" />,
    children: [
      {
        id: 'set_mode_nano6',
        title: tx(locale, 'Nano6 Mode', 'Nano6 模式'),
        type: 'localMusicStatus',
        action: 'settings_set_device_mode',
        settingKey: 'nano6Touch',
        statusTone: local.deviceMode === 'nano6Touch' ? 'success' : 'neutral',
        detailLines: [
          deviceModeLabel('nano6Touch', locale),
          local.deviceMode === 'nano6Touch'
            ? tx(locale, 'Current active mode.', '当前正在使用。')
            : tx(locale, 'Select to switch immediately.', '选择后立即切换。'),
        ],
      },
      {
        id: 'set_mode_classic',
        title: tx(locale, 'Classic Mode', 'Classic 模式'),
        type: 'localMusicStatus',
        action: 'settings_set_device_mode',
        settingKey: 'clickWheel',
        statusTone: local.deviceMode === 'clickWheel' ? 'success' : 'neutral',
        detailLines: [
          deviceModeLabel('clickWheel', locale),
          local.deviceMode === 'clickWheel'
            ? tx(locale, 'Current active mode.', '当前正在使用。')
            : tx(locale, 'Select to switch immediately.', '选择后立即切换。'),
        ],
      },
      {
        id: 'set_about',
        title: t(locale, 'about'),
        type: 'about',
        previewIcon: <Info className="w-16 h-16" />,
        detailLines: [
          'Version: V1.8',
          'Devices: Nano6 + Classic',
          `${t(locale, 'allSongs')}: ${trackCount}`,
          `${t(locale, 'artists')}: ${artistCount}`,
          `${t(locale, 'albums')}: ${albumCount}`,
          'Platform: Android',
        ],
      },
      {
        id: 'set_language',
        title: `${t(locale, 'language')}: ${localeLabel(locale)}`,
        type: 'menu',
        children: LOCALE_OPTIONS.map(option => ({
          id: `set_language_${option.code}`,
          title: option.nativeLabel,
          type: 'localMusicStatus' as const,
          action: 'settings_set_language' as const,
          settingKey: option.code,
          statusTone: option.code === locale ? 'success' as const : 'neutral' as const,
          detailLines: [option.label],
        })),
      },
      generateMainMenuSettings(local),
      {
        id: 'set_playback',
        title: t(locale, 'playback'),
        type: 'menu',
        children: [
          {
            id: 'set_playback_mode',
            title: `${t(locale, 'playbackMode')}: ${playbackModeLabel(local.playbackMode, locale)}`,
            type: 'localMusicStatus',
            action: 'settings_cycle_playback_mode',
            statusTone: 'neutral',
            detailLines: [
              playbackModeLabel(local.playbackMode, locale),
              `${t(locale, 'sequential')} / ${t(locale, 'shuffle')} / ${t(locale, 'repeatAll')} / ${t(locale, 'repeatOne')}`,
            ],
          },
          {
            id: 'set_continuation',
            title: `${t(locale, 'continuePlayback')}: ${local.continuationMode === 'album' ? t(locale, 'album') : t(locale, 'library')}`,
            type: 'localMusicStatus',
            action: 'local_toggle_continuation',
            statusTone: 'neutral',
            detailLines: [
              local.continuationMode === 'album' ? t(locale, 'album') : t(locale, 'library'),
              `${t(locale, 'album')} / ${t(locale, 'library')}`,
            ],
          },
          {
            id: 'set_eq',
            title: `${t(locale, 'eq')}: ${local.eqPreset || t(locale, 'off')}`,
            type: 'localMusicStatus',
            action: 'settings_cycle_eq',
            statusTone: 'neutral',
            detailLines: [
              `${t(locale, 'eq')}: ${local.eqPreset || t(locale, 'off')}`,
              `${t(locale, 'off')} / Bass Boost / Treble Boost / Spoken Word`,
            ],
          },
        ],
      },
      {
        id: 'set_interface',
        title: t(locale, 'interfaceSettings'),
        type: 'menu',
        children: [
          {
            id: 'set_theme',
            title: `${tx(locale, 'Theme', '主题')}: ${themeLabel(local.theme, locale)}`,
            type: 'localMusicStatus',
            action: 'settings_toggle_theme',
            switchValue: local.theme === 'dark',
            statusTone: 'neutral',
            detailLines: [
              `${tx(locale, 'Theme', '主题')}: ${themeLabel(local.theme, locale)}`,
              local.theme === 'dark'
                ? tx(locale, 'Classic U2-style black body and red click wheel.', 'Classic U2 风格黑色机身与红色滚轮。')
                : tx(locale, 'Classic white body and white click wheel.', 'Classic 白色机身与白色滚轮。'),
            ],
          },
          {
            id: 'set_click_sound',
            title: `${t(locale, 'clickSound')}: ${formatPercent(local.uiSoundVolume ?? 1)}`,
            type: 'localMusicStatus',
            action: 'settings_cycle_click_sound',
            previewIcon: <Volume2 className="w-16 h-16" />,
            statusTone: 'neutral',
            detailLines: [
              `${t(locale, 'clickSound')}: ${formatPercent(local.uiSoundVolume ?? 1)}`,
              `${t(locale, 'off')} / 25 / 50 / 75 / 100`,
            ],
          },
          {
            id: 'set_backlight',
            title: `${t(locale, 'backlight')}: ${backlightLabel(local.backlightTimer, locale)}`,
            type: 'localMusicStatus',
            action: 'settings_cycle_backlight',
            statusTone: 'neutral',
            detailLines: [
              `${t(locale, 'backlight')}: ${backlightLabel(local.backlightTimer, locale)}`,
              `30s / 1m / 2m / ${t(locale, 'alwaysOn')}`,
            ],
          },
        ],
      },
      {
        id: 'set_library',
        title: t(locale, 'librarySettings'),
        type: 'menu',
        children: [
          {
            id: 'set_library_source',
            title: `${tx(locale, 'Library Source', '资料库来源')}: ${librarySourceLabel(local.sourceMode, locale)}`,
            type: 'localMusicStatus',
            action: 'settings_cycle_library_source',
            statusTone: normalizeLocalSourceMode(local.sourceMode) === 'squarepod' ? 'success' : 'warning',
            detailLines: [
              librarySourceDetail(local.sourceMode, locale),
              'SquarePod / Android / All',
            ],
          },
          {
            id: 'set_auto_scan',
            title: `${t(locale, 'autoScan')}: ${enabledLabel(local.autoScan !== false, locale)}`,
            type: 'localMusicStatus',
            action: 'settings_toggle_auto_scan',
            previewIcon: <RefreshCw className="w-16 h-16" />,
            switchValue: local.autoScan !== false,
            statusTone: 'neutral',
            detailLines: [
              `${t(locale, 'autoScan')}: ${enabledLabel(local.autoScan !== false, locale)}`,
              `${t(locale, 'on')} / ${t(locale, 'off')}`,
            ],
          },
          {
            id: 'set_compilations',
            title: `${t(locale, 'compilations')}: ${enabledLabel(local.compilationsEnabled, locale)}`,
            type: 'localMusicStatus',
            action: 'settings_toggle_compilations',
            switchValue: local.compilationsEnabled !== false,
            statusTone: 'neutral',
            detailLines: [
              `${t(locale, 'compilations')}: ${enabledLabel(local.compilationsEnabled, locale)}`,
              `${t(locale, 'on')} / ${t(locale, 'off')}`,
            ],
          },
        ],
      },
      {
        id: 'set_legal',
        title: t(locale, 'legal'),
        type: 'legal',
        detailLines: [
          'SquarePod',
          'Apple Music / Spotify',
          'FM Radio',
        ],
      },
      {
        id: 'set_reset',
        title: t(locale, 'resetAppSettings'),
        type: 'localMusicStatus',
        action: 'settings_reset',
        previewIcon: <RotateCcw className="w-16 h-16" />,
        statusTone: 'warning',
        detailLines: [
          t(locale, 'resetAppSettings'),
          t(locale, 'music'),
        ],
      },
    ],
  };
};

export const generateMenuRoot = (local: LocalMusicMenuState = {}): MenuNode => {
  const locale = normalizeLocale(local.language);
  const configurableItems: Record<string, MenuNode> = {
    music: generateMusicMenu(local),
    videos: generateVideosMenu(local),
    photos: generatePhotosMenu(local),
    radio: generateRadioMenu(local),
    fitness: generateFitnessMenu(local),
    voice_memos: generateVoiceMemosMenu(local),
    ebooks: generateEbooksMenu(local),
    notes: generateNotesMenu(local),
    ex_clock: generateClockMenu(local),
    ex_contacts: generateContactsMenu(local),
    ex_calendar: generateCalendarMenu(local),
    ex_stopwatch: { id: 'ex_stopwatch', title: t(locale, 'stopwatch'), type: 'stopwatch' },
    ex_screen_lock: { id: 'ex_screen_lock', title: t(locale, 'screenLock'), type: 'screenLock', action: 'screen_lock' },
    shuffle_songs: {
      id: 'shuffle_songs',
      title: t(locale, 'shuffleSongs'),
      type: 'localMusicStatus',
      action: 'player_shuffle_all',
      previewIcon: <Shuffle className="w-16 h-16 text-green-500" />,
      detailLines: ['Shuffle all local songs.'],
    },
  };
  const order = normalizeMainMenuOrder(local.mainMenuOrder);
  const enabledItems = order
    .filter(key => isMainMenuItemEnabled(local.mainMenuEnabled, key))
    .map(key => configurableItems[key])
    .filter((item): item is MenuNode => Boolean(item));
  const extrasChildren = order
    .filter(key => !isMainMenuItemEnabled(local.mainMenuEnabled, key))
    .map(key => configurableItems[key])
    .filter((item): item is MenuNode => Boolean(item));

  return {
    id: 'root',
    title: 'iPod',
    type: 'menu',
    children: [
      ...enabledItems,
      {
        id: 'extras',
        title: t(locale, 'extras'),
        type: 'menu',
        children: extrasChildren,
      },
      generateSettingsMenu(local),
    ],
  };
};

export const MENU_ROOT: MenuNode = generateMenuRoot();
