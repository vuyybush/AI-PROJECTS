"use client";

import { useEffect, useRef, useState } from "react";
import "./cinematic-intro.css";

const SEEN_KEY = "dreamforge-cinematic-intro-v1";
type Phase = "arrive" | "reveal" | "travel" | "fade";

export default function CinematicIntro({ replay, onComplete }: {
  replay: number;
  onComplete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const exitAction = useRef<(instant?: boolean) => void>(() => {});
  const [phase, setPhase] = useState<Phase>("arrive");
  const [fullMotion, setFullMotion] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) { onComplete(); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN_KEY) === "seen"; } catch { /* Storage is optional. */ }
    if (reduced.matches || (replay === 0 && (seen || window.location.hash))) {
      onComplete(); return;
    }

    let closed = false;
    let exiting = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const full = desktop.matches;
    setFullMotion(full);
    setPhase("arrive");

    function later(callback: () => void, delay: number) {
      timeouts.push(setTimeout(callback, delay));
    }
    function clearTimers() { timeouts.forEach(clearTimeout); timeouts.length = 0; }
    function finish() {
      if (closed) return;
      closed = true;
      clearTimers();
      element?.close();
      document.body.style.overflow = previousOverflow;
      try { sessionStorage.setItem(SEEN_KEY, "seen"); } catch { /* Intro still works without storage. */ }
      onComplete();
      const destination = replay > 0 ? previousFocus : document.getElementById("hero-title");
      destination?.focus({ preventScroll: true });
    }
    function exit(instant = false) {
      if (instant) { finish(); return; }
      if (closed || exiting) return;
      exiting = true;
      clearTimers();
      if (full) {
        setPhase("travel");
        later(() => setPhase("fade"), 1400);
        later(finish, 1900);
      } else {
        setPhase("fade");
        later(finish, 200);
      }
    }
    exitAction.current = exit;
    try {
      element.showModal();
      document.body.style.overflow = "hidden";
    } catch { finish(); return; }
    // Show the design immediately, then begin the entrance on the next frame.
    later(() => setPhase("reveal"), 60);
    later(() => exit(), full ? 3300 : 1100);
    const preferenceChange = () => finish();
    const hidden = () => { if (document.hidden) finish(); };
    reduced.addEventListener("change", preferenceChange);
    desktop.addEventListener("change", preferenceChange);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      closed = true;
      clearTimers();
      element.close();
      document.body.style.overflow = previousOverflow;
      reduced.removeEventListener("change", preferenceChange);
      desktop.removeEventListener("change", preferenceChange);
      document.removeEventListener("visibilitychange", hidden);
      exitAction.current = () => {};
    };
  }, [replay, onComplete]);

  return <dialog ref={dialog} className="df-intro" data-phase={phase} data-full={fullMotion}
    aria-labelledby="df-intro-title" aria-describedby="df-intro-description"
    onCancel={event => { event.preventDefault(); exitAction.current(true); }}>
    <div className="df-intro-sky" aria-hidden="true" />
    <header className="df-intro-header"><span className="df-intro-wordmark">✳ <strong>dreamforge.</strong></span><button type="button" className="df-intro-skip" onClick={() => exitAction.current(true)}>Skip intro <span aria-hidden="true">↗</span></button></header>
    <div className="df-intro-scene" aria-hidden="true"><div className="df-intro-world" /></div>
    <div className="df-intro-copy"><p className="df-intro-kicker">DREAMFORGE / A NEW PERSPECTIVE</p><h2 id="df-intro-title">A thought.<br /><em>A whole world.</em></h2><p id="df-intro-description">Let your imagination take the lead.</p></div>
    <footer className="df-intro-footer"><span>AN OPEN DOOR TO WHAT’S POSSIBLE</span><button type="button" onClick={() => exitAction.current()}>Enter DreamForge <span aria-hidden="true">↗</span></button><span>CREATE ONCE. IMAGINE ENDLESSLY.</span></footer>
    <div className="df-intro-timeline" aria-hidden="true"><span /></div>
  </dialog>;
}
