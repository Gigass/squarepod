import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type LocalRepeatMode = 'off' | 'one' | 'all';
export type LocalMusicSourceMode = 'squarepod' | 'android' | 'all' | 'custom';
export type LocalMusicTrackSource = 'appFolder' | 'publicSquarePod' | 'mediaStore' | 'customFolder';

export interface LocalLyricLine {
  time: number;
  text: string;
}

export interface LocalMusicTrack {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  albumId?: string;
  genre?: string;
  duration: number;
  trackNumber: number;
  artworkUri?: string;
  lyrics?: LocalLyricLine[];
  source?: LocalMusicTrackSource;
  sourcePath?: string;
}

export interface LocalMusicCustomFolder {
  selected: boolean;
  uri: string;
  name: string;
  displayPath: string;
}

export interface LocalMusicLibrary {
  tracks: LocalMusicTrack[];
  musicDirectory: string;
  publicMusicDirectory?: string;
  sourceMode?: LocalMusicSourceMode;
  sourceCounts?: Partial<Record<LocalMusicTrackSource, number>>;
  customFolderUri?: string;
  customFolderName?: string;
  customFolderDisplayPath?: string;
  hasCustomFolder?: boolean;
}

export interface LocalMusicPlaybackState {
  state: 'stopped' | 'playing' | 'paused';
  isPlaying: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeatMode: LocalRepeatMode;
  index: number;
  queueLength: number;
  queue?: LocalMusicTrack[];
  track?: LocalMusicTrack;
}

export interface LocalMusicPlugin {
  scanLibrary(options?: { sourceMode?: LocalMusicSourceMode }): Promise<LocalMusicLibrary>;
  pickCustomFolder(): Promise<LocalMusicCustomFolder>;
  getCustomFolder(): Promise<LocalMusicCustomFolder>;
  clearCustomFolder(): Promise<LocalMusicCustomFolder>;
  playQueue(options: { tracks: LocalMusicTrack[]; startIndex?: number; shuffle?: boolean; repeatMode?: LocalRepeatMode }): Promise<LocalMusicPlaybackState>;
  play(): Promise<LocalMusicPlaybackState>;
  pause(): Promise<LocalMusicPlaybackState>;
  next(): Promise<LocalMusicPlaybackState>;
  previous(): Promise<LocalMusicPlaybackState>;
  seek(options: { position: number }): Promise<LocalMusicPlaybackState>;
  setShuffle(options: { enabled: boolean }): Promise<LocalMusicPlaybackState>;
  setRepeat(options: { mode: LocalRepeatMode }): Promise<LocalMusicPlaybackState>;
  setEq(options: { preset: string }): Promise<LocalMusicPlaybackState>;
  getState(): Promise<LocalMusicPlaybackState>;
  addListener(
    eventName: 'playbackState',
    listenerFunc: (state: LocalMusicPlaybackState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'playbackError',
    listenerFunc: (error: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const LocalMusic = registerPlugin<LocalMusicPlugin>('LocalMusic');
