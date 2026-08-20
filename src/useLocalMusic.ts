import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useState } from 'react';
import { LocalMusic, LocalMusicPlaybackState, LocalMusicSourceMode, LocalMusicTrack, LocalMusicTrackSource, LocalRepeatMode } from './native/localMusic';
import { PlaybackMode, ShuffleMode, Song } from './types';

export type LocalMusicStatus = 'idle' | 'working' | 'ready' | 'needsPermission' | 'error' | 'success';

const CACHE_KEY = 'squarepod.localMusicLibrary.v3';
const FALLBACK_COVER = 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&q=80&w=400';
const WEB_PREVIEW_SEED_PATH = '/dev-local-music-seed.json';

interface LocalMusicCacheV3 {
  version: 3;
  sourceMode: LocalMusicSourceMode;
  scannedAt: number;
  musicDirectory: string;
  publicMusicDirectory?: string;
  customFolderUri?: string;
  customFolderName?: string;
  customFolderDisplayPath?: string;
  tracks: LocalMusicTrack[];
  sourceCounts?: Partial<Record<LocalMusicTrackSource, number>>;
}

const normalizeSourceMode = (value?: string): LocalMusicSourceMode => {
  if (value === 'android' || value === 'all' || value === 'custom') return value;
  return 'squarepod';
};

const sourceModeLabel = (mode: LocalMusicSourceMode) => {
  if (mode === 'android') return 'Android media library';
  if (mode === 'all') return 'SquarePod folders and Android media library';
  if (mode === 'custom') return 'custom folder';
  return 'SquarePod folders';
};

const readCachedLibrary = (sourceMode: LocalMusicSourceMode): LocalMusicCacheV3 | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) || '') as Partial<LocalMusicCacheV3>;
    if (
      parsed?.version !== 3 ||
      normalizeSourceMode(parsed.sourceMode) !== sourceMode ||
      !Array.isArray(parsed.tracks)
    ) {
      return undefined;
    }
    return {
      version: 3,
      sourceMode,
      scannedAt: Number(parsed.scannedAt) || 0,
      musicDirectory: parsed.musicDirectory || '',
      publicMusicDirectory: parsed.publicMusicDirectory,
      customFolderUri: parsed.customFolderUri,
      customFolderName: parsed.customFolderName,
      customFolderDisplayPath: parsed.customFolderDisplayPath,
      tracks: parsed.tracks,
      sourceCounts: parsed.sourceCounts,
    };
  } catch {
    return undefined;
  }
};

const writeCachedLibrary = (
  sourceMode: LocalMusicSourceMode,
  library: {
    tracks: LocalMusicTrack[];
    musicDirectory?: string;
    publicMusicDirectory?: string;
    customFolderUri?: string;
    customFolderName?: string;
    customFolderDisplayPath?: string;
    sourceCounts?: Partial<Record<LocalMusicTrackSource, number>>;
  },
) => {
  if (typeof window === 'undefined') return;
  const cache: LocalMusicCacheV3 = {
    version: 3,
    sourceMode,
    scannedAt: Date.now(),
    musicDirectory: library.musicDirectory || '',
    publicMusicDirectory: library.publicMusicDirectory,
    customFolderUri: library.customFolderUri,
    customFolderName: library.customFolderName,
    customFolderDisplayPath: library.customFolderDisplayPath,
    tracks: library.tracks,
    sourceCounts: library.sourceCounts,
  };
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
};

const isLocalPreviewHost = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
};

const trackToSong = (track?: LocalMusicTrack): Song | undefined => {
  if (!track) return undefined;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    coverUrl: track.artworkUri || FALLBACK_COVER,
    lyrics: track.lyrics,
    localTrack: track,
  };
};

const playbackModeFromState = (shuffle: ShuffleMode, repeat: LocalRepeatMode): PlaybackMode => {
  if (repeat === 'one') return 'repeatOne';
  if (repeat === 'all') return 'repeatAll';
  return shuffle === 'songs' ? 'shuffle' : 'sequential';
};

interface UseLocalMusicOptions {
  autoScan?: boolean;
  sourceMode?: LocalMusicSourceMode;
}

export function useLocalMusic({ autoScan = true, sourceMode = 'squarepod' }: UseLocalMusicOptions = {}) {
  const isAndroid = Capacitor.getPlatform() === 'android';
  const activeSourceMode = normalizeSourceMode(sourceMode);
  const initialCache = () => readCachedLibrary(activeSourceMode);
  const [status, setStatus] = useState<LocalMusicStatus>('idle');
  const [message, setMessage] = useState('Scan local music to build your library.');
  const [tracks, setTracks] = useState<LocalMusicTrack[]>(() => initialCache()?.tracks || []);
  const [musicDirectory, setMusicDirectory] = useState('');
  const [publicMusicDirectory, setPublicMusicDirectory] = useState('');
  const [customFolderUri, setCustomFolderUri] = useState(() => initialCache()?.customFolderUri || '');
  const [customFolderName, setCustomFolderName] = useState(() => initialCache()?.customFolderName || '');
  const [customFolderDisplayPath, setCustomFolderDisplayPath] = useState(() => initialCache()?.customFolderDisplayPath || '');
  const [sourceCounts, setSourceCounts] = useState<Partial<Record<LocalMusicTrackSource, number>>>({});
  const [playbackState, setPlaybackState] = useState<LocalMusicPlaybackState>();
  const [shuffleMode, setShuffleModeState] = useState<ShuffleMode>('off');
  const [repeatMode, setRepeatModeState] = useState<LocalRepeatMode>('off');
  const [progress, setProgress] = useState(0);

  const currentTrack = playbackState?.track;
  const playbackQueue = playbackState?.queue || [];
  const currentSong = useMemo(() => trackToSong(currentTrack), [currentTrack]);
  const isPlaying = Boolean(playbackState?.isPlaying);
  const duration = currentSong?.duration || Math.max(1, playbackState?.duration || 1);
  const playbackMode = playbackModeFromState(shuffleMode, repeatMode);

  useEffect(() => {
    const cached = readCachedLibrary(activeSourceMode);
    setTracks(cached?.tracks || []);
    setMusicDirectory(cached?.musicDirectory || '');
    setPublicMusicDirectory(cached?.publicMusicDirectory || '');
    setCustomFolderUri(cached?.customFolderUri || '');
    setCustomFolderName(cached?.customFolderName || '');
    setCustomFolderDisplayPath(cached?.customFolderDisplayPath || '');
    setSourceCounts(cached?.sourceCounts || {});
    if (cached?.tracks.length) {
      setStatus('success');
      setMessage(`Loaded ${cached.tracks.length} cached local songs from ${sourceModeLabel(activeSourceMode)}.`);
    } else if (!isPlaying) {
      setStatus('idle');
      setMessage(
        activeSourceMode === 'custom'
          ? 'Pick a custom music folder in Settings, then scan.'
          : `Scan ${sourceModeLabel(activeSourceMode)} to build your library.`,
      );
    }
  }, [activeSourceMode, isPlaying]);

  useEffect(() => {
    if (!isAndroid) {
      let cancelled = false;
      const cachedLibrary = readCachedLibrary(activeSourceMode);

      const applySeedLibrary = (
        nextTracks: LocalMusicTrack[],
        nextDirectory = '',
        nextPublicDirectory = '',
        nextSourceCounts: Partial<Record<LocalMusicTrackSource, number>> = {},
      ) => {
        if (cancelled) return;
        setTracks(nextTracks);
        setMusicDirectory(nextDirectory);
        setPublicMusicDirectory(nextPublicDirectory);
        setSourceCounts(nextSourceCounts);
        writeCachedLibrary(activeSourceMode, {
          tracks: nextTracks,
          musicDirectory: nextDirectory,
          publicMusicDirectory: nextPublicDirectory,
          sourceCounts: nextSourceCounts,
        });
        setStatus(nextTracks.length ? 'success' : 'error');
        setMessage(nextTracks.length
          ? `Loaded ${nextTracks.length} local songs for web preview from ${sourceModeLabel(activeSourceMode)}${nextDirectory ? ` (${nextDirectory})` : ''}.`
          : 'Local music playback is implemented in the Android app.');
      };

      if (isLocalPreviewHost()) {
        fetch(WEB_PREVIEW_SEED_PATH, { cache: 'no-store' })
          .then(async response => {
            if (!response.ok) throw new Error(`Seed request failed: ${response.status}`);
            const library = await response.json() as {
              tracks?: LocalMusicTrack[];
              musicDirectory?: string;
              publicMusicDirectory?: string;
              sourceCounts?: Partial<Record<LocalMusicTrackSource, number>>;
            };
            applySeedLibrary(
              Array.isArray(library.tracks) ? library.tracks : [],
              library.musicDirectory || '',
              library.publicMusicDirectory || '',
              library.sourceCounts || {},
            );
          })
          .catch(() => {
            if (cachedLibrary?.tracks.length) {
              applySeedLibrary(
                cachedLibrary.tracks,
                cachedLibrary.musicDirectory,
                cachedLibrary.publicMusicDirectory || '',
                cachedLibrary.sourceCounts || {},
              );
              return;
            }
            if (cancelled) return;
            setStatus('error');
            setMessage('Local music playback is implemented in the Android app.');
          });
      } else if (cachedLibrary?.tracks.length) {
        applySeedLibrary(
          cachedLibrary.tracks,
          cachedLibrary.musicDirectory,
          cachedLibrary.publicMusicDirectory || '',
          cachedLibrary.sourceCounts || {},
        );
      } else {
        setStatus('error');
        setMessage('Local music playback is implemented in the Android app.');
      }

      return () => {
        cancelled = true;
      };
    }

    let disposed = false;
    let stateHandle: { remove: () => Promise<void> } | undefined;
    let errorHandle: { remove: () => Promise<void> } | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    LocalMusic.addListener('playbackState', state => {
      if (!disposed) applyPlaybackState(state);
    }).then(handle => {
      stateHandle = handle;
    });
    LocalMusic.addListener('playbackError', error => {
      if (disposed) return;
      setStatus('error');
      setMessage(error.message || 'Local playback failed.');
    }).then(handle => {
      errorHandle = handle;
    });
    LocalMusic.getState().then(applyPlaybackState).catch(() => undefined);
    pollTimer = setInterval(() => {
      LocalMusic.getState().then(applyPlaybackState).catch(() => undefined);
    }, 1500);

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      stateHandle?.remove();
      errorHandle?.remove();
    };
  }, [activeSourceMode, isAndroid]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = setInterval(() => {
      setProgress(current => Math.min(duration, current + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [duration, isPlaying]);

  const applyPlaybackState = (state: LocalMusicPlaybackState) => {
    setPlaybackState(state);
    setProgress(Math.max(0, state.position || 0));
    setShuffleModeState(state.shuffle ? 'songs' : 'off');
    setRepeatModeState(state.repeatMode || 'off');
    if (state.track) {
      setStatus('ready');
      setMessage(`${state.isPlaying ? 'Playing' : 'Ready'}: ${state.track.title}`);
    }
  };

  const applyCustomFolder = (folder: {
    selected?: boolean;
    uri?: string;
    name?: string;
    displayPath?: string;
  }) => {
    const selected = Boolean(folder.selected && folder.uri);
    setCustomFolderUri(selected ? (folder.uri || '') : '');
    setCustomFolderName(selected ? (folder.name || '') : '');
    setCustomFolderDisplayPath(selected ? (folder.displayPath || folder.name || '') : '');
  };

  const scanLibrary = async () => {
    if (!isAndroid) throw new Error('Local music scan is only implemented in the Android app.');
    setStatus('working');
    setMessage('Scanning local music...');
    try {
      const library = await LocalMusic.scanLibrary({ sourceMode: activeSourceMode });
      const resolvedSourceMode = normalizeSourceMode(library.sourceMode || activeSourceMode);
      setTracks(library.tracks);
      setMusicDirectory(library.musicDirectory);
      setPublicMusicDirectory(library.publicMusicDirectory || '');
      applyCustomFolder({
        selected: library.hasCustomFolder,
        uri: library.customFolderUri,
        name: library.customFolderName,
        displayPath: library.customFolderDisplayPath,
      });
      setSourceCounts(library.sourceCounts || {});
      writeCachedLibrary(resolvedSourceMode, library);
      setStatus('success');
      const folderHint = library.customFolderDisplayPath
        || library.customFolderName
        || library.publicMusicDirectory
        || library.musicDirectory;
      setMessage(library.tracks.length
        ? `Scanned ${library.tracks.length} local songs from ${sourceModeLabel(resolvedSourceMode)}.`
        : resolvedSourceMode === 'custom' && !library.hasCustomFolder
          ? 'No custom folder selected. Choose a folder in Settings -> Library.'
          : `No songs found${folderHint ? ` in ${folderHint}` : ''}.`);
      return library;
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Local music scan failed.';
      setStatus(nextMessage.includes('permission') ? 'needsPermission' : 'error');
      setMessage(nextMessage);
      throw error;
    }
  };

  const refreshCustomFolder = async () => {
    if (!isAndroid) return undefined;
    const folder = await LocalMusic.getCustomFolder();
    applyCustomFolder(folder);
    return folder;
  };

  const pickCustomFolder = async () => {
    if (!isAndroid) throw new Error('Custom folders are only available in the Android app.');
    setStatus('working');
    setMessage('Choose a music folder...');
    try {
      const folder = await LocalMusic.pickCustomFolder();
      applyCustomFolder(folder);
      setStatus('success');
      setMessage(folder.selected
        ? `Custom folder set to ${folder.displayPath || folder.name || 'selected folder'}.`
        : 'No custom folder selected.');
      if (activeSourceMode === 'custom' && folder.selected) {
        await scanLibrary();
      }
      return folder;
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Folder selection failed.';
      setStatus(nextMessage.includes('cancelled') ? 'idle' : 'error');
      setMessage(nextMessage);
      throw error;
    }
  };

  const clearCustomFolder = async () => {
    if (!isAndroid) throw new Error('Custom folders are only available in the Android app.');
    const folder = await LocalMusic.clearCustomFolder();
    applyCustomFolder(folder);
    if (activeSourceMode === 'custom') {
      setTracks([]);
      setSourceCounts({});
      writeCachedLibrary(activeSourceMode, {
        tracks: [],
        musicDirectory,
        publicMusicDirectory,
        sourceCounts: {},
      });
      setMessage('Custom folder cleared. Choose a folder to scan.');
    }
    return folder;
  };

  useEffect(() => {
    if (!isAndroid || !autoScan) return;
    if (activeSourceMode === 'custom') {
      refreshCustomFolder()
        .then(folder => {
          if (folder?.selected) return scanLibrary();
          setStatus('idle');
          setMessage('Pick a custom music folder in Settings, then scan.');
          return undefined;
        })
        .catch(() => undefined);
      return;
    }
    scanLibrary().catch(() => undefined);
  }, [activeSourceMode, autoScan, isAndroid]);

  const playQueue = async (queue: LocalMusicTrack[], startIndex = 0, options: { shuffle?: boolean; repeatMode?: LocalRepeatMode } = {}) => {
    if (!queue.length) throw new Error('No local tracks to play.');
    setStatus('working');
    setMessage('Starting local playback...');
    const state = await LocalMusic.playQueue({
      tracks: queue,
      startIndex,
      shuffle: options.shuffle ?? shuffleMode === 'songs',
      repeatMode: options.repeatMode ?? repeatMode,
    });
    applyPlaybackState(state);
    return state;
  };

  const playPause = () => {
    const command = isPlaying ? LocalMusic.pause() : LocalMusic.play();
    command.then(applyPlaybackState).catch(error => {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Local play/pause failed.');
    });
  };

  const pausePlayback = async () => {
    const state = await LocalMusic.pause();
    applyPlaybackState(state);
    return state;
  };

  const nextTrack = () => {
    LocalMusic.next().then(applyPlaybackState).catch(error => {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Local next failed.');
    });
  };

  const prevTrack = () => {
    LocalMusic.previous().then(applyPlaybackState).catch(error => {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Local previous failed.');
    });
  };

  const seekTo = async (position: number) => {
    const state = await LocalMusic.seek({ position: Math.max(0, Math.floor(position)) });
    applyPlaybackState(state);
    return state;
  };

  const setShuffleMode = async (mode: ShuffleMode) => {
    const state = await LocalMusic.setShuffle({ enabled: mode === 'songs' });
    applyPlaybackState(state);
    return state;
  };

  const setRepeatMode = async (mode: LocalRepeatMode) => {
    const state = await LocalMusic.setRepeat({ mode });
    applyPlaybackState(state);
    return state;
  };

  const setPlaybackMode = async (mode: PlaybackMode) => {
    const nextShuffle: ShuffleMode = mode === 'shuffle' ? 'songs' : 'off';
    const nextRepeat: LocalRepeatMode = mode === 'repeatOne'
      ? 'one'
      : mode === 'repeatAll' ? 'all' : 'off';
    await setShuffleMode(nextShuffle);
    await setRepeatMode(nextRepeat);
  };

  const setEqPreset = async (preset: string) => {
    const state = await LocalMusic.setEq({ preset });
    applyPlaybackState(state);
    return state;
  };

  return {
    status,
    message,
    tracks,
    musicDirectory,
    publicMusicDirectory,
    customFolderUri,
    customFolderName,
    customFolderDisplayPath,
    hasCustomFolder: Boolean(customFolderUri),
    sourceMode: activeSourceMode,
    sourceCounts,
    currentSong,
    currentTrack,
    playbackQueue,
    isPlaying,
    progress,
    playbackMode,
    shuffleMode,
    repeatMode,
    scanLibrary,
    pickCustomFolder,
    clearCustomFolder,
    refreshCustomFolder,
    playQueue,
    playPause,
    pausePlayback,
    nextTrack,
    prevTrack,
    seekTo,
    setPlaybackMode,
    setEqPreset,
  };
}
