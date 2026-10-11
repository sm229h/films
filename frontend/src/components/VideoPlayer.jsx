import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

import { Icon, IconButton, Spinner } from './ui.jsx';
import { formatTime, toFaDigits } from '../lib/format.js';
import './player.css';

const SAVE_INTERVAL_MS = 15000;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * HTML5 player with HLS support (hls.js), quality/subtitle selection, resume
 * and periodic progress reporting.
 *
 * The stream URL comes from the API's playback endpoint, which authorises the
 * request server-side — the client never decides whether content is watchable.
 */
export default function VideoPlayer({
  sources = [],
  subtitles = [],
  startPosition = 0,
  title,
  onProgress,
  nextEpisode,
  onNextEpisode,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const lastSavedRef = useRef(0);
  const resumeAppliedRef = useRef(false);

  const [sourceId, setSourceId] = useState(sources[0]?.id ?? null);
  const [subtitleId, setSubtitleId] = useState(
    subtitles.find((track) => track.isDefault)?.id ?? subtitles[0]?.id ?? null,
  );
  const [status, setStatus] = useState(sources.length ? 'loading' : 'empty');
  const [errorMessage, setErrorMessage] = useState('');
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [waiting, setWaiting] = useState(false);

  const activeSource = sources.find((source) => source.id === sourceId) ?? sources[0];
  const activeSubtitle = subtitles.find((track) => track.id === subtitleId) ?? null;

  const report = useCallback(
    (current, total, force = false) => {
      if (!onProgress) return;
      const now = Date.now();
      if (!force && now - lastSavedRef.current < SAVE_INTERVAL_MS) return;
      lastSavedRef.current = now;
      onProgress(Math.floor(current), Math.floor(total || 0));
    },
    [onProgress],
  );

  /* ------------------------------------------------------------ attach media */

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeSource) return undefined;

    resumeAppliedRef.current = false;
    setStatus('loading');
    setErrorMessage('');

    if (activeSource.kind === 'hls' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(activeSource.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setStatus('error');
        setErrorMessage(
          data.type === Hls.ErrorTypes.NETWORK_ERROR
            ? 'اتصال به منبع پخش قطع شد. اتصال اینترنت خود را بررسی کنید.'
            : 'پخش این منبع ممکن نشد. کیفیت دیگری را امتحان کنید.',
        );
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Safari plays HLS natively; MP4 goes straight to the video element.
    video.src = activeSource.url;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }, [activeSource]);

  /* ---------------------------------------------------------- media events */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const onLoaded = () => {
      setDuration(video.duration || 0);
      setStatus('ready');
      if (
        !resumeAppliedRef.current &&
        startPosition > 1 &&
        startPosition < (video.duration || 0) - 5
      ) {
        video.currentTime = startPosition;
        resumeAppliedRef.current = true;
      }
    };
    const onTime = () => {
      setPosition(video.currentTime);
      if (video.buffered.length) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      report(video.currentTime, video.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      report(video.currentTime, video.duration, true);
    };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onEnded = () => {
      setPlaying(false);
      report(video.duration, video.duration, true);
      if (nextEpisode) onNextEpisode?.();
    };
    const onError = () => {
      setStatus('error');
      setErrorMessage('پخش این منبع ممکن نشد. ممکن است فایل در دسترس نباشد.');
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, [report, startPosition, nextEpisode, onNextEpisode]);

  // Persist the final position when leaving the page.
  useEffect(
    () => () => {
      const video = videoRef.current;
      if (video && video.duration) report(video.currentTime, video.duration, true);
    },
    [report],
  );

  /* --------------------------------------------------------------- controls */

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const seek = useCallback((seconds) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, seconds));
    setPosition(video.currentTime);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const node = containerRef.current;
    if (!node) return;
    if (!document.fullscreenElement) {
      await node.requestFullscreen?.().catch(() => {});
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.().catch(() => {});
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = rate;
  }, [volume, muted, rate]);

  // Show/hide the <track> matching the selected subtitle.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const apply = () => {
      const tracks = video.textTracks;
      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        track.mode =
          activeSubtitle && track.language === activeSubtitle.languageCode ? 'showing' : 'disabled';
      }
    };
    apply();
    const timer = setTimeout(apply, 300);
    return () => clearTimeout(timer);
  }, [activeSubtitle]);

  // Auto-hide controls while playing.
  useEffect(() => {
    if (!playing) {
      setControlsVisible(true);
      return undefined;
    }
    const timer = setTimeout(() => setControlsVisible(false), 3200);
    return () => clearTimeout(timer);
  }, [playing, position]);

  // Keyboard shortcuts (space / arrows / f / m).
  useEffect(() => {
    const onKey = (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      }
      if (event.code === 'ArrowRight') seek(position - 10);
      if (event.code === 'ArrowLeft') seek(position + 10);
      if (event.key === 'f') toggleFullscreen();
      if (event.key === 'm') setMuted((prev) => !prev);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [position, togglePlay, seek, toggleFullscreen]);

  /* ----------------------------------------------------------------- render */

  if (status === 'empty') {
    return (
      <div className="player player--empty">
        <Icon name="film" size={44} />
        <h3>منبع پخش برای این محتوا ثبت نشده است</h3>
        <p>
          برای تماشای آنلاین باید فایل یا سرویس استریم دارای مجوز در پنل مدیریت ثبت شود. رابط
          پلیر آماده است، اما بدون منبع واقعی پخشی انجام نمی‌شود.
        </p>
      </div>
    );
  }

  const percent = duration ? (position / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      className={`player ${controlsVisible ? 'is-active' : ''} ${fullscreen ? 'is-fullscreen' : ''}`}
      ref={containerRef}
      onMouseMove={() => setControlsVisible(true)}
      onMouseLeave={() => {
        if (playing) setControlsVisible(false);
      }}
    >
      <video
        ref={videoRef}
        className="player__video"
        playsInline
        crossOrigin="anonymous"
        onClick={togglePlay}
        preload="metadata"
        aria-label={title}
      >
        {activeSubtitle ? (
          <track
            key={activeSubtitle.id}
            kind="subtitles"
            src={activeSubtitle.url}
            srcLang={activeSubtitle.languageCode}
            label={activeSubtitle.label}
            default
          />
        ) : null}
      </video>

      {status === 'loading' || waiting ? (
        <div className="player__overlay">
          <Spinner size={34} />
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="player__overlay player__overlay--error">
          <Icon name="alert" size={32} />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!playing && status === 'ready' ? (
        <button type="button" className="player__big-play" onClick={togglePlay} aria-label="پخش">
          <Icon name="play" size={34} />
        </button>
      ) : null}

      <div className="player__title">{title}</div>

      <div className="player__controls">
        <input
          className="player__seek"
          type="range"
          min="0"
          max={duration || 0}
          step="1"
          value={position}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="نوار پیشرفت"
          style={{ '--progress': `${percent}%`, '--buffered': `${bufferedPercent}%` }}
        />

        <div className="player__bar">
          <div className="player__bar-group">
            <IconButton
              icon={playing ? 'pause' : 'play'}
              label={playing ? 'توقف' : 'پخش'}
              onClick={togglePlay}
            />
            <IconButton icon="skipBack" label="۱۰ ثانیه عقب" onClick={() => seek(position - 10)} />
            <IconButton icon="skipForward" label="۱۰ ثانیه جلو" onClick={() => seek(position + 10)} />

            <div className="player__volume">
              <IconButton
                icon={muted || volume === 0 ? 'mute' : 'volume'}
                label={muted ? 'روشن کردن صدا' : 'بی‌صدا'}
                onClick={() => setMuted((prev) => !prev)}
              />
              <input
                className="player__volume-range"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(event) => {
                  setVolume(Number(event.target.value));
                  setMuted(Number(event.target.value) === 0);
                }}
                aria-label="میزان صدا"
              />
            </div>

            <span className="player__time">
              {formatTime(position)} / {formatTime(duration)}
            </span>
          </div>

          <div className="player__bar-group">
            {nextEpisode ? (
              <button type="button" className="player__next" onClick={onNextEpisode}>
                قسمت بعد
                <Icon name="chevronLeft" size={16} />
              </button>
            ) : null}

            <label className="player__select">
              <select
                value={String(rate)}
                onChange={(event) => setRate(Number(event.target.value))}
                aria-label="سرعت پخش"
              >
                {SPEEDS.map((speed) => (
                  <option key={speed} value={speed}>
                    {toFaDigits(speed)}×
                  </option>
                ))}
              </select>
            </label>

            {subtitles.length ? (
              <label className="player__select">
                <Icon name="cc" size={16} />
                <select
                  value={subtitleId ?? ''}
                  onChange={(event) =>
                    setSubtitleId(event.target.value ? Number(event.target.value) : null)
                  }
                  aria-label="زیرنویس"
                >
                  <option value="">بدون زیرنویس</option>
                  {subtitles.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {sources.length > 1 ? (
              <label className="player__select">
                <Icon name="grid" size={16} />
                <select
                  value={sourceId ?? ''}
                  onChange={(event) => setSourceId(Number(event.target.value))}
                  aria-label="کیفیت تصویر"
                >
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.quality || source.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <IconButton icon="fullscreen" label="تمام‌صفحه" onClick={toggleFullscreen} />
          </div>
        </div>
      </div>
    </div>
  );
}
