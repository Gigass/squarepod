import React, { useEffect, useRef, useState } from 'react';
import { AppTheme, MenuNode, PlaybackMode, Song, TextEditorState } from '../types';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CachedImage } from './CachedImage';
import { DeviceStatus } from '../native/deviceStatus';
import { Capacitor } from '@capacitor/core';
import { Locale, t, text } from '../i18n';
import type { SleepTimerMenuState } from '../data';
import { findAlphaSectionForIndex } from '../alphaIndex';

export type VideoCommand =
  | { id: number; action: 'toggle' }
  | { id: number; action: 'seek'; seconds: number };

export type EbookReaderCommand =
  | { id: number; action: 'scroll'; steps: number }
  | { id: number; action: 'chapter'; direction: -1 | 1 };

interface ScreenProps {
  currentNode: MenuNode;
  cursorIndex: number;
  isPlaying: boolean;
  currentSong?: Song;
  progress: number;
  playbackMode: PlaybackMode;
  videoCommand?: VideoCommand;
  ebookReaderCommand?: EbookReaderCommand;
  stopwatchElapsedMs: number;
  stopwatchRunning: boolean;
  stopwatchLaps: number[];
  stopwatchLastSession?: {
    totalMs: number;
    laps: number[];
    endedAt: number;
  };
  screenLocked: boolean;
  unlockArmed: boolean;
  sleepTimer: SleepTimerMenuState;
  coverFlowIsSelecting: boolean;
  coverFlowIsDragging: boolean;
  coverFlowReleaseId: number;
  coverFlowReleaseVelocity: number;
  locale: Locale;
  textEditor?: TextEditorState;
  onTextEditorChange: (field: keyof TextEditorState['fields'], value: string) => void;
  onTextEditorSave: () => void;
  onTextEditorCancel: () => void;
  onVideoPlay: () => void;
  onEbookProgress: (ebookId: string, progress: number, chapterIndex?: number) => void;
  onCoverFlowSettleTarget: (index: number) => void;
  alphaJumpKey?: string;
  theme?: AppTheme;
}

const COVER_FLOW_DRAG_MAX_SPEED = 18;
const COVER_FLOW_DRAG_FOLLOW_RATE = 22;
const COVER_FLOW_SETTLE_MAX_SPEED = 8.5;
const COVER_FLOW_SETTLE_FOLLOW_RATE = 9.2;
const COVER_FLOW_SETTLE_EPSILON = 0.01;
const COVER_FLOW_RELEASE_MAX_DISTANCE = 1.65;
const COVER_FLOW_RELEASE_MIN_DISTANCE = 0.62;
const COVER_FLOW_RELEASE_VELOCITY_FACTOR = 0.22;
const COVER_FLOW_RELEASE_VELOCITY_EPSILON = 0.15;
const COVER_FLOW_RENDER_COMMIT_MS = 24;
const COVER_FLOW_RENDER_EPSILON = 0.025;
const COVER_FLOW_VISIBLE_RANGE = 3.35;
const PHOTO_GRID_COLUMNS = 4;
const PHOTO_GRID_VISIBLE_ROWS = 2;
const EBOOK_WHEEL_SCROLL_PX = 46;

const tx = (locale: Locale | string | undefined, en: string, zhCN: string, values: Record<string, string | number> = {}) => (
  text(locale, { en, 'zh-CN': zhCN }, values)
);

const AppleSwitch = ({ checked, selected = false, theme = 'light' }: { checked: boolean; selected?: boolean; theme?: AppTheme }) => {
  const isDarkTheme = theme === 'dark';
  const checkedColor = isDarkTheme ? '#d92727' : '#22c55e';
  const offColor = isDarkTheme ? '#251b1d' : '#e5e7eb';
  const selectedOffColor = isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.25)';
  const selectedCheckedColor = isDarkTheme ? '#f4eeea' : '#ffffff';

  return (
    <motion.div
      className={`relative h-[18px] w-[32px] shrink-0 rounded-full border shadow-inner ${
        checked
          ? selected ? 'border-white/70' : isDarkTheme ? 'border-[#d92727]' : 'border-green-500'
          : selected ? 'border-white/60' : isDarkTheme ? 'border-[#554448]' : 'border-gray-300'
      }`}
      animate={{
        backgroundColor: checked ? (selected ? selectedCheckedColor : checkedColor) : (selected ? selectedOffColor : offColor),
        borderColor: checked ? (selected ? 'rgba(255,255,255,0.75)' : checkedColor) : (selected ? 'rgba(255,255,255,0.6)' : isDarkTheme ? '#554448' : '#d1d5db'),
      }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
    >
      <motion.div
        className={`absolute top-[2px] h-[12px] w-[12px] rounded-full shadow-sm ${
          checked && selected ? (isDarkTheme ? 'bg-[#d92727]' : 'bg-blue-600') : 'bg-white'
        }`}
        animate={{ x: checked ? 16 : 2 }}
        transition={{ type: 'spring', stiffness: 620, damping: 32 }}
      />
    </motion.div>
  );
};

const resolveNativeMediaSrc = (sourceUrl?: string) => {
  if (!sourceUrl) return undefined;
  if (sourceUrl.startsWith('file://') || sourceUrl.startsWith('content://')) {
    return Capacitor.convertFileSrc(sourceUrl);
  }
  return sourceUrl;
};

interface ClassicEbookChapter {
  title: string;
  body: string;
  startRatio: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const splitClassicEbookChapters = (body: string, locale: Locale): ClassicEbookChapter[] => {
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

function ClassicEbookReader({
  node,
  command,
  locale,
  onEbookProgress,
  theme = 'light',
}: {
  node: MenuNode;
  command?: EbookReaderCommand;
  locale: Locale;
  onEbookProgress: ScreenProps['onEbookProgress'];
  theme?: AppTheme;
}) {
  const isDarkTheme = theme === 'dark';
  const body = node.ebookBody || '';
  const chapters = React.useMemo(() => splitClassicEbookChapters(body, locale), [body, locale]);
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
  const [readProgress, setReadProgress] = React.useState(node.ebookProgress || 0);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const saveTimerRef = React.useRef<number>();
  const lastCommandIdRef = React.useRef(command?.id ?? 0);
  const activeChapter = chapters[chapterIndex] || chapters[0];
  const chapterProgressBase = activeChapter?.startRatio || 0;
  const nextChapterStart = chapters[chapterIndex + 1]?.startRatio ?? 1;

  const saveProgress = React.useCallback((progressValue: number, nextChapterIndex = chapterIndex) => {
    if (!node.ebookId) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      onEbookProgress(node.ebookId as string, progressValue, nextChapterIndex);
    }, 140);
  }, [chapterIndex, node.ebookId, onEbookProgress]);

  const updateProgressFromScroll = React.useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const scrollable = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const chapterRatio = Math.max(0, Math.min(1, scroller.scrollTop / scrollable));
    const progressValue = chapterProgressBase + (nextChapterStart - chapterProgressBase) * chapterRatio;
    setReadProgress(progressValue);
    saveProgress(progressValue);
  }, [chapterProgressBase, nextChapterStart, saveProgress]);

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
    setReadProgress(chapterProgressBase);
    if (node.ebookId) onEbookProgress(node.ebookId, chapterProgressBase, chapterIndex);
  }, [chapterIndex, chapterProgressBase, node.ebookId, onEbookProgress]);

  React.useEffect(() => {
    if (!command || command.id === lastCommandIdRef.current) return;
    lastCommandIdRef.current = command.id;

    if (command.action === 'chapter') {
      setChapterIndex(current => clamp(current + command.direction, 0, Math.max(0, chapters.length - 1)));
      return;
    }

    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ top: command.steps * EBOOK_WHEEL_SCROLL_PX, behavior: 'smooth' });
  }, [chapters.length, command]);

  if (!body.trim()) {
    return (
      <div className={`flex-1 px-7 flex flex-col items-center justify-center text-center ${isDarkTheme ? 'bg-[#151112]' : 'bg-[#f3efe3]'}`}>
        <svg className={`h-10 w-10 ${isDarkTheme ? 'text-[#8f7b80]' : 'text-[#8b7d61]'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
        </svg>
        <div className={`mt-3 text-sm font-black leading-tight ${isDarkTheme ? 'text-[#f4eeee]' : 'text-neutral-900'}`}>{tx(locale, 'No readable text', '没有可阅读文本')}</div>
        <div className={`mt-2 text-[11px] font-bold leading-tight ${isDarkTheme ? 'text-[#a89499]' : 'text-neutral-600'}`}>{tx(locale, 'Edit this book and paste plain text first.', '请先编辑图书并粘贴纯文本。')}</div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isDarkTheme ? 'bg-[#151112] text-[#eee4df]' : 'bg-[#f3efe3] text-[#211f1a]'}`}>
      <div className={`h-[27px] shrink-0 border-b px-4 flex items-center gap-3 ${isDarkTheme ? 'border-[#3b2d31] bg-[#21191c]' : 'border-[#d7cdb9] bg-[#ebe1cd]'}`}>
        <div className="min-w-0 flex-1 truncate text-[11px] font-black leading-none">{activeChapter?.title || node.title}</div>
        <div className={`shrink-0 text-[9px] font-black tabular-nums leading-none ${isDarkTheme ? 'text-[#df302c]' : 'text-[#7a6d57]'}`}>{Math.round(readProgress * 100)}%</div>
        <div className={`shrink-0 text-[9px] font-black tabular-nums leading-none ${isDarkTheme ? 'text-[#a89499]' : 'text-[#7a6d57]'}`}>{chapterIndex + 1}/{chapters.length}</div>
      </div>
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none]"
        onScroll={updateProgressFromScroll}
      >
        <div className="mx-auto max-w-[360px] whitespace-pre-wrap text-[13px] font-semibold leading-[1.55]">
          {activeChapter?.body || body.replace(/^\s{0,3}#{1,3}\s+/gm, '')}
        </div>
      </div>
      <div className={`h-[20px] shrink-0 border-t px-4 flex items-center justify-between text-[8px] font-black uppercase leading-none ${isDarkTheme ? 'border-[#3b2d31] bg-[#21191c] text-[#a89499]' : 'border-[#d7cdb9] bg-[#ebe1cd] text-[#7a6d57]'}`}>
        <span>{tx(locale, 'Wheel scroll', '滚轮滚动')}</span>
        <span>{tx(locale, 'Prev/Next chapter', '上一章/下一章')}</span>
        <span>{tx(locale, 'Menu back', 'Menu 返回')}</span>
      </div>
    </div>
  );
}

export function Screen({
  currentNode,
  cursorIndex,
  isPlaying,
  currentSong,
  progress,
  playbackMode,
  videoCommand,
  ebookReaderCommand,
  stopwatchElapsedMs,
  stopwatchRunning,
  stopwatchLaps,
  stopwatchLastSession,
  screenLocked,
  unlockArmed,
  sleepTimer,
  coverFlowIsSelecting,
  coverFlowIsDragging,
  coverFlowReleaseId,
  coverFlowReleaseVelocity,
  locale,
  textEditor,
  onTextEditorChange,
  onTextEditorSave,
  onTextEditorCancel,
  onVideoPlay,
  onEbookProgress,
  onCoverFlowSettleTarget,
  alphaJumpKey,
  theme = 'light',
}: ScreenProps) {
  const [coverFlowRenderPosition, setCoverFlowRenderPosition] = useState(cursorIndex);
  const [batteryPercent, setBatteryPercent] = useState<number>();
  const [batteryCharging, setBatteryCharging] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [videoHasStarted, setVideoHasStarted] = useState(false);
  const [videoIsPaused, setVideoIsPaused] = useState(true);
  const coverFlowPositionRef = useRef(cursorIndex);
  const coverFlowRenderPositionRef = useRef(cursorIndex);
  const coverFlowTargetRef = useRef(cursorIndex);
  const coverFlowMotionModeRef = useRef<'drag' | 'settle'>('settle');
  const coverFlowFrameRef = useRef<number | null>(null);
  const coverFlowLastTimeRef = useRef<number | null>(null);
  const coverFlowLastCommitTimeRef = useRef(0);
  const coverFlowLastReleaseIdRef = useRef(coverFlowReleaseId);
  const coverFlowPreviousNodeIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const editorFirstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const coverFlowAlbumCount = currentNode.type === 'coverFlow'
    ? currentNode.children?.length || 0
    : 0;
  const isDarkTheme = theme === 'dark';
  const screenRootClass = isDarkTheme
    ? 'relative w-full h-full bg-[#100d0e] border-[4px] border-[#302426] rounded-[36px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_18px_rgba(0,0,0,0.78)] flex flex-col overflow-hidden'
    : 'relative w-full h-full bg-white border-[4px] border-neutral-900 rounded-[36px] shadow-inner flex flex-col overflow-hidden';
  const headerClass = isDarkTheme
    ? 'bg-[linear-gradient(180deg,#2a2325_0%,#151113_100%)] h-[24px] min-h-[24px] max-h-[24px] shrink-0 border-b border-[#3a2b2f] flex items-center justify-between px-6 overflow-hidden'
    : 'bg-gradient-to-b from-gray-100 to-gray-200 h-[24px] min-h-[24px] max-h-[24px] shrink-0 border-b border-gray-300 flex items-center justify-between px-6 overflow-hidden';
  const headerTextClass = isDarkTheme ? 'text-[#e8e1df]' : 'text-gray-700';
  const batteryShellClass = isDarkTheme
    ? 'relative h-2 w-4 rounded-sm border border-[#5b4b4f] bg-[#0b090a]'
    : 'relative h-2 w-4 rounded-sm border border-gray-400 bg-white';
  const leftPaneClass = isDarkTheme
    ? 'w-1/2 h-full flex flex-col border-r border-[#38292d] bg-[#120f10]'
    : 'w-1/2 h-full flex flex-col border-r border-gray-300 bg-white';
  const previewSurfaceClass = isDarkTheme ? 'bg-[#171314]' : 'bg-neutral-50';
  const mainSurfaceClass = isDarkTheme ? 'bg-[#171314]' : 'bg-neutral-50';
  const cardSurfaceClass = isDarkTheme ? 'bg-[#241c1f]' : 'bg-neutral-200';
  const imageFallbackClass = isDarkTheme
    ? 'bg-[linear-gradient(135deg,#2b2225_0%,#151113_48%,#5f000b_100%)]'
    : 'bg-gradient-to-br from-neutral-300 to-neutral-600';
  const dividerClass = isDarkTheme ? 'border-[#38292d]' : 'border-gray-200';
  const primaryTextClass = isDarkTheme ? 'text-[#f4eeee]' : 'text-gray-900';
  const strongTextClass = isDarkTheme ? 'text-[#f8f2ef]' : 'text-gray-950';
  const secondaryTextClass = isDarkTheme ? 'text-[#c9bbbe]' : 'text-gray-700';
  const mutedTextClass = isDarkTheme ? 'text-[#8f7d82]' : 'text-gray-500';
  const faintTextClass = isDarkTheme ? 'text-[#6f5e63]' : 'text-gray-400';
  const accentTextClass = isDarkTheme ? 'text-[#df302c]' : 'text-blue-600';
  const accentFillClass = isDarkTheme ? 'bg-[#d92727]' : 'bg-blue-500';
  const accentButtonClass = isDarkTheme ? 'bg-[#d92727]' : 'bg-blue-600';
  const accentSelectionClass = isDarkTheme
    ? 'bg-[linear-gradient(180deg,#df302c_0%,#d92727_58%,#c91f22_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_3px_rgba(0,0,0,0.42)]'
    : 'bg-gradient-to-b from-blue-400 to-blue-600 shadow-sm';
  const progressTrackClass = isDarkTheme ? 'bg-[#35272b]' : 'bg-gray-300';
  const loadingTrackClass = isDarkTheme ? 'bg-[#2a2023]' : 'bg-gray-200';
  const spinnerIdleClass = isDarkTheme ? 'border-[#59464b] border-t-[#d92727]' : 'border-gray-300 border-t-blue-500';
  const sectionMarkerClass = isDarkTheme ? 'text-[#df302c]/85' : 'text-blue-500/80';
  const selectedTextClass = 'text-white';
  const unselectedMenuTextClass = isDarkTheme ? 'text-[#e4dcda]' : 'text-gray-800';
  const unselectedMenuMetaClass = isDarkTheme ? 'text-[#806c71]' : 'text-gray-400';

  const commitCoverFlowPosition = React.useCallback((position: number, force = false) => {
    const nowMs = typeof performance === 'undefined' ? Date.now() : performance.now();
    const elapsedMs = nowMs - coverFlowLastCommitTimeRef.current;
    const delta = Math.abs(position - coverFlowRenderPositionRef.current);

    if (!force && (elapsedMs < COVER_FLOW_RENDER_COMMIT_MS || delta < COVER_FLOW_RENDER_EPSILON)) {
      return;
    }

    coverFlowRenderPositionRef.current = position;
    coverFlowLastCommitTimeRef.current = nowMs;
    setCoverFlowRenderPosition(previous => {
      if (!force && Math.abs(previous - position) < COVER_FLOW_RENDER_EPSILON) return previous;
      return position;
    });
  }, []);

  useEffect(() => {
    const previousNodeId = coverFlowPreviousNodeIdRef.current;
    const enteredCoverFlow = currentNode.type === 'coverFlow' && previousNodeId !== currentNode.id;
    const enteredFromCoverAlbum = enteredCoverFlow && Boolean(previousNodeId?.startsWith('cover_album_'));

    if (currentNode.type !== 'coverFlow') {
      if (coverFlowFrameRef.current !== null) {
        cancelAnimationFrame(coverFlowFrameRef.current);
        coverFlowFrameRef.current = null;
      }
      coverFlowMotionModeRef.current = 'settle';
      coverFlowLastTimeRef.current = null;
      coverFlowLastReleaseIdRef.current = coverFlowReleaseId;
      coverFlowPreviousNodeIdRef.current = currentNode.id;
      return;
    }

    if (enteredCoverFlow && !enteredFromCoverAlbum) {
      if (coverFlowFrameRef.current !== null) {
        cancelAnimationFrame(coverFlowFrameRef.current);
        coverFlowFrameRef.current = null;
      }
      coverFlowPositionRef.current = cursorIndex;
      coverFlowTargetRef.current = cursorIndex;
      coverFlowMotionModeRef.current = 'settle';
      coverFlowLastTimeRef.current = null;
      coverFlowLastReleaseIdRef.current = coverFlowReleaseId;
      commitCoverFlowPosition(cursorIndex, true);
    }

    if (shouldReduceMotion || coverFlowIsSelecting) {
      if (coverFlowFrameRef.current !== null) {
        cancelAnimationFrame(coverFlowFrameRef.current);
        coverFlowFrameRef.current = null;
      }
      coverFlowPositionRef.current = cursorIndex;
      coverFlowTargetRef.current = cursorIndex;
      coverFlowMotionModeRef.current = 'settle';
      coverFlowLastTimeRef.current = null;
      coverFlowLastReleaseIdRef.current = coverFlowReleaseId;
      coverFlowPreviousNodeIdRef.current = currentNode.id;
      commitCoverFlowPosition(cursorIndex, true);
      return;
    }

    if (coverFlowReleaseId !== coverFlowLastReleaseIdRef.current) {
      coverFlowLastReleaseIdRef.current = coverFlowReleaseId;

      const current = coverFlowPositionRef.current;
      const velocityDirection = Math.sign(coverFlowReleaseVelocity);
      const maxIndex = Math.max(0, coverFlowAlbumCount - 1);
      const rawTarget = Math.abs(coverFlowReleaseVelocity) < COVER_FLOW_RELEASE_VELOCITY_EPSILON
        ? current
        : current + Math.max(
          COVER_FLOW_RELEASE_MIN_DISTANCE,
          Math.min(
            COVER_FLOW_RELEASE_MAX_DISTANCE,
            Math.abs(coverFlowReleaseVelocity) * COVER_FLOW_RELEASE_VELOCITY_FACTOR,
          ),
        ) * velocityDirection;
      const targetIndex = Math.max(0, Math.min(maxIndex, Math.round(rawTarget)));

      coverFlowTargetRef.current = targetIndex;
      coverFlowMotionModeRef.current = 'settle';
      onCoverFlowSettleTarget(targetIndex);
    } else {
      coverFlowTargetRef.current = cursorIndex;
      coverFlowMotionModeRef.current = coverFlowIsDragging ? 'drag' : 'settle';
    }

    const step = (timestamp: number) => {
      const previousTime = coverFlowLastTimeRef.current ?? timestamp;
      const dt = Math.min(0.04, Math.max(0.001, (timestamp - previousTime) / 1000));
      coverFlowLastTimeRef.current = timestamp;

      const current = coverFlowPositionRef.current;
      const target = coverFlowTargetRef.current;
      const distance = target - current;

      if (Math.abs(distance) < COVER_FLOW_SETTLE_EPSILON) {
        coverFlowPositionRef.current = target;
        commitCoverFlowPosition(target, true);
        coverFlowFrameRef.current = null;
        coverFlowLastTimeRef.current = null;
        return;
      }

      const isDragging = coverFlowMotionModeRef.current === 'drag';
      const followRate = isDragging ? COVER_FLOW_DRAG_FOLLOW_RATE : COVER_FLOW_SETTLE_FOLLOW_RATE;
      const maxSpeed = isDragging ? COVER_FLOW_DRAG_MAX_SPEED : COVER_FLOW_SETTLE_MAX_SPEED;
      const easedStep = distance * (1 - Math.exp(-followRate * dt));
      const maxStep = maxSpeed * dt;
      const nextStep = Math.sign(distance) * Math.min(Math.abs(easedStep), maxStep, Math.abs(distance));
      const nextPosition = current + nextStep;

      coverFlowPositionRef.current = nextPosition;
      commitCoverFlowPosition(nextPosition);
      coverFlowFrameRef.current = requestAnimationFrame(step);
    };

    if (coverFlowFrameRef.current === null) {
      coverFlowLastTimeRef.current = null;
      coverFlowFrameRef.current = requestAnimationFrame(step);
    }
    coverFlowPreviousNodeIdRef.current = currentNode.id;
  }, [
    cursorIndex,
    currentNode.type,
    coverFlowAlbumCount,
    coverFlowIsSelecting,
    coverFlowIsDragging,
    coverFlowReleaseId,
    coverFlowReleaseVelocity,
    commitCoverFlowPosition,
    onCoverFlowSettleTarget,
    shouldReduceMotion,
  ]);

  useEffect(() => {
    return () => {
      if (coverFlowFrameRef.current !== null) {
        cancelAnimationFrame(coverFlowFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const refreshBattery = () => {
      DeviceStatus.getBattery()
        .then(status => {
          if (disposed) return;
          setBatteryPercent(status.percent);
          setBatteryCharging(status.charging);
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentNode.type !== 'videoDetail') return;
    setVideoHasStarted(false);
    setVideoIsPaused(true);
  }, [currentNode.id, currentNode.type]);

  useEffect(() => {
    if (currentNode.type !== 'textEditor' || !textEditor) return undefined;

    const frame = window.requestAnimationFrame(() => {
      editorFirstInputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentNode.id, currentNode.type, textEditor?.kind, textEditor?.mode]);

  useEffect(() => {
    if (!videoCommand || currentNode.type !== 'videoDetail') return;

    const video = videoRef.current;
    if (!video) return;

    if (videoCommand.action === 'toggle') {
      if (video.paused || video.ended) {
        if (video.ended) video.currentTime = 0;
        video.play().catch(error => {
          console.error('Video playback failed', error);
        });
      } else {
        video.pause();
      }
      return;
    }

    const nextTime = video.currentTime + videoCommand.seconds;
    video.currentTime = Number.isFinite(video.duration)
      ? Math.max(0, Math.min(video.duration, nextTime))
      : Math.max(0, nextTime);
  }, [currentNode.type, videoCommand]);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeLyricIndex = (seconds: number) => {
    const lyrics = currentSong?.lyrics || [];
    let activeIndex = -1;
    for (let index = 0; index < lyrics.length; index += 1) {
      if (lyrics[index].time <= seconds + 0.35) {
        activeIndex = index;
      } else {
        break;
      }
    }
    return activeIndex;
  };

  const renderLyricLines = (variant: 'compact' | 'full') => {
    const lyrics = currentSong?.lyrics || [];
    if (!lyrics.length) return null;

    const activeIndex = activeLyricIndex(progress);
    const focusIndex = Math.max(0, activeIndex);
    const visibleIndexes = variant === 'compact'
      ? [focusIndex]
      : [focusIndex - 1, focusIndex, focusIndex + 1].filter(index => index >= 0 && index < lyrics.length);

    if (!visibleIndexes.length) return null;

    if (variant === 'compact') {
      const line = lyrics[visibleIndexes[0]];
      return (
        <motion.div
          key={`${line.time}-${line.text}`}
          className={`mt-2 w-full min-h-[20px] px-1 text-center text-[9px] font-black leading-[1.2] line-clamp-2 ${secondaryTextClass}`}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {line.text}
        </motion.div>
      );
    }

    return (
      <div className={`mt-4 flex min-h-[80px] flex-col justify-center gap-[2px] overflow-hidden border-t pt-3 ${dividerClass}`}>
        {visibleIndexes.map(index => {
          const line = lyrics[index];
          const isActive = index === focusIndex;
          return (
            <motion.div
              key={`${line.time}-${line.text}`}
              className={`line-clamp-2 leading-[1.2] ${
                isActive
                  ? `text-[11px] font-black ${strongTextClass}`
                  : `text-[9px] font-bold ${faintTextClass}`
              }`}
              animate={{ opacity: isActive ? 1 : 0.52, y: 0 }}
              initial={{ opacity: 0, y: isActive ? 4 : 2 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {line.text}
            </motion.div>
          );
        })}
      </div>
    );
  };

  const renderPlaybackModeIcon = () => {
    if (currentNode.type !== 'nowPlaying' || playbackMode === 'sequential') return null;

    if (playbackMode === 'shuffle') {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label="Shuffle">
          <path d="M16 3h5v5" />
          <path d="M4 20 21 3" />
          <path d="M21 16v5h-5" />
          <path d="M15 15 21 21" />
          <path d="M4 4l5 5" />
        </svg>
      );
    }

    return (
      <div className="relative h-4 w-4" aria-label={playbackMode === 'repeatOne' ? 'Repeat One' : 'Repeat All'}>
        <svg className="absolute inset-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
        {playbackMode === 'repeatOne' && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[45%] text-[8px] font-black leading-none">1</span>
        )}
      </div>
    );
  };

  const renderHeader = () => (
    <div className={headerClass}>
      <div className="flex items-center space-x-1 w-16 h-full">
        {isPlaying && (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" className={headerTextClass}>
             <path d="M0 0h3v12H0zm7 0h3v12H7z" />
          </svg>
        )}
      </div>
      <div className={`flex h-full flex-1 items-center justify-center pt-[2px] text-center text-[10px] font-bold uppercase leading-none tracking-tighter ${headerTextClass}`}>
        <span className="truncate">{currentNode.title}</span>
      </div>
      <div className={`flex items-center justify-end w-16 h-full gap-1 ${headerTextClass}`}>
         {renderPlaybackModeIcon()}
         {batteryPercent !== undefined && (
           <span className={`min-w-[21px] text-right text-[9px] font-black leading-none tabular-nums ${headerTextClass}`}>
             {batteryPercent}%
           </span>
         )}
         <div className={batteryShellClass}>
           <div
             className={`h-full rounded-[1px] ${batteryPercent !== undefined && batteryPercent <= 15 ? 'bg-red-500' : 'bg-green-500'}`}
             style={{ width: `${batteryPercent ?? 100}%` }}
           />
           {batteryCharging && (
             <div className="absolute inset-0 flex items-center justify-center text-[7px] font-black leading-none text-black/70">
               +
             </div>
           )}
         </div>
      </div>
    </div>
  );

  const renderRightPreview = (selectedChild?: MenuNode) => {
    if (selectedChild?.previewImage) {
      const isVideoPreview = selectedChild.mediaItem?.kind === 'video' || selectedChild.id === 'v_all';

      return (
        <div className={`w-1/2 h-full flex items-center justify-center p-6 ${previewSurfaceClass}`}>
          <div className={`relative w-full aspect-square overflow-hidden rounded-sm shadow-lg ${cardSurfaceClass}`}>
            <CachedImage src={selectedChild.previewImage} className="h-full w-full object-cover" />
            {isVideoPreview && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-sm">
                  <svg width="14" height="16" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
                    <path d="M0 0l10 6-10 6z" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    const isMusicRelated = ['music', 'now_playing_menu', 'shuffle_songs'].includes(selectedChild?.id || '');
    
    if (currentSong && isMusicRelated) {
      const duration = Math.max(1, currentSong.duration || 1);
      const progressPercent = Math.max(0, Math.min(100, (progress / duration) * 100));
      const remaining = Math.max(0, duration - progress);

      return (
        <div className={`w-1/2 h-full flex flex-col items-center justify-center p-6 ${previewSurfaceClass}`}>
          <div className={`w-full aspect-square shadow-lg relative group overflow-hidden rounded-sm ${isDarkTheme ? 'bg-[#2b2225]' : 'bg-neutral-300'}`}>
            <CachedImage src={currentSong.coverUrl} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-auto">{t(locale, 'nowPlaying')}</p>
              <p className="text-sm font-bold leading-tight px-2 w-full truncate">{currentSong.title}</p>
              <p className="text-[10px] font-medium w-full truncate px-2 mb-2">{currentSong.artist}</p>
            </div>
          </div>
          <div className="mt-4 w-full px-2">
            <div className={`h-1 rounded-full w-full overflow-hidden ${progressTrackClass}`}>
              <div 
                className={`h-full ${accentFillClass}`} 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-[8px] font-bold ${faintTextClass}`}>{formatTime(progress)}</span>
              <span className={`text-[8px] font-bold ${faintTextClass}`}>-{formatTime(remaining)}</span>
            </div>
            {renderLyricLines('compact')}
          </div>
        </div>
      );
    }

    if (selectedChild?.detailLines?.length) {
      return (
        <div className={`w-1/2 h-full flex flex-col justify-center p-5 overflow-hidden shadow-inner ${previewSurfaceClass}`}>
          <div className="flex items-center gap-2">
            {selectedChild.isLoading && (
              <motion.div
                className={`h-3 w-3 shrink-0 rounded-full border-2 ${spinnerIdleClass}`}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
            )}
            <div className={`text-sm font-bold leading-tight truncate ${primaryTextClass}`}>{selectedChild.title}</div>
            {typeof selectedChild.switchValue === 'boolean' && (
              <AppleSwitch checked={Boolean(selectedChild.switchValue)} theme={theme} />
            )}
          </div>
          <div className="mt-3 space-y-2">
            {selectedChild.detailLines.map((line, index) => (
              <div key={`${line}-${index}`} className={`text-[10px] font-semibold leading-tight ${mutedTextClass}`}>
                {line}
              </div>
            ))}
          </div>
          {selectedChild.isLoading && (
            <div className={`mt-4 h-1 overflow-hidden rounded-full ${loadingTrackClass}`}>
              <motion.div
                className={`h-full w-1/3 rounded-full ${accentFillClass}`}
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          )}
        </div>
      );
    }

    if (selectedChild?.previewIcon) {
       return (
         <div className={`w-1/2 h-full flex items-center justify-center p-6 relative overflow-hidden shadow-inner ${previewSurfaceClass}`}>
            <div className={faintTextClass}>
               {selectedChild.previewIcon}
            </div>
         </div>
       );
    }

    return (
      <div className={`w-1/2 h-full flex items-center justify-center relative overflow-hidden shadow-inner ${previewSurfaceClass}`}>
         <div className={`${isDarkTheme ? 'text-[#433238]' : 'text-gray-300'} opacity-30 pointer-events-none scale-150`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-24 h-24">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="10 8 16 12 10 16 10 8"></polygon>
            </svg>
         </div>
      </div>
    );
  };

  const renderNowPlayingFull = () => {
    if (!currentSong) return <div className={`flex-1 flex items-center justify-center text-xs font-bold font-sans ${mainSurfaceClass} ${primaryTextClass}`}>{t(locale, 'noSongSelected')}</div>;

    const duration = Math.max(1, currentSong.duration || 1);
    const progressPercent = Math.max(0, Math.min(100, (progress / duration) * 100));
    const remaining = Math.max(0, duration - progress);
    
    return (
      <div className={`flex-1 flex w-full h-full ${mainSurfaceClass}`}>
        <div className={`w-1/2 p-6 flex flex-col items-center justify-center border-r ${dividerClass}`}>
           <CachedImage src={currentSong.coverUrl} className="w-full aspect-square object-cover shadow-lg rounded-sm" />
        </div>
        <div className="w-1/2 flex flex-col justify-center px-6 font-sans overflow-hidden">
          <div className="min-h-[74px]">
            <div className={`text-lg font-bold truncate leading-tight ${primaryTextClass}`}>{currentSong.title}</div>
            <div className={`text-sm font-semibold truncate leading-tight mt-1 ${secondaryTextClass}`}>{currentSong.artist}</div>
            <div className={`text-xs truncate leading-tight mt-1 ${mutedTextClass}`}>{currentSong.album}</div>
          </div>
          
          <div className="mt-4 flex flex-col w-full">
            <div className={`w-full h-1.5 rounded-full overflow-hidden ${progressTrackClass}`}>
              <div 
                className={`h-full ${accentFillClass}`} 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className={`flex justify-between text-[10px] font-bold mt-1.5 ${mutedTextClass}`}>
              <span>{formatTime(progress)}</span>
              <span>-{formatTime(remaining)}</span>
            </div>
          </div>
          {renderLyricLines('full')}
        </div>
      </div>
    );
  };

  const renderSongDetail = () => {
    const track = currentNode.localTrack;
    if (!track) {
      return <div className={`flex-1 flex items-center justify-center text-xs font-bold font-sans ${mainSurfaceClass} ${primaryTextClass}`}>{t(locale, 'noSongSelected')}</div>;
    }

    return (
      <div className={`flex-1 flex w-full h-full ${mainSurfaceClass}`}>
        <div className={`w-1/2 p-6 flex flex-col items-center justify-center border-r ${dividerClass}`}>
          <div className={`w-full aspect-square overflow-hidden rounded-sm shadow-lg ${isDarkTheme ? 'bg-[#2b2225]' : 'bg-neutral-300'}`}>
            {track.artworkUri ? (
              <CachedImage src={track.artworkUri} className="h-full w-full object-cover" />
            ) : (
              <div className={`flex h-full w-full items-center justify-center px-3 text-center text-sm font-black uppercase leading-tight text-white/90 ${imageFallbackClass}`}>
                {track.album || track.title}
              </div>
            )}
          </div>
        </div>
        <div className="w-1/2 flex flex-col justify-center px-6 font-sans overflow-hidden">
          <div className={`text-[10px] font-black uppercase leading-none ${accentTextClass}`}>{t(locale, 'song')}</div>
          <div className={`mt-2 text-lg font-black leading-tight line-clamp-2 ${strongTextClass}`}>{track.title || t(locale, 'title')}</div>
          <div className={`mt-2 text-sm font-bold leading-tight line-clamp-2 ${secondaryTextClass}`}>{track.artist || tx(locale, 'Unknown Artist', '未知艺人')}</div>
          <div className={`mt-1 text-xs font-semibold leading-tight line-clamp-2 ${mutedTextClass}`}>{track.album || tx(locale, 'Unknown Album', '未知专辑')}</div>
          <div className="mt-5 flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm ${accentButtonClass}`}>
              <svg width="11" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
                <path d="M0 0l10 6-10 6z" />
              </svg>
            </div>
            <div className={`text-[11px] font-black uppercase leading-none ${secondaryTextClass}`}>{t(locale, 'selectToPlay')}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderCoverArtwork = (album: MenuNode, isCenter: boolean) => {
    const title = album.title || tx(locale, 'Unknown Album', '未知专辑');

    return (
      <>
        <div className={`absolute inset-0 flex items-center justify-center text-center ${isDarkTheme ? 'bg-[linear-gradient(135deg,#2b2225_0%,#151113_46%,#64000c_100%)]' : 'bg-gradient-to-br from-neutral-300 via-neutral-400 to-neutral-600'}`}>
          <div className={`px-3 font-black uppercase leading-tight text-white/90 drop-shadow-sm ${isCenter ? 'text-sm' : 'text-[9px]'}`}>
            {title}
          </div>
        </div>
        {album.previewImage && (
          <CachedImage
            src={album.previewImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        )}
      </>
    );
  };

  const renderCoverFlow = () => {
    const albums = currentNode.children || [];
    const selectedAlbum = albums[cursorIndex];

    if (!albums.length || !selectedAlbum) {
      return (
        <div className={`flex-1 flex flex-col items-center justify-center px-8 text-center ${isDarkTheme ? 'bg-[linear-gradient(180deg,#1c1719_0%,#0f0c0d_100%)]' : 'bg-gradient-to-b from-neutral-100 to-neutral-200'}`}>
          <div className={`h-24 w-24 rounded-sm border shadow-inner ${isDarkTheme ? 'border-[#4a383d] bg-[linear-gradient(135deg,#2c2225,#5a000b)]' : 'border-neutral-300 bg-gradient-to-br from-neutral-200 to-neutral-400'}`} />
          <div className={`mt-5 text-sm font-black leading-tight ${isDarkTheme ? 'text-[#eee5e3]' : 'text-neutral-800'}`}>{t(locale, 'noAlbums')}</div>
          <div className={`mt-1 text-[11px] font-bold leading-tight ${isDarkTheme ? 'text-[#9a878b]' : 'text-neutral-500'}`}>{t(locale, 'scanLocalMusicFirst')}</div>
        </div>
      );
    }

    const renderPosition = coverFlowIsSelecting ? cursorIndex : coverFlowRenderPosition;
    const displayIndex = Math.max(0, Math.min(albums.length - 1, Math.round(renderPosition)));
    const displayAlbum = coverFlowIsSelecting ? selectedAlbum : albums[displayIndex] || selectedAlbum;
    const visibleStart = Math.max(0, Math.floor(renderPosition - COVER_FLOW_VISIBLE_RANGE));
    const visibleEnd = Math.min(albums.length - 1, Math.ceil(renderPosition + COVER_FLOW_VISIBLE_RANGE));
    const visibleAlbums: Array<{ album: MenuNode; index: number; distance: number }> = [];
    for (let index = visibleStart; index <= visibleEnd; index += 1) {
      visibleAlbums.push({ album: albums[index], index, distance: index - renderPosition });
    }
    const artist = displayAlbum.detailLines?.[0] || tx(locale, 'Unknown Artist', '未知艺人');

    return (
      <div className={`relative flex-1 overflow-hidden ${isDarkTheme ? 'bg-[linear-gradient(180deg,#241b1e_0%,#100d0e_46%,#050404_47%,#181113_100%)]' : 'bg-[linear-gradient(180deg,#f6f6f4_0%,#d9dbdf_46%,#a9adb5_47%,#f3f4f3_100%)]'}`}>
        <div className={`absolute inset-x-0 top-0 h-12 pointer-events-none ${isDarkTheme ? 'bg-gradient-to-b from-white/10 to-transparent' : 'bg-gradient-to-b from-white/65 to-transparent'}`} />
        <div className={`absolute left-1/2 top-[128px] h-[2px] w-28 -translate-x-1/2 rounded-full blur-[1px] ${isDarkTheme ? 'bg-[#d92727]/35' : 'bg-black/20'}`} />
        <div
          className="absolute inset-x-0 top-2 h-[158px]"
          style={{ perspective: 900, transformStyle: 'preserve-3d' }}
        >
          {visibleAlbums.map(({ album, index, distance }) => {
            const isSelectedAlbum = index === cursorIndex;
            const absDistance = Math.abs(distance);
            const sign = Math.sign(distance);
            const clampedDistance = Math.max(-1, Math.min(1, distance));
            const beyondFirstSlot = Math.max(0, absDistance - 1);
            const trackOffset = absDistance <= 1
              ? distance * 82
              : sign * (82 + beyondFirstSlot * 48);
            const x = -60 + trackOffset;
            const y = Math.min(18, absDistance * 7);
            const rotateY = -64 * clampedDistance;
            const scale = Math.max(0.44, 1 - Math.min(absDistance, 1) * 0.24 - beyondFirstSlot * 0.095);
            const opacity = coverFlowIsSelecting && !isSelectedAlbum
              ? 0.12
              : Math.max(0.16, 1 - Math.min(absDistance, 1) * 0.22 - beyondFirstSlot * 0.18);
            const shadowOpacity = Math.max(0.16, 0.46 - absDistance * 0.08);
            const isHeroCard = coverFlowIsSelecting && isSelectedAlbum;
            const cardTransition = shouldReduceMotion
              ? 'none'
              : coverFlowIsDragging
                ? 'transform 70ms linear, opacity 70ms linear'
                : 'transform 110ms cubic-bezier(0.22, 1, 0.36, 1), opacity 90ms linear';
            const heroTransform = isHeroCard && !shouldReduceMotion
              ? 'translate3d(0, -10px, 0) scale(1.18)'
              : 'translate3d(0, 0, 0) scale(1)';

            return (
              <div
                key={album.id}
                className="absolute left-1/2 top-2 h-[120px] w-[120px] origin-center will-change-transform"
                style={{
                  opacity,
                  zIndex: 100 - Math.round(absDistance * 10),
                  transform: `translate3d(${x}px, ${y}px, ${80 - absDistance * 12}px) rotateY(${rotateY}deg) scale(${scale})`,
                  transformStyle: 'preserve-3d',
                  transition: cardTransition,
                  willChange: 'transform, opacity',
                  contain: 'layout paint style',
                }}
              >
                <div
                  className="relative h-full w-full"
                  style={{
                    transform: heroTransform,
                    transformStyle: 'preserve-3d',
                    transformOrigin: 'center center',
                    transition: shouldReduceMotion ? 'none' : 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1)',
                    willChange: 'transform',
                  }}
                >
                  <div
                    className={`absolute inset-0 h-full w-full overflow-hidden rounded-[2px] ${isDarkTheme ? 'bg-[#2b2225]' : 'bg-neutral-300'} ${absDistance < 0.08 ? (isDarkTheme ? 'shadow-[0_24px_36px_-12px_rgba(0,0,0,0.9)] ring-1 ring-[#d92727]/70' : 'shadow-[0_24px_32px_-14px_rgba(0,0,0,0.72)] ring-1 ring-white/90') : 'shadow-[0_16px_20px_-15px_rgba(0,0,0,0.78)]'}`}
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(0deg) translateZ(1px)',
                    }}
                  >
                    {renderCoverArtwork(album, absDistance < 0.08)}
                    <div className={`absolute inset-0 pointer-events-none ${absDistance < 0.08 ? (isDarkTheme ? 'bg-[linear-gradient(110deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.025)_34%,rgba(80,0,10,0.18)_100%)]' : 'bg-[linear-gradient(110deg,rgba(255,255,255,0.26)_0%,rgba(255,255,255,0.04)_34%,rgba(0,0,0,0.08)_100%)]') : 'bg-black/10'}`} />
                  </div>
                </div>
                <div
                  className="absolute left-0 top-[122px] h-10 w-full overflow-hidden [transform:scaleY(-1)]"
                  style={{
                    opacity: shadowOpacity,
                    transition: shouldReduceMotion ? 'none' : 'opacity 120ms linear',
                  }}
                >
                  <div className={`relative h-full w-full overflow-hidden rounded-[2px] ${isDarkTheme ? 'bg-[#2b2225]' : 'bg-neutral-300'}`}>
                    {renderCoverArtwork(album, false)}
                    <div className={`absolute inset-0 ${isDarkTheme ? 'bg-gradient-to-b from-black/10 via-black/65 to-[#090707]' : 'bg-gradient-to-b from-white/10 via-white/65 to-white'}`} />
                  </div>
                </div>
                {absDistance < 0.08 && (
                  <div className={`absolute -inset-1 rounded-[4px] border pointer-events-none ${isDarkTheme ? 'border-[#d92727]/35' : 'border-black/10'}`} />
                )}
              </div>
            );
          })}
        </div>

        <div
          className={`absolute inset-x-7 bottom-0 z-[160] px-3 py-2 text-center ${isDarkTheme ? '[text-shadow:0_1px_1px_rgba(0,0,0,0.75)]' : '[text-shadow:0_1px_1px_rgba(255,255,255,0.75)]'}`}
        >
          <div className={`truncate text-[15px] font-black leading-tight ${isDarkTheme ? 'text-[#f7efed]' : 'text-neutral-950'}`}>{displayAlbum.title}</div>
          <div className={`mt-1 truncate text-[11px] font-bold leading-tight ${isDarkTheme ? 'text-[#b9a6aa]' : 'text-neutral-700'}`}>{artist}</div>
        </div>
      </div>
    );
  };

  const renderMenu = () => {
    const children = currentNode.children || [];
    const scrollStart = Math.max(0, cursorIndex - 4);
    const rowHeight = 32;
    
    // Determine preview to show on the right
    const selectedChild = children[cursorIndex];
    const previewImg = selectedChild?.previewImage;
    
    return (
      <div className="flex-1 flex w-full relative">
        <div className={leftPaneClass}>
          <div className="flex-grow flex flex-col pt-2 relative overflow-hidden">
             <motion.div
               className={`absolute left-0 right-0 h-[32px] z-0 ${accentSelectionClass}`}
               animate={{ y: (cursorIndex - scrollStart) * rowHeight }}
               transition={{ type: "spring", stiffness: 450, damping: 40 }}
             />
             {/* Scrolling window: each line is 32px height (px-4 py-1.5). */}
             <motion.div 
               className="w-full absolute z-10"
               animate={{ y: -scrollStart * rowHeight }}
               transition={{ type: "spring", stiffness: 450, damping: 40 }}
             >
               {children.map((child, idx) => {
                 const isSelected = idx === cursorIndex;
                 const hasSwitch = typeof child.switchValue === 'boolean';
                 const section = findAlphaSectionForIndex(currentNode.alphaSections, idx);
                 const showSection = section?.startIndex === idx;
                 return (
                   <div 
                     key={child.id} 
	                      className={`relative h-[32px] px-4 flex justify-between items-center bg-transparent ${child.reorderActive ? 'ring-2 ring-inset ring-amber-300' : ''}`}
	                   >
                     {showSection && !isSelected && (
                       <span className={`absolute left-1 top-1 z-10 text-[9px] font-black leading-none ${sectionMarkerClass}`}>
                         {section.key}
                       </span>
                     )}
	                     <span className={`relative min-w-0 text-sm font-bold truncate z-10 transition-colors duration-150 ${isSelected ? selectedTextClass : unselectedMenuTextClass}`}>
	                       {child.title}
	                     </span>
                     {hasSwitch && (
                       <div className="relative z-10 ml-2">
                         <AppleSwitch checked={Boolean(child.switchValue)} selected={isSelected} theme={theme} />
                       </div>
                     )}
                     {child.isLoading && (
                       <motion.span
                         className={`relative h-3 w-3 shrink-0 rounded-full border-2 z-10 ${isSelected ? 'border-white/50 border-t-white' : spinnerIdleClass}`}
                         animate={{ rotate: 360 }}
                         transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                       />
                     )}
                     {!hasSwitch && !child.isLoading && child.type === 'menu' && (
                       <span className={`relative text-[10px] font-bold pl-2 z-10 transition-colors duration-150 ${isSelected ? selectedTextClass : unselectedMenuMetaClass}`}>
                         &gt;
                       </span>
                     )}
                   </div>
                 );
               })}
             </motion.div>
          </div>
        </div>
        
        {/* Right side preview */}
        {renderRightPreview(selectedChild)}
      </div>
    );
  };

  const inputClass = isDarkTheme
    ? 'w-full rounded-sm border border-[#4a383d] bg-[#110d0f] px-2 py-1.5 text-[12px] font-semibold leading-tight text-[#f4eeee] outline-none placeholder:text-[#6f5e63] focus:border-[#d92727] focus:ring-2 focus:ring-[#d92727]/25'
    : 'w-full rounded-sm border border-neutral-300 bg-white px-2 py-1.5 text-[12px] font-semibold leading-tight text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200';
  const labelClass = `text-[9px] font-black uppercase tracking-wide ${mutedTextClass}`;

  const renderTextField = (
    field: keyof TextEditorState['fields'],
    label: string,
    options: {
      type?: string;
      inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
      placeholder?: string;
      first?: boolean;
    } = {},
  ) => (
    <label className="block">
      <div className={labelClass}>{label}</div>
      <input
        ref={options.first ? element => { editorFirstInputRef.current = element; } : undefined}
        className={`${inputClass} mt-1`}
        type={options.type || 'text'}
        inputMode={options.inputMode}
        enterKeyHint="next"
        value={textEditor?.fields[field] || ''}
        placeholder={options.placeholder}
        onChange={event => onTextEditorChange(field, event.target.value)}
      />
    </label>
  );

  const renderTextArea = (
    field: keyof TextEditorState['fields'],
    label: string,
    options: { placeholder?: string; first?: boolean } = {},
  ) => (
    <label className="block min-h-0">
      <div className={labelClass}>{label}</div>
      <textarea
        ref={options.first ? element => { editorFirstInputRef.current = element; } : undefined}
        className={`${inputClass} mt-1 min-h-[74px] resize-none`}
        value={textEditor?.fields[field] || ''}
        placeholder={options.placeholder}
        onChange={event => onTextEditorChange(field, event.target.value)}
      />
    </label>
  );

  const renderTextEditor = () => {
    if (!textEditor) return renderServiceStatus();

    const title = textEditor.mode === 'create'
      ? textEditor.kind === 'note' ? t(locale, 'newNote') : textEditor.kind === 'contact' ? t(locale, 'newContact') : textEditor.kind === 'calendarEvent' ? t(locale, 'newEvent') : textEditor.kind === 'ebook' ? tx(locale, 'New Book', '新建图书') : tx(locale, 'New Workout', '新建健身记录')
      : textEditor.kind === 'note' ? t(locale, 'editNote') : textEditor.kind === 'contact' ? t(locale, 'editContact') : textEditor.kind === 'calendarEvent' ? t(locale, 'editEvent') : textEditor.kind === 'ebook' ? tx(locale, 'Edit Book', '编辑图书') : tx(locale, 'Edit Workout', '编辑健身记录');

    return (
      <form
        className={`flex-1 p-3 overflow-y-auto ${mainSurfaceClass}`}
        onSubmit={event => {
          event.preventDefault();
          onTextEditorSave();
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className={`truncate text-[15px] font-black leading-tight ${strongTextClass}`}>{title}</div>
            <div className={`text-[9px] font-bold uppercase ${mutedTextClass}`}>{t(locale, 'menuCancelsSelectSaves')}</div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" className={`rounded-sm border px-2 py-1 text-[10px] font-black ${isDarkTheme ? 'border-[#4a383d] bg-[#110d0f] text-[#d4c7ca]' : 'border-neutral-300 bg-white text-neutral-700'}`} onClick={onTextEditorCancel}>{t(locale, 'cancel')}</button>
            <button type="submit" className={`rounded-sm px-2 py-1 text-[10px] font-black text-white ${accentButtonClass}`}>{t(locale, 'save')}</button>
          </div>
        </div>

        <div className="space-y-2">
          {textEditor.kind === 'note' && (
            <>
              {renderTextField('title', t(locale, 'title'), { first: true, placeholder: t(locale, 'noteTitlePlaceholder') })}
              {renderTextArea('body', t(locale, 'body'), { placeholder: t(locale, 'noteBodyPlaceholder') })}
            </>
          )}

          {textEditor.kind === 'contact' && (
            <>
              {renderTextField('name', t(locale, 'name'), { first: true, placeholder: t(locale, 'name') })}
              {renderTextField('phone', t(locale, 'phone'), { inputMode: 'tel', placeholder: t(locale, 'phone') })}
              {renderTextField('email', t(locale, 'email'), { type: 'email', inputMode: 'email', placeholder: t(locale, 'email') })}
            </>
          )}

          {textEditor.kind === 'calendarEvent' && (
            <>
              {renderTextField('title', t(locale, 'title'), { first: true, placeholder: t(locale, 'eventTitle') })}
              {renderTextField('date', t(locale, 'date'), { type: 'date' })}
              {renderTextField('time', t(locale, 'time'), { type: 'time' })}
              {renderTextArea('notes', t(locale, 'notes'), { placeholder: t(locale, 'eventNotes') })}
            </>
          )}

          {textEditor.kind === 'ebook' && (
            <>
              {renderTextField('title', t(locale, 'title'), { first: true, placeholder: tx(locale, 'Book title', '图书标题') })}
              {renderTextField('name', tx(locale, 'Author', '作者'), { placeholder: tx(locale, 'Author', '作者') })}
              {renderTextArea('body', tx(locale, 'Text', '文本'), { placeholder: tx(locale, 'Book text', '图书文本') })}
            </>
          )}

          {textEditor.kind === 'workout' && (
            <>
              {renderTextField('title', t(locale, 'title'), { first: true, placeholder: tx(locale, 'Workout', '健身') })}
              {renderTextField('date', t(locale, 'date'), { type: 'date' })}
              {renderTextArea('notes', t(locale, 'notes'), { placeholder: tx(locale, 'Distance, duration, route, effort', '距离、时长、路线、强度') })}
            </>
          )}
        </div>

        {textEditor.error && (
          <div className={`mt-3 rounded-sm border px-2 py-1.5 text-[11px] font-bold leading-tight ${isDarkTheme ? 'border-[#7d1d2a] bg-[#2a1115] text-[#ff9aa7]' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {textEditor.error}
          </div>
        )}
      </form>
    );
  };

  const renderClock = () => {
    if (currentNode.id.startsWith('sleep_timer')) {
      const remainingMs = sleepTimer.status === 'running' && sleepTimer.startedAt && sleepTimer.durationMs
        ? Math.max(0, sleepTimer.startedAt + sleepTimer.durationMs - now.getTime())
        : 0;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      const formatted = sleepTimer.status === 'running'
        ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : sleepTimer.status === 'completed' ? tx(locale, 'Done', '完成') : t(locale, 'off');

      return (
        <div className={`flex-1 text-white flex flex-col justify-center px-6 ${isDarkTheme ? 'bg-[#0c090a]' : 'bg-neutral-950'}`}>
          <div className={`text-[10px] font-black uppercase ${isDarkTheme ? 'text-[#df302c]' : 'text-white/55'}`}>{tx(locale, 'Sleep Timer', '睡眠定时')}</div>
          <div className="mt-2 text-4xl font-black leading-none tabular-nums">{formatted}</div>
          <div className="mt-4 space-y-1">
            {(currentNode.detailLines || []).map((line, index) => (
              <div key={`${line}-${index}`} className="text-[11px] font-bold leading-tight text-white/70">{line}</div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2 text-[10px] font-black uppercase text-white/60">
            <div>{tx(locale, 'Select action', 'Select 操作')}</div>
            <div>{tx(locale, 'Menu back', 'Menu 返回')}</div>
            <div>Next +5m</div>
            <div>Prev -5m</div>
          </div>
        </div>
      );
    }

    const timeZoneByNode: Record<string, string> = {
      clk_local: Intl.DateTimeFormat().resolvedOptions().timeZone,
      clk_new_york: 'America/New_York',
      clk_london: 'Europe/London',
      clk_tokyo: 'Asia/Tokyo',
    };
    const timeZone = timeZoneByNode[currentNode.id] || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).formatToParts(now);
    const hour = Number(parts.find(part => part.type === 'hour')?.value || 0) % 12;
    const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
    const second = Number(parts.find(part => part.type === 'second')?.value || 0);
    const formattedTime = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now);
    const hourDegrees = hour * 30 + minute * 0.5;
    const minuteDegrees = minute * 6 + second * 0.1;
    const secondDegrees = second * 6;

    return (
      <div className={`flex-1 flex flex-col items-center justify-center relative overflow-hidden ${isDarkTheme ? 'bg-[#171314]' : 'bg-neutral-100'}`}>
        <div className={`w-32 h-32 rounded-full border-[8px] relative flex items-center justify-center shadow-inner ${isDarkTheme ? 'border-[#4a383d] bg-[#0d0a0b]' : 'border-gray-400 bg-white'}`}>
          <div className={`absolute top-2 w-1 h-3 ${isDarkTheme ? 'bg-[#6f5e63]' : 'bg-gray-300'}`}></div>
          <div className={`absolute bottom-2 w-1 h-3 ${isDarkTheme ? 'bg-[#6f5e63]' : 'bg-gray-300'}`}></div>
          <div className={`absolute left-2 w-3 h-1 ${isDarkTheme ? 'bg-[#6f5e63]' : 'bg-gray-300'}`}></div>
          <div className={`absolute right-2 w-3 h-1 ${isDarkTheme ? 'bg-[#6f5e63]' : 'bg-gray-300'}`}></div>
          
          {/* Hands */}
          <div className={`w-1.5 h-8 absolute bottom-1/2 left-1/2 -mb-0.5 -ml-[3px] origin-bottom rounded-full ${isDarkTheme ? 'bg-[#efe7e4]' : 'bg-gray-800'}`} style={{ transform: `rotate(${hourDegrees}deg)` }}></div>
          <div className={`w-1 h-12 absolute bottom-1/2 left-1/2 -mb-0.5 -ml-0.5 origin-bottom rounded-full ${isDarkTheme ? 'bg-[#efe7e4]' : 'bg-gray-800'}`} style={{ transform: `rotate(${minuteDegrees}deg)` }}></div>
          <div className={`w-0.5 h-14 absolute bottom-1/2 left-1/2 -mb-0.5 -ml-[1px] origin-bottom ${accentFillClass}`} style={{ transform: `rotate(${secondDegrees}deg)` }}></div>
          
          <div className={`w-3 h-3 rounded-full z-10 absolute ${isDarkTheme ? 'bg-[#df302c]' : 'bg-gray-800'}`}></div>
        </div>
        <div className={`mt-8 text-xl font-bold font-sans tracking-tight ${primaryTextClass}`}>{formattedTime}</div>
        <div className={`text-xs font-semibold ${mutedTextClass}`}>{currentNode.title || 'Clock'}</div>
      </div>
    );
  };

  const renderCalendar = () => {
    const focus = currentNode.calendarEventDate ? new Date(`${currentNode.calendarEventDate}T00:00:00`) : now;
    const year = focus.getFullYear();
    const month = focus.getMonth();
    const todayDate = new Date();
    const isCurrentMonth = todayDate.getFullYear() === year && todayDate.getMonth() === month;
    const today = isCurrentMonth ? todayDate.getDate() : -1;
    const eventDates = new Set((currentNode.children || [])
      .map(child => child.calendarEventDate)
      .filter((date): date is string => Boolean(date)));
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthTitle = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    }).format(now);
    const cells = [
      ...Array.from({ length: firstDay }, () => 0),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];

    return (
      <div className={`flex-1 flex flex-col p-2 ${isDarkTheme ? 'bg-[#171314]' : 'bg-white'}`}>
        <div className={`text-center font-bold text-sm text-white py-1 rounded-sm shadow-sm mb-2 ${accentFillClass}`}>{monthTitle}</div>
        <div className="grid grid-cols-7 gap-1 flex-1">
          {t(locale, 'weekdaysShort').split(',').map((d, i) => (
            <div key={i} className={`text-center text-[10px] font-bold ${faintTextClass}`}>{d}</div>
          ))}
          {cells.map((day, index) => {
            const dateKey = day
              ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              : '';
            const hasEvent = eventDates.has(dateKey);
            return (
              <div key={`${day}-${index}`} className={`relative text-center text-xs font-bold py-1 ${day === today ? (isDarkTheme ? 'bg-[#351419] border border-[#d92727] text-[#fff2f0] shadow-sm rounded-sm z-10' : 'bg-blue-100 border border-blue-500 text-blue-800 shadow-sm rounded-sm z-10') : (isDarkTheme ? 'text-[#ded4d2]' : 'text-gray-800')}`}>
                {day || ''}
                {hasEvent && (
                  <span className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${accentButtonClass}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStopwatch = () => {
    const totalCentiseconds = Math.floor(stopwatchElapsedMs / 10);
    const centiseconds = totalCentiseconds % 100;
    const totalSeconds = Math.floor(totalCentiseconds / 100);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
    const lapRows = stopwatchLaps
      .map((elapsed, index, all) => ({
        index: index + 1,
        elapsed,
        split: elapsed - (all[index - 1] || 0),
      }))
      .slice(-4)
      .reverse();
    const formatMs = (ms: number) => {
      const cs = Math.floor(ms / 10);
      const c = cs % 100;
      const s = Math.floor(cs / 100) % 60;
      const m = Math.floor(cs / 6000);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
    };

    return (
       <div className={`flex-1 flex flex-col p-5 ${isDarkTheme ? 'bg-[#171314]' : 'bg-neutral-100'}`}>
         <div className="flex items-center justify-between">
           <div className={`text-[10px] font-black uppercase ${mutedTextClass}`}>{stopwatchRunning ? t(locale, 'running') : stopwatchElapsedMs > 0 ? tx(locale, 'Paused', '已暂停') : t(locale, 'stopped')}</div>
           <div className={`h-2 w-2 rounded-full ${stopwatchRunning ? accentFillClass : isDarkTheme ? 'bg-[#6f5e63]' : 'bg-gray-400'}`} />
         </div>
         <div className={`mt-2 text-4xl font-black font-mono tracking-tighter tabular-nums ${strongTextClass}`}>{formatted}</div>
         <div className="mt-4 min-h-[82px] space-y-1 overflow-hidden">
           {lapRows.length ? lapRows.map(lap => (
             <div key={lap.index} className={`flex justify-between border-b pb-1 text-[11px] font-black tabular-nums ${dividerClass} ${secondaryTextClass}`}>
               <span>{tx(locale, 'Lap {count}', '计圈 {count}', { count: String(lap.index).padStart(2, '0') })}</span>
               <span>{formatMs(lap.split)}</span>
             </div>
           )) : stopwatchLastSession ? (
             <div className={`space-y-1 text-[11px] font-bold ${mutedTextClass}`}>
               <div className={`font-black ${strongTextClass}`}>{tx(locale, 'Last Session', '上次记录')}</div>
               <div>{tx(locale, 'Total {value}', '总计 {value}', { value: formatMs(stopwatchLastSession.totalMs) })}</div>
               <div>{tx(locale, '{count} laps', '{count} 圈', { count: stopwatchLastSession.laps.length })}</div>
             </div>
           ) : (
             <div className={`text-[11px] font-bold leading-tight ${mutedTextClass}`}>{tx(locale, 'Select starts. Next records a lap. Pause first, then Previous resets.', 'Select 开始。Next 记录一圈。先暂停，再用 Previous 重置。')}</div>
           )}
         </div>
         <div className={`mt-auto grid grid-cols-3 gap-1 text-center text-[9px] font-black uppercase ${mutedTextClass}`}>
           <div>{tx(locale, 'Select {action}', 'Select {action}', { action: stopwatchRunning ? tx(locale, 'Pause', '暂停') : tx(locale, 'Start', '开始') })}</div>
           <div>{tx(locale, 'Next Lap', 'Next 计圈')}</div>
           <div>{tx(locale, 'Prev Reset', 'Prev 重置')}</div>
         </div>
       </div>
    );
  };

  const renderAbout = () => {
     const lines = currentNode.detailLines || [];
     return (
       <div className={`flex-1 flex flex-col p-4 ${isDarkTheme ? 'bg-[#171314]' : 'bg-white'}`}>
          <div className={`font-bold text-lg mb-4 text-center ${strongTextClass}`}>SquarePod</div>
          <div className="space-y-2 align-middle">
            {lines.map(line => {
              const [label, ...valueParts] = line.split(':');
              return (
                <div key={line} className={`flex border-b pb-1 justify-between gap-3 text-xs font-bold ${isDarkTheme ? 'border-[#2b2023]' : 'border-gray-100'}`}>
                  <span className={mutedTextClass}>{label}</span>
                  <span className={`text-right ${primaryTextClass}`}>{valueParts.join(':').trim() || '-'}</span>
                </div>
              );
            })}
          </div>
       </div>
     );
  };

  const renderPlaceholder = () => {
     return (
       <div className={`flex-1 flex flex-col items-center justify-center p-6 text-center ${isDarkTheme ? 'bg-[#171314]' : 'bg-white'}`}>
         <svg className={`w-12 h-12 mb-4 ${isDarkTheme ? 'text-[#4a383d]' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
         </svg>
         <div className={`font-bold text-sm tracking-tight ${mutedTextClass}`}>{t(locale, 'notImplemented')}</div>
         <div className={`text-xs mt-1 leading-tight ${faintTextClass}`}>{t(locale, 'mockupFeature')}</div>
       </div>
     );
  };

  const renderServiceStatus = () => {
    const toneClass = currentNode.statusTone === 'success'
      ? isDarkTheme ? 'text-[#68d391]' : 'text-green-600'
      : currentNode.statusTone === 'error'
        ? isDarkTheme ? 'text-[#ff7a8b]' : 'text-red-600'
        : currentNode.statusTone === 'warning'
          ? isDarkTheme ? 'text-[#f0b45f]' : 'text-amber-600'
          : isDarkTheme ? 'text-[#d6cacc]' : 'text-gray-600';

    return (
      <div className={`flex-1 flex flex-col p-5 overflow-hidden ${isDarkTheme ? 'bg-[#171314]' : 'bg-white'}`}>
        <div className={`text-sm font-bold leading-tight ${toneClass}`}>{currentNode.title}</div>
        <div className="mt-3 space-y-2">
          {(currentNode.detailLines || [t(locale, 'noServiceDetails')]).map((line, index) => (
            <div key={`${line}-${index}`} className={`text-[11px] leading-tight font-semibold ${secondaryTextClass}`}>
              {line}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPhotoGrid = () => {
    const photos = (currentNode.children || []).filter(child => child.mediaItem?.kind === 'photo');

    if (!photos.length) {
      return renderServiceStatus();
    }

    const visibleCount = PHOTO_GRID_COLUMNS * PHOTO_GRID_VISIBLE_ROWS;
    const selectedRow = Math.floor(cursorIndex / PHOTO_GRID_COLUMNS);
    const rowCount = Math.ceil(photos.length / PHOTO_GRID_COLUMNS);
    const maxStartRow = Math.max(0, rowCount - PHOTO_GRID_VISIBLE_ROWS);
    const startRow = Math.max(0, Math.min(maxStartRow, selectedRow - 1));
    const startIndex = startRow * PHOTO_GRID_COLUMNS;
    const visiblePhotos = photos.slice(startIndex, startIndex + visibleCount);

    return (
      <div className="flex-1 bg-black p-[3px] grid grid-cols-4 gap-[3px] content-start overflow-hidden">
        {visiblePhotos.map((photo, index) => {
          const absoluteIndex = startIndex + index;
          const isSelected = absoluteIndex === cursorIndex;

          return (
            <div key={photo.id} className="aspect-square bg-gray-800 rounded-[2px] relative overflow-hidden">
              <CachedImage
                src={photo.mediaItem?.thumbnailUri || photo.mediaItem?.uri || ''}
                className="absolute inset-0 object-cover w-full h-full"
                decoding="async"
              />
              {isSelected && (
                <div className={`pointer-events-none absolute inset-0 z-10 rounded-[2px] border-[3px] ${isDarkTheme ? 'border-[#d92727]' : 'border-blue-500'} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.92),0_0_0_1px_rgba(0,0,0,0.65)]`} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderPhotoDetail = () => {
    const item = currentNode.mediaItem;
    if (!item) return renderServiceStatus();

    return (
      <div className="flex-1 bg-black flex items-center justify-center">
        <CachedImage src={item.uri} className="max-h-full max-w-full object-contain" />
      </div>
    );
  };

  const renderVideoDetail = () => {
    const item = currentNode.mediaItem;
    if (!item) return renderServiceStatus();
    const videoSrc = resolveNativeMediaSrc(item.uri);
    const posterSrc = resolveNativeMediaSrc(item.thumbnailUri);
    const startVideo = () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.ended) video.currentTime = 0;
      video.play()
        .then(() => {
          setVideoHasStarted(true);
          setVideoIsPaused(false);
        })
        .catch(error => console.error('Video playback failed', error));
    };

    return (
      <div className="relative flex-1 bg-black">
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
        />
        {videoIsPaused && (
          <button
            type="button"
            aria-label={tx(locale, 'Play video', '播放视频')}
            onClick={startVideo}
            className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/62 text-white shadow-[0_8px_22px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/30 active:scale-95"
          >
            <span className="ml-1 block h-0 w-0 border-y-[15px] border-l-[23px] border-y-transparent border-l-current" />
          </button>
        )}
      </div>
    );
  };

  const renderRadio = () => {
    const lines = currentNode.detailLines || [t(locale, 'radioStatusUnavailable')];
    const frequencyLine = currentNode.radioFrequency
      ? `${currentNode.radioFrequency.toFixed(1)} MHz`
      : lines[0];

    return (
      <div className={`flex-1 flex flex-col items-center justify-center px-6 text-center ${isDarkTheme ? 'bg-[#171314]' : 'bg-neutral-100'}`}>
        <div className="relative h-24 w-36 rounded-sm border-4 border-neutral-700 bg-neutral-900 shadow-inner">
          <div className="absolute inset-x-4 top-5 h-2 rounded-full bg-neutral-700">
            <div className={`h-full w-1 rounded-full ${accentFillClass}`} style={{ marginLeft: '56%' }} />
          </div>
          <div className="absolute inset-x-4 bottom-5 flex items-end gap-1">
            {[0.45, 0.72, 0.32, 0.86, 0.54].map((height, index) => (
              <div key={index} className="w-full rounded-sm bg-neutral-400" style={{ height: `${height * 28}px` }} />
            ))}
          </div>
        </div>
        <div className={`mt-5 text-xl font-black leading-none ${strongTextClass}`}>{frequencyLine}</div>
        <div className="mt-3 space-y-1">
          {lines.slice(0, 4).map((line, index) => (
            <div key={`${line}-${index}`} className={`text-[11px] font-bold leading-tight ${mutedTextClass}`}>{line}</div>
          ))}
        </div>
      </div>
    );
  };

  const renderDetailLinesScreen = () => (
    <div className={`flex-1 flex flex-col p-5 overflow-y-auto ${isDarkTheme ? 'bg-[#171314]' : 'bg-white'}`}>
      <div className={`text-lg font-black leading-tight ${strongTextClass}`}>{currentNode.title}</div>
      <div className="mt-4 space-y-3">
        {(currentNode.detailLines || []).map((line, index) => (
          <div key={`${line}-${index}`} className={`whitespace-pre-wrap text-xs font-semibold leading-tight ${secondaryTextClass}`}>{line}</div>
        ))}
      </div>
      {currentNode.children?.length ? (
        <div className={`mt-auto text-[10px] font-black uppercase ${mutedTextClass}`}>{t(locale, 'actions')}</div>
      ) : null}
    </div>
  );

  const renderScreenLock = () => {
    return (
      <div className="flex-1 bg-neutral-950 text-white flex flex-col items-center justify-center text-center p-6">
        <div className="h-16 w-16 rounded-full border-4 border-white/80 flex items-center justify-center">
          <div className="h-7 w-5 rounded-sm border-2 border-white relative">
            <div className="absolute -top-4 left-1/2 h-5 w-6 -translate-x-1/2 rounded-t-full border-2 border-white border-b-0" />
          </div>
        </div>
        <div className="mt-6 text-lg font-black">{t(locale, 'screenLocked')}</div>
        {currentSong && (
          <div className="mt-3 w-full min-w-0">
            <div className="truncate text-sm font-black">{currentSong.title}</div>
            <div className="truncate text-xs font-bold text-white/60">{currentSong.artist}</div>
          </div>
        )}
        <div className="mt-4 text-xs font-bold text-white/70">
          {unlockArmed ? tx(locale, 'Press Select to unlock. Menu cancels.', '按 Select 解锁。Menu 取消。') : tx(locale, 'Press Menu, then Select to unlock.', '先按 Menu，再按 Select 解锁。')}
        </div>
      </div>
    );
  };

  const renderScreenContent = () => {
    switch (currentNode.type) {
      case 'coverFlow': return renderCoverFlow();
      case 'nowPlaying': return renderNowPlayingFull();
      case 'songDetail': return renderSongDetail();
      case 'videoDetail': return renderVideoDetail();
      case 'photoGrid': return renderPhotoGrid();
      case 'photoDetail': return renderPhotoDetail();
      case 'radioStatus': return renderServiceStatus();
      case 'radioNowPlaying': return renderRadio();
      case 'radioStationList': return renderMenu();
      case 'radioTune': return renderRadio();
      case 'clock': return renderClock();
      case 'calendar': return renderCalendar();
      case 'calendarEventList': return renderMenu();
      case 'calendarEventDetail': return renderDetailLinesScreen();
      case 'stopwatch': return renderStopwatch();
      case 'contactList': return renderMenu();
      case 'contactDetail': return renderDetailLinesScreen();
      case 'noteList': return renderMenu();
      case 'noteDetail': return renderDetailLinesScreen();
      case 'ebookReader':
        return (
          <ClassicEbookReader
            node={currentNode}
            command={ebookReaderCommand}
            locale={locale}
            onEbookProgress={onEbookProgress}
            theme={theme}
          />
        );
      case 'textEditor': return renderTextEditor();
      case 'screenLock': return renderScreenLock();
      case 'legal': return renderDetailLinesScreen();
      case 'appleMusicStatus':
      case 'spotifyStatus':
      case 'localMusicStatus':
        return renderServiceStatus();
      case 'about': return renderAbout();
      case 'photos': return renderPhotoGrid();
      case 'videos': return renderPlaceholder();
      case 'settings': return renderPlaceholder();
      case 'placeholder': return renderPlaceholder();
      case 'menu':
      default: return renderMenu();
    }
  };

  const usesFullScreenMedia = currentNode.type === 'photoDetail';

  return (
    <div className={screenRootClass}>
      {!usesFullScreenMedia && renderHeader()}
      <div className={`w-full ${usesFullScreenMedia ? 'h-full' : 'h-[calc(100%-24px)]'} min-h-0 overflow-hidden flex`}>
        {renderScreenContent()}
      </div>
      <AnimatePresence>
        {alphaJumpKey && (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 z-[300] grid h-[82px] w-[82px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[18px] bg-black/72 text-[48px] font-black leading-none text-white shadow-xl"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.12 }}
          >
            {alphaJumpKey}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
