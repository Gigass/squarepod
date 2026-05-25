import React from 'react';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BookOpen, Check, ChevronRight, ListMusic, Music, Pause, Play, Repeat, Repeat1, Save, Shuffle, SkipBack, SkipForward, X } from 'lucide-react';
import { EditorFieldKey, MenuNode, PlaybackMode, Song, TextEditorState } from '../types';
import { Locale, t, text } from '../i18n';
import { CachedImage } from './CachedImage';
import { findAlphaSectionForIndex } from '../alphaIndex';
import { DeviceStatus } from '../native/deviceStatus';

interface Nano6ScreenProps {
  rootMenu: MenuNode;
  currentNode: MenuNode;
  currentSong?: Song;
  progress: number;
  playbackMode: PlaybackMode;
  isPlaying: boolean;
  screenDimmed: boolean;
  locale: Locale;
  nano6Wallpaper?: string;
  textEditor?: TextEditorState;
  onOpenNode: (node: MenuNode) => void;
  onActivateChild: (parentNode: MenuNode, child: MenuNode, index: number) => void;
  onSetWallpaper: (url: string) => void;
  onTextEditorChange: (field: EditorFieldKey, value: string) => void;
  onTextEditorSave: () => void;
  onTextEditorCancel: () => void;
  onVideoPlay: () => void;
  onEbookProgress: (ebookId: string, progress: number, chapterIndex?: number) => void;
  onBack: () => void;
  onHome: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekTo: (seconds: number) => Promise<unknown>;
  onCyclePlaybackMode: () => void;
}

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

const tx = (locale: Locale | string | undefined, en: string, zhCN: string, values: Record<string, string | number> = {}) => (
  text(locale, { en, 'zh-CN': zhCN }, values)
);

const modeLabel = (mode: PlaybackMode, locale: Locale) => {
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

const modeIcon = (mode: PlaybackMode) => {
  switch (mode) {
    case 'shuffle':
      return <Shuffle size={12} />;
    case 'repeatOne':
      return <Repeat1 size={12} />;
    case 'repeatAll':
      return <Repeat size={12} />;
    case 'sequential':
    default:
      return <ListMusic size={12} />;
  }
};

const findRootNode = (root: MenuNode, id: string) => root.children?.find(child => child.id === id);

const touchPoint = (event: React.TouchEvent) => event.changedTouches[0] || event.touches[0];

const TAP_SLOP = 10;
const SWIPE_DISTANCE = 38;
const SWIPE_CROSS_AXIS_LIMIT = 56;
const BACK_SWIPE_START_X = 54;
const LONG_PRESS_MS = 720;
const COVER_FLOW_DRAG_PIXELS_PER_ITEM = 76;
const COVER_FLOW_FRICTION = 0.94;
const COVER_FLOW_MIN_VELOCITY = 0.0025;
const COVER_FLOW_EDGE_BACK_SWIPE = 52;

interface TouchStart {
  x: number;
  y: number;
  time: number;
  moved: boolean;
  startedOnInteractive: boolean;
}

const isInteractiveTarget = (target: EventTarget | null) => (
  target instanceof HTMLElement && Boolean(target.closest('button,input,textarea,select,a,[data-nano-interactive="true"]'))
);

const movementFrom = (start: { x: number; y: number }, x: number, y: number) => ({
  dx: x - start.x,
  dy: y - start.y,
  distance: Math.hypot(x - start.x, y - start.y),
});

const nanoTimeLabel = () => new Date().toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

const readViewportSize = () => {
  if (typeof window === 'undefined') return { width: 240, height: 240 };
  const viewport = window.visualViewport;
  const doc = document.documentElement;
  const width = Math.max(1, Math.round(viewport?.width || window.innerWidth || doc.clientWidth || 240));
  const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || doc.clientHeight || 240));
  return { width, height };
};

interface NanoBatteryState {
  percent?: number;
  charging: boolean;
}

const NanoBatteryContext = React.createContext<NanoBatteryState>({ charging: false });

function NanoBatteryIcon({ percent, charging }: NanoBatteryState) {
  const safePercent = Math.max(0, Math.min(100, percent ?? 100));
  const fillColor = safePercent <= 15 ? '#ff3b30' : safePercent <= 30 ? '#ffd60a' : '#d7e878';

  return (
    <div className="flex items-center justify-end gap-[3px]">
      {percent !== undefined && (
        <span className="min-w-[22px] text-right text-[9px] font-black leading-none tabular-nums text-white">
          {safePercent}%
        </span>
      )}
      <div className="relative h-[9px] w-[19px] rounded-[1px] border border-white/90 bg-black/18 p-[1px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.28)]">
        <div className="h-full rounded-[1px]" style={{ width: `${safePercent}%`, backgroundColor: fillColor }} />
        <div className="absolute -right-[3px] top-[2px] h-[5px] w-[2px] rounded-r-[1px] bg-white/86" />
        {charging && (
          <div className="absolute inset-0 grid place-items-center text-[8px] font-black leading-none text-black/75">
            +
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBar({ title, isPlaying }: { title?: string; isPlaying: boolean }) {
  const [timeLabel, setTimeLabel] = React.useState(nanoTimeLabel);
  const battery = React.useContext(NanoBatteryContext);

  React.useEffect(() => {
    const interval = window.setInterval(() => setTimeLabel(nanoTimeLabel()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-[20px] items-center justify-between px-[7px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.82)]">
      <div className="w-[48px] text-[10px] font-black tabular-nums">{isPlaying ? '▶' : ''}</div>
      <div className="min-w-0 flex-1 truncate text-center text-[12px] font-black leading-none">
        {title || timeLabel}
      </div>
      <div className="flex w-[52px] items-center justify-end">
        <NanoBatteryIcon percent={battery.percent} charging={battery.charging} />
      </div>
    </div>
  );
}

const NANO6_HOME_ORDER_KEY = 'squarepod.nano6.homeOrder.v1';
const NANO6_HOME_PAGE_KEY = 'squarepod.nano6.homePage.v1';
const HOME_LONG_PRESS_MS = 560;

interface NanoHomeIcon {
  id: string;
  label: string;
  src: string;
  node: MenuNode;
}

interface AppIconProps {
  icon: NanoHomeIcon;
  editMode: boolean;
  isSelected: boolean;
  onClick: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => void;
  onTouchEnd: (event: React.TouchEvent<HTMLButtonElement>) => void;
}

const chunkIcons = (icons: NanoHomeIcon[]) => {
  const pages: NanoHomeIcon[][] = [];
  for (let index = 0; index < icons.length; index += 4) {
    pages.push(icons.slice(index, index + 4));
  }
  return pages.length ? pages : [[]];
};

const readHomeOrder = () => {
  try {
    const raw = window.localStorage.getItem(NANO6_HOME_ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const writeHomeOrder = (order: string[]) => {
  try {
    window.localStorage.setItem(NANO6_HOME_ORDER_KEY, JSON.stringify(order));
  } catch {
    // localStorage may be unavailable in restricted WebViews.
  }
};

const readHomePage = () => {
  try {
    const parsed = Number(window.localStorage.getItem(NANO6_HOME_PAGE_KEY));
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  } catch {
    return 0;
  }
};

const writeHomePage = (page: number) => {
  try {
    window.localStorage.setItem(NANO6_HOME_PAGE_KEY, String(Math.max(0, Math.floor(page))));
  } catch {
    // localStorage may be unavailable in restricted WebViews.
  }
};

const reconcileHomeOrder = (savedOrder: string[], visibleIcons: NanoHomeIcon[]) => {
  const visibleIds = new Set(visibleIcons.map(icon => icon.id));
  const kept = savedOrder.filter(id => visibleIds.has(id));
  const missing = visibleIcons.map(icon => icon.id).filter(id => !kept.includes(id));
  return [...kept, ...missing];
};

const moveId = (ids: string[], fromIndex: number, toIndex: number) => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const jiggleSeedForId = (id: string) => (
  id.split('').reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 0) % 5
);

const AppIcon: React.FC<AppIconProps> = ({
  icon,
  editMode,
  isSelected,
  onClick,
  onTouchStart,
  onTouchEnd,
}) => {
  const jiggleSeed = React.useMemo(() => jiggleSeedForId(icon.id), [icon.id]);
  const jiggleDirection = jiggleSeed % 2 === 0 ? 1 : -1;
  const jiggleRotation = 1.9 + jiggleSeed * 0.08;
  const jiggleShift = 0.22 + jiggleSeed * 0.03;

  return (
    <button
      type="button"
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={`group relative flex w-[76px] touch-none select-none flex-col items-center gap-[5px] text-white outline-none transition-transform duration-150 ${editMode ? 'scale-[0.985]' : 'active:scale-[0.96]'}`}
      data-nano-interactive="true"
    >
      <motion.div
        className={`relative h-[64px] w-[64px] origin-[50%_62%] overflow-hidden rounded-[14px] shadow-[0_2px_5px_rgba(0,0,0,0.44)] ${isSelected ? 'ring-[3px] ring-white' : ''}`}
        animate={editMode ? {
          rotate: [-jiggleRotation * jiggleDirection, jiggleRotation * jiggleDirection, -jiggleRotation * jiggleDirection],
          x: [-jiggleShift * jiggleDirection, jiggleShift * jiggleDirection, -jiggleShift * jiggleDirection],
          y: [0, -0.28, 0],
        } : { rotate: 0, x: 0, y: 0 }}
        transition={editMode ? {
          duration: 0.32,
          repeat: Infinity,
          ease: 'linear',
        } : { duration: 0.12 }}
      >
        <img src={icon.src} alt="" className="h-full w-full scale-[1.055] object-cover" draggable={false} />
      </motion.div>
      <span className="max-w-full truncate text-[10px] font-black leading-none [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{icon.label}</span>
    </button>
  );
};

function HomeScreen({ rootMenu, currentSong, locale, nano6Wallpaper, onOpenNode }: Pick<Nano6ScreenProps, 'rootMenu' | 'currentSong' | 'locale' | 'nano6Wallpaper' | 'onOpenNode'>) {
  const [page, setPage] = React.useState(readHomePage);
  const [homeOrder, setHomeOrder] = React.useState(readHomeOrder);
  const [editMode, setEditMode] = React.useState(false);
  const [selectedHomeIconId, setSelectedHomeIconId] = React.useState<string>();
  const startRef = React.useRef<TouchStart>();
  const lastTouchAtRef = React.useRef(0);
  const longPressTimerRef = React.useRef<number>();
  const iconTouchRef = React.useRef<{ id: string; index: number; x: number; y: number; moved: boolean }>();
  const orderedIdsRef = React.useRef<string[]>([]);

  const nowPlaying: MenuNode = { id: 'now_playing', title: t(locale, 'nowPlaying'), type: 'nowPlaying' };
  const music = findRootNode(rootMenu, 'music');
  const radio = findRootNode(rootMenu, 'radio');
  const settings = findRootNode(rootMenu, 'settings');
  const extras = findRootNode(rootMenu, 'extras');
  const fitness = findRootNode(rootMenu, 'fitness') || extras?.children?.find(child => child.id === 'fitness');
  const voiceMemos = findRootNode(rootMenu, 'voice_memos') || extras?.children?.find(child => child.id === 'voice_memos');
  const ebooks = findRootNode(rootMenu, 'ebooks') || extras?.children?.find(child => child.id === 'ebooks');
  const photos = findRootNode(rootMenu, 'photos');
  const videos = findRootNode(rootMenu, 'videos') || extras?.children?.find(child => child.id === 'videos');
  const clock = findRootNode(rootMenu, 'ex_clock') || extras?.children?.find(child => child.id === 'ex_clock');
  const musicChild = (id: string) => music?.children?.find(child => child.id === id);
  const placeholder = (id: string, title: string): MenuNode => ({
    id,
    title,
    type: 'localMusicStatus',
    statusTone: 'neutral',
    detailLines: [title],
  });

  const visibleIcons = React.useMemo(() => ([
    { id: 'now_playing', label: t(locale, 'nowPlaying'), node: nowPlaying, src: '/ipod-nano6-icons/now-playing.png' },
    { id: 'radio', label: t(locale, 'radio'), node: radio, src: '/ipod-nano6-icons/radio.png' },
    { id: 'music', label: t(locale, 'music'), node: music, src: '/ipod-nano6-icons/music.png' },
    { id: 'fitness', label: tx(locale, 'Fitness', '健身'), node: fitness, src: '/ipod-nano6-icons/fitness.png' },
    { id: 'artists', label: t(locale, 'artists'), node: musicChild('local_artists'), src: '/ipod-nano6-icons/artists.png' },
    { id: 'albums', label: t(locale, 'albums'), node: musicChild('local_albums'), src: '/ipod-nano6-icons/albums.png' },
    { id: 'songs', label: t(locale, 'allSongs'), node: musicChild('local_all_songs'), src: '/ipod-nano6-icons/songs.png' },
    { id: 'photos', label: t(locale, 'photos'), node: photos?.children?.find(child => child.type === 'photoGrid') || photos, src: '/ipod-nano6-icons/photos.png' },
    { id: 'videos', label: t(locale, 'videos'), node: videos?.children?.find(child => child.id === 'v_all') || videos, src: '/ipod-nano6-icons/videos.png' },
    { id: 'settings', label: t(locale, 'settings'), node: settings, src: '/ipod-nano6-icons/settings.png' },
    { id: 'ebooks', label: tx(locale, 'Books', '图书'), node: ebooks, src: '/ipod-nano6-icons/audiobooks.png' },
    { id: 'voice_memos', label: tx(locale, 'Voice Memos', '语音备忘录'), node: voiceMemos, src: '/ipod-nano6-icons/voice-memos.png' },
    { id: 'clock', label: t(locale, 'clock'), node: clock || placeholder('nano_clock', t(locale, 'clock')), src: '/ipod-nano6-icons/clock.png' },
  ] as Array<Omit<NanoHomeIcon, 'node'> & { node?: MenuNode }>).filter((icon): icon is NanoHomeIcon => Boolean(icon.node)), [clock, currentSong, ebooks, extras, fitness, locale, music, photos, radio, rootMenu, settings, videos, voiceMemos]);

  const orderedIds = React.useMemo(() => reconcileHomeOrder(homeOrder, visibleIcons), [homeOrder, visibleIcons]);
  const iconById = React.useMemo(() => new Map(visibleIcons.map(icon => [icon.id, icon])), [visibleIcons]);
  const orderedIcons = React.useMemo(() => orderedIds.map(id => iconById.get(id)).filter((icon): icon is NanoHomeIcon => Boolean(icon)), [iconById, orderedIds]);
  const pages = React.useMemo(() => chunkIcons(orderedIcons), [orderedIcons]);
  const activePage = Math.max(0, Math.min(page, pages.length - 1));
  const activePageIcons = pages[activePage] || [];

  orderedIdsRef.current = orderedIds;

  React.useEffect(() => {
    const reconciled = reconcileHomeOrder(homeOrder, visibleIcons);
    if (reconciled.join('|') !== homeOrder.join('|')) setHomeOrder(reconciled);
  }, [homeOrder, visibleIcons]);

  React.useEffect(() => {
    writeHomeOrder(orderedIds);
  }, [orderedIds]);

  React.useEffect(() => {
    writeHomePage(activePage);
  }, [activePage]);

  React.useEffect(() => {
    if (page > pages.length - 1) setPage(Math.max(0, pages.length - 1));
  }, [page, pages.length]);

  React.useEffect(() => () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
  }, []);

  React.useEffect(() => {
    if (selectedHomeIconId && !orderedIds.includes(selectedHomeIconId)) setSelectedHomeIconId(undefined);
  }, [orderedIds, selectedHomeIconId]);

  const commitSwipe = (dx: number, dy: number) => {
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dy) < SWIPE_CROSS_AXIS_LIMIT) {
      setPage(current => Math.max(0, Math.min(pages.length - 1, current + (dx < 0 ? 1 : -1))));
    }
  };

  const setOrderedIds = (nextIds: string[]) => {
    orderedIdsRef.current = nextIds;
    setHomeOrder(nextIds);
  };

  const handleEditIconTap = (iconId: string) => {
    if (!selectedHomeIconId) {
      setSelectedHomeIconId(iconId);
      return;
    }
    if (selectedHomeIconId === iconId) {
      setSelectedHomeIconId(undefined);
      return;
    }
    const currentIds = orderedIdsRef.current;
    const firstIndex = currentIds.indexOf(selectedHomeIconId);
    const secondIndex = currentIds.indexOf(iconId);
    if (firstIndex >= 0 && secondIndex >= 0) {
      const nextIds = [...currentIds];
      [nextIds[firstIndex], nextIds[secondIndex]] = [nextIds[secondIndex], nextIds[firstIndex]];
      setOrderedIds(nextIds);
    }
    setSelectedHomeIconId(undefined);
  };

  const startIconTouch = (event: React.TouchEvent<HTMLButtonElement>, icon: NanoHomeIcon, index: number) => {
    const point = touchPoint(event);
    if (!point) return;
    event.stopPropagation();
    iconTouchRef.current = { id: icon.id, index, x: point.clientX, y: point.clientY, moved: false };
    if (editMode) {
      return;
    }
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      setEditMode(true);
      setSelectedHomeIconId(undefined);
    }, HOME_LONG_PRESS_MS);
  };

  const moveIconBeforeLongPress = (x: number, y: number) => {
    const start = iconTouchRef.current;
    if (!start) return;
    const { distance } = movementFrom(start, x, y);
    if (distance > TAP_SLOP) {
      start.moved = true;
      if (!editMode && longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = undefined;
      }
    }
  };

  const endIconTouch = (event: React.TouchEvent<HTMLButtonElement>, icon: NanoHomeIcon) => {
    const point = touchPoint(event);
    const start = iconTouchRef.current;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = undefined;
    }
    iconTouchRef.current = undefined;
    if (!point || !start) return;
    const { dx, dy, distance } = movementFrom(start, point.clientX, point.clientY);
    if (distance > TAP_SLOP) {
      event.preventDefault();
      event.stopPropagation();
      commitSwipe(dx, dy);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    lastTouchAtRef.current = Date.now();
    if (editMode) {
      handleEditIconTap(icon.id);
      return;
    }
    onOpenNode(icon.node);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (Date.now() - lastTouchAtRef.current < 500) return;
    const start = startRef.current;
    startRef.current = undefined;
    if (!start) return;
    commitSwipe(event.clientX - start.x, event.clientY - start.y);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
      moved: false,
      startedOnInteractive: isInteractiveTarget(event.target),
    };
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = touchPoint(event);
    if (!point) return;
    startRef.current = {
      x: point.clientX,
      y: point.clientY,
      time: Date.now(),
      moved: false,
      startedOnInteractive: isInteractiveTarget(event.target),
    };
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = touchPoint(event);
    if (point) moveIconBeforeLongPress(point.clientX, point.clientY);
    const start = startRef.current;
    if (!point || !start) return;
    const { distance } = movementFrom(start, point.clientX, point.clientY);
    if (distance > TAP_SLOP) start.moved = true;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    lastTouchAtRef.current = Date.now();
    const point = touchPoint(event);
    const start = startRef.current;
    startRef.current = undefined;
    if (!point || !start) return;
    const { dx, dy, distance } = movementFrom(start, point.clientX, point.clientY);
    if (distance > TAP_SLOP) event.preventDefault();
    commitSwipe(dx, dy);
  };

  return (
    <div
      className="nano6-home-wallpaper relative h-full w-full touch-none select-none overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {nano6Wallpaper && (
        <>
          <CachedImage src={nano6Wallpaper} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.16),rgba(0,0,0,0.32))]" />
        </>
      )}
      <StatusBar title={editMode ? tx(locale, 'Edit Home', '编辑主屏幕') : undefined} isPlaying={false} />
      {editMode && (
        <button
          type="button"
          className="absolute left-[6px] top-[22px] z-40 rounded-[5px] bg-black/42 px-[8px] py-[3px] text-[10px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditMode(false);
            setSelectedHomeIconId(undefined);
          }}
          onTouchEnd={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditMode(false);
            setSelectedHomeIconId(undefined);
          }}
          data-nano-interactive="true"
        >
          {tx(locale, 'Done', '完成')}
        </button>
      )}
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={activePage}
          className="absolute inset-0 z-10 grid h-full grid-cols-2 content-center justify-items-center gap-x-[6px] gap-y-[10px] px-[12px] pb-[18px] pt-[24px]"
          initial={{ opacity: 0, x: activePage ? 18 : -18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          {activePageIcons.map((icon, localIndex) => {
            const index = activePage * 4 + localIndex;
            return (
              <AppIcon
                key={icon.id}
                icon={icon}
                editMode={editMode}
                isSelected={selectedHomeIconId === icon.id}
                onClick={() => {
                  if (Date.now() - lastTouchAtRef.current < 500 || editMode) return;
                  onOpenNode(icon.node);
                }}
                onTouchStart={event => startIconTouch(event, icon, index)}
                onTouchEnd={event => endIconTouch(event, icon)}
              />
            );
          })}
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-x-0 bottom-[8px] z-20 flex justify-center gap-[4px]">
        {pages.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`h-[8px] w-[8px] touch-none rounded-full p-[1.5px] ${index === activePage ? 'bg-white' : 'bg-black/30'}`}
            onClick={() => setPage(index)}
            onTouchEnd={event => {
              event.preventDefault();
              event.stopPropagation();
              setPage(index);
            }}
            aria-label={tx(locale, 'Page {count}', '第 {count} 页', { count: index + 1 })}
            data-nano-interactive="true"
          />
        ))}
      </div>
    </div>
  );
}

function CoverFlowScreen({ node, locale, onActivateChild, onBack }: { node: MenuNode; locale: Locale; onActivateChild: Nano6ScreenProps['onActivateChild']; onBack: () => void }) {
  const albums = node.children || [];
  const maxIndex = Math.max(0, albums.length - 1);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [position, setPosition] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const positionRef = React.useRef(0);
  const velocityRef = React.useRef(0);
  const rafRef = React.useRef<number>();
  const lastFrameRef = React.useRef<number>();
  const startRef = React.useRef<{ x: number; y: number; position: number; time: number; lastX: number; lastTime: number; moved: boolean }>();

  React.useEffect(() => {
    setSelectedIndex(0);
    setPosition(0);
    positionRef.current = 0;
    velocityRef.current = 0;
  }, [node.id]);

  React.useEffect(() => () => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
  }, []);

  const clampPosition = React.useCallback((value: number) => Math.max(0, Math.min(maxIndex, value)), [maxIndex]);

  const setVisualPosition = React.useCallback((value: number) => {
    const clamped = clampPosition(value);
    positionRef.current = clamped;
    setPosition(clamped);
    setSelectedIndex(Math.round(clamped));
  }, [clampPosition]);

  const stopAnimation = () => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    lastFrameRef.current = undefined;
  };

  const continueInertia = React.useCallback((initialVelocity = 0) => {
    stopAnimation();
    velocityRef.current = initialVelocity;

    const step = (timestamp: number) => {
      const previous = lastFrameRef.current ?? timestamp;
      lastFrameRef.current = timestamp;
      const dt = Math.min(32, timestamp - previous);
      const current = positionRef.current;
      const friction = Math.pow(COVER_FLOW_FRICTION, dt / 16.67);
      const nextVelocity = velocityRef.current * friction;
      let next = current + nextVelocity * (dt / 16.67);

      if (next < 0 || next > maxIndex) {
        next = clampPosition(next);
        velocityRef.current = 0;
      } else {
        velocityRef.current = nextVelocity;
      }

      positionRef.current = next;
      setPosition(next);
      setSelectedIndex(Math.round(next));

      if (Math.abs(velocityRef.current) < COVER_FLOW_MIN_VELOCITY) {
        rafRef.current = undefined;
        lastFrameRef.current = undefined;
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [clampPosition, maxIndex]);

  const selectedAlbum = albums[selectedIndex];
  const visibleAlbums = React.useMemo(() => (
    albums
      .map((album, index) => ({ album, index, distance: index - position }))
      .filter(({ distance }) => Math.abs(distance) <= 2.5)
      .sort((left, right) => {
        const leftAbs = Math.abs(left.distance);
        const rightAbs = Math.abs(right.distance);
        const leftRank = leftAbs < 0.08 ? 300 : leftAbs < 1.1 ? 200 - Math.round(leftAbs * 40) : 100 - Math.round(leftAbs * 20);
        const rightRank = rightAbs < 0.08 ? 300 : rightAbs < 1.1 ? 200 - Math.round(rightAbs * 40) : 100 - Math.round(rightAbs * 20);
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.index - right.index;
      })
  ), [albums, position]);

  const beginDrag = (x: number, y: number) => {
    stopAnimation();
    const now = performance.now();
    startRef.current = {
      x,
      y,
      position: positionRef.current,
      time: now,
      lastX: x,
      lastTime: now,
      moved: false,
    };
    velocityRef.current = 0;
    setIsDragging(true);
  };

  const updateDrag = (x: number, y: number) => {
    const start = startRef.current;
    if (!start) return;
    const now = performance.now();
    const { dx, distance } = movementFrom(start, x, y);
    if (distance > TAP_SLOP) start.moved = true;
    const next = start.position - (dx / COVER_FLOW_DRAG_PIXELS_PER_ITEM);
    const overscroll = next < 0 || next > maxIndex;
    setVisualPosition(overscroll ? start.position - (dx / (COVER_FLOW_DRAG_PIXELS_PER_ITEM * 2.4)) : next);
    const elapsed = Math.max(1, now - start.lastTime);
    velocityRef.current = -((x - start.lastX) / COVER_FLOW_DRAG_PIXELS_PER_ITEM) / elapsed * 16.67;
    start.lastX = x;
    start.lastTime = now;
  };

  const endDrag = (x: number, y: number) => {
    const start = startRef.current;
    startRef.current = undefined;
    setIsDragging(false);
    if (!start) return;
    const { dx, dy, distance } = movementFrom(start, x, y);
    if (distance <= TAP_SLOP && selectedAlbum) {
      onActivateChild(node, selectedAlbum, selectedIndex);
      return;
    }

    const isBackSwipe = dx > COVER_FLOW_EDGE_BACK_SWIPE
      && Math.abs(dy) < SWIPE_CROSS_AXIS_LIMIT
      && start.x <= BACK_SWIPE_START_X;

    if (isBackSwipe) {
      onBack();
      return;
    }

    continueInertia(velocityRef.current);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    beginDrag(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    updateDrag(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    endDrag(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = touchPoint(event);
    if (!point) return;
    beginDrag(point.clientX, point.clientY);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = touchPoint(event);
    if (!point) return;
    event.preventDefault();
    updateDrag(point.clientX, point.clientY);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = touchPoint(event);
    if (!point || !startRef.current) return;
    if (startRef.current?.moved) event.preventDefault();
    event.stopPropagation();
    endDrag(point.clientX, point.clientY);
  };

  if (!albums.length) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-[linear-gradient(180deg,#f5f5f2,#cacdd1)] px-[18px] text-center">
        <StatusBar title={node.title} isPlaying={false} />
        <div className="h-[82px] w-[82px] rounded-[3px] bg-[linear-gradient(135deg,#eeeeee,#9da3aa)] shadow-inner" />
        <div className="mt-[14px] text-[14px] font-black text-neutral-900">{t(locale, 'noAlbums')}</div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full touch-none select-none overflow-hidden bg-[linear-gradient(180deg,#fafafa_0%,#dedfe2_44%,#9ba0a8_45%,#f4f4f2_100%)]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { startRef.current = undefined; setIsDragging(false); continueInertia(0); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { startRef.current = undefined; setIsDragging(false); continueInertia(0); }}
      data-nano-interactive="true"
    >
      <StatusBar title={node.title} isPlaying={false} />
      <div className="absolute inset-x-0 top-[24px] h-[124px]" style={{ perspective: 720, transformStyle: 'preserve-3d' }}>
        {visibleAlbums.map(({ album, distance }) => {
          const abs = Math.abs(distance);
          const sign = Math.sign(distance);
          const near = Math.min(abs, 1);
          const far = Math.max(0, abs - 1);
          const x = abs <= 1
            ? sign * near * 74
            : sign * (74 + far * 42);
          const y = abs <= 1
            ? near * 6
            : 6 + far * 8;
          const z = abs <= 1
            ? 54 - near * 18
            : 36 - far * 14;
          const rotateY = abs <= 1
            ? -sign * near * 62
            : -sign * (62 + far * 8);
          const scale = Math.max(0.56, abs <= 1
            ? 1 - near * 0.2
            : 0.8 - far * 0.08);
          const opacity = Math.max(0.18, abs <= 1
            ? 1 - near * 0.2
            : 0.8 - far * 0.18);
          const zIndex = abs < 0.08
            ? 300
            : abs < 1.1
              ? 200 - Math.round(abs * 40)
              : 100 - Math.round(abs * 20);
          const isCenter = abs < 0.08;
          return (
            <div
              key={album.id}
              className="absolute left-1/2 top-[6px] h-[96px] w-[96px] origin-center overflow-visible will-change-transform"
              style={{
                transform: `translateX(-50%) translate3d(${x}px, ${y}px, ${z}px) rotateY(${rotateY}deg) scale(${scale})`,
                transformStyle: 'preserve-3d',
                zIndex,
                opacity,
                transition: isDragging ? 'none' : 'opacity 120ms linear',
                willChange: 'transform, opacity',
              }}
            >
              <div
                className={`relative h-full w-full overflow-hidden rounded-[2px] bg-neutral-300 ${isCenter ? 'shadow-[0_24px_30px_-14px_rgba(0,0,0,0.74)] ring-1 ring-white/90' : 'shadow-[0_18px_24px_-13px_rgba(0,0,0,0.78)] ring-1 ring-white/80'}`}
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'translateZ(1px)',
                }}
              >
                {album.previewImage ? (
                  <CachedImage src={album.previewImage} className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#e5e5e5,#777)] text-[10px] font-black text-white">{album.title.slice(0, 2)}</div>
                )}
                <div className={`absolute inset-0 ${isCenter ? 'bg-[linear-gradient(112deg,rgba(255,255,255,0.28),rgba(255,255,255,0.05)_36%,rgba(0,0,0,0.08))]' : 'bg-[linear-gradient(115deg,rgba(255,255,255,0.24),rgba(255,255,255,0.03)_38%,rgba(0,0,0,0.14))]'}`} />
              </div>
              <div className="mt-[2px] h-[26px] w-full overflow-hidden rounded-[2px] opacity-35 [transform:scaleY(-1)]">
                {album.previewImage && <CachedImage src={album.previewImage} className="h-full w-full object-cover" draggable={false} />}
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-white" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-[13px] bottom-[18px] text-center">
        <div className="truncate text-[13px] font-black leading-tight text-neutral-950">{selectedAlbum?.title}</div>
        <div className="mt-[2px] truncate text-[10px] font-bold text-neutral-600">{selectedAlbum?.detailLines?.[0] || ''}</div>
        <div className="mt-[7px] text-[9px] font-black tabular-nums text-neutral-500">{selectedIndex + 1} / {albums.length}</div>
      </div>
    </div>
  );
}

function PhotoGridScreen({ node, locale, onActivateChild }: { node: MenuNode; locale: Locale; onActivateChild: Nano6ScreenProps['onActivateChild'] }) {
  const photoGridNode = node.type === 'photos'
    ? node.children?.find(child => child.type === 'photoGrid') || node
    : node;
  const photos = (photoGridNode.children || []).filter(child => child.mediaItem?.kind === 'photo');
  const touchStartRef = React.useRef<{ x: number; y: number; index: number }>();

  if (!photos.length) {
    return (
      <div className="relative flex h-full items-center justify-center bg-black px-[18px] text-center text-[12px] font-black text-white">
        <StatusBar title={photoGridNode.title} isPlaying={false} />
        {t(locale, 'noPhotos')}
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black pt-[20px]">
      <StatusBar title={photoGridNode.title} isPlaying={false} />
      <div
        className="absolute inset-x-0 bottom-0 top-[20px] grid auto-rows-min content-start gap-[3px] overflow-y-auto p-[3px] [scrollbar-width:none]"
        style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
      >
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            className="relative block h-0 w-full overflow-hidden bg-neutral-900 pb-[100%]"
            onClick={() => onActivateChild(photoGridNode, photo, index)}
            onTouchStart={event => {
              const point = touchPoint(event);
              if (point) touchStartRef.current = { x: point.clientX, y: point.clientY, index };
            }}
            onTouchEnd={event => {
              const point = touchPoint(event);
              const start = touchStartRef.current;
              touchStartRef.current = undefined;
              if (!point || !start || start.index !== index) return;
              if (movementFrom(start, point.clientX, point.clientY).distance > TAP_SLOP) return;
              event.preventDefault();
              event.stopPropagation();
              onActivateChild(photoGridNode, photo, index);
            }}
            data-nano-interactive="true"
          >
            <CachedImage src={photo.mediaItem?.thumbnailUri || photo.mediaItem?.uri} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const touchDistance = (first: React.Touch, second: React.Touch) => Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);

const touchCenter = (first: React.Touch, second: React.Touch) => ({
  x: (first.clientX + second.clientX) / 2,
  y: (first.clientY + second.clientY) / 2,
});

const resolveNanoImageSrc = (sourceUrl?: string) => {
  if (!sourceUrl) return '';
  if (sourceUrl.startsWith('file://') || sourceUrl.startsWith('content://')) return Capacitor.convertFileSrc(sourceUrl);
  return sourceUrl;
};

function VideoDetailScreen({ node, locale, onVideoPlay }: { node: MenuNode; locale: Locale; onVideoPlay: Nano6ScreenProps['onVideoPlay'] }) {
  const item = node.mediaItem;
  const videoSrc = resolveNanoImageSrc(item?.uri);
  const posterSrc = resolveNanoImageSrc(item?.thumbnailUri);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [videoHasStarted, setVideoHasStarted] = React.useState(false);
  const [videoIsPaused, setVideoIsPaused] = React.useState(true);

  const startVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.ended) video.currentTime = 0;
    video.play()
      .then(() => {
        setVideoHasStarted(true);
        setVideoIsPaused(false);
      })
      .catch(error => console.error('Nano6 video playback failed', error));
  };

  React.useEffect(() => {
    setVideoHasStarted(false);
    setVideoIsPaused(true);
  }, [node.id]);

  if (!item || !videoSrc) {
    return (
      <div className="relative flex h-full items-center justify-center bg-black px-[18px] text-center text-[12px] font-black text-white">
        <StatusBar title={node.title} isPlaying={false} />
        {t(locale, 'noVideos')}
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black">
      <StatusBar title={node.title} isPlaying={false} />
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          src={videoSrc}
          poster={posterSrc}
          controls={videoHasStarted && !videoIsPaused}
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          onPlay={() => {
            onVideoPlay();
            setVideoHasStarted(true);
            setVideoIsPaused(false);
          }}
          onPause={() => setVideoIsPaused(true)}
          onEnded={() => setVideoIsPaused(true)}
          data-nano-interactive="true"
        />
        {videoIsPaused && (
          <button
            type="button"
            aria-label={tx(locale, 'Play video', '播放视频')}
            onClick={startVideo}
            className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/62 text-white shadow-[0_8px_22px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/30 active:scale-95"
            data-nano-interactive="true"
          >
            <span className="ml-1 block h-0 w-0 border-y-[15px] border-l-[23px] border-y-transparent border-l-current" />
          </button>
        )}
      </div>
    </div>
  );
}

function PhotoDetailScreen({
  node,
  locale,
  onBack,
  onSetWallpaper,
}: {
  node: MenuNode;
  locale: Locale;
  onBack: Nano6ScreenProps['onBack'];
  onSetWallpaper: Nano6ScreenProps['onSetWallpaper'];
}) {
  const photoQueue = React.useMemo(() => {
    const queue = node.mediaQueue?.filter(child => child.type === 'photoDetail') || [];
    return queue.length ? queue : [node];
  }, [node]);
  const [activeIndex, setActiveIndex] = React.useState(() => clamp(node.mediaQueueIndex ?? 0, 0, Math.max(0, photoQueue.length - 1)));
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [wallpaperNotice, setWallpaperNotice] = React.useState('');
  const [cropOpen, setCropOpen] = React.useState(false);
  const [cropZoom, setCropZoom] = React.useState(1);
  const [cropOffset, setCropOffset] = React.useState({ x: 0, y: 0 });
  const [cropImageSize, setCropImageSize] = React.useState({ width: 0, height: 0 });
  const wallpaperNoticeTimerRef = React.useRef<number>();
  const lastWallpaperTapRef = React.useRef(0);
  const lastCropOpenTapRef = React.useRef(0);
  const lastPhotoTapRef = React.useRef({ time: 0, x: 0, y: 0 });
  const gestureRef = React.useRef<{
    mode: 'none' | 'pan' | 'swipe' | 'pinch';
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startOffsetX: number;
    startOffsetY: number;
    startScale: number;
    startDistance: number;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startScale: 1,
    startDistance: 1,
  });
  const cropGestureRef = React.useRef<{
    mode: 'none' | 'pan' | 'pinch';
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    startZoom: number;
    startDistance: number;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startZoom: 1,
    startDistance: 1,
  });

  React.useEffect(() => {
    setActiveIndex(clamp(node.mediaQueueIndex ?? 0, 0, Math.max(0, photoQueue.length - 1)));
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setCropOpen(false);
    setWallpaperNotice('');
    lastPhotoTapRef.current = { time: 0, x: 0, y: 0 };
  }, [node.id, node.mediaQueueIndex, photoQueue.length]);

  React.useEffect(() => () => {
    if (wallpaperNoticeTimerRef.current) window.clearTimeout(wallpaperNoticeTimerRef.current);
  }, []);

  const activePhoto = photoQueue[activeIndex] || node;
  const activePhotoUrl = activePhoto.mediaItem?.uri || activePhoto.previewImage;
  const activePhotoSrc = React.useMemo(() => resolveNanoImageSrc(activePhotoUrl), [activePhotoUrl]);
  const maxOffset = (nextScale = scale) => Math.max(0, (nextScale - 1) * 96);
  const setBoundedOffset = (next: { x: number; y: number }, nextScale = scale) => {
    const bound = maxOffset(nextScale);
    setOffset({
      x: clamp(next.x, -bound, bound),
      y: clamp(next.y, -bound, bound),
    });
  };

  const goPhoto = (direction: number) => {
    setActiveIndex(current => clamp(current + direction, 0, photoQueue.length - 1));
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setCropOpen(false);
    setWallpaperNotice('');
    lastPhotoTapRef.current = { time: 0, x: 0, y: 0 };
  };

  const showWallpaperNotice = (message: string) => {
    setWallpaperNotice(message);
    if (wallpaperNoticeTimerRef.current) window.clearTimeout(wallpaperNoticeTimerRef.current);
    wallpaperNoticeTimerRef.current = window.setTimeout(() => {
      setWallpaperNotice('');
    }, 1250);
  };

  const openCrop = () => {
    if (!activePhotoUrl) return;
    const now = Date.now();
    if (now - lastCropOpenTapRef.current < 450) return;
    lastCropOpenTapRef.current = now;
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setCropOpen(true);
  };

  const getBoundedCropOffset = React.useCallback((next: { x: number; y: number }, nextZoom = cropZoom) => {
    const frame = 176;
    const baseScale = cropImageSize.width && cropImageSize.height
      ? Math.max(frame / cropImageSize.width, frame / cropImageSize.height)
      : 1;
    const displayWidth = cropImageSize.width * baseScale * nextZoom;
    const displayHeight = cropImageSize.height * baseScale * nextZoom;
    return {
      x: clamp(next.x, -Math.max(0, (displayWidth - frame) / 2), Math.max(0, (displayWidth - frame) / 2)),
      y: clamp(next.y, -Math.max(0, (displayHeight - frame) / 2), Math.max(0, (displayHeight - frame) / 2)),
    };
  }, [cropImageSize.height, cropImageSize.width, cropZoom]);

  const setBoundedCropOffset = React.useCallback((next: { x: number; y: number }, nextZoom = cropZoom) => {
    setCropOffset(getBoundedCropOffset(next, nextZoom));
  }, [cropZoom, getBoundedCropOffset]);

  React.useEffect(() => {
    if (!cropOpen) return;
    setCropOffset(current => getBoundedCropOffset(current, cropZoom));
  }, [cropImageSize, cropOpen, cropZoom, getBoundedCropOffset]);

  const commitCroppedWallpaper = async () => {
    if (!activePhotoSrc) return;
    const now = Date.now();
    if (now - lastWallpaperTapRef.current < 450) return;
    lastWallpaperTapRef.current = now;

    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.src = activePhotoSrc;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to load wallpaper source'));
      });

      const frame = 176;
      const outputSize = 512;
      const naturalWidth = image.naturalWidth || cropImageSize.width;
      const naturalHeight = image.naturalHeight || cropImageSize.height;
      if (!naturalWidth || !naturalHeight) throw new Error('Wallpaper source has no dimensions');

      const boundedOffset = getBoundedCropOffset(cropOffset, cropZoom);
      const renderScale = Math.max(frame / naturalWidth, frame / naturalHeight) * cropZoom;
      const displayWidth = naturalWidth * renderScale;
      const displayHeight = naturalHeight * renderScale;
      const imageLeft = frame / 2 + boundedOffset.x - displayWidth / 2;
      const imageTop = frame / 2 + boundedOffset.y - displayHeight / 2;
      const sourceX = clamp((0 - imageLeft) / renderScale, 0, naturalWidth);
      const sourceY = clamp((0 - imageTop) / renderScale, 0, naturalHeight);
      const sourceSize = Math.min(frame / renderScale, naturalWidth - sourceX, naturalHeight - sourceY);
      if (sourceSize <= 0) throw new Error('Invalid wallpaper crop');

      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
      onSetWallpaper(canvas.toDataURL('image/jpeg', 0.9));
      setCropOpen(false);
      showWallpaperNotice(tx(locale, 'Wallpaper Set', '已设置墙纸'));
    } catch (error) {
      console.error('Wallpaper crop failed', error);
      showWallpaperNotice(tx(locale, 'Crop Failed', '裁剪失败'));
    }
  };

  const handleCropTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.touches.length >= 2) {
      cropGestureRef.current = {
        mode: 'pinch',
        startX: 0,
        startY: 0,
        startOffsetX: cropOffset.x,
        startOffsetY: cropOffset.y,
        startZoom: cropZoom,
        startDistance: Math.max(1, touchDistance(event.touches[0], event.touches[1])),
      };
      return;
    }
    const point = touchPoint(event);
    if (!point) return;
    cropGestureRef.current = {
      mode: 'pan',
      startX: point.clientX,
      startY: point.clientY,
      startOffsetX: cropOffset.x,
      startOffsetY: cropOffset.y,
      startZoom: cropZoom,
      startDistance: 1,
    };
  };

  const handleCropTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const gesture = cropGestureRef.current;
    if (event.touches.length >= 2 && gesture.mode === 'pinch') {
      const nextZoom = clamp(gesture.startZoom * (touchDistance(event.touches[0], event.touches[1]) / gesture.startDistance), 1, 4);
      setCropZoom(nextZoom);
      setBoundedCropOffset({ x: gesture.startOffsetX, y: gesture.startOffsetY }, nextZoom);
      return;
    }
    const point = touchPoint(event);
    if (!point || gesture.mode !== 'pan') return;
    setBoundedCropOffset({
      x: gesture.startOffsetX + point.clientX - gesture.startX,
      y: gesture.startOffsetY + point.clientY - gesture.startY,
    });
  };

  const closeCrop = () => {
    setCropOpen(false);
    cropGestureRef.current.mode = 'none';
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.touches.length >= 2) {
      event.preventDefault();
      const first = event.touches[0];
      const second = event.touches[1];
      gestureRef.current = {
        mode: 'pinch',
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
        startScale: scale,
        startDistance: Math.max(1, touchDistance(first, second)),
      };
      return;
    }

    const point = touchPoint(event);
    if (!point) return;
    gestureRef.current = {
      mode: scale > 1 ? 'pan' : 'swipe',
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      lastY: point.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
      startScale: scale,
      startDistance: 1,
    };
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const gesture = gestureRef.current;

    if (event.touches.length >= 2 && gesture.mode === 'pinch') {
      event.preventDefault();
      const first = event.touches[0];
      const second = event.touches[1];
      const center = touchCenter(first, second);
      const nextScale = clamp(gesture.startScale * (touchDistance(first, second) / gesture.startDistance), 1, 4);
      setScale(nextScale);
      setBoundedOffset({
        x: gesture.startOffsetX + (center.x - window.innerWidth / 2) * 0.05 * (nextScale - gesture.startScale),
        y: gesture.startOffsetY + (center.y - window.innerHeight / 2) * 0.05 * (nextScale - gesture.startScale),
      }, nextScale);
      return;
    }

    const point = touchPoint(event);
    if (!point) return;
    const dx = point.clientX - gesture.startX;
    const dy = point.clientY - gesture.startY;
    if (gesture.mode === 'pan') {
      event.preventDefault();
      setBoundedOffset({
        x: gesture.startOffsetX + dx,
        y: gesture.startOffsetY + dy,
      });
      return;
    }

    if (Math.hypot(dx, dy) > TAP_SLOP) event.preventDefault();
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const gesture = gestureRef.current;
    if (gesture.mode === 'pinch') {
      if (scale <= 1.03) {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      } else {
        setBoundedOffset(offset);
      }
      gesture.mode = 'none';
      return;
    }

    const point = touchPoint(event);
    if (!point) {
      gesture.mode = 'none';
      return;
    }
    const { dx, dy } = movementFrom({ x: gesture.startX, y: gesture.startY }, point.clientX, point.clientY);
    const moved = Math.hypot(dx, dy);
    if (
      gesture.mode === 'swipe' &&
      gesture.startX <= BACK_SWIPE_START_X &&
      dx > SWIPE_DISTANCE &&
      Math.abs(dy) < SWIPE_CROSS_AXIS_LIMIT
    ) {
      event.preventDefault();
      onBack();
      gesture.mode = 'none';
      return;
    }

    if (moved <= TAP_SLOP) {
      const now = Date.now();
      const lastTap = lastPhotoTapRef.current;
      const isDoubleTap = now - lastTap.time < 320 && Math.hypot(point.clientX - lastTap.x, point.clientY - lastTap.y) < 32;
      if (isDoubleTap && scale > 1.03) {
        event.preventDefault();
        setScale(1);
        setOffset({ x: 0, y: 0 });
        lastPhotoTapRef.current = { time: 0, x: 0, y: 0 };
        gesture.mode = 'none';
        return;
      }
      lastPhotoTapRef.current = { time: now, x: point.clientX, y: point.clientY };
    } else {
      lastPhotoTapRef.current = { time: 0, x: 0, y: 0 };
    }

    if (gesture.mode === 'swipe' && Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      event.preventDefault();
      goPhoto(dx < 0 ? 1 : -1);
    }
    gesture.mode = 'none';
  };

  return (
    <div
      className="relative flex h-full touch-none select-none items-center justify-center overflow-hidden bg-black"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { gestureRef.current.mode = 'none'; }}
      data-nano-interactive="true"
    >
      <StatusBar title={`${activeIndex + 1}/${photoQueue.length}`} isPlaying={false} />
      <CachedImage
        key={activePhoto.id}
        src={activePhotoUrl}
        className="max-h-full max-w-full object-contain transition-transform duration-100"
        draggable={false}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      />
      <AnimatePresence>
        {wallpaperNotice && (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 items-center gap-[5px] rounded-[8px] border border-white/25 bg-black/72 px-[10px] py-[7px] text-[10px] font-black text-white shadow-[0_8px_20px_rgba(0,0,0,0.45)] [text-shadow:0_1px_1px_rgba(0,0,0,0.7)]"
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.16 }}
          >
            <Check size={13} strokeWidth={3} />
            <span>{wallpaperNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {cropOpen && activePhotoSrc && (
          <motion.div
            className="absolute inset-0 z-50 flex flex-col items-center justify-between bg-black/92 px-[12px] pb-[10px] pt-[24px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onTouchStart={event => event.stopPropagation()}
            onTouchMove={event => event.stopPropagation()}
            onTouchEnd={event => event.stopPropagation()}
            data-nano-interactive="true"
          >
            <div className="absolute left-0 right-0 top-0 h-[20px] bg-[linear-gradient(180deg,#0f0f0f,#000)] text-center text-[10px] font-black leading-[20px] text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.9)]">
              {tx(locale, 'Crop Wallpaper', '裁剪墙纸')}
            </div>
            <div
              className="relative mt-[3px] h-[176px] w-[176px] touch-none overflow-hidden rounded-[5px] bg-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_8px_18px_rgba(0,0,0,0.7)]"
              onTouchStart={handleCropTouchStart}
              onTouchMove={handleCropTouchMove}
              onTouchEnd={(event) => {
                event.preventDefault();
                event.stopPropagation();
                cropGestureRef.current.mode = 'none';
              }}
              onTouchCancel={() => { cropGestureRef.current.mode = 'none'; }}
            >
              <img
                src={activePhotoSrc}
                className="absolute left-1/2 top-1/2 max-w-none select-none"
                draggable={false}
                onLoad={(event) => {
                  setCropImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                style={{
                  width: cropImageSize.width && cropImageSize.height && cropImageSize.width / cropImageSize.height > 1
                    ? `${176 * (cropImageSize.width / cropImageSize.height) * cropZoom}px`
                    : `${176 * cropZoom}px`,
                  height: cropImageSize.width && cropImageSize.height && cropImageSize.width / cropImageSize.height > 1
                    ? `${176 * cropZoom}px`
                    : `${176 * (cropImageSize.height / Math.max(1, cropImageSize.width)) * cropZoom}px`,
                  transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))`,
                }}
              />
              <div className="pointer-events-none absolute inset-0 border border-white/70" />
              <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/25" />
              <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/25" />
              <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/25" />
              <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/25" />
            </div>
            <div className="flex w-full items-center justify-center gap-[7px]">
              <button
                type="button"
                className="min-w-[72px] rounded-[6px] bg-white/16 px-[10px] py-[6px] text-[10px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeCrop();
                }}
                data-nano-interactive="true"
              >
                {t(locale, 'cancel')}
              </button>
              <button
                type="button"
                className="min-w-[72px] rounded-[6px] bg-[#2d8cff] px-[10px] py-[6px] text-[10px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_3px_8px_rgba(0,0,0,0.42)]"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void commitCroppedWallpaper();
                }}
                data-nano-interactive="true"
              >
                {tx(locale, 'Set', '设置')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {activePhotoUrl && (
        <button
          type="button"
          className="absolute bottom-[8px] left-1/2 z-30 -translate-x-1/2 rounded-[6px] bg-black/62 px-[9px] py-[4px] text-[10px] font-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.45)] [text-shadow:0_1px_1px_rgba(0,0,0,0.8)]"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openCrop();
          }}
          onTouchStart={event => {
            event.stopPropagation();
          }}
          onTouchEnd={event => {
            event.preventDefault();
            event.stopPropagation();
            openCrop();
          }}
          data-nano-interactive="true"
        >
          {tx(locale, 'Set Wallpaper', '设置墙纸')}
        </button>
      )}
    </div>
  );
}

interface NanoEbookChapter {
  title: string;
  body: string;
  startRatio: number;
}

const splitNanoEbookChapters = (body: string, locale: Locale): NanoEbookChapter[] => {
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
    if (paragraphs.length <= 3) return [{ title: tx(locale, 'Start', '开始'), body, startRatio: 0 }];
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

function EbookReaderScreen({
  node,
  locale,
  onEbookProgress,
}: {
  node: MenuNode;
  locale: Locale;
  onEbookProgress: Nano6ScreenProps['onEbookProgress'];
}) {
  const shouldReduceMotion = useReducedMotion();
  const body = node.ebookBody || node.detailLines?.[1] || '';
  const chapters = React.useMemo(() => splitNanoEbookChapters(body, locale), [body, locale]);
  const initialChapter = React.useMemo(() => {
    if (typeof node.ebookChapterIndex === 'number') return clamp(node.ebookChapterIndex, 0, Math.max(0, chapters.length - 1));
    const progress = node.ebookProgress || 0;
    const index = chapters.findIndex((chapter, chapterIndex) => {
      const next = chapters[chapterIndex + 1];
      return progress >= chapter.startRatio && (!next || progress < next.startRatio);
    });
    return Math.max(0, index);
  }, [chapters, node.ebookChapterIndex, node.ebookProgress]);
  const [chapterIndex, setChapterIndex] = React.useState(initialChapter);
  const [pageTurnDirection, setPageTurnDirection] = React.useState(1);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const saveTimerRef = React.useRef<number>();
  const autoAdvanceRef = React.useRef(false);
  const activeChapter = chapters[chapterIndex] || chapters[0];
  const chapterProgressBase = activeChapter?.startRatio || 0;
  const nextChapterStart = chapters[chapterIndex + 1]?.startRatio ?? 1;
  const [readProgress, setReadProgress] = React.useState(node.ebookProgress || chapterProgressBase);

  React.useEffect(() => {
    setChapterIndex(initialChapter);
  }, [initialChapter, node.id]);

  React.useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = 0;
    autoAdvanceRef.current = false;
    setReadProgress(chapterProgressBase);
    if (node.ebookId) onEbookProgress(node.ebookId, chapterProgressBase, chapterIndex);
  }, [chapterIndex, chapterProgressBase, node.ebookId, onEbookProgress]);

  const goNextChapter = React.useCallback(() => {
    if (chapterIndex >= chapters.length - 1 || autoAdvanceRef.current) return;
    autoAdvanceRef.current = true;
    setPageTurnDirection(1);
    setChapterIndex(current => Math.min(current + 1, Math.max(0, chapters.length - 1)));
  }, [chapterIndex, chapters.length]);

  const updateProgressFromScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const scrollable = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const chapterRatio = Math.max(0, Math.min(1, scroller.scrollTop / scrollable));
    const progress = chapterProgressBase + (nextChapterStart - chapterProgressBase) * chapterRatio;
    setReadProgress(progress);
    if (!node.ebookId) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      onEbookProgress(node.ebookId as string, progress, chapterIndex);
    }, 160);
    if (chapterRatio >= 0.995 && scroller.scrollTop > 8) {
      goNextChapter();
    }
  };

  if (!body.trim()) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-[#f4f1e8] px-[16px] text-center">
        <StatusBar title={node.title} isPlaying={false} />
        <BookOpen size={34} className="text-neutral-500" />
        <div className="mt-[9px] text-[13px] font-black text-neutral-900">No readable text</div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#f4f1e8] pt-[20px] text-[#211f1a]">
      <StatusBar isPlaying={false} />
      <div className="absolute inset-x-0 top-[20px] z-20 flex h-[15px] items-center gap-[5px] border-b border-[#d7cdb9] bg-[#eee6d6]/96 px-[7px] text-[7px] font-black leading-none text-[#7a6d57]">
        <div className="min-w-0 flex-1 truncate text-[8px] text-[#31291e]">{activeChapter?.title || node.title}</div>
        <span className="shrink-0 tabular-nums">{Math.round(readProgress * 100)}%</span>
        <span className="shrink-0 tabular-nums">{chapterIndex + 1}/{chapters.length}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[35px] overflow-hidden [perspective:760px]">
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={`${node.id}_${chapterIndex}`}
            ref={scrollerRef}
            className="absolute inset-0 origin-left touch-pan-y overflow-y-auto bg-[#f4f1e8] px-[11px] py-[7px] shadow-[inset_10px_0_18px_-18px_rgba(62,45,20,0.7),inset_-10px_0_18px_-18px_rgba(62,45,20,0.55)] [backface-visibility:hidden] [scrollbar-width:none]"
            initial={shouldReduceMotion ? { opacity: 0 } : {
              opacity: 0.42,
              rotateY: pageTurnDirection > 0 ? -76 : 76,
              x: pageTurnDirection > 0 ? 22 : -22,
              scale: 0.985,
            }}
            animate={{ opacity: 1, rotateY: 0, x: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : {
              opacity: 0.18,
              rotateY: pageTurnDirection > 0 ? 82 : -82,
              x: pageTurnDirection > 0 ? -18 : 18,
              scale: 0.985,
            }}
            transition={{ duration: shouldReduceMotion ? 0.08 : 0.34, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: pageTurnDirection > 0 ? 'left center' : 'right center' }}
            onScroll={updateProgressFromScroll}
            onClick={(event) => {
              const scroller = scrollerRef.current;
              if (!scroller) return;
              const hasScrollableContent = scroller.scrollHeight - scroller.clientHeight > 8;
              const clickedForwardSide = event.clientX > scroller.getBoundingClientRect().left + scroller.clientWidth * 0.55;
              if (!hasScrollableContent && clickedForwardSide) goNextChapter();
            }}
            data-nano-interactive="true"
          >
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[18px] bg-[linear-gradient(90deg,transparent,rgba(89,65,31,0.10))]" />
            <div className="whitespace-pre-wrap text-[12px] font-semibold leading-[1.48]">
              {activeChapter?.body || body.replace(/^\s{0,3}#{1,3}\s+/gm, '')}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ListScreen({ node, onActivateChild }: { node: MenuNode; onActivateChild: Nano6ScreenProps['onActivateChild'] }) {
  const children = node.children || [];
  const touchStartRef = React.useRef<{ x: number; y: number }>();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [activeAlphaKey, setActiveAlphaKey] = React.useState<string>();
  const sections = node.alphaSections || [];
  const showAlphaRail = sections.length > 1 && children.length >= 24;
  const hasPlayableChildren = children.some(child => (
    child.localTrack ||
    child.appleMusicSong ||
    child.appleMusicSongId ||
    child.id.startsWith('song_') ||
    child.type === 'songDetail'
  ));
  const isAlbumSongList = Boolean(node.previewImage || node.localAlbumKey || node.id.startsWith('cover_album_')) && hasPlayableChildren;
  const albumArtist = node.detailLines?.[0] || children[0]?.detailLines?.[0] || '';

  const jumpToSectionFromClientY = (clientY: number) => {
    if (!showAlphaRail || !scrollerRef.current) return;
    const rect = scrollerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(0.999, (clientY - rect.top) / rect.height));
    const section = sections[Math.min(sections.length - 1, Math.floor(ratio * sections.length))];
    if (!section) return;
    setActiveAlphaKey(section.key);
    itemRefs.current[section.startIndex]?.scrollIntoView({ block: 'start' });
  };

  const handleAlphaTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = touchPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    jumpToSectionFromClientY(point.clientY);
  };

  const handleAlphaTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = touchPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    jumpToSectionFromClientY(point.clientY);
  };

  const clearAlpha = () => {
    window.setTimeout(() => setActiveAlphaKey(undefined), 180);
  };

  return (
    <div className="relative h-full bg-[#f5f5ef] pt-[20px]">
      <StatusBar title={node.title} isPlaying={false} />
      <div ref={scrollerRef} className={`h-full touch-pan-y overflow-y-auto pt-[1px] [scrollbar-width:none] ${showAlphaRail ? 'pr-[18px]' : ''}`}>
        {isAlbumSongList && (
          <div className="relative flex min-h-[104px] items-center gap-[10px] overflow-hidden border-b border-[#c7c7be] bg-[linear-gradient(180deg,#f8f8f3,#deded4)] px-[9px] py-[9px]">
            {node.previewImage && (
              <CachedImage src={node.previewImage} className="absolute inset-0 h-full w-full scale-125 object-cover opacity-18 blur-[6px]" draggable={false} />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(226,226,216,0.9))]" />
            <div className="relative h-[82px] w-[82px] shrink-0 overflow-hidden rounded-[3px] bg-neutral-300 shadow-[0_8px_15px_rgba(0,0,0,0.42)] ring-1 ring-white/90">
              {node.previewImage ? (
                <CachedImage src={node.previewImage} className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#e8e8e8,#858585)] text-[13px] font-black text-white">
                  {node.title.slice(0, 2)}
                </div>
              )}
              <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.28),rgba(255,255,255,0.03)_42%,rgba(0,0,0,0.16))]" />
            </div>
            <div className="relative min-w-0 flex-1">
              <div className="line-clamp-2 text-[15px] font-black leading-tight text-neutral-950">{node.title}</div>
              {albumArtist && <div className="mt-[5px] truncate text-[10px] font-bold text-neutral-650">{albumArtist}</div>}
              <div className="mt-[7px] text-[9px] font-black text-neutral-500">{children.length} song{children.length === 1 ? '' : 's'}</div>
            </div>
          </div>
        )}
        {children.length ? children.map((child, index) => {
          const section = findAlphaSectionForIndex(sections, index);
          const showSection = section?.startIndex === index;
          return (
            <React.Fragment key={child.id}>
              {showSection && (
                <div className="sticky top-0 z-10 h-[15px] border-b border-[#b9b9b2] bg-[linear-gradient(180deg,#c8c8c1,#aaa9a0)] px-[8px] text-[10px] font-black leading-[15px] text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.62)]">
                  {section.key}
                </div>
              )}
              <button
                ref={element => { itemRefs.current[index] = element; }}
                type="button"
                onClick={() => onActivateChild(node, child, index)}
                onTouchStart={event => {
                  const point = touchPoint(event);
                  if (point) touchStartRef.current = { x: point.clientX, y: point.clientY };
                }}
                onTouchEnd={event => {
                  const point = touchPoint(event);
                  const start = touchStartRef.current;
                  touchStartRef.current = undefined;
                  if (!point || !start) return;
                  const { distance } = movementFrom(start, point.clientX, point.clientY);
                  if (distance > TAP_SLOP) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onActivateChild(node, child, index);
                }}
                className="flex min-h-[38px] w-full touch-manipulation items-center gap-[8px] border-b border-[#cfcfc7] bg-[linear-gradient(180deg,#fbfbf7,#e8e8df)] px-[9px] text-left active:brightness-95"
                data-nano-interactive="true"
              >
                {isAlbumSongList && (
                  <div className="relative h-[30px] w-[30px] shrink-0 overflow-hidden rounded-[2px] bg-neutral-300 shadow-sm">
                    {(child.previewImage || node.previewImage) ? (
                      <CachedImage src={child.previewImage || node.previewImage} className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#ececec,#888)] text-[8px] font-black text-white">
                        {String(index + 1)}
                      </div>
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-black leading-tight text-[#202020]">{child.title}</div>
                  {child.detailLines?.[0] && <div className="mt-[2px] truncate text-[9px] font-semibold text-neutral-500">{child.detailLines[0]}</div>}
                </div>
                <ChevronRight size={17} className="text-neutral-500" />
              </button>
            </React.Fragment>
          );
        }) : (
          <div className="flex h-full items-center justify-center px-[18px] text-center text-[12px] font-black text-neutral-500">No items</div>
        )}
      </div>
      {showAlphaRail && (
        <div
          className="absolute bottom-[4px] right-0 top-[23px] z-30 flex w-[18px] touch-none select-none flex-col items-center justify-center rounded-l-[8px] bg-black/8 py-[3px]"
          onTouchStart={handleAlphaTouchStart}
          onTouchMove={handleAlphaTouchMove}
          onTouchEnd={clearAlpha}
          onTouchCancel={clearAlpha}
          onPointerDown={event => {
            if (event.pointerType === 'touch') return;
            event.preventDefault();
            event.stopPropagation();
            jumpToSectionFromClientY(event.clientY);
          }}
          onPointerMove={event => {
            if (event.pointerType === 'touch' || event.buttons !== 1) return;
            event.preventDefault();
            event.stopPropagation();
            jumpToSectionFromClientY(event.clientY);
          }}
          onPointerUp={clearAlpha}
          data-nano-interactive="true"
        >
          {sections.map(section => (
            <div
              key={section.key}
              className={`grid min-h-0 flex-1 place-items-center text-[8px] font-black leading-none [text-shadow:0_1px_1px_rgba(255,255,255,0.8)] ${activeAlphaKey === section.key ? 'text-[#155ccf]' : 'text-neutral-700'}`}
            >
              {section.key}
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {activeAlphaKey && (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 z-40 grid h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[17px] bg-black/72 text-[45px] font-black leading-none text-white shadow-xl"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
          >
            {activeAlphaKey}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NowPlayingScreen({
  currentSong,
  progress,
  playbackMode,
  isPlaying,
  locale,
  onPlayPause,
  onNext,
  onPrev,
  onSeekTo,
  onCyclePlaybackMode,
}: Pick<Nano6ScreenProps, 'currentSong' | 'progress' | 'playbackMode' | 'isPlaying' | 'locale' | 'onPlayPause' | 'onNext' | 'onPrev' | 'onSeekTo' | 'onCyclePlaybackMode'>) {
  const duration = Math.max(1, currentSong?.duration || 1);
  const percent = Math.max(0, Math.min(100, (progress / duration) * 100));
  const activeLyric = currentSong?.lyrics?.reduce((active, line, index) => line.time <= progress ? index : active, -1);
  const lyric = activeLyric !== undefined && activeLyric >= 0 ? currentSong?.lyrics?.[activeLyric]?.text : '';
  const scrub = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onSeekTo(duration * ratio).catch(error => console.error('Nano6 seek failed', error));
  };

  return (
    <div className="relative h-full overflow-hidden bg-[linear-gradient(180deg,#f6f3ea,#c9c5b8)] px-[10px] pt-[24px]">
      <StatusBar title={t(locale, 'nowPlaying')} isPlaying={isPlaying} />
      {currentSong ? (
        <div className="relative h-full pb-[72px]">
          <div className="relative mx-auto aspect-square w-[88px] shrink-0 overflow-hidden rounded-[3px] bg-neutral-300 shadow-[0_7px_13px_rgba(0,0,0,0.42)]">
            <CachedImage src={currentSong.coverUrl} className="absolute inset-0 h-full w-full object-cover" />
          </div>
          <div className="mt-[5px] text-center">
            <div className="truncate text-[13px] font-black leading-tight">{currentSong.title}</div>
            <div className="mt-[2px] truncate text-[10px] font-bold text-neutral-700">{currentSong.artist}</div>
          </div>
          <div className="mt-[4px] min-h-[20px] px-[8px] text-center text-[8px] font-black leading-[10px] text-neutral-700 line-clamp-2">
            {lyric}
          </div>
          <div className="absolute inset-x-0 bottom-[7px]">
            <div className="h-[6px] rounded-full bg-black/18 p-[1px]" onPointerDown={scrub}>
              <div className="h-full rounded-full bg-[#2b69c8]" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-[3px] flex justify-between text-[9px] font-black tabular-nums text-neutral-700">
              <span>{formatTime(progress)}</span>
              <button
                type="button"
                onClick={onCyclePlaybackMode}
                onTouchEnd={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCyclePlaybackMode();
                }}
                className="flex max-w-[96px] items-center gap-[3px] truncate rounded-[5px] bg-black/10 px-[5px] py-[2px]"
                data-nano-interactive="true"
              >
                {modeIcon(playbackMode)}
                <span className="truncate">{modeLabel(playbackMode, locale)}</span>
              </button>
              <span>-{formatTime(duration - progress)}</span>
            </div>
            <div className="mt-[5px] flex items-center justify-center gap-[14px]">
              <button type="button" onClick={onPrev} className="grid h-[30px] w-[30px] place-items-center rounded-full bg-neutral-900 text-white active:scale-95"><SkipBack size={14} fill="currentColor" /></button>
              <button type="button" onClick={onPlayPause} className="grid h-[38px] w-[38px] place-items-center rounded-full bg-neutral-950 text-white active:scale-95">{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
              <button type="button" onClick={onNext} className="grid h-[30px] w-[30px] place-items-center rounded-full bg-neutral-900 text-white active:scale-95"><SkipForward size={14} fill="currentColor" /></button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <Music className="h-[42px] w-[42px] text-neutral-500" />
          <div className="mt-[10px] text-[13px] font-black">{t(locale, 'noSongSelected')}</div>
        </div>
      )}
    </div>
  );
}

const clockTimeZoneForNode = (node: MenuNode) => {
  const line = node.detailLines?.[0];
  if (line?.includes('/')) return line;
  if (node.id.includes('new_york')) return 'America/New_York';
  if (node.id.includes('london')) return 'Europe/London';
  if (node.id.includes('tokyo')) return 'Asia/Tokyo';
  return undefined;
};

const formatClockZoneLabel = (timeZone?: string) => {
  if (!timeZone) return Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
  return timeZone.replace(/_/g, ' ');
};

const formatSleepTime = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

const sleepSecondsForNode = (node: MenuNode, now: Date) => {
  if (node.sleepTimerStartedAt && node.sleepTimerDurationMs) {
    return Math.max(0, (node.sleepTimerStartedAt + node.sleepTimerDurationMs - now.getTime()) / 1000);
  }
  const firstLine = node.detailLines?.[0] || '';
  const match = firstLine.match(/^(\d+)\s+min left/i);
  if (!match) return 0;
  return Number(match[1]) * 60 - now.getSeconds();
};

const safeClockParts = (now: Date, locale: Locale, timeZone?: string) => {
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    if (typeof formatter.formatToParts === 'function') {
      const parts = formatter.formatToParts(now);
      return {
        hour: Number(parts.find(part => part.type === 'hour')?.value || now.getHours()) % 12,
        minute: Number(parts.find(part => part.type === 'minute')?.value || now.getMinutes()),
        second: Number(parts.find(part => part.type === 'second')?.value || now.getSeconds()),
      };
    }
  } catch (error) {
    console.warn('Clock formatter failed', error);
  }

  return {
    hour: now.getHours() % 12,
    minute: now.getMinutes(),
    second: now.getSeconds(),
  };
};

const safeClockText = (now: Date, timeZone?: string) => {
  try {
    return now.toLocaleTimeString(undefined, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    console.warn('Clock time text failed', error);
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }
};

const safeClockDate = (now: Date, timeZone?: string) => {
  try {
    return now.toLocaleDateString(undefined, {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.warn('Clock date text failed', error);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
};

function ClockScreen({
  node,
  locale,
  onActivateChild,
}: {
  node: MenuNode;
  locale: Locale;
  onActivateChild: Nano6ScreenProps['onActivateChild'];
}) {
  const [now, setNow] = React.useState(new Date());
  const timeZone = clockTimeZoneForNode(node);
  const isSleepTimer = node.id.startsWith('sleep_timer');

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isSleepTimer) {
    const running = node.id === 'sleep_timer_running';
    const completed = node.id === 'sleep_timer_completed';
    const seconds = sleepSecondsForNode(node, now);
    const primary = running ? formatSleepTime(seconds) : completed ? tx(locale, 'DONE', '完成') : t(locale, 'off').toUpperCase();

    return (
      <div className="relative flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,#151515,#050505)] px-[11px] pt-[24px] text-white">
        <StatusBar title={tx(locale, 'Sleep Timer', '睡眠定时')} isPlaying={false} />
        <div className="flex flex-1 flex-col">
          <div className="grid h-[76px] place-items-center rounded-[7px] border border-white/10 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.18),rgba(255,255,255,0.04)_54%,rgba(0,0,0,0.18))] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <div className="text-[34px] font-black leading-none tabular-nums tracking-normal">{primary}</div>
          </div>
          <div className="mt-[8px] min-h-[34px] space-y-[3px]">
            {(node.detailLines || []).slice(0, 2).map((line, index) => (
              <div key={`${line}-${index}`} className="truncate text-[10px] font-black leading-tight text-white/64">{line}</div>
            ))}
          </div>
          <div className="mt-[5px] grid grid-cols-2 gap-[6px]">
            {(node.children || []).slice(0, 4).map((child, index) => {
              const warning = child.statusTone === 'warning';
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onActivateChild(node, child, index)}
                  className={`min-h-[32px] rounded-[5px] border px-[5px] text-[10px] font-black leading-tight active:scale-[0.98] ${
                    warning
                      ? 'border-[#ffb3a7]/50 bg-[#ff3b30] text-white'
                      : 'border-white/15 bg-white/10 text-white'
                  }`}
                  data-nano-interactive="true"
                >
                  {child.title}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const { hour, minute, second } = safeClockParts(now, locale, timeZone);
  const time = safeClockText(now, timeZone);
  const date = safeClockDate(now, timeZone);
  const hourDegrees = hour * 30 + minute * 0.5;
  const minuteDegrees = minute * 6 + second * 0.1;
  const secondDegrees = second * 6;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_24%,#fbfbf3,#d8d4c8_60%,#96928b)] px-[12px] pt-[22px] text-neutral-950">
      <StatusBar title={node.title} isPlaying={false} />
      <div className="grid h-[108px] w-full shrink-0 place-items-center">
        <div className="relative h-[92px] w-[92px] rounded-full border-[5px] border-neutral-950 bg-[#f7f4ea] shadow-[0_9px_14px_rgba(0,0,0,0.28),inset_0_2px_0_rgba(255,255,255,0.82)]">
          {[0, 1, 2, 3].map(index => (
            <div
              key={index}
              className="absolute left-1/2 top-1/2 h-[3px] w-[72px]"
              style={{ transform: `translate(-50%, -50%) rotate(${index * 30}deg)` }}
            >
              <div className="absolute left-0 top-1/2 h-[2px] w-[6px] -translate-y-1/2 rounded-full bg-neutral-950/36" />
              <div className="absolute right-0 top-1/2 h-[2px] w-[6px] -translate-y-1/2 rounded-full bg-neutral-950/36" />
            </div>
          ))}
          <div className="absolute bottom-1/2 left-1/2 h-[23px] w-[5px] origin-bottom rounded-full bg-neutral-950" style={{ transform: `translateX(-50%) rotate(${hourDegrees}deg)` }} />
          <div className="absolute bottom-1/2 left-1/2 h-[33px] w-[3px] origin-bottom rounded-full bg-neutral-950" style={{ transform: `translateX(-50%) rotate(${minuteDegrees}deg)` }} />
          <div className="absolute bottom-1/2 left-1/2 h-[38px] w-[1px] origin-bottom bg-[#d22] shadow-[0_0_0_1px_rgba(210,34,34,0.18)]" style={{ transform: `translateX(-50%) rotate(${secondDegrees}deg)` }} />
          <div className="absolute left-1/2 top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-950 ring-[2px] ring-[#f7f4ea]" />
        </div>
      </div>
      <div className="min-h-0 w-full flex-1 text-center">
        <div className="truncate text-[24px] font-black leading-[1.02] tabular-nums tracking-normal">{time}</div>
        <div className="mt-[5px] truncate text-[11px] font-black leading-tight text-neutral-700">{date}</div>
        <div className="mt-[4px] truncate text-[9px] font-black leading-tight text-neutral-500">{formatClockZoneLabel(timeZone)}</div>
      </div>
    </div>
  );
}

const formatStopwatchTime = (elapsedMs: number) => {
  const safe = Math.max(0, Math.floor(elapsedMs / 10));
  const centiseconds = safe % 100;
  const totalSeconds = Math.floor(safe / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

function StopwatchScreen({ node, locale }: { node: MenuNode; locale: Locale }) {
  const [running, setRunning] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [lapStartedAt, setLapStartedAt] = React.useState(0);
  const [laps, setLaps] = React.useState<number[]>([]);
  const startedAtRef = React.useRef(0);

  React.useEffect(() => {
    if (!running) return undefined;
    startedAtRef.current = performance.now() - elapsedMs;
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current);
    }, 33);
    return () => window.clearInterval(timer);
  }, [running]);

  const toggle = () => {
    setRunning(current => !current);
  };
  const reset = () => {
    setRunning(false);
    setElapsedMs(0);
    setLapStartedAt(0);
    setLaps([]);
  };
  const lap = () => {
    if (elapsedMs <= 0) return;
    const delta = elapsedMs - lapStartedAt;
    setLaps(current => [delta, ...current].slice(0, 5));
    setLapStartedAt(elapsedMs);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,#f8f8f2,#d9d8cf)] px-[10px] pt-[24px] text-neutral-950">
      <StatusBar title={node.title || t(locale, 'stopwatch')} isPlaying={false} />
      <div className="rounded-[7px] border border-neutral-950/12 bg-white/72 px-[8px] py-[11px] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_7px_14px_rgba(0,0,0,0.12)]">
        <div className="text-[32px] font-black leading-none tabular-nums tracking-normal">{formatStopwatchTime(elapsedMs)}</div>
      </div>
      <div className="mt-[8px] grid grid-cols-3 gap-[6px]">
        <button type="button" onClick={lap} className="h-[32px] rounded-[5px] border border-neutral-950/12 bg-white/65 text-[10px] font-black active:scale-[0.98]" data-nano-interactive="true">{tx(locale, 'Lap', '计圈')}</button>
        <button type="button" onClick={toggle} className={`h-[32px] rounded-[5px] text-[10px] font-black text-white active:scale-[0.98] ${running ? 'bg-[#ff9500]' : 'bg-[#34c759]'}`} data-nano-interactive="true">
          {running ? tx(locale, 'Pause', '暂停') : elapsedMs > 0 ? tx(locale, 'Resume', '继续') : tx(locale, 'Start', '开始')}
        </button>
        <button type="button" onClick={reset} className="h-[32px] rounded-[5px] bg-neutral-950 text-[10px] font-black text-white active:scale-[0.98]" data-nano-interactive="true">{tx(locale, 'Reset', '重置')}</button>
      </div>
      <div className="mt-[8px] min-h-0 flex-1 overflow-y-auto rounded-[6px] border border-neutral-950/10 bg-white/42 [scrollbar-width:none]">
        {laps.length ? laps.map((lapMs, index) => (
          <div key={`${lapMs}-${index}`} className="flex h-[25px] items-center justify-between border-b border-neutral-950/8 px-[8px] text-[11px] font-black tabular-nums">
            <span className="text-neutral-500">{tx(locale, 'Lap {count}', '计圈 {count}', { count: laps.length - index })}</span>
            <span>{formatStopwatchTime(lapMs)}</span>
          </div>
        )) : (
          <div className="grid h-full place-items-center px-[12px] text-center text-[11px] font-black leading-tight text-neutral-500">{tx(locale, 'Start, pause, resume, record laps.', '开始、暂停、继续、记录圈数。')}</div>
        )}
      </div>
    </div>
  );
}

const editorLabel = (locale: Locale, kind: TextEditorState['kind'], field: EditorFieldKey) => {
  if (field === 'name') return kind === 'ebook' ? tx(locale, 'Author', '作者') : t(locale, 'name');
  if (field === 'body') return kind === 'ebook' ? tx(locale, 'Book Text', '图书文本') : t(locale, 'body');
  if (field === 'notes') return t(locale, 'notes');
  if (field === 'date') return t(locale, 'date');
  if (field === 'time') return t(locale, 'time');
  if (field === 'phone') return t(locale, 'phone');
  if (field === 'email') return t(locale, 'email');
  return t(locale, 'title');
};

const editorFieldsForKind = (kind: TextEditorState['kind']): EditorFieldKey[] => {
  switch (kind) {
    case 'contact':
      return ['name', 'phone', 'email'];
    case 'calendarEvent':
      return ['date', 'time', 'title', 'notes'];
    case 'ebook':
      return ['title', 'name', 'body'];
    case 'workout':
      return ['title', 'date', 'notes'];
    case 'note':
    default:
      return ['title', 'body'];
  }
};

function NanoTextEditorScreen({
  title,
  locale,
  textEditor,
  onTextEditorChange,
  onTextEditorSave,
  onTextEditorCancel,
}: {
  title: string;
  locale: Locale;
  textEditor?: TextEditorState;
  onTextEditorChange: Nano6ScreenProps['onTextEditorChange'];
  onTextEditorSave: Nano6ScreenProps['onTextEditorSave'];
  onTextEditorCancel: Nano6ScreenProps['onTextEditorCancel'];
}) {
  if (!textEditor) return <DetailScreen node={{ id: 'missing_editor', title, type: 'localMusicStatus', detailLines: [tx(locale, 'Editor state is missing.', '编辑器状态缺失。')] }} locale={locale} />;
  const fields = editorFieldsForKind(textEditor.kind);

  return (
    <div className="relative h-full overflow-hidden bg-[#f5f5ef] pt-[20px]">
      <StatusBar title={title} isPlaying={false} />
      <div className="absolute inset-x-0 bottom-[31px] top-[20px] touch-pan-y overflow-y-auto px-[9px] py-[7px] [scrollbar-width:none]" data-nano-interactive="true">
        {fields.map(field => {
          const isLong = field === 'body' || field === 'notes';
          return (
            <label key={field} className="mb-[7px] block">
              <span className="mb-[3px] block text-[9px] font-black text-neutral-500">{editorLabel(locale, textEditor.kind, field)}</span>
              {isLong ? (
                <textarea
                  value={textEditor.fields[field] || ''}
                  onChange={event => onTextEditorChange(field, event.target.value)}
                  className="min-h-[82px] w-full resize-none rounded-[5px] border border-[#c7c7be] bg-white px-[7px] py-[6px] text-[12px] font-semibold leading-snug text-neutral-950 outline-none focus:border-[#2b69c8]"
                  data-nano-interactive="true"
                />
              ) : (
                <input
                  value={textEditor.fields[field] || ''}
                  onChange={event => onTextEditorChange(field, event.target.value)}
                  className="h-[30px] w-full rounded-[5px] border border-[#c7c7be] bg-white px-[7px] text-[12px] font-semibold text-neutral-950 outline-none focus:border-[#2b69c8]"
                  data-nano-interactive="true"
                />
              )}
            </label>
          );
        })}
        {textEditor.kind === 'ebook' && (
          <div className="rounded-[5px] bg-[#e6dfcf] px-[7px] py-[6px] text-[9px] font-bold leading-snug text-[#5f533f]">
            {tx(locale, 'Use lines like # Chapter title to create chapter navigation.', '使用类似 # 章节标题 的行来创建章节导航。')}
          </div>
        )}
        {textEditor.error && (
          <div className="mt-[7px] rounded-[5px] bg-red-100 px-[7px] py-[6px] text-[10px] font-black text-red-700">
            {textEditor.error}
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[31px] items-center justify-between border-t border-[#c7c7be] bg-[#e8e8df] px-[8px]">
        <button type="button" className="flex items-center gap-[4px] rounded-[5px] px-[7px] py-[5px] text-[10px] font-black text-neutral-700" onClick={onTextEditorCancel} data-nano-interactive="true">
          <X size={12} strokeWidth={3} />
          {t(locale, 'cancel')}
        </button>
        <button type="button" className="flex items-center gap-[4px] rounded-[5px] bg-neutral-950 px-[9px] py-[5px] text-[10px] font-black text-white" onClick={onTextEditorSave} data-nano-interactive="true">
          <Save size={12} strokeWidth={3} />
          {t(locale, 'save')}
        </button>
      </div>
    </div>
  );
}

function DetailScreen({ node, locale }: { node: MenuNode; locale: Locale }) {
  return (
    <div className="relative h-full bg-[#f5f5ef] px-[12px] py-[26px]">
      <StatusBar title={node.title} isPlaying={false} />
      <div className="text-[15px] font-black leading-tight text-neutral-950">{node.title}</div>
      <div className="mt-[11px] space-y-[7px]">
        {(node.detailLines?.length ? node.detailLines : [t(locale, 'noServiceDetails')]).slice(0, 7).map((line, index) => (
          <div key={`${line}-${index}`} className="text-[11px] font-semibold leading-tight text-neutral-600">{line}</div>
        ))}
      </div>
    </div>
  );
}

export function Nano6Screen(props: Nano6ScreenProps) {
  const shouldReduceMotion = useReducedMotion();
  const isHome = props.currentNode.id === props.rootMenu.id;
  const isVideoDetail = props.currentNode.type === 'videoDetail';
  const startRef = React.useRef<TouchStart>();
  const longPressRef = React.useRef<number>();
  const lastTouchAtRef = React.useRef(0);
  const [viewportSize, setViewportSize] = React.useState(readViewportSize);
  const [battery, setBattery] = React.useState<NanoBatteryState>({ charging: false });
  const screenSize = Math.min(viewportSize.width, viewportSize.height);
  const screenScale = screenSize / 240;

  React.useEffect(() => {
    const updateScale = () => {
      setViewportSize(readViewportSize());
    };
    const viewport = window.visualViewport;
    const canListenToVisualViewport = Boolean(
      viewport
      && typeof viewport.addEventListener === 'function'
      && typeof viewport.removeEventListener === 'function',
    );

    updateScale();
    window.addEventListener('resize', updateScale);
    if (canListenToVisualViewport) viewport.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
      if (canListenToVisualViewport) viewport.removeEventListener('resize', updateScale);
    };
  }, []);

  React.useEffect(() => {
    let disposed = false;

    const refreshBattery = () => {
      DeviceStatus.getBattery()
        .then(status => {
          if (disposed) return;
          setBattery({
            percent: status.percent,
            charging: status.charging,
          });
        })
        .catch(() => undefined);
    };

    refreshBattery();
    const timer = window.setInterval(refreshBattery, 60000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (Date.now() - lastTouchAtRef.current < 500) return;
    const startedOnInteractive = isInteractiveTarget(event.target);
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
      moved: false,
      startedOnInteractive,
    };
    window.clearTimeout(longPressRef.current);
    if (!startedOnInteractive) longPressRef.current = window.setTimeout(() => {
      if (!isHome) props.onHome();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const start = startRef.current;
    if (!start) return;
    const { distance } = movementFrom(start, event.clientX, event.clientY);
    if (distance > TAP_SLOP) {
      start.moved = true;
      window.clearTimeout(longPressRef.current);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (Date.now() - lastTouchAtRef.current < 500) return;
    window.clearTimeout(longPressRef.current);
    const start = startRef.current;
    startRef.current = undefined;
    if (!start || isHome) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx > SWIPE_DISTANCE && Math.abs(dy) < SWIPE_CROSS_AXIS_LIMIT && start.x <= BACK_SWIPE_START_X) props.onBack();
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isHome) return;
    const point = touchPoint(event);
    if (!point) return;
    const startedOnInteractive = isInteractiveTarget(event.target);
    startRef.current = {
      x: point.clientX,
      y: point.clientY,
      time: Date.now(),
      moved: false,
      startedOnInteractive,
    };
    window.clearTimeout(longPressRef.current);
    if (!startedOnInteractive) longPressRef.current = window.setTimeout(() => {
      if (!isHome) props.onHome();
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isHome) return;
    const point = touchPoint(event);
    const start = startRef.current;
    if (!point || !start) return;
    const { distance } = movementFrom(start, point.clientX, point.clientY);
    if (distance > TAP_SLOP) {
      start.moved = true;
      window.clearTimeout(longPressRef.current);
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isHome) return;
    lastTouchAtRef.current = Date.now();
    window.clearTimeout(longPressRef.current);
    const point = touchPoint(event);
    const start = startRef.current;
    startRef.current = undefined;
    if (!point || !start || isHome) return;
    const { dx, dy, distance } = movementFrom(start, point.clientX, point.clientY);
    if (distance > TAP_SLOP) event.preventDefault();
    if (dx > SWIPE_DISTANCE && Math.abs(dy) < SWIPE_CROSS_AXIS_LIMIT && start.x <= BACK_SWIPE_START_X) props.onBack();
  };

  const content = isHome ? (
    <HomeScreen rootMenu={props.rootMenu} currentSong={props.currentSong} locale={props.locale} nano6Wallpaper={props.nano6Wallpaper} onOpenNode={props.onOpenNode} />
  ) : props.currentNode.type === 'nowPlaying' ? (
    <NowPlayingScreen {...props} />
  ) : props.currentNode.type === 'coverFlow' ? (
    <CoverFlowScreen node={props.currentNode} locale={props.locale} onActivateChild={props.onActivateChild} onBack={props.onBack} />
  ) : props.currentNode.type === 'photoGrid' || props.currentNode.type === 'photos' ? (
    <PhotoGridScreen node={props.currentNode} locale={props.locale} onActivateChild={props.onActivateChild} />
  ) : props.currentNode.type === 'photoDetail' ? (
    <PhotoDetailScreen node={props.currentNode} locale={props.locale} onBack={props.onBack} onSetWallpaper={props.onSetWallpaper} />
  ) : props.currentNode.type === 'videoDetail' ? (
    <VideoDetailScreen node={props.currentNode} locale={props.locale} onVideoPlay={props.onVideoPlay} />
  ) : props.currentNode.type === 'ebookReader' ? (
    <EbookReaderScreen node={props.currentNode} locale={props.locale} onEbookProgress={props.onEbookProgress} />
  ) : props.currentNode.type === 'clock' ? (
    <ClockScreen node={props.currentNode} locale={props.locale} onActivateChild={props.onActivateChild} />
  ) : props.currentNode.type === 'stopwatch' ? (
    <StopwatchScreen node={props.currentNode} locale={props.locale} />
  ) : props.currentNode.type === 'textEditor' ? (
    <NanoTextEditorScreen
      title={props.currentNode.title}
      locale={props.locale}
      textEditor={props.textEditor}
      onTextEditorChange={props.onTextEditorChange}
      onTextEditorSave={props.onTextEditorSave}
      onTextEditorCancel={props.onTextEditorCancel}
    />
  ) : props.currentNode.children?.length ? (
    <ListScreen node={props.currentNode} onActivateChild={props.onActivateChild} />
  ) : (
    <DetailScreen node={props.currentNode} locale={props.locale} />
  );

  return (
    <NanoBatteryContext.Provider value={battery}>
      <div
        className="overflow-hidden bg-black font-sans"
        style={{ width: viewportSize.width, height: viewportSize.height }}
      >
        <div className="grid h-full w-full place-items-center">
          <div
            className={`relative touch-manipulation select-none overflow-hidden bg-black transition-opacity duration-300 ${props.screenDimmed ? 'opacity-35' : 'opacity-100'}`}
            style={{ width: screenSize, height: screenSize }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => window.clearTimeout(longPressRef.current)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={() => window.clearTimeout(longPressRef.current)}
          >
            {isVideoDetail ? (
              <div className="absolute inset-0">
                {content}
              </div>
            ) : (
              <div className="absolute left-0 top-0 h-[240px] w-[240px] origin-top-left" style={{ transform: `scale(${screenScale})` }}>
                <AnimatePresence initial={false} mode="sync">
                  <motion.div
                    key={props.currentNode.id}
                    className="absolute inset-0 h-full w-full"
                    initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.992 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                  >
                    {content}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </NanoBatteryContext.Provider>
  );
}
