import React from 'react';
import { AppTheme } from '../types';
import { RotateEndMeta, useWheel } from '../useWheel';
import { playOuterButtonClick, playSelectClick, playWheelTick, unlockUiAudio } from '../audio/uiSounds';
import { WheelHaptics } from '../native/wheelHaptics';

const CLICK_WHEEL_SENSITIVITY = Math.PI / 6;
const OUTER_BUTTON_SOUND_DELAY_MS = 70;
const LONG_PRESS_START_MS = 700;
const LONG_PRESS_REPEAT_MS = 180;

const hapticButton = () => {
  WheelHaptics.tick({
    count: 2,
    durationMs: 36,
    gapMs: 10,
    amplitude: 255,
  }).catch(() => undefined);
};

const hapticSelect = () => {
  WheelHaptics.tick({
    count: 2,
    durationMs: 44,
    gapMs: 9,
    amplitude: 255,
  }).catch(() => undefined);
};

interface ClickWheelProps {
  onRotate: (steps: number) => void;
  onSelect: () => void;
  onMenu: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onNextLongPress?: () => void;
  onPrevLongPress?: () => void;
  onRotateStart?: () => void;
  onRotateEnd?: (meta: RotateEndMeta) => void;
  theme?: AppTheme;
}

export function ClickWheel({
  onRotate,
  onSelect,
  onMenu,
  onPlayPause,
  onNext,
  onPrev,
  onNextLongPress,
  onPrevLongPress,
  onRotateStart,
  onRotateEnd,
  theme = 'light',
}: ClickWheelProps) {
  const isDarkTheme = theme === 'dark';
  const pendingOuterButtonSoundRef = React.useRef<number | null>(null);
  const longPressStartRef = React.useRef<number | null>(null);
  const longPressRepeatRef = React.useRef<number | null>(null);
  const longPressZoneRef = React.useRef<'next' | 'prev' | null>(null);
  const longPressFiredRef = React.useRef(false);

  const clearLongPressTimers = () => {
    if (longPressStartRef.current !== null) {
      window.clearTimeout(longPressStartRef.current);
      longPressStartRef.current = null;
    }
    if (longPressRepeatRef.current !== null) {
      window.clearInterval(longPressRepeatRef.current);
      longPressRepeatRef.current = null;
    }
    longPressZoneRef.current = null;
  };

  const clearPendingOuterButtonSound = () => {
    if (pendingOuterButtonSoundRef.current === null) return;
    window.clearTimeout(pendingOuterButtonSoundRef.current);
    pendingOuterButtonSoundRef.current = null;
  };

  const scheduleOuterButtonSound = () => {
    clearPendingOuterButtonSound();
    pendingOuterButtonSoundRef.current = window.setTimeout(() => {
      pendingOuterButtonSoundRef.current = null;
      playOuterButtonClick();
    }, OUTER_BUTTON_SOUND_DELAY_MS);
  };

  const zoneFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(event.clientY - cy, event.clientX - cx);

    if (angle > -Math.PI * 0.25 && angle < Math.PI * 0.25) return 'next';
    if (angle < -Math.PI * 0.75 || angle > Math.PI * 0.75) return 'prev';
    return null;
  };

  const scheduleLongPress = (zone: 'next' | 'prev' | null) => {
    clearLongPressTimers();
    if (!zone) return;

    longPressZoneRef.current = zone;
    longPressStartRef.current = window.setTimeout(() => {
      longPressStartRef.current = null;
      longPressFiredRef.current = true;
      const fire = () => {
        if (longPressZoneRef.current === 'next') {
          onNextLongPress?.();
        } else if (longPressZoneRef.current === 'prev') {
          onPrevLongPress?.();
        }
      };
      fire();
      longPressRepeatRef.current = window.setInterval(fire, LONG_PRESS_REPEAT_MS);
    }, LONG_PRESS_START_MS);
  };

  const handleZoneClick = (angle: number) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }

    hapticButton();
    if (angle >= -Math.PI * 0.75 && angle <= -Math.PI * 0.25) {
      onMenu();
    } else if (angle >= Math.PI * 0.25 && angle <= Math.PI * 0.75) {
      onPlayPause();
    } else if (angle > -Math.PI * 0.25 && angle < Math.PI * 0.25) {
      onNext();
    } else {
      onPrev();
    }
  };

  const handleWheelRotate = (steps: number) => {
    clearLongPressTimers();
    clearPendingOuterButtonSound();
    playWheelTick(steps);
    onRotate(steps);
  };

  const handleWheelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    unlockUiAudio();
    scheduleOuterButtonSound();
    scheduleLongPress(zoneFromPointer(event));
    handlePointerDown(event);
  };

  const handleWheelPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (longPressZoneRef.current && zoneFromPointer(event) !== longPressZoneRef.current) {
      clearLongPressTimers();
    }
    handlePointerMove(event);
  };

  const handleWheelPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    clearLongPressTimers();
    handlePointerUp(event);
  };

  const handleWheelPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    clearPendingOuterButtonSound();
    clearLongPressTimers();
    handlePointerUp(event);
  };

  const handleSelectPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    clearPendingOuterButtonSound();
    event.stopPropagation();
    unlockUiAudio();
    hapticSelect();
    playSelectClick();
  };

  const handleRotateStartWithSoundCancel = () => {
    clearLongPressTimers();
    clearPendingOuterButtonSound();
    onRotateStart?.();
  };

  const { wheelRef, handlePointerDown, handlePointerMove, handlePointerUp } = useWheel({ 
    onRotate: handleWheelRotate,
    onClickZone: handleZoneClick,
    onRotateStart: handleRotateStartWithSoundCancel,
    onRotateEnd,
    sensitivity: CLICK_WHEEL_SENSITIVITY,
  });

  React.useEffect(() => {
    return () => {
      clearPendingOuterButtonSound();
      clearLongPressTimers();
    };
  }, []);

  const wheelClass = isDarkTheme
    ? 'h-[calc(100%+7px)] max-h-[343px] aspect-square rounded-full border border-[#a91518] bg-[linear-gradient(180deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0)_38%),linear-gradient(180deg,#df302c_0%,#d92727_52%,#c91f22_100%)] shadow-[0_16px_28px_rgba(0,0,0,0.48),inset_0_1px_1px_rgba(255,255,255,0.16),inset_0_-1px_2px_rgba(85,0,0,0.18)] flex items-center justify-center relative touch-none pointer-events-auto cursor-pointer'
    : 'h-[calc(100%+7px)] max-h-[343px] aspect-square rounded-full bg-white shadow-[0_10px_20px_rgba(0,0,0,0.1),inset_0_1px_4px_rgba(0,0,0,0.1)] border border-gray-100 flex items-center justify-center relative touch-none pointer-events-auto cursor-pointer';
  const wheelLabelClass = isDarkTheme ? 'text-[#050303]' : 'text-[#9CA3AF]';
  const selectVisualClass = isDarkTheme
    ? 'absolute left-1/2 top-1/2 z-10 h-[35%] w-[35%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3a3032] bg-[linear-gradient(180deg,#242022_0%,#111011_100%)] shadow-[0_3px_6px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] pointer-events-none'
    : 'absolute left-1/2 top-1/2 z-10 h-[35%] w-[35%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-400 bg-gradient-to-b from-gray-100 to-gray-300 shadow-[0_2px_4px_rgba(0,0,0,0.15)] pointer-events-none';
  const selectButtonClass = isDarkTheme
    ? 'absolute left-1/2 top-1/2 z-20 h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent cursor-pointer pointer-events-auto outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d92727]/70'
    : 'absolute left-1/2 top-1/2 z-20 h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent cursor-pointer pointer-events-auto outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/40';

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none" style={{ touchAction: 'none' }}>
      <div 
        ref={wheelRef}
        onPointerDown={handleWheelPointerDown}
        onPointerMove={handleWheelPointerMove}
        onPointerUp={handleWheelPointerUp}
        onPointerCancel={handleWheelPointerCancel}
        className={wheelClass}
      >
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[30%] flex justify-center items-start pt-[15%] ${wheelLabelClass} font-bold text-sm tracking-[0.15em] uppercase pointer-events-none`}>
          MENU
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[30%] flex justify-center items-end pb-[15%] pointer-events-none">
          <svg width="22" height="11" viewBox="0 0 22 11" fill="currentColor" className={wheelLabelClass}>
             {/* Play */}
             <path d="M0 0l9 5.5L0 11z" />
             {/* Pause */}
             <path d="M14 0h2.5v11H14zM19.5 0H22v11h-2.5z" />
          </svg>
        </div>

        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[30%] h-1/2 flex justify-start pl-[15%] pointer-events-none items-center">
          <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" className={wheelLabelClass}>
             <path d="M0 0h2.5v11H0zM15 0L6 5.5 15 11z" />
          </svg>
        </div>

        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[30%] h-1/2 flex justify-end pr-[15%] pointer-events-none items-center">
          <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" className={wheelLabelClass}>
             <path d="M0 0l9 5.5L0 11zM12.5 0H15v11h-2.5z" />
          </svg>
        </div>

        {/* Center Select visual stays large; the transparent hit target is smaller to avoid stealing outer-button taps. */}
        <div className={selectVisualClass} />
        <button 
          aria-label="Select"
          className={selectButtonClass}
          onPointerDown={handleSelectPointerDown}
          onClick={onSelect}
        />
      </div>
    </div>
  );
}
