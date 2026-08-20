import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { strFromU8, unzipSync } from 'fflate';
import { CalendarEventEntry, ContactEntry, DEFAULT_EBOOKS, EbookEntry, generateMenuRoot, isMainMenuItemEnabled, NoteEntry, normalizeMainMenuOrder, SleepTimerMenuState, WorkoutEntry } from './data';
import { AppTheme, ClickWheelColor, DeviceMode, EditorFieldKey, EditorMode, MenuNode, PlaybackMode, SleepTimerEndAction, TextEditorState } from './types';
import { useLocalMusic } from './useLocalMusic';
import { useMediaLibrary } from './useMediaLibrary';
import { useRadio } from './useRadio';
import { useVoiceMemos } from './useVoiceMemos';
import { LocalMusicSourceMode, LocalMusicTrack } from './native/localMusic';
import { ScreenAwake } from './native/screenAwake';
import { ClickWheel } from './components/ClickWheel';
import { Screen, type EbookReaderCommand, type VideoCommand } from './components/Screen';
import { Nano6Screen } from './components/Nano6Screen';
import type { RotateEndMeta } from './useWheel';
import { setUiSoundVolume } from './audio/uiSounds';
import { Locale, normalizeLocale, t, text } from './i18n';
import { findAlphaSectionForIndex } from './alphaIndex';

interface StackItem {
  node: MenuNode;
  cursorIndex: number;
}

type ContinuationMode = 'album' | 'library';
type VideoCommandInput =
  | { action: 'toggle' }
  | { action: 'seek'; seconds: number };
type EbookReaderCommandInput =
  | { action: 'scroll'; steps: number }
  | { action: 'chapter'; direction: -1 | 1 };

interface StopwatchSnapshot {
  status: 'idle' | 'running' | 'paused';
  startedAt?: number;
  accumulatedMs: number;
  laps: number[];
  lastSession?: {
    totalMs: number;
    laps: number[];
    endedAt: number;
  };
}

interface ImportedEbook {
  title: string;
  author?: string;
  body: string;
}

const CONTINUATION_MODE_KEY = 'squarepod.localContinuationMode.v1';
const UI_SOUND_VOLUME_KEY = 'squarepod.uiSoundVolume.v1';
const AUTO_SCAN_KEY = 'squarepod.autoScan.v1';
const LIBRARY_SOURCE_KEY = 'squarepod.librarySource.v1';
const CONTACTS_KEY = 'squarepod.contacts.v1';
const NOTES_KEY = 'squarepod.notes.v1';
const CALENDAR_EVENTS_KEY = 'squarepod.calendarEvents.v1';
const NOTE_DRAFT_KEY = 'squarepod.noteDraft.v1';
const SLEEP_TIMER_KEY = 'squarepod.sleepTimer.v1';
const STOPWATCH_KEY = 'squarepod.stopwatch.v1';
const EBOOKS_KEY = 'squarepod.ebooks.v1';
const WORKOUTS_KEY = 'squarepod.workouts.v1';
const MAIN_MENU_KEY = 'squarepod.mainMenu.v1';
const MAIN_MENU_ORDER_KEY = 'squarepod.mainMenuOrder.v1';
const BACKLIGHT_TIMER_KEY = 'squarepod.backlightTimer.v1';
const EQ_KEY = 'squarepod.eq.v1';
const COMPILATIONS_KEY = 'squarepod.compilations.v1';
const LANGUAGE_KEY = 'squarepod.language.v1';
const DEVICE_MODE_KEY = 'squarepod.deviceMode.v1';
const THEME_KEY = 'squarepod.theme.v1';
const CLICK_WHEEL_COLOR_KEY = 'squarepod.clickWheelColor.v1';
const NANO6_WALLPAPER_KEY = 'squarepod.nano6Wallpaper.v1';
const SETTINGS_DEFAULTS_VERSION_KEY = 'squarepod.settingsDefaultsVersion.v1';
const PLAYBACK_MODE_ORDER: PlaybackMode[] = ['sequential', 'shuffle', 'repeatAll', 'repeatOne'];
const LIBRARY_SOURCE_ORDER: LocalMusicSourceMode[] = ['squarepod', 'android', 'all', 'custom'];
const UI_SOUND_VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1];
const DEFAULT_UI_SOUND_VOLUME = 1;
const DEFAULT_BACKLIGHT_TIMER = 'Always On';
const SETTINGS_DEFAULTS_VERSION = '1.5';
const BACKLIGHT_TIMER_ORDER = ['30s', '1m', '2m', 'Always On'];
const EQ_ORDER = ['Off', 'Bass Boost', 'Treble Boost', 'Spoken Word'];
const SEEK_STEP_SECONDS = 10;
const COVER_FLOW_MAX_STEPS_PER_INPUT = 4;
const COVER_FLOW_SELECT_HERO_MS = 560;
const DEFAULT_SLEEP_TIMER: SleepTimerMenuState = { status: 'off', endAction: 'pause' };
const DEFAULT_STOPWATCH: StopwatchSnapshot = { status: 'idle', accumulatedMs: 0, laps: [] };
const SLEEP_ACTION_ORDER: SleepTimerEndAction[] = ['pause', 'fadePause', 'lock'];
const ALPHA_JUMP_MIN_ITEMS = 24;
const ALPHA_JUMP_WINDOW_MS = 320;
const ALPHA_JUMP_STEP_THRESHOLD = 7;
const ALPHA_JUMP_HUD_MS = 760;

const tx = (
  locale: Locale | string | undefined,
  en: string,
  zhCN: string,
  values: Record<string, string | number> = {},
) => text(locale, { en, 'zh-CN': zhCN }, values);

const findNodeByPath = (root: MenuNode, path: string[]) => {
  let node = root;
  for (const id of path.slice(1)) {
    const next = node.children?.find(child => child.id === id);
    if (!next) return undefined;
    node = next;
  }
  return node;
};

const nowPlayingNodeForLocale = (locale: Locale): MenuNode => ({ id: 'now_playing', title: t(locale, 'nowPlaying'), type: 'nowPlaying' });

const isDetachedNavigationNode = (node: MenuNode) => (
  node.id === 'now_playing' ||
  node.id === 'now_playing_queue' ||
  node.id.startsWith('queue_track_') ||
  node.type === 'textEditor'
);

const isMenuLikeNode = (node: MenuNode) => (
  node.type === 'menu' ||
  node.type === 'photoGrid' ||
  node.type === 'radioStationList' ||
  node.type === 'contactList' ||
  node.type === 'noteList' ||
  node.type === 'contactDetail' ||
  node.type === 'noteDetail' ||
  node.type === 'calendarEventList' ||
  node.type === 'calendarEventDetail'
);

const localTrackNode = (track: LocalMusicTrack, queue: LocalMusicTrack[], index: number, locale: Locale): MenuNode => ({
  id: `queue_track_${track.id || index}`,
  title: track.title || t(locale, 'title'),
  type: 'songDetail',
  previewImage: track.artworkUri,
  localTrack: track,
  localQueue: queue,
  localQueueIndex: index,
  detailLines: [
    track.artist || tx(locale, 'Unknown Artist', '未知艺人'),
    track.album || tx(locale, 'Unknown Album', '未知专辑'),
  ],
});

const localQueueFromMenu = (node: MenuNode) => (
  node.children
    ?.map(child => child.localTrack)
    .filter((track): track is LocalMusicTrack => Boolean(track)) || []
);

const readContinuationMode = (): ContinuationMode => {
  if (typeof window === 'undefined') return 'library';
  return window.localStorage.getItem(CONTINUATION_MODE_KEY) === 'album' ? 'album' : 'library';
};

const writeContinuationMode = (mode: ContinuationMode) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONTINUATION_MODE_KEY, mode);
};

const readUiSoundVolume = () => {
  if (typeof window === 'undefined') return DEFAULT_UI_SOUND_VOLUME;
  const parsed = Number(window.localStorage.getItem(UI_SOUND_VOLUME_KEY));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : DEFAULT_UI_SOUND_VOLUME;
};

const writeUiSoundVolume = (volume: number) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(UI_SOUND_VOLUME_KEY, String(volume));
};

const readAutoScan = () => {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(AUTO_SCAN_KEY) !== 'false';
};

const writeAutoScan = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTO_SCAN_KEY, String(enabled));
};

const readLibrarySource = (): LocalMusicSourceMode => {
  const value = readString(LIBRARY_SOURCE_KEY, 'squarepod');
  return value === 'android' || value === 'all' || value === 'custom' ? value : 'squarepod';
};

const readJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const readArray = <T,>(key: string): T[] => {
  const parsed = readJson<unknown>(key, []);
  return Array.isArray(parsed) ? parsed as T[] : [];
};

const readRecord = <T extends Record<string, unknown>>(key: string, fallback: T): T => {
  const parsed = readJson<unknown>(key, fallback);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : fallback;
};

const mergeDefaultEbooks = (stored: EbookEntry[]) => {
  const storedById = new Map(stored.map(ebook => [ebook.id, ebook]));
  return [
    ...DEFAULT_EBOOKS.map(ebook => storedById.get(ebook.id) || ebook),
    ...stored.filter(ebook => !DEFAULT_EBOOKS.some(defaultBook => defaultBook.id === ebook.id)),
  ];
};

const readString = (key: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
};

const writeString = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
};

const readTheme = (): AppTheme => (
  readString(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light'
);

const normalizeClickWheelColor = (value: string | undefined | null): ClickWheelColor | undefined => {
  if (value === 'white' || value === 'blue' || value === 'darkGray' || value === 'u2Red') return value;
  return undefined;
};

const readClickWheelColor = (): ClickWheelColor => (
  normalizeClickWheelColor(readString(CLICK_WHEEL_COLOR_KEY, '')) || (readTheme() === 'dark' ? 'u2Red' : 'white')
);

const readBoolean = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === 'true';
};

const writeBoolean = (key: string, value: boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
};

const readDeviceMode = (): DeviceMode => (
  readString(DEVICE_MODE_KEY, 'clickWheel') === 'nano6Touch' ? 'nano6Touch' : 'clickWheel'
);

const localTrackKey = (track: LocalMusicTrack) => track.id || track.uri;

const todayInputValue = () => {
  const now = new Date();
  return todayInputValueFromDate(now);
};

const todayInputValueFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateValue = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  date.setDate(date.getDate() + days);
  return todayInputValueFromDate(date);
};

const shiftMonthValue = (dateValue: string, months: number) => {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  date.setMonth(date.getMonth() + months);
  return todayInputValueFromDate(date);
};

const isValidDateInput = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && value === todayInputValueFromDate(date);
};

const isValidTimeInput = (value: string) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '').trim();

const normalizeImportedText = (text: string) => text
  .replace(/\r\n?/g, '\n')
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const removeGutenbergEnvelope = (text: string) => {
  let next = text;
  const startMatch = next.match(/\*{3}\s*START OF THE PROJECT GUTENBERG EBOOK[^\n]*\*{3}/i);
  if (startMatch?.index !== undefined) {
    next = next.slice(startMatch.index + startMatch[0].length);
  }
  const endMatch = next.match(/\*{3}\s*END OF THE PROJECT GUTENBERG EBOOK[^\n]*\*{3}/i);
  if (endMatch?.index !== undefined) {
    next = next.slice(0, endMatch.index);
  }
  return normalizeImportedText(next);
};

const textFromHtmlDocument = (document: Document) => {
  document.querySelectorAll('script, style, nav, .pg-boilerplate, #pg-header, #pg-machine-header, #pg-footer').forEach(element => element.remove());
  const footer = document.querySelector('#pg-footer-heading');
  if (footer) {
    let current: Element | null = footer;
    while (current) {
      const next = current.nextElementSibling;
      current.remove();
      current = next;
    }
  }

  const body = document.body;
  if (!body) return '';
  const blocks: string[] = [];

  body.querySelectorAll('h1,h2,h3,h4,p,blockquote,li').forEach(element => {
    const text = normalizeImportedText(element.textContent || '');
    if (!text) return;
    if (/^\*{3}\s*(START|END) OF THE PROJECT GUTENBERG/i.test(text)) return;
    if (/^Project Gutenberg/i.test(text)) return;
    if (/^This eBook is for the use of anyone anywhere/i.test(text)) return;
    const tag = element.tagName.toLowerCase();
    blocks.push(tag.startsWith('h') ? `# ${text.replace(/^#+\s*/, '')}` : text);
  });

  return removeGutenbergEnvelope(blocks.join('\n\n'));
};

const getOpfPath = (zip: Record<string, Uint8Array>) => {
  const containerEntry = zip['META-INF/container.xml'];
  if (!containerEntry) return Object.keys(zip).find(name => name.endsWith('.opf'));
  const containerXml = strFromU8(containerEntry);
  const match = containerXml.match(/full-path=["']([^"']+\.opf)["']/i);
  return match?.[1] || Object.keys(zip).find(name => name.endsWith('.opf'));
};

const resolveZipPath = (basePath: string, href: string) => {
  if (/^[a-z]+:/i.test(href)) return href;
  const baseParts = basePath.split('/');
  baseParts.pop();
  href.split('/').forEach(part => {
    if (!part || part === '.') return;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  });
  return baseParts.join('/');
};

const parseEpubFile = async (file: File): Promise<ImportedEbook> => {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const parser = new DOMParser();
  const opfPath = getOpfPath(zip);
  const opfText = opfPath ? strFromU8(zip[opfPath]) : '';
  const opf = opfText ? parser.parseFromString(opfText, 'application/xml') : undefined;
  const title = normalizeImportedText(opf?.querySelector('title')?.textContent || stripExtension(file.name));
  const author = normalizeImportedText(opf?.querySelector('creator')?.textContent || '');
  const manifest = new Map<string, string>();

  opf?.querySelectorAll('manifest item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href && opfPath) manifest.set(id, resolveZipPath(opfPath, href));
  });

  const spinePaths = [...(opf?.querySelectorAll('spine itemref') || [])]
    .map(item => item.getAttribute('idref') || '')
    .map(idref => manifest.get(idref))
    .filter((path): path is string => Boolean(path && zip[path] && /\.(xhtml|html?|xml)$/i.test(path)));

  const htmlPaths = spinePaths.length
    ? spinePaths
    : Object.keys(zip).filter(path => /\.(xhtml|html?)$/i.test(path) && !/toc|nav|wrap/i.test(path)).sort();

  const body = removeGutenbergEnvelope(htmlPaths.map(path => {
    const htmlText = strFromU8(zip[path]);
    const document = parser.parseFromString(htmlText, 'text/html');
    return textFromHtmlDocument(document);
  }).filter(Boolean).join('\n\n'));

  if (!body) throw new Error('No readable text found in this EPUB.');

  return {
    title,
    author: author || undefined,
    body,
  };
};

const parseEbookFile = async (file: File): Promise<ImportedEbook> => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.epub')) return parseEpubFile(file);
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    const body = removeGutenbergEnvelope(await file.text());
    if (!body) throw new Error('The selected text file is empty.');
    return {
      title: stripExtension(file.name),
      body,
    };
  }
  throw new Error('Unsupported file type. Choose EPUB, TXT, or Markdown.');
};

export default function App() {
  const coverFlowSelectTimerRef = useRef<number | null>(null);
  const coverFlowSelectingRef = useRef(false);
  const alphaJumpTimerRef = useRef<number | null>(null);
  const alphaJumpStatsRef = useRef({ startedAt: 0, steps: 0 });
  const seekInFlightRef = useRef(false);
  const seekTargetRef = useRef(0);
  const ebookFileInputRef = useRef<HTMLInputElement | null>(null);
  const [coverFlowIsSelecting, setCoverFlowIsSelecting] = useState(false);
  const [coverFlowIsDragging, setCoverFlowIsDragging] = useState(false);
  const [coverFlowRelease, setCoverFlowRelease] = useState({ id: 0, velocity: 0 });
  const [alphaJumpKey, setAlphaJumpKey] = useState<string>();
  const [playbackQueue, setPlaybackQueue] = useState<LocalMusicTrack[]>([]);
  const [continuationMode, setContinuationMode] = useState<ContinuationMode>(readContinuationMode);
  const [uiSoundVolume, setUiSoundVolumeState] = useState(readUiSoundVolume);
  const [autoScan, setAutoScan] = useState(readAutoScan);
  const [librarySource, setLibrarySource] = useState<LocalMusicSourceMode>(readLibrarySource);
  const [contacts, setContacts] = useState<ContactEntry[]>(() => readArray(CONTACTS_KEY));
  const [notes, setNotes] = useState<NoteEntry[]>(() => readArray(NOTES_KEY));
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventEntry[]>(() => readArray(CALENDAR_EVENTS_KEY));
  const [ebooks, setEbooks] = useState<EbookEntry[]>(() => mergeDefaultEbooks(readArray(EBOOKS_KEY)));
  const [ebookImportState, setEbookImportState] = useState<{ status?: string; message?: string; importing: boolean }>({ importing: false });
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>(() => readArray(WORKOUTS_KEY));
  const [noteDraft, setNoteDraft] = useState<NoteEntry | undefined>(() => readJson<NoteEntry | undefined>(NOTE_DRAFT_KEY, undefined));
  const [calendarFocusDate, setCalendarFocusDate] = useState(todayInputValue);
  const [sleepTimer, setSleepTimer] = useState<SleepTimerMenuState>(() => readJson(SLEEP_TIMER_KEY, DEFAULT_SLEEP_TIMER));
  const [stopwatch, setStopwatch] = useState<StopwatchSnapshot>(() => readJson(STOPWATCH_KEY, DEFAULT_STOPWATCH));
  const [mainMenuEnabled, setMainMenuEnabled] = useState<Record<string, boolean>>(() => readRecord(MAIN_MENU_KEY, {}));
  const [mainMenuOrder, setMainMenuOrder] = useState<string[]>(() => normalizeMainMenuOrder(readArray(MAIN_MENU_ORDER_KEY)));
  const [mainMenuDraftOrder, setMainMenuDraftOrder] = useState<string[]>();
  const [mainMenuReorderKey, setMainMenuReorderKey] = useState<string>();
  const [backlightTimer, setBacklightTimer] = useState(() => readString(BACKLIGHT_TIMER_KEY, DEFAULT_BACKLIGHT_TIMER));
  const [eqPreset, setEqPreset] = useState(() => readString(EQ_KEY, 'Off'));
  const [compilationsEnabled, setCompilationsEnabled] = useState(() => readBoolean(COMPILATIONS_KEY, true));
  const [language, setLanguage] = useState<Locale>(() => normalizeLocale(readString(LANGUAGE_KEY, 'en')));
  const [deviceMode, setDeviceMode] = useState<DeviceMode>(readDeviceMode);
  const [theme, setTheme] = useState<AppTheme>(readTheme);
  const [clickWheelColor, setClickWheelColor] = useState<ClickWheelColor>(readClickWheelColor);
  const [nano6Wallpaper, setNano6Wallpaper] = useState(() => readString(NANO6_WALLPAPER_KEY, ''));
  const [screenLocked, setScreenLocked] = useState(false);
  const [unlockArmed, setUnlockArmed] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  const [screenDimmed, setScreenDimmed] = useState(false);
  const [textEditor, setTextEditor] = useState<TextEditorState>();
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState(0);
  const [videoCommand, setVideoCommand] = useState<VideoCommand>();
  const [ebookReaderCommand, setEbookReaderCommand] = useState<EbookReaderCommand>();
  const localMusic = useLocalMusic({ autoScan, sourceMode: librarySource });
  const mediaLibrary = useMediaLibrary();
  const radio = useRadio();
  const voiceMemos = useVoiceMemos();
  const {
    isPlaying,
    currentSong,
    progress,
    playbackMode,
    playPause,
    pausePlayback,
    nextTrack,
    prevTrack,
    seekTo,
    setPlaybackMode,
    playQueue,
  } = localMusic;
  const currentTrackMenuKey = [
    localMusic.currentTrack?.id,
    localMusic.currentTrack?.title,
    localMusic.currentTrack?.artist,
    localMusic.currentTrack?.album,
  ].join('|');
  const rootMenu = useMemo(() => generateMenuRoot({
    status: localMusic.status,
    message: localMusic.message,
    tracks: localMusic.tracks,
    musicDirectory: localMusic.musicDirectory,
    publicMusicDirectory: localMusic.publicMusicDirectory,
    customFolderName: localMusic.customFolderName,
    customFolderDisplayPath: localMusic.customFolderDisplayPath,
    hasCustomFolder: localMusic.hasCustomFolder,
    sourceMode: localMusic.sourceMode,
    sourceCounts: localMusic.sourceCounts,
    currentTrack: localMusic.currentTrack,
    continuationMode,
    uiSoundVolume,
    autoScan,
    playbackMode,
    isScanning: localMusic.status === 'working',
    photos: mediaLibrary.photos,
    videos: mediaLibrary.videos,
    mediaStatus: mediaLibrary.status,
    mediaMessage: mediaLibrary.message,
    isMediaScanning: mediaLibrary.status === 'working',
    radioStatus: radio.status,
    radioStations: radio.stations,
    radioPresets: radio.presets,
    radioMessage: radio.message,
    isRadioWorking: radio.isWorking,
    voiceMemos: voiceMemos.memos,
    voiceMemoStatus: voiceMemos.status,
    voiceMemoMessage: voiceMemos.message,
    isVoiceMemoRecording: voiceMemos.isRecording,
    ebooks,
    ebookImportStatus: ebookImportState.status,
    ebookImportMessage: ebookImportState.message,
    isEbookImporting: ebookImportState.importing,
    workouts,
    contacts,
    notes,
    noteDraft,
    calendarEvents,
    calendarFocusDate,
    sleepTimer,
    mainMenuEnabled,
    mainMenuOrder,
    mainMenuSettingsOrder: mainMenuDraftOrder,
    mainMenuReorderKey,
    backlightTimer,
    eqPreset,
    compilationsEnabled,
    language,
    deviceMode,
    theme,
    clickWheelColor,
  }), [
    localMusic.status,
    localMusic.message,
    localMusic.tracks,
    localMusic.musicDirectory,
    localMusic.publicMusicDirectory,
    localMusic.customFolderName,
    localMusic.customFolderDisplayPath,
    localMusic.hasCustomFolder,
    localMusic.sourceMode,
    localMusic.sourceCounts,
    currentTrackMenuKey,
    continuationMode,
    uiSoundVolume,
    autoScan,
    playbackMode,
    mediaLibrary.photos,
    mediaLibrary.videos,
    mediaLibrary.status,
    mediaLibrary.message,
    radio.status,
    radio.stations,
    radio.presets,
    radio.message,
    radio.isWorking,
    voiceMemos.memos,
    voiceMemos.status,
    voiceMemos.message,
    voiceMemos.isRecording,
    ebooks,
    ebookImportState,
    workouts,
    contacts,
    notes,
    noteDraft,
    calendarEvents,
    calendarFocusDate,
    sleepTimer,
    mainMenuEnabled,
    mainMenuOrder,
    mainMenuDraftOrder,
    mainMenuReorderKey,
    backlightTimer,
    eqPreset,
    compilationsEnabled,
    language,
    deviceMode,
    theme,
    clickWheelColor,
  ]);

  const [stack, setStack] = useState<StackItem[]>([{ node: rootMenu, cursorIndex: 0 }]);
  const currentItem = stack[stack.length - 1];
  const currentNode = currentItem.node;
  const cursorIndex = currentItem.cursorIndex;

  useEffect(() => {
    setStack(prev => {
      const path = prev.map(item => item.node.id);
      const nextStack: StackItem[] = [];

      for (let index = 0; index < prev.length; index += 1) {
        const node = findNodeByPath(rootMenu, path.slice(0, index + 1));
        if (!node) {
          if (isDetachedNavigationNode(prev[index].node)) {
            return [
              ...nextStack,
              ...prev.slice(index),
            ];
          }
          break;
        }

        const maxCursorIndex = Math.max(0, (node.children?.length || 1) - 1);
        nextStack.push({
          node,
          cursorIndex: Math.min(prev[index].cursorIndex, maxCursorIndex),
        });
      }

      return nextStack.length ? nextStack : [{ node: rootMenu, cursorIndex: 0 }];
    });
  }, [rootMenu]);

  useEffect(() => {
    if (currentNode.type === 'coverFlow') return;

    setCoverFlowIsDragging(false);
    if (coverFlowSelectTimerRef.current !== null) {
      window.clearTimeout(coverFlowSelectTimerRef.current);
      coverFlowSelectTimerRef.current = null;
      coverFlowSelectingRef.current = false;
      setCoverFlowIsSelecting(false);
    }
  }, [currentNode.type]);

  useEffect(() => {
    if (currentNode.id !== 'set_main_menu') {
      setMainMenuReorderKey(undefined);
      setMainMenuDraftOrder(undefined);
    }
  }, [currentNode.id]);

  useEffect(() => {
    if (currentNode.id !== 'set_main_menu' || !mainMenuReorderKey) return;
    const activeOrder = normalizeMainMenuOrder(mainMenuDraftOrder || mainMenuOrder);
    const activeIndex = activeOrder.indexOf(mainMenuReorderKey);
    if (activeIndex < 0) return;

    setStack(prev => {
      const nextStack = [...prev];
      const top = { ...nextStack[nextStack.length - 1] };
      if (top.node.id !== 'set_main_menu' || top.cursorIndex === activeIndex) return prev;
      top.cursorIndex = activeIndex;
      nextStack[nextStack.length - 1] = top;
      return nextStack;
    });
  }, [currentNode.id, mainMenuDraftOrder, mainMenuOrder, mainMenuReorderKey]);

  useEffect(() => {
    return () => {
      if (coverFlowSelectTimerRef.current !== null) {
        window.clearTimeout(coverFlowSelectTimerRef.current);
      }
      if (alphaJumpTimerRef.current !== null) {
        window.clearTimeout(alphaJumpTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setUiSoundVolume(uiSoundVolume);
    writeUiSoundVolume(uiSoundVolume);
  }, [uiSoundVolume]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(SETTINGS_DEFAULTS_VERSION_KEY) === SETTINGS_DEFAULTS_VERSION) return;

    // V1.5 changes the shipped defaults and should take effect on the first launch after install/update.
    setUiSoundVolumeState(DEFAULT_UI_SOUND_VOLUME);
    setBacklightTimer(DEFAULT_BACKLIGHT_TIMER);
    window.localStorage.setItem(SETTINGS_DEFAULTS_VERSION_KEY, SETTINGS_DEFAULTS_VERSION);
  }, []);

  useEffect(() => {
    writeAutoScan(autoScan);
  }, [autoScan]);

  useEffect(() => { writeString(LIBRARY_SOURCE_KEY, librarySource); }, [librarySource]);

  useEffect(() => { writeJson(CONTACTS_KEY, contacts); }, [contacts]);
  useEffect(() => { writeJson(NOTES_KEY, notes); }, [notes]);
  useEffect(() => { writeJson(CALENDAR_EVENTS_KEY, calendarEvents); }, [calendarEvents]);
  useEffect(() => { writeJson(EBOOKS_KEY, ebooks); }, [ebooks]);
  useEffect(() => { writeJson(WORKOUTS_KEY, workouts); }, [workouts]);
  useEffect(() => { writeJson(NOTE_DRAFT_KEY, noteDraft); }, [noteDraft]);
  useEffect(() => { writeJson(SLEEP_TIMER_KEY, sleepTimer); }, [sleepTimer]);
  useEffect(() => { writeJson(STOPWATCH_KEY, stopwatch); }, [stopwatch]);
  useEffect(() => { writeJson(MAIN_MENU_KEY, mainMenuEnabled); }, [mainMenuEnabled]);
  useEffect(() => { writeJson(MAIN_MENU_ORDER_KEY, mainMenuOrder); }, [mainMenuOrder]);
  useEffect(() => { writeString(BACKLIGHT_TIMER_KEY, backlightTimer); }, [backlightTimer]);
  useEffect(() => { writeString(EQ_KEY, eqPreset); }, [eqPreset]);
  useEffect(() => { writeBoolean(COMPILATIONS_KEY, compilationsEnabled); }, [compilationsEnabled]);
  useEffect(() => { writeString(LANGUAGE_KEY, language); }, [language]);
  useEffect(() => { writeString(DEVICE_MODE_KEY, deviceMode); }, [deviceMode]);
  useEffect(() => { writeString(THEME_KEY, theme); }, [theme]);
  useEffect(() => { writeString(CLICK_WHEEL_COLOR_KEY, clickWheelColor); }, [clickWheelColor]);
  useEffect(() => { writeString(NANO6_WALLPAPER_KEY, nano6Wallpaper); }, [nano6Wallpaper]);

  useEffect(() => {
    ScreenAwake.setKeepAwake({ enabled: backlightTimer === 'Always On' }).catch(error => {
      console.error('Screen awake update failed', error);
    });
  }, [backlightTimer]);

  useEffect(() => {
    const computeElapsed = () => (
      stopwatch.status === 'running' && stopwatch.startedAt
        ? stopwatch.accumulatedMs + Math.max(0, Date.now() - stopwatch.startedAt)
        : stopwatch.accumulatedMs
    );
    setStopwatchElapsedMs(computeElapsed());
    if (stopwatch.status !== 'running') return undefined;

    const timer = window.setInterval(() => {
      setStopwatchElapsedMs(computeElapsed());
    }, 50);

    return () => window.clearInterval(timer);
  }, [stopwatch]);

  useEffect(() => {
    if (!seekInFlightRef.current) {
      seekTargetRef.current = progress;
    }
  }, [currentSong?.id, progress]);

  const runSleepTimerEndAction = useCallback((action: SleepTimerEndAction) => {
    if (action === 'lock') {
      setScreenLocked(true);
      setStack(prev => [...prev, {
        node: { id: 'screen_lock_active', title: 'Screen Lock', type: 'screenLock', action: 'screen_unlock' },
        cursorIndex: 0,
      }]);
      return;
    }

    if (isPlaying) {
      playPause();
    }
  }, [isPlaying, playPause]);

  useEffect(() => {
    if (sleepTimer.status !== 'running' || !sleepTimer.startedAt || !sleepTimer.durationMs) return undefined;
    const remainingMs = sleepTimer.startedAt + sleepTimer.durationMs - Date.now();
    if (remainingMs <= 0) {
      runSleepTimerEndAction(sleepTimer.endAction);
      setSleepTimer(current => ({ ...current, status: 'completed' }));
      return undefined;
    }

    const timer = window.setTimeout(() => {
      runSleepTimerEndAction(sleepTimer.endAction);
      setSleepTimer(current => ({ ...current, status: 'completed' }));
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [runSleepTimerEndAction, sleepTimer]);

  useEffect(() => {
    const timeoutMs = backlightTimer === '30s'
      ? 30000
      : backlightTimer === '2m' ? 120000 : backlightTimer === 'Always On' ? Number.POSITIVE_INFINITY : 60000;
    if (!Number.isFinite(timeoutMs)) {
      setScreenDimmed(false);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setScreenDimmed(Date.now() - lastInteractionAt >= timeoutMs);
    }, 1000);
    setScreenDimmed(Date.now() - lastInteractionAt >= timeoutMs);
    return () => window.clearInterval(timer);
  }, [backlightTimer, lastInteractionAt]);

  const rotateStackTop = (steps: number, expectedType?: MenuNode['type']) => {
    setStack(prev => {
      const newStack = [...prev];
      const top = { ...newStack[newStack.length - 1] };
      const children = top.node.children;

      if (expectedType && top.node.type !== expectedType) return prev;
      if (!children?.length) return prev;

      const maxIdx = children.length - 1;
      const nextIdx = Math.max(0, Math.min(maxIdx, top.cursorIndex + steps));
      if (nextIdx === top.cursorIndex) return prev;

      top.cursorIndex = nextIdx;
      newStack[newStack.length - 1] = top;
      return newStack;
    });
  };

  const showAlphaJumpHud = (key: string) => {
    setAlphaJumpKey(key);
    if (alphaJumpTimerRef.current !== null) {
      window.clearTimeout(alphaJumpTimerRef.current);
    }
    alphaJumpTimerRef.current = window.setTimeout(() => {
      alphaJumpTimerRef.current = null;
      setAlphaJumpKey(undefined);
    }, ALPHA_JUMP_HUD_MS);
  };

  const tryClassicAlphaJump = (steps: number) => {
    if (!currentNode.alphaSections?.length || (currentNode.children?.length || 0) < ALPHA_JUMP_MIN_ITEMS) return false;

    const now = performance.now();
    const stats = alphaJumpStatsRef.current;
    if (now - stats.startedAt > ALPHA_JUMP_WINDOW_MS) {
      stats.startedAt = now;
      stats.steps = 0;
    }
    stats.steps += Math.abs(steps);

    if (stats.steps < ALPHA_JUMP_STEP_THRESHOLD && Math.abs(steps) < 3) return false;

    const activeSection = findAlphaSectionForIndex(currentNode.alphaSections, cursorIndex) || currentNode.alphaSections[0];
    const activeSectionIndex = Math.max(0, currentNode.alphaSections.findIndex(section => section.key === activeSection.key));
    const direction = steps > 0 ? 1 : -1;
    const nextSection = currentNode.alphaSections[Math.max(0, Math.min(currentNode.alphaSections.length - 1, activeSectionIndex + direction))];
    if (!nextSection || nextSection.startIndex === cursorIndex) return false;

    showAlphaJumpHud(nextSection.key);
    setStack(prev => {
      const nextStack = [...prev];
      const top = { ...nextStack[nextStack.length - 1] };
      if (top.node.id !== currentNode.id) return prev;
      top.cursorIndex = nextSection.startIndex;
      nextStack[nextStack.length - 1] = top;
      return nextStack;
    });
    return true;
  };

  const setCoverFlowCursorIndex = useCallback((index: number) => {
    setStack(prev => {
      const newStack = [...prev];
      const top = { ...newStack[newStack.length - 1] };
      const children = top.node.children;

      if (top.node.type !== 'coverFlow' || !children?.length) return prev;

      const maxIdx = children.length - 1;
      const nextIdx = Math.max(0, Math.min(maxIdx, index));
      if (nextIdx === top.cursorIndex) return prev;

      top.cursorIndex = nextIdx;
      newStack[newStack.length - 1] = top;
      return newStack;
    });
  }, []);

  const moveMainMenuOrderItem = (key: string, steps: number) => {
    if (!steps) return;
    let nextIndex = -1;
    setMainMenuDraftOrder(current => {
      const order = normalizeMainMenuOrder(current || mainMenuOrder);
      const currentIndex = order.indexOf(key);
      if (currentIndex < 0) return order;
      nextIndex = Math.max(0, Math.min(order.length - 1, currentIndex + steps));
      if (nextIndex === currentIndex) return order;
      const nextOrder = [...order];
      const [item] = nextOrder.splice(currentIndex, 1);
      nextOrder.splice(nextIndex, 0, item);
      return nextOrder;
    });
    if (nextIndex >= 0) {
      setStack(prev => {
        const nextStack = [...prev];
        const top = { ...nextStack[nextStack.length - 1] };
        if (top.node.id !== 'set_main_menu') return prev;
        top.cursorIndex = nextIndex;
        nextStack[nextStack.length - 1] = top;
        return nextStack;
      });
    }
  };

  const handleRotateStart = () => {
    if (currentNode.type !== 'coverFlow' || coverFlowSelectingRef.current) return;
    setCoverFlowIsDragging(true);
  };

  const handleRotateEnd = ({ velocity }: RotateEndMeta) => {
    if (currentNode.type !== 'coverFlow') return;
    setCoverFlowIsDragging(false);
    setCoverFlowRelease(prev => ({
      id: prev.id + 1,
      velocity,
    }));
  };

  const handleRotate = (steps: number) => {
    setLastInteractionAt(Date.now());

    if (currentNode.id === 'set_main_menu' && mainMenuReorderKey) {
      moveMainMenuOrderItem(mainMenuReorderKey, steps);
      return;
    }

    const activePlaybackQueue = playbackQueue.length
      ? playbackQueue
      : localMusic.playbackQueue.length ? localMusic.playbackQueue : localMusic.tracks;
    if (currentNode.type === 'nowPlaying' && steps !== 0 && activePlaybackQueue.length) {
      const currentQueueIndex = Math.max(
        0,
        activePlaybackQueue.findIndex(track => track.id === localMusic.currentTrack?.id),
      );
      const queueNode: MenuNode = {
        id: 'now_playing_queue',
        title: tx(language, 'Up Next', '下一首列表'),
        type: 'menu',
        children: activePlaybackQueue.map((track, index) => localTrackNode(track, activePlaybackQueue, index, language)),
      };
      const maxIdx = activePlaybackQueue.length - 1;
      const nextIndex = Math.max(0, Math.min(maxIdx, currentQueueIndex + steps));
      setStack(prev => [...prev, { node: queueNode, cursorIndex: nextIndex }]);
      return;
    }

    if (currentNode.type === 'ebookReader' && steps !== 0) {
      sendEbookReaderCommand({ action: 'scroll', steps });
      return;
    }

    const canRotate = isMenuLikeNode(currentNode) || currentNode.type === 'coverFlow';
    if (!canRotate || !currentNode.children || steps === 0) return;

    if (currentNode.type === 'coverFlow') {
      if (coverFlowSelectingRef.current) return;
      setCoverFlowIsDragging(true);

      const boundedSteps = Math.max(
        -COVER_FLOW_MAX_STEPS_PER_INPUT,
        Math.min(COVER_FLOW_MAX_STEPS_PER_INPUT, steps),
      );
      rotateStackTop(boundedSteps, 'coverFlow');
      return;
    }

    if (tryClassicAlphaJump(steps)) return;

    rotateStackTop(steps);
  };

  const nextFromOrder = (currentValue: string, order: string[]) => {
    const currentIndex = Math.max(0, order.indexOf(currentValue));
    return order[(currentIndex + 1) % order.length];
  };

  const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}`;

  const closeTextEditor = () => {
    setTextEditor(undefined);
    setStack(prev => (
      prev[prev.length - 1]?.node.type === 'textEditor'
        ? prev.slice(0, -1)
        : prev
    ));
  };

  const openTextEditor = (editor: TextEditorState, title: string) => {
    setTextEditor(editor);
    setStack(prev => [
      ...prev,
      {
        node: {
          id: `text_editor_${editor.kind}_${editor.mode}_${editor.id || Date.now().toString(36)}`,
          title,
          type: 'textEditor',
        },
        cursorIndex: 0,
      },
    ]);
  };

  const updateTextEditorField = (field: EditorFieldKey, value: string) => {
    setTextEditor(current => {
      if (!current) return current;
      const next = {
        ...current,
        error: undefined,
        fields: {
          ...current.fields,
          [field]: value,
        },
      };
      if (next.kind === 'note' && next.mode === 'create') {
        const body = next.fields.body || '';
        const title = next.fields.title || body.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 48) || '';
        setNoteDraft({
          id: next.id || 'draft_note',
          title,
          body,
          updatedAt: Date.now(),
          attachedSongTitle: currentSong?.title,
          attachedSongArtist: currentSong?.artist,
          isDraft: true,
        });
      }
      return next;
    });
  };

  const setTextEditorError = (message: string) => {
    setTextEditor(current => current ? { ...current, error: message } : current);
  };

  const openNoteEditor = (mode: EditorMode, noteId?: string, useDraft = false, attachCurrentSong = false) => {
    const note = useDraft ? noteDraft : noteId ? notes.find(item => item.id === noteId) : undefined;
    if (mode === 'edit' && !note) return;
    const songHeader = attachCurrentSong && currentSong
      ? `[${currentSong.artist} - ${currentSong.title}]\n\n`
      : '';

    openTextEditor({
      kind: 'note',
      mode,
      id: note?.id,
      fields: {
        title: note?.title || '',
        body: note?.body || songHeader,
      },
    }, mode === 'create' ? t(language, 'newNote') : t(language, 'editNote'));
  };

  const openContactEditor = (mode: EditorMode, contactId?: string) => {
    const contact = contactId ? contacts.find(item => item.id === contactId) : undefined;
    if (mode === 'edit' && !contact) return;

    openTextEditor({
      kind: 'contact',
      mode,
      id: contact?.id,
      fields: {
        name: contact?.name || '',
        phone: contact?.phone || '',
        email: contact?.email || '',
      },
    }, mode === 'create' ? t(language, 'newContact') : t(language, 'editContact'));
  };

  const openCalendarEventEditor = (mode: EditorMode, eventId?: string, dateOverride?: string) => {
    const event = eventId ? calendarEvents.find(item => item.id === eventId) : undefined;
    if (mode === 'edit' && !event) return;

    openTextEditor({
      kind: 'calendarEvent',
      mode,
      id: event?.id,
      fields: {
        date: event?.date || dateOverride || calendarFocusDate || todayInputValue(),
        time: event?.time || '',
        title: event?.title || '',
        notes: event?.notes || '',
      },
    }, mode === 'create' ? t(language, 'newEvent') : t(language, 'editEvent'));
  };

  const openEbookEditor = (mode: EditorMode, ebookId?: string) => {
    const ebook = ebookId ? ebooks.find(item => item.id === ebookId) : undefined;
    if (mode === 'edit' && !ebook) return;

    openTextEditor({
      kind: 'ebook',
      mode,
      id: ebook?.id,
      fields: {
        title: ebook?.title || '',
        name: ebook?.author || '',
        body: ebook?.body || '',
      },
    }, mode === 'create' ? tx(language, 'Paste Book Text', '粘贴图书文本') : tx(language, 'Edit Book', '编辑图书'));
  };

  const openWorkoutEditor = (mode: EditorMode, workoutId?: string, preset?: Pick<WorkoutEntry, 'title' | 'notes'>) => {
    const workout = workoutId ? workouts.find(item => item.id === workoutId) : undefined;
    if (mode === 'edit' && !workout) return;

    openTextEditor({
      kind: 'workout',
      mode,
      id: workout?.id,
      fields: {
        title: workout?.title || preset?.title || '',
        date: workout?.date || todayInputValue(),
        notes: workout?.notes || preset?.notes || '',
      },
    }, mode === 'create' ? tx(language, 'Log Workout', '记录健身') : tx(language, 'Edit Workout', '编辑健身记录'));
  };

  const updateEbookProgress = useCallback((ebookId: string, progress: number, chapterIndex?: number) => {
    const safeProgress = Math.max(0, Math.min(1, progress));
    setEbooks(current => current.map(ebook => (
      ebook.id === ebookId
        ? {
            ...ebook,
            progress: Math.max(ebook.progress || 0, safeProgress),
            currentChapterIndex: chapterIndex ?? ebook.currentChapterIndex,
          }
        : ebook
    )));
  }, []);

  const importEbookFile = async (file: File) => {
    setEbookImportState({ importing: true, status: 'working', message: tx(language, 'Importing {name}...', '正在导入 {name}...', { name: file.name }) });
    try {
      const imported = await parseEbookFile(file);
      const savedBook: EbookEntry = {
        id: `ebook_import_${Date.now().toString(36)}`,
        title: imported.title,
        author: imported.author,
        body: imported.body,
        updatedAt: Date.now(),
      };
      setEbooks(current => [savedBook, ...current]);
      setEbookImportState({
        importing: false,
        status: 'success',
        message: tx(language, 'Imported {name}', '已导入 {name}', { name: savedBook.title }),
      });
    } catch (error) {
      setEbookImportState({
        importing: false,
        status: 'error',
        message: error instanceof Error ? error.message : tx(language, 'Book import failed.', '图书导入失败。'),
      });
    }
  };

  const openEbookFilePicker = () => {
    ebookFileInputRef.current?.click();
  };

  const saveTextEditor = () => {
    if (!textEditor) return;

    if (textEditor.kind === 'note') {
      const body = (textEditor.fields.body || '').trim();
      const title = (textEditor.fields.title || '').trim()
        || body.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 48)
        || '';
      if (!title && !body) {
        setTextEditorError(t(language, 'enterTitleOrBody'));
        return;
      }

      const savedNote: NoteEntry = {
        id: textEditor.id || newId('note'),
        title,
        body,
        updatedAt: Date.now(),
        attachedSongTitle: currentSong?.title,
        attachedSongArtist: currentSong?.artist,
      };
      setNotes(current => (
        textEditor.mode === 'edit'
          ? current.map(note => note.id === savedNote.id ? savedNote : note)
          : [...current, savedNote]
      ));
      setNoteDraft(undefined);
      closeTextEditor();
      return;
    }

    if (textEditor.kind === 'contact') {
      const name = (textEditor.fields.name || '').trim();
      if (!name) {
        setTextEditorError(t(language, 'nameRequired'));
        return;
      }

      const savedContact: ContactEntry = {
        id: textEditor.id || newId('contact'),
        name,
        phone: (textEditor.fields.phone || '').trim(),
        email: (textEditor.fields.email || '').trim(),
      };
      setContacts(current => (
        textEditor.mode === 'edit'
          ? current.map(contact => contact.id === savedContact.id ? savedContact : contact)
          : [...current, savedContact]
      ));
      closeTextEditor();
      return;
    }

    if (textEditor.kind === 'ebook') {
      const title = (textEditor.fields.title || '').trim();
      const body = (textEditor.fields.body || '').trim();
      const existingBook = textEditor.id ? ebooks.find(ebook => ebook.id === textEditor.id) : undefined;
      if (!title || !body) {
        setTextEditorError(tx(language, 'Book title and body are required.', '图书标题和正文不能为空。'));
        return;
      }

      const savedBook: EbookEntry = {
        id: textEditor.id || newId('ebook'),
        title,
        author: (textEditor.fields.name || '').trim(),
        body,
        progress: existingBook?.progress,
        currentChapterIndex: existingBook?.currentChapterIndex,
        updatedAt: Date.now(),
      };
      setEbooks(current => (
        textEditor.mode === 'edit'
          ? current.map(ebook => ebook.id === savedBook.id ? savedBook : ebook)
          : [...current, savedBook]
      ));
      closeTextEditor();
      return;
    }

    if (textEditor.kind === 'workout') {
      const title = (textEditor.fields.title || '').trim();
      const date = (textEditor.fields.date || todayInputValue()).trim();
      if (!title) {
        setTextEditorError(tx(language, 'Workout title is required.', '健身标题不能为空。'));
        return;
      }
      if (!isValidDateInput(date)) {
        setTextEditorError(t(language, 'validDateRequired'));
        return;
      }

      const savedWorkout: WorkoutEntry = {
        id: textEditor.id || newId('workout'),
        title,
        date,
        notes: (textEditor.fields.notes || '').trim(),
        updatedAt: Date.now(),
      };
      setWorkouts(current => (
        textEditor.mode === 'edit'
          ? current.map(workout => workout.id === savedWorkout.id ? savedWorkout : workout)
          : [...current, savedWorkout]
      ));
      closeTextEditor();
      return;
    }

    const date = (textEditor.fields.date || todayInputValue()).trim();
    const time = (textEditor.fields.time || '').trim();
    const title = (textEditor.fields.title || '').trim();
    const notesText = (textEditor.fields.notes || '').trim();

    if (!isValidDateInput(date)) {
      setTextEditorError(t(language, 'validDateRequired'));
      return;
    }
    if (!isValidTimeInput(time)) {
      setTextEditorError(t(language, 'validTimeRequired'));
      return;
    }
    if (!title) {
      setTextEditorError(t(language, 'eventTitleRequired'));
      return;
    }

    const savedEvent: CalendarEventEntry = {
      id: textEditor.id || newId('event'),
      date,
      time,
      title,
      notes: notesText,
      updatedAt: Date.now(),
    };
    setCalendarEvents(current => (
      textEditor.mode === 'edit'
        ? current.map(event => event.id === savedEvent.id ? savedEvent : event)
        : [...current, savedEvent]
    ));
    closeTextEditor();
  };

  const resetNavigationToRoot = () => {
    setMainMenuReorderKey(undefined);
    setMainMenuDraftOrder(undefined);
    setUnlockArmed(false);
    setStack([{ node: rootMenu, cursorIndex: 0 }]);
  };

  const switchDeviceMode = (nextMode: DeviceMode | ((current: DeviceMode) => DeviceMode)) => {
    resetNavigationToRoot();
    setDeviceMode(nextMode);
  };

  const runAction = async (node: MenuNode) => {
    setLastInteractionAt(Date.now());
    switch (node.action) {
      case 'local_music_scan':
        await localMusic.scanLibrary();
        break;
      case 'local_toggle_continuation':
        setContinuationMode(currentMode => {
          const nextMode: ContinuationMode = currentMode === 'library' ? 'album' : 'library';
          writeContinuationMode(nextMode);
          return nextMode;
        });
        break;
      case 'player_shuffle_all':
        await setPlaybackMode('shuffle');
        setPlaybackQueue(localMusic.tracks);
        await playQueue(localMusic.tracks, randomStartIndex(localMusic.tracks.length), { shuffle: true });
        setStack(prev => [
          ...prev,
          { node: nowPlayingNodeForLocale(language), cursorIndex: 0 }
        ]);
        break;
      case 'settings_cycle_click_sound':
        setUiSoundVolumeState(currentVolume => {
          const currentIndex = UI_SOUND_VOLUME_STEPS.findIndex(step => Math.abs(step - currentVolume) < 0.01);
          const nextIndex = currentIndex >= 0
            ? (currentIndex + 1) % UI_SOUND_VOLUME_STEPS.length
            : UI_SOUND_VOLUME_STEPS.findIndex(step => step > currentVolume);
          return UI_SOUND_VOLUME_STEPS[nextIndex >= 0 ? nextIndex : 0];
        });
        break;
      case 'settings_toggle_theme':
        setTheme(current => current === 'dark' ? 'light' : 'dark');
        break;
      case 'settings_set_clickwheel_color': {
        const nextColor = normalizeClickWheelColor(node.settingKey);
        if (nextColor) setClickWheelColor(nextColor);
        break;
      }
      case 'settings_cycle_device_mode':
        switchDeviceMode(current => current === 'clickWheel' ? 'nano6Touch' : 'clickWheel');
        break;
      case 'settings_set_device_mode':
        if (node.settingKey === 'clickWheel' || node.settingKey === 'nano6Touch') {
          switchDeviceMode(node.settingKey);
        }
        break;
      case 'settings_toggle_auto_scan':
        setAutoScan(!autoScan);
        break;
      case 'settings_cycle_library_source': {
        const currentIndex = Math.max(0, LIBRARY_SOURCE_ORDER.indexOf(librarySource));
        const next = LIBRARY_SOURCE_ORDER[(currentIndex + 1) % LIBRARY_SOURCE_ORDER.length];
        setLibrarySource(next);
        if (next === 'custom' && !localMusic.hasCustomFolder) {
          await localMusic.pickCustomFolder().catch(() => undefined);
        }
        break;
      }
      case 'settings_pick_custom_folder':
        await localMusic.pickCustomFolder().catch(() => undefined);
        if (librarySource !== 'custom') setLibrarySource('custom');
        break;
      case 'settings_clear_custom_folder':
        await localMusic.clearCustomFolder().catch(() => undefined);
        break;
      case 'media_scan':
        await mediaLibrary.scanMedia();
        break;
      case 'radio_scan':
        await radio.scanStations();
        break;
      case 'radio_tune':
        if (typeof node.radioFrequency === 'number') {
          await radio.tune(node.radioFrequency);
        }
        break;
      case 'radio_seek_up':
        await radio.seekUp();
        break;
      case 'radio_seek_down':
        await radio.seekDown();
        break;
      case 'radio_start':
        await radio.start();
        break;
      case 'radio_stop':
        await radio.stop();
        break;
      case 'radio_save_preset':
        radio.savePreset();
        break;
      case 'radio_delete_preset':
        if (typeof node.radioFrequency === 'number') {
          radio.deletePreset(node.radioFrequency);
        }
        break;
      case 'voice_memos_refresh':
        await voiceMemos.refresh();
        break;
      case 'voice_memos_toggle_record':
        await voiceMemos.toggleRecording();
        break;
      case 'voice_memos_play':
        if (node.voiceMemoId) await voiceMemos.play(node.voiceMemoId);
        break;
      case 'voice_memos_delete':
        if (node.voiceMemoId) {
          await voiceMemos.deleteMemo(node.voiceMemoId);
          handleMenu();
        }
        break;
      case 'ebook_import':
        openEbookFilePicker();
        break;
      case 'ebook_add':
        openEbookEditor('create');
        break;
      case 'ebook_edit':
        if (node.ebookId) openEbookEditor('edit', node.ebookId);
        break;
      case 'ebook_delete_confirm':
        if (node.ebookId) {
          setEbooks(current => current.filter(ebook => ebook.id !== node.ebookId));
          handleMenu();
        }
        break;
      case 'workout_add':
        openWorkoutEditor('create');
        break;
      case 'workout_add_walk':
        openWorkoutEditor('create', undefined, { title: tx(language, 'Walk', '步行'), notes: tx(language, 'Duration:\nDistance:\nRoute:', '时长：\n距离：\n路线：') });
        break;
      case 'workout_add_run':
        openWorkoutEditor('create', undefined, { title: tx(language, 'Run', '跑步'), notes: tx(language, 'Duration:\nDistance:\nPace:', '时长：\n距离：\n配速：') });
        break;
      case 'workout_add_strength':
        openWorkoutEditor('create', undefined, { title: tx(language, 'Strength', '力量'), notes: tx(language, 'Focus:\nSets:\nNotes:', '重点：\n组数：\n备注：') });
        break;
      case 'workout_edit':
        if (node.workoutId) openWorkoutEditor('edit', node.workoutId);
        break;
      case 'workout_delete':
        if (node.workoutId) {
          setWorkouts(current => current.filter(workout => workout.id !== node.workoutId));
          handleMenu();
        }
        break;
      case 'contact_add':
        openContactEditor('create');
        break;
      case 'contact_edit':
        if (node.contactId) openContactEditor('edit', node.contactId);
        break;
      case 'contact_delete':
        if (node.contactId) {
          setContacts(current => current.filter(contact => contact.id !== node.contactId));
          handleMenu();
        }
        break;
      case 'note_add':
        openNoteEditor('create');
        break;
      case 'note_quick':
        openNoteEditor('create', undefined, Boolean(noteDraft), !noteDraft);
        break;
      case 'note_discard_draft':
        setNoteDraft(undefined);
        break;
      case 'note_edit':
        if (node.noteId) openNoteEditor('edit', node.noteId);
        break;
      case 'note_delete':
      case 'note_delete_confirm':
        if (node.noteId) {
          setNotes(current => current.filter(note => note.id !== node.noteId));
          handleMenu();
        }
        break;
      case 'calendar_event_add':
        openCalendarEventEditor('create', undefined, node.calendarEventDate || calendarFocusDate);
        break;
      case 'calendar_event_edit':
        if (node.calendarEventId) openCalendarEventEditor('edit', node.calendarEventId);
        break;
      case 'calendar_event_delete':
      case 'calendar_event_delete_confirm':
        if (node.calendarEventId) {
          setCalendarEvents(current => current.filter(event => event.id !== node.calendarEventId));
          handleMenu();
        }
        break;
      case 'sleep_timer_start':
        setSleepTimer(current => ({
          status: 'running',
          startedAt: Date.now(),
          durationMs: node.sleepTimerDurationMs || 30 * 60000,
          endAction: current.endAction,
        }));
        break;
      case 'sleep_timer_cancel':
        setSleepTimer(current => ({ status: 'off', endAction: current.endAction }));
        break;
      case 'sleep_timer_end_now':
        runSleepTimerEndAction(sleepTimer.endAction);
        setSleepTimer(current => ({ ...current, status: 'completed' }));
        break;
      case 'sleep_timer_cycle_action':
        setSleepTimer(current => {
          const index = Math.max(0, SLEEP_ACTION_ORDER.indexOf(current.endAction));
          return { ...current, endAction: SLEEP_ACTION_ORDER[(index + 1) % SLEEP_ACTION_ORDER.length] };
        });
        break;
      case 'editor_save':
        saveTextEditor();
        break;
      case 'editor_cancel':
        closeTextEditor();
        break;
      case 'settings_toggle_main_menu_item':
        if (node.settingKey) {
          setMainMenuEnabled(current => ({
            ...current,
            [node.settingKey as string]: !isMainMenuItemEnabled(current, node.settingKey as string),
          }));
        }
        break;
      case 'settings_cycle_backlight':
        setBacklightTimer(current => nextFromOrder(current, BACKLIGHT_TIMER_ORDER));
        break;
      case 'settings_cycle_eq':
        setEqPreset(current => {
          const nextPreset = nextFromOrder(current, EQ_ORDER);
          localMusic.setEqPreset(nextPreset).catch(error => {
            console.error('EQ update failed', error);
          });
          return nextPreset;
        });
        break;
      case 'settings_toggle_compilations':
        setCompilationsEnabled(current => !current);
        break;
      case 'settings_cycle_language':
        setLanguage(current => current === 'zh-CN' ? 'en' : 'zh-CN');
        break;
      case 'settings_set_language':
        if (node.settingKey) {
          setLanguage(normalizeLocale(node.settingKey));
        }
        break;
      case 'screen_lock':
        setScreenLocked(true);
        setStack(prev => [...prev, {
          node: { id: 'screen_lock_active', title: 'Screen Lock', type: 'screenLock', action: 'screen_unlock' },
          cursorIndex: 0,
        }]);
        break;
      case 'screen_unlock':
        setScreenLocked(false);
        break;
      case 'settings_cycle_playback_mode': {
        const currentIndex = Math.max(0, PLAYBACK_MODE_ORDER.indexOf(playbackMode));
        const nextMode = PLAYBACK_MODE_ORDER[(currentIndex + 1) % PLAYBACK_MODE_ORDER.length];
        await setPlaybackMode(nextMode);
        break;
      }
      case 'settings_reset':
        setUiSoundVolumeState(DEFAULT_UI_SOUND_VOLUME);
        setAutoScan(true);
        setLibrarySource('squarepod');
        setContinuationMode('library');
        setMainMenuEnabled({});
        setBacklightTimer(DEFAULT_BACKLIGHT_TIMER);
        setEqPreset('Off');
        await localMusic.setEqPreset('Off');
        setCompilationsEnabled(true);
        setLanguage('en');
        setTheme('light');
        setClickWheelColor('white');
        switchDeviceMode('clickWheel');
        setNoteDraft(undefined);
        setSleepTimer(DEFAULT_SLEEP_TIMER);
        setStopwatch(DEFAULT_STOPWATCH);
        writeContinuationMode('library');
        writeString(LIBRARY_SOURCE_KEY, 'squarepod');
        writeString(BACKLIGHT_TIMER_KEY, DEFAULT_BACKLIGHT_TIMER);
        writeString(THEME_KEY, 'light');
        writeString(CLICK_WHEEL_COLOR_KEY, 'white');
        writeUiSoundVolume(DEFAULT_UI_SOUND_VOLUME);
        writeString(SETTINGS_DEFAULTS_VERSION_KEY, SETTINGS_DEFAULTS_VERSION);
        await localMusic.clearCustomFolder().catch(() => undefined);
        await setPlaybackMode('sequential');
        break;
      default:
        break;
    }
  };

  const queueWithContinuation = (contextNode: MenuNode, queue: LocalMusicTrack[], selectedIndex: number) => {
    if (
      continuationMode !== 'library' ||
      contextNode.id === 'local_all_songs' ||
      contextNode.id === 'now_playing_queue' ||
      !queue.length ||
      !localMusic.tracks.length ||
      queue.length >= localMusic.tracks.length
    ) {
      return { queue, selectedIndex };
    }

    const contextTrackKeys = new Set(queue.map(localTrackKey));
    const continuationTracks = localMusic.tracks.filter(track => !contextTrackKeys.has(localTrackKey(track)));
    if (!continuationTracks.length) return { queue, selectedIndex };

    return {
      queue: [...queue, ...continuationTracks],
      selectedIndex,
    };
  };

  const startLocalQueue = (contextNode: MenuNode, queue: LocalMusicTrack[], selectedIndex: number) => {
    const playback = queueWithContinuation(contextNode, queue, selectedIndex);
    setPlaybackQueue(playback.queue);
    playQueue(playback.queue, playback.selectedIndex)
      .then(() => {
        setStack(prev => [...prev, { node: nowPlayingNodeForLocale(language), cursorIndex: 0 }]);
      })
      .catch(error => {
        console.error('Local playback failed', error);
      });
  };

  const sendVideoCommand = (command: VideoCommandInput) => {
    setVideoCommand(current => ({
      id: (current?.id || 0) + 1,
      ...command,
    }));
  };

  const sendEbookReaderCommand = (command: EbookReaderCommandInput) => {
    setEbookReaderCommand(current => ({
      id: (current?.id || 0) + 1,
      ...command,
    }));
  };

  const stopwatchElapsedNow = (snapshot = stopwatch) => (
    snapshot.status === 'running' && snapshot.startedAt
      ? snapshot.accumulatedMs + Math.max(0, Date.now() - snapshot.startedAt)
      : snapshot.accumulatedMs
  );

  const toggleStopwatch = () => {
    setStopwatch(current => {
      if (current.status === 'running') {
        return {
          ...current,
          status: 'paused',
          accumulatedMs: stopwatchElapsedNow(current),
          startedAt: undefined,
        };
      }
      return {
        ...current,
        status: 'running',
        startedAt: Date.now(),
      };
    });
  };

  const lapStopwatch = () => {
    setStopwatch(current => {
      if (current.status !== 'running') return current;
      return {
        ...current,
        laps: [...current.laps, stopwatchElapsedNow(current)],
      };
    });
  };

  const resetStopwatch = () => {
    setStopwatch(current => {
      const totalMs = stopwatchElapsedNow(current);
      const lastSession = totalMs > 0
        ? { totalMs, laps: current.laps, endedAt: Date.now() }
        : current.lastSession;
      return { ...DEFAULT_STOPWATCH, lastSession };
    });
  };

  const toggleSelectedMainMenuItem = () => {
    if (currentNode.id !== 'set_main_menu') return false;
    const selectedChild = currentNode.children?.[cursorIndex];
    if (!selectedChild?.settingKey) return false;
    setMainMenuEnabled(current => ({
      ...current,
      [selectedChild.settingKey as string]: !isMainMenuItemEnabled(current, selectedChild.settingKey as string),
    }));
    return true;
  };

  const handleSelect = () => {
    setLastInteractionAt(Date.now());
    if (screenLocked && currentNode.type !== 'screenLock') return;

    if (currentNode.type === 'screenLock') {
      if (!unlockArmed) {
        setUnlockArmed(true);
        return;
      }
      setScreenLocked(false);
      setUnlockArmed(false);
      handleMenu();
      return;
    }

    if (currentNode.type === 'textEditor') {
      saveTextEditor();
      return;
    }

    if (currentNode.id === 'set_main_menu') {
      if (mainMenuReorderKey) {
        setMainMenuOrder(normalizeMainMenuOrder(mainMenuDraftOrder || mainMenuOrder));
        setMainMenuDraftOrder(undefined);
        setMainMenuReorderKey(undefined);
        return;
      }

      const selectedChild = currentNode.children?.[cursorIndex];
      if (selectedChild?.settingKey) {
        setMainMenuDraftOrder(normalizeMainMenuOrder(mainMenuOrder));
        setMainMenuReorderKey(selectedChild.settingKey);
      }
      return;
    }

    if (currentNode.action) {
      runAction(currentNode).catch(error => {
        console.error('Action failed', error);
      });
      return;
    }

    if (currentNode.type === 'stopwatch') {
      toggleStopwatch();
      return;
    }

    if (currentNode.type === 'nowPlaying') {
      const currentIndex = Math.max(0, PLAYBACK_MODE_ORDER.indexOf(playbackMode));
      const nextMode = PLAYBACK_MODE_ORDER[(currentIndex + 1) % PLAYBACK_MODE_ORDER.length];
      setPlaybackMode(nextMode).catch(error => {
        console.error('Playback mode update failed', error);
      });
      return;
    }

    if (currentNode.type === 'radioNowPlaying') {
      (radio.status.isPlaying ? radio.stop() : radio.start()).catch(error => {
        console.error('Radio playback action failed', error);
      });
      return;
    }

    if (currentNode.type === 'videoDetail') {
      sendVideoCommand({ action: 'toggle' });
      return;
    }

    if (currentNode.type === 'songDetail' && currentNode.localTrack) {
      const queue = currentNode.localQueue?.length ? currentNode.localQueue : [currentNode.localTrack];
      const selectedIndex = Math.max(0, currentNode.localQueueIndex ?? queue.findIndex(track => track.id === currentNode.localTrack?.id));
      startLocalQueue(currentNode, queue, selectedIndex);
      return;
    }

    if (currentNode.type === 'coverFlow') {
      const selectedAlbum = currentNode.children?.[cursorIndex];
      if (!selectedAlbum || coverFlowSelectingRef.current) return;

      coverFlowSelectingRef.current = true;
      setCoverFlowIsDragging(false);
      setCoverFlowIsSelecting(true);

      coverFlowSelectTimerRef.current = window.setTimeout(() => {
        coverFlowSelectTimerRef.current = null;
        coverFlowSelectingRef.current = false;
        setCoverFlowIsSelecting(false);
        setStack(prev => {
          const top = prev[prev.length - 1];
          if (top.node.type !== 'coverFlow') return prev;
          return [...prev, { node: selectedAlbum, cursorIndex: 0 }];
        });
      }, COVER_FLOW_SELECT_HERO_MS);
      return;
    }

    if (!isMenuLikeNode(currentNode) || !currentNode.children) return;
    
    const selectedChild = currentNode.children[cursorIndex];
    if (selectedChild.action) {
       runAction(selectedChild).catch(error => {
         console.error('Local music action failed', error);
       });
       return;
    }

    if (selectedChild.localTrack) {
       const localTracks = localQueueFromMenu(currentNode);
       const queue = localTracks.length ? localTracks : [selectedChild.localTrack];
       const selectedIndex = Math.max(0, queue.findIndex(track => track.id === selectedChild.localTrack?.id));
       startLocalQueue(currentNode, queue, selectedIndex);
    } else if (selectedChild.id.startsWith('song_')) {
       setStack(prev => [
         ...prev,
         { node: nowPlayingNodeForLocale(language), cursorIndex: 0 }
       ]);
    } else if (selectedChild.type === 'nowPlaying') {
       // Just go to now playing view without changing song
       setStack(prev => [
         ...prev,
         { node: nowPlayingNodeForLocale(language), cursorIndex: 0 }
       ]);
    } else {
       // Push submenu or other screens (clock, calendar, placeholders, etc.)
       setStack(prev => [...prev, { node: selectedChild, cursorIndex: 0 }]);
    }
  };

  const handleMenu = () => {
    setLastInteractionAt(Date.now());
    if (screenLocked) {
      setUnlockArmed(true);
      return;
    }

    if (currentNode.id === 'set_main_menu' && mainMenuReorderKey) {
      setMainMenuReorderKey(undefined);
      setMainMenuDraftOrder(undefined);
      return;
    }

    if (currentNode.type === 'textEditor') {
      closeTextEditor();
      return;
    }

    if (coverFlowSelectTimerRef.current !== null) {
      window.clearTimeout(coverFlowSelectTimerRef.current);
      coverFlowSelectTimerRef.current = null;
      coverFlowSelectingRef.current = false;
      setCoverFlowIsDragging(false);
      setCoverFlowIsSelecting(false);
    }

    setStack(prev => {
      if (prev.length <= 1) return prev;

      const poppedNodeId = prev[prev.length - 1].node.id;
      const nextStack = prev.slice(0, -1);

      while (
        nextStack.length > 1 &&
        nextStack[nextStack.length - 1].node.id === poppedNodeId
      ) {
        nextStack.pop();
      }

      return nextStack;
    });
  };

  const handlePlayPause = () => {
    setLastInteractionAt(Date.now());
    if (screenLocked) {
      playPause();
      return;
    }

    if (toggleSelectedMainMenuItem()) return;

    if (currentNode.type === 'stopwatch') {
      toggleStopwatch();
      return;
    }

    if (currentNode.type === 'radioNowPlaying') {
      (radio.status.isPlaying ? radio.stop() : radio.start()).catch(error => {
        console.error('Radio playback action failed', error);
      });
      return;
    }

    if (currentNode.type === 'videoDetail') {
      sendVideoCommand({ action: 'toggle' });
      return;
    }

    playPause();
  };

  const seekRelative = (deltaSeconds: number) => {
    setLastInteractionAt(Date.now());
    if (screenLocked) return;

    if (currentNode.type === 'radioNowPlaying') {
      (deltaSeconds > 0 ? radio.seekUp() : radio.seekDown()).catch(error => {
        console.error('Radio seek failed', error);
      });
      return;
    }

    if (currentNode.type === 'videoDetail') {
      sendVideoCommand({ action: 'seek', seconds: deltaSeconds });
      return;
    }

    if (!currentSong) return;

    const duration = Math.max(1, currentSong.duration || 1);
    const currentTarget = Number.isFinite(seekTargetRef.current)
      ? seekTargetRef.current
      : progress;
    seekTargetRef.current = Math.max(0, Math.min(duration, currentTarget + deltaSeconds));

    if (seekInFlightRef.current) return;

    const flushSeek = () => {
      seekInFlightRef.current = true;
      const target = seekTargetRef.current;
      seekTo(target)
        .catch(error => {
          console.error('Seek failed', error);
        })
        .finally(() => {
          if (Math.abs(seekTargetRef.current - target) > 0.5) {
            flushSeek();
            return;
          }
          seekInFlightRef.current = false;
        });
    };

    flushSeek();
  };

  const handleNext = () => {
    setLastInteractionAt(Date.now());
    if (screenLocked) return;

    if (currentNode.id === 'set_main_menu' && !mainMenuReorderKey && toggleSelectedMainMenuItem()) return;

    if (currentNode.type === 'stopwatch') {
      lapStopwatch();
      return;
    }

    if (currentNode.id === 'sleep_timer_running') {
      setSleepTimer(current => current.status === 'running'
        ? { ...current, durationMs: (current.durationMs || 0) + 5 * 60000 }
        : current);
      return;
    }

    if (currentNode.id === 'calendar_today') {
      setCalendarFocusDate(current => shiftDateValue(current, 1));
      return;
    }

    if (currentNode.id === 'calendar_month') {
      setCalendarFocusDate(current => shiftMonthValue(current, 1));
      return;
    }

    if (currentNode.type === 'radioNowPlaying') {
      radio.seekUp().catch(error => {
        console.error('Radio seek failed', error);
      });
      return;
    }

    if (currentNode.type === 'ebookReader') {
      sendEbookReaderCommand({ action: 'chapter', direction: 1 });
      return;
    }

    if (currentNode.type === 'videoDetail') return;

    nextTrack();
  };

  const handlePrev = () => {
    setLastInteractionAt(Date.now());
    if (screenLocked) return;

    if (currentNode.id === 'set_main_menu' && !mainMenuReorderKey && toggleSelectedMainMenuItem()) return;

    if (currentNode.type === 'stopwatch') {
      if (stopwatch.status !== 'running') resetStopwatch();
      return;
    }

    if (currentNode.id === 'sleep_timer_running') {
      setSleepTimer(current => current.status === 'running'
        ? { ...current, durationMs: Math.max(60000, (current.durationMs || 0) - 5 * 60000) }
        : current);
      return;
    }

    if (currentNode.id === 'calendar_today') {
      setCalendarFocusDate(current => shiftDateValue(current, -1));
      return;
    }

    if (currentNode.id === 'calendar_month') {
      setCalendarFocusDate(current => shiftMonthValue(current, -1));
      return;
    }

    if (currentNode.type === 'radioNowPlaying') {
      radio.seekDown().catch(error => {
        console.error('Radio seek failed', error);
      });
      return;
    }

    if (currentNode.type === 'ebookReader') {
      sendEbookReaderCommand({ action: 'chapter', direction: -1 });
      return;
    }

    if (currentNode.type === 'videoDetail') return;

    prevTrack();
  };

  const handleTouchActivateChild = (parentNode: MenuNode, selectedChild: MenuNode, selectedIndex: number) => {
    setLastInteractionAt(Date.now());
    if (screenLocked && parentNode.type !== 'screenLock') return;

    setStack(prev => {
      const nextStack = [...prev];
      const top = { ...nextStack[nextStack.length - 1] };
      if (top.node.id === parentNode.id) {
        top.cursorIndex = selectedIndex;
        nextStack[nextStack.length - 1] = top;
      }
      return nextStack;
    });

    if (selectedChild.action) {
      runAction(selectedChild).catch(error => {
        console.error('Touch action failed', error);
      });
      return;
    }

    if (selectedChild.localTrack) {
      const localTracks = localQueueFromMenu(parentNode);
      const queue = localTracks.length ? localTracks : [selectedChild.localTrack];
      const selectedQueueIndex = Math.max(0, queue.findIndex(track => track.id === selectedChild.localTrack?.id));
      startLocalQueue(parentNode, queue, selectedQueueIndex);
      return;
    }

    if (selectedChild.id.startsWith('song_') || selectedChild.type === 'nowPlaying') {
      setStack(prev => [...prev, { node: nowPlayingNodeForLocale(language), cursorIndex: 0 }]);
      return;
    }

    if (selectedChild.type === 'photoDetail') {
      const mediaQueue = parentNode.children?.filter(child => child.type === 'photoDetail') || [selectedChild];
      const mediaQueueIndex = Math.max(0, mediaQueue.findIndex(child => child.id === selectedChild.id));
      setStack(prev => [...prev, {
        node: {
          ...selectedChild,
          mediaQueue,
          mediaQueueIndex,
        },
        cursorIndex: 0,
      }]);
      return;
    }

    setStack(prev => [...prev, { node: selectedChild, cursorIndex: 0 }]);
  };

  const handleTouchOpenNode = (node: MenuNode) => {
    setLastInteractionAt(Date.now());
    if (node.type === 'nowPlaying') {
      setStack(prev => [...prev, { node: nowPlayingNodeForLocale(language), cursorIndex: 0 }]);
      return;
    }
    const rootIndex = rootMenu.children?.findIndex(child => child.id === node.id) ?? -1;
    setStack([
      { node: rootMenu, cursorIndex: Math.max(0, rootIndex) },
      { node, cursorIndex: 0 },
    ]);
  };

  const handleTouchHome = () => {
    setLastInteractionAt(Date.now());
    setMainMenuReorderKey(undefined);
    setMainMenuDraftOrder(undefined);
    setUnlockArmed(false);
    setStack([{ node: rootMenu, cursorIndex: 0 }]);
  };

  const handleCyclePlaybackMode = () => {
    setLastInteractionAt(Date.now());
    const currentIndex = Math.max(0, PLAYBACK_MODE_ORDER.indexOf(playbackMode));
    const nextMode = PLAYBACK_MODE_ORDER[(currentIndex + 1) % PLAYBACK_MODE_ORDER.length];
    setPlaybackMode(nextMode).catch(error => {
      console.error('Playback mode update failed', error);
    });
  };

  const handleVideoPlay = () => {
    if (!isPlaying) return;
    pausePlayback().catch(error => {
      console.error('Pause before video playback failed', error);
    });
  };

  const handleSetNano6Wallpaper = (url: string) => {
    setLastInteractionAt(Date.now());
    setNano6Wallpaper(url);
  };

  const isClassicDarkTheme = theme === 'dark';
  const classicFrameClass = isClassicDarkTheme
    ? 'relative w-[min(100vw,100vh)] h-[min(100vw,100vh)] rounded-[56px] border-8 border-[#050303] bg-[radial-gradient(circle_at_50%_16%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(145deg,#211b1d_0%,#0c0a0b_48%,#171113_100%)] px-5 pt-4 pb-3 flex flex-col items-center shadow-[0_35px_70px_-16px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-16px_30px_rgba(0,0,0,0.45)]'
    : 'relative w-[min(100vw,100vh)] h-[min(100vw,100vh)] bg-gradient-to-br from-gray-50 to-gray-200 rounded-[56px] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] border-8 border-white px-5 pt-4 pb-3 flex flex-col items-center';

  if (deviceMode === 'nano6Touch') {
    return (
      <>
        <input
          ref={ebookFileInputRef}
          type="file"
          accept=".epub,.txt,.md,.markdown,application/epub+zip,text/plain,text/markdown"
          className="hidden"
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) importEbookFile(file).catch(error => {
              setEbookImportState({
                importing: false,
                status: 'error',
                message: error instanceof Error ? error.message : tx(language, 'Book import failed.', '图书导入失败。'),
              });
            });
          }}
        />
        <Nano6Screen
          rootMenu={rootMenu}
          currentNode={currentNode}
          currentSong={currentSong}
          progress={progress}
          playbackMode={playbackMode}
          isPlaying={isPlaying}
          screenDimmed={screenDimmed}
          locale={language}
          nano6Wallpaper={nano6Wallpaper}
          onOpenNode={handleTouchOpenNode}
          onActivateChild={handleTouchActivateChild}
          onSetWallpaper={handleSetNano6Wallpaper}
          textEditor={textEditor}
          onTextEditorChange={updateTextEditorField}
          onTextEditorSave={saveTextEditor}
          onTextEditorCancel={closeTextEditor}
          onVideoPlay={handleVideoPlay}
          onEbookProgress={updateEbookProgress}
          onBack={handleMenu}
          onHome={handleTouchHome}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onPrev={handlePrev}
          onSeekTo={seekTo}
          onCyclePlaybackMode={handleCyclePlaybackMode}
        />
      </>
    );
  }

  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center p-0 font-sans overflow-hidden">
      <input
        ref={ebookFileInputRef}
        type="file"
        accept=".epub,.txt,.md,.markdown,application/epub+zip,text/plain,text/markdown"
        className="hidden"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) importEbookFile(file).catch(error => {
            setEbookImportState({
              importing: false,
              status: 'error',
              message: error instanceof Error ? error.message : tx(language, 'Book import failed.', '图书导入失败。'),
            });
          });
        }}
      />
      <div className={classicFrameClass}>
        
        {/* Top Section: Screen */}
        <div className={`w-full h-[56%] shrink-0 pb-0 transition-opacity duration-300 ${screenDimmed ? 'opacity-35' : 'opacity-100'}`}>
          <Screen 
            currentNode={currentNode} 
            cursorIndex={cursorIndex} 
            isPlaying={isPlaying} 
            currentSong={currentSong} 
            progress={progress} 
            playbackMode={playbackMode}
            videoCommand={videoCommand}
            ebookReaderCommand={ebookReaderCommand}
            stopwatchElapsedMs={stopwatchElapsedMs}
            stopwatchRunning={stopwatch.status === 'running'}
            stopwatchLaps={stopwatch.laps}
            stopwatchLastSession={stopwatch.lastSession}
            screenLocked={screenLocked}
            unlockArmed={unlockArmed}
            sleepTimer={sleepTimer}
            coverFlowIsSelecting={coverFlowIsSelecting}
            coverFlowIsDragging={coverFlowIsDragging}
            coverFlowReleaseId={coverFlowRelease.id}
            coverFlowReleaseVelocity={coverFlowRelease.velocity}
            locale={language}
            textEditor={textEditor}
            onTextEditorChange={updateTextEditorField}
            onTextEditorSave={saveTextEditor}
            onTextEditorCancel={closeTextEditor}
            onVideoPlay={handleVideoPlay}
            onEbookProgress={updateEbookProgress}
            onCoverFlowSettleTarget={setCoverFlowCursorIndex}
            alphaJumpKey={alphaJumpKey}
            theme={theme}
          />
        </div>

        {/* Bottom Section: Click Wheel */}
        <div className="w-full flex-1 flex items-end justify-center relative min-h-0 pb-0 translate-y-[7px]">
          <ClickWheel 
            onRotate={handleRotate}
            onSelect={handleSelect}
            onMenu={handleMenu}
            onPlayPause={handlePlayPause}
            onNext={handleNext}
            onPrev={handlePrev}
            onNextLongPress={() => seekRelative(SEEK_STEP_SECONDS)}
            onPrevLongPress={() => seekRelative(-SEEK_STEP_SECONDS)}
            onRotateStart={handleRotateStart}
            onRotateEnd={handleRotateEnd}
            theme={theme}
            color={clickWheelColor}
          />
        </div>

      </div>
    </div>
  );
}

const randomStartIndex = (length: number) => {
  if (length <= 1) return 0;
  return Math.floor(Math.random() * length);
};
