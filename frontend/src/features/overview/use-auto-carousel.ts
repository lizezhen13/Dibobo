import { useEffect, useRef } from "react";

interface UseAutoCarouselOptions {
  itemCount: number;
  enabled?: boolean;
  speedPxPerSecond?: number;
  itemSelector?: string;
  trackSelector?: string;
  resetDelayMs?: number;
}

/**
 * Runs a vertical marquee from the first row to the last row, then returns to
 * the first row. While hovered, the same track can be moved with the wheel.
 */
export function useAutoCarousel<T extends HTMLElement>({
  itemCount,
  enabled = true,
  speedPxPerSecond = 8,
  itemSelector,
  trackSelector = "[data-carousel-track]",
  resetDelayMs = 720,
}: UseAutoCarouselOptions) {
  const viewportRef = useRef<T>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const track = viewport.querySelector<HTMLElement>(trackSelector);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frameId: number | undefined;
    let wheelResumeTimer: number | undefined;
    let resetTimer: number | undefined;
    let lastTimestamp: number | undefined;
    let loopDistance = 0;
    let offset = 0;
    let atEnd = false;
    let canCarousel = false;
    const pauseReasons = new Set<string>();

    const clearResetTimer = () => {
      if (resetTimer !== undefined) {
        window.clearTimeout(resetTimer);
        resetTimer = undefined;
      }
    };

    const resetTrack = () => {
      if (!track) return;
      clearResetTimer();
      track.dataset.carouselActive = "false";
      delete track.dataset.carouselPaused;
      track.style.removeProperty("--carousel-distance");
      track.style.removeProperty("--carousel-duration");
      track.style.transform = "translate3d(0, 0, 0)";
    };

    const stopAnimation = () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
        frameId = undefined;
      }
      lastTimestamp = undefined;
    };

    const renderTrack = () => {
      if (!track) return;
      track.style.transform = `translate3d(0, ${-offset}px, 0)`;
    };

    const resetToStart = () => {
      clearResetTimer();
      atEnd = false;
      offset = 0;
      renderTrack();
      startAnimation();
    };

    const scheduleReset = () => {
      if (resetTimer !== undefined) return;
      resetTimer = window.setTimeout(() => {
        resetTimer = undefined;
        if (pauseReasons.size > 0 || document.hidden) return;
        resetToStart();
      }, resetDelayMs);
    };

    const startAnimation = () => {
      if (atEnd) {
        scheduleReset();
        return;
      }

      if (
        frameId !== undefined ||
        !canCarousel ||
        pauseReasons.size > 0 ||
        document.hidden
      ) {
        return;
      }

      lastTimestamp = undefined;
      frameId = window.requestAnimationFrame(animate);
    };

    const animate = (timestamp: number) => {
      frameId = undefined;
      if (!canCarousel || pauseReasons.size > 0 || document.hidden) {
        lastTimestamp = undefined;
        return;
      }

      if (lastTimestamp === undefined) lastTimestamp = timestamp;
      const elapsedMs = Math.min(timestamp - lastTimestamp, 80);
      lastTimestamp = timestamp;
      offset += (elapsedMs / 1000) * speedPxPerSecond;

      if (offset >= loopDistance) {
        offset = loopDistance;
        atEnd = true;
        stopAnimation();
        renderTrack();
        scheduleReset();
        return;
      }

      renderTrack();
      frameId = window.requestAnimationFrame(animate);
    };

    const pause = (reason: string) => {
      pauseReasons.add(reason);
      stopAnimation();
    };

    const resume = (reason: string) => {
      pauseReasons.delete(reason);
      startAnimation();
    };

    const normalizeWheelDelta = (event: WheelEvent) => {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 40;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * viewport.clientHeight;
      return event.deltaY;
    };

    const handleWheel = (event: WheelEvent) => {
      if (!canCarousel || !loopDistance) return;

      event.preventDefault();
      pause("wheel");
      const nextOffset = Math.min(
        loopDistance,
        Math.max(0, offset + normalizeWheelDelta(event)),
      );
      offset = nextOffset;
      atEnd = offset >= loopDistance;
      if (!atEnd) clearResetTimer();
      renderTrack();

      if (wheelResumeTimer !== undefined) window.clearTimeout(wheelResumeTimer);
      wheelResumeTimer = window.setTimeout(() => {
        wheelResumeTimer = undefined;
        resume("wheel");
      }, 180);
    };

    const measure = () => {
      if (!track) return;

      const firstItem = itemSelector
        ? track.querySelector<HTMLElement>(itemSelector)
        : (track.firstElementChild as HTMLElement | null);
      const trackRect = track.getBoundingClientRect();

      if (!firstItem) {
        canCarousel = false;
        stopAnimation();
        resetTrack();
        return;
      }

      const previousDistance = loopDistance;
      loopDistance = Math.max(0, trackRect.height - viewport.clientHeight);
      canCarousel = itemCount > 1 && loopDistance > 0;

      if (!canCarousel) {
        stopAnimation();
        resetTrack();
        return;
      }

      if (previousDistance > 0 && Math.abs(previousDistance - loopDistance) > 0.5) {
        atEnd = false;
        offset = 0;
        clearResetTimer();
        stopAnimation();
      }

      const durationSeconds = Math.max(42, loopDistance / speedPxPerSecond);
      track.style.setProperty("--carousel-distance", `${loopDistance}px`);
      track.style.setProperty("--carousel-duration", `${durationSeconds}s`);
      track.dataset.carouselActive = "true";
      renderTrack();
      startAnimation();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pause("visibility");
        if (track) track.dataset.carouselPaused = "true";
      } else {
        resume("visibility");
        if (track) delete track.dataset.carouselPaused;
      }
    };

    const handlePointerEnter = () => pause("pointer");
    const handlePointerLeave = () => resume("pointer");

    if (!track || !enabled || itemCount < 2 || reducedMotion) {
      resetTrack();
      return;
    }

    viewport.addEventListener("pointerenter", handlePointerEnter);
    viewport.addEventListener("pointerleave", handlePointerLeave);
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(track);
    const initialMeasureFrame = window.requestAnimationFrame(measure);

    return () => {
      window.cancelAnimationFrame(initialMeasureFrame);
      if (wheelResumeTimer !== undefined) window.clearTimeout(wheelResumeTimer);
      stopAnimation();
      resizeObserver?.disconnect();
      viewport.removeEventListener("pointerenter", handlePointerEnter);
      viewport.removeEventListener("pointerleave", handlePointerLeave);
      viewport.removeEventListener("wheel", handleWheel);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resetTrack();
    };
  }, [enabled, itemCount, itemSelector, resetDelayMs, speedPxPerSecond, trackSelector]);

  return viewportRef;
}
