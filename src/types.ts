import React from 'react';
import { AppleMusicSong } from './services/appleMusic';
import { LocalLyricLine, LocalMusicTrack } from './native/localMusic';
import { MediaLibraryItem } from './native/mediaLibrary';
import { SpotifyPlaylist, SpotifyPlaylistTrack, SpotifyShortcut, SpotifyTrack } from './services/spotify';

export type ShuffleMode = 'off' | 'songs';
export type PlaybackMode = 'sequential' | 'shuffle' | 'repeatAll' | 'repeatOne';
export type DeviceMode = 'clickWheel' | 'nano6Touch';
export type EditorKind = 'note' | 'contact' | 'calendarEvent' | 'ebook' | 'workout';
export type EditorMode = 'create' | 'edit';
export type EditorFieldKey = 'title' | 'body' | 'name' | 'phone' | 'email' | 'date' | 'time' | 'notes';
export type EditorFields = Partial<Record<EditorFieldKey, string>>;
export type SleepTimerEndAction = 'pause' | 'fadePause' | 'lock';
export type SleepTimerMode = 'duration' | 'song' | 'album' | 'queue';

export interface TextEditorState {
  kind: EditorKind;
  mode: EditorMode;
  id?: string;
  fields: EditorFields;
  error?: string;
}

export type MenuNodeType = 'menu' | 'coverFlow' | 'nowPlaying' | 'songDetail' | 'videos' | 'videoDetail' | 'photoGrid' | 'photoDetail' | 'photos' | 'radioStatus' | 'radioNowPlaying' | 'radioStationList' | 'radioTune' | 'settings' | 'about' | 'clock' | 'calendar' | 'calendarEventList' | 'calendarEventDetail' | 'stopwatch' | 'contactList' | 'contactDetail' | 'noteList' | 'noteDetail' | 'ebookReader' | 'textEditor' | 'screenLock' | 'legal' | 'appleMusicStatus' | 'spotifyStatus' | 'localMusicStatus' | 'placeholder';

export type MenuAction =
  | 'apple_music_sign_in'
  | 'apple_music_load_library'
  | 'apple_music_search_catalog'
  | 'apple_music_favorite_current'
  | 'spotify_connect'
  | 'spotify_sync_library'
  | 'spotify_play_default'
  | 'local_music_scan'
  | 'local_toggle_continuation'
  | 'player_shuffle_all'
  | 'settings_cycle_click_sound'
  | 'settings_cycle_device_mode'
  | 'settings_set_device_mode'
  | 'settings_toggle_auto_scan'
  | 'settings_cycle_playback_mode'
  | 'settings_reset'
  | 'media_scan'
  | 'radio_scan'
  | 'radio_tune'
  | 'radio_seek_up'
  | 'radio_seek_down'
  | 'radio_start'
  | 'radio_stop'
  | 'radio_save_preset'
  | 'radio_delete_preset'
  | 'voice_memos_refresh'
  | 'voice_memos_toggle_record'
  | 'voice_memos_play'
  | 'voice_memos_delete'
  | 'ebook_import'
  | 'ebook_add'
  | 'ebook_edit'
  | 'ebook_delete'
  | 'ebook_delete_confirm'
  | 'workout_add'
  | 'workout_add_walk'
  | 'workout_add_run'
  | 'workout_add_strength'
  | 'workout_edit'
  | 'workout_delete'
  | 'contact_add'
  | 'contact_edit'
  | 'contact_delete'
  | 'note_add'
  | 'note_quick'
  | 'note_discard_draft'
  | 'note_edit'
  | 'note_delete'
  | 'note_delete_confirm'
  | 'calendar_event_add'
  | 'calendar_event_edit'
  | 'calendar_event_delete'
  | 'calendar_event_delete_confirm'
  | 'sleep_timer_start'
  | 'sleep_timer_cancel'
  | 'sleep_timer_end_now'
  | 'sleep_timer_cycle_action'
  | 'editor_save'
  | 'editor_cancel'
  | 'settings_toggle_main_menu_item'
  | 'settings_cycle_backlight'
  | 'settings_cycle_eq'
  | 'settings_toggle_compilations'
  | 'settings_cycle_language'
  | 'settings_set_language'
  | 'screen_lock'
  | 'screen_unlock';

export interface MenuNode {
  id: string;
  title: string;
  type: MenuNodeType;
  children?: MenuNode[];
  alphaSections?: AlphaSection[];
  previewIcon?: React.ReactNode;
  previewImage?: string;
  action?: MenuAction;
  detailLines?: string[];
  appleMusicSongId?: string;
  appleMusicSong?: AppleMusicSong;
  appleMusicPlaylistId?: string;
  localTrack?: LocalMusicTrack;
  localQueue?: LocalMusicTrack[];
  localQueueIndex?: number;
  localAlbumKey?: string;
  mediaQueue?: MenuNode[];
  mediaQueueIndex?: number;
  mediaItem?: MediaLibraryItem;
  radioFrequency?: number;
  settingKey?: string;
  switchValue?: boolean;
  reorderActive?: boolean;
  contactId?: string;
  noteId?: string;
  calendarEventId?: string;
  calendarEventDate?: string;
  calendarEventTime?: string;
  sleepTimerDurationMs?: number;
  sleepTimerStartedAt?: number;
  sleepTimerMode?: SleepTimerMode;
  spotifyUri?: string;
  spotifyPlaylist?: SpotifyPlaylist;
  spotifyPlaylistTrack?: SpotifyPlaylistTrack;
  spotifyShortcut?: SpotifyShortcut;
  spotifyTrack?: SpotifyTrack;
  voiceMemoId?: string;
  ebookId?: string;
  ebookAuthor?: string;
  ebookBody?: string;
  ebookChapterIndex?: number;
  ebookProgress?: number;
  workoutId?: string;
  statusTone?: 'neutral' | 'success' | 'warning' | 'error';
  isLoading?: boolean;
}

export interface AlphaSection {
  key: string;
  startIndex: number;
  count: number;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  coverUrl: string;
  url?: string;
  lyrics?: LocalLyricLine[];
  appleMusicSong?: AppleMusicSong;
  localTrack?: LocalMusicTrack;
  spotifyTrack?: SpotifyTrack;
}
