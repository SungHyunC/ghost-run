import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { escapeForDisplay as esc } from '@ghost-run/ui';
import { frameCount } from '../overlay/geometry';
import { buildOverlayViewModel } from '../overlay/view-model';
import type { CameraPreset, OverlayRenderer } from '../overlay/renderer';
import type { OverlayInput } from '../pipeline/types';
import { WEBGL_FALLBACK_TEXT } from '../texts';
import {
  CAMERA_ANGLED_LABEL,
  CAMERA_FRONT_LABEL,
  CAMERA_SIDE_LABEL,
  FRAME_SLIDER_LABEL,
  OVERLAY_HEADING,
  OVERLAY_NAME,
  REDUCED_MOTION_TEXT,
  REPLAY_LABEL,
} from '../ui-text';

export type CreateOverlay = (canvas: HTMLCanvasElement) => OverlayRenderer | { unavailable: true };

export interface OverlayViewProps {
  readonly input: OverlayInput | null;
  /** Id of the variant table, referenced from the canvas description. */
  readonly tableId: string;
  readonly createOverlay: CreateOverlay;
  readonly reducedMotion: boolean;
}

function isRenderer(r: OverlayRenderer | { unavailable: true }): r is OverlayRenderer {
  return !('unavailable' in r);
}

/** Reads the Theme the kit root sets on `data-theme` and follows its changes (the kit owns the Lights_Toggle). */
function useKitTheme(ref: React.RefObject<HTMLElement | null>): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const root = ref.current?.closest('[data-theme]') ?? null;
    if (root === null) return undefined;
    const read = (): void => {
      setTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    };
    read();
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return theme;
}

/** The 3D overlay with two camera presets and a frame slider. Under reduced motion it shows a still frame. */
export function OverlayView({ input, tableId, createOverlay, reducedMotion }: OverlayViewProps) {
  const headingId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OverlayRenderer | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  // The angled view is the default: from the front the ghost arms hide behind each other.
  const [preset, setPreset] = useState<CameraPreset>('angled');
  const [frame, setFrame] = useState(0);
  const theme = useKitTheme(sectionRef);

  const model = useMemo(() => (input === null ? null : buildOverlayViewModel(input)), [input]);
  const totalFrames = useMemo(
    () => (model === null ? 0 : Math.max(0, ...model.arms.map((a) => frameCount(a.frames, model.bodyCount)))),
    [model],
  );
  const lastFrame = Math.max(0, totalFrames - 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const made = createOverlay(canvas);
    if (!isRenderer(made)) {
      setUnavailable(true);
      return undefined;
    }
    rendererRef.current = made;
    return () => {
      made.dispose();
      rendererRef.current = null;
    };
  }, [createOverlay]);

  useEffect(() => {
    rendererRef.current?.setTheme(theme);
  }, [theme, model]);

  useEffect(() => {
    rendererRef.current?.setCameraPreset(preset);
  }, [preset, model]);

  useEffect(() => {
    const r = rendererRef.current;
    if (r === null || model === null) return;
    r.setModel(model, { reducedMotion });
    r.setTheme(theme);
    r.setCameraPreset(preset);
    setFrame(reducedMotion ? lastFrame : 0);
    // The theme and the preset are applied by their own effects; they must not rebuild the model.
  }, [model, reducedMotion]);

  const canStep = model !== null && totalFrames > 1 && !unavailable;
  return (
    <section className="gk-section gh-overlay" aria-labelledby={headingId} ref={sectionRef}>
      <h2 className="gk-heading" id={headingId}>
        {OVERLAY_HEADING}
      </h2>
      {unavailable ? <p role="status">{WEBGL_FALLBACK_TEXT}</p> : null}
      <canvas
        ref={canvasRef}
        className="gh-canvas"
        role="img"
        aria-label={esc(OVERLAY_NAME)}
        aria-describedby={tableId}
        hidden={unavailable}
      />
      {reducedMotion && !unavailable ? <p className="gk-note">{REDUCED_MOTION_TEXT}</p> : null}
      <div className="gh-actions gh-view-actions">
        <button
          type="button"
          className="gk-button"
          aria-pressed={preset === 'angled'}
          disabled={unavailable}
          onClick={() => {
            setPreset('angled');
          }}
        >
          {CAMERA_ANGLED_LABEL}
        </button>
        <button
          type="button"
          className="gk-button"
          aria-pressed={preset === 'front'}
          disabled={unavailable}
          onClick={() => {
            setPreset('front');
          }}
        >
          {CAMERA_FRONT_LABEL}
        </button>
        <button
          type="button"
          className="gk-button"
          aria-pressed={preset === 'side'}
          disabled={unavailable}
          onClick={() => {
            setPreset('side');
          }}
        >
          {CAMERA_SIDE_LABEL}
        </button>
        {reducedMotion ? null : (
          <button
            type="button"
            className="gk-button"
            disabled={!canStep}
            onClick={() => {
              setFrame(0);
              rendererRef.current?.setFrame(0);
              rendererRef.current?.play();
            }}
          >
            {REPLAY_LABEL}
          </button>
        )}
      </div>
      <label className="gh-field">
        <span>
          {FRAME_SLIDER_LABEL}: <span className="gh-mono">{frame} / {lastFrame}</span>
        </span>
        <input
          type="range"
          min={0}
          max={lastFrame}
          step={1}
          value={Math.min(frame, lastFrame)}
          disabled={!canStep}
          onChange={(e) => {
            const next = Number(e.target.value);
            setFrame(next);
            rendererRef.current?.setFrame(next);
          }}
        />
      </label>
    </section>
  );
}
