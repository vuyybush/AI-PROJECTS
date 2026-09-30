"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount } from "./AccountProvider";
import AccountPanel from "./AccountPanel";
import "./welcome-gate.css";

export default function WelcomeGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAccount();
  const [intro, setIntro] = useState(true);
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("account");
    if (result) {
      url.searchParams.delete("account");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    if (result === "confirmed") setMessage("Email confirmed. Sign in below if your session is not active.");
    if (result === "confirmation-failed") setMessage("Sign-in did not finish. Please try again. Email confirmation links must be opened in the same browser.");
    // Email confirmation returns directly to the result, without replaying the intro.
    if (result) { setIntro(false); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setTimeout(() => setIntro(false), reduced.matches ? 400 : 3400);
    const finish = () => setIntro(false);
    reduced.addEventListener("change", finish);
    return () => { clearTimeout(timer); reduced.removeEventListener("change", finish); };
  }, []);

  useEffect(() => {
    if (intro || loading) return;
    const frame = requestAnimationFrame(() => {
      if (!user) heading.current?.focus();
      else {
        // Login always lands on the hero, even when arriving with an old #studio hash.
        const url = new URL(window.location.href);
        window.history.replaceState(null, "", url.pathname + url.search + "#home");
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        document.getElementById("hero-title")?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [intro, loading, user?.id]); // Session identity changes only; background refreshes keep position.

  if (!intro && !loading && user) return <>{children}</>;
  return <main className="df-welcome" data-stage={intro ? "intro" : "login"} aria-label="Welcome to DreamForge">
    <div className="df-welcome-aurora" aria-hidden="true" />
    <div className="df-welcome-sparks" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ "--spark": i } as React.CSSProperties} />)}</div>
    {intro ? <section className="df-logo-scene" aria-labelledby="df-logo-title">
      <div className="df-logo-orbit" aria-hidden="true"><span /><span /><b>✳</b></div>
      <h1 id="df-logo-title">dreamforge<span>.</span></h1>
      <p>A spark. A thought. A whole new world.</p>
      <div className="df-welcome-progress" aria-hidden="true"><span /></div>
      <button type="button" className="df-welcome-skip" onClick={() => setIntro(false)}>Skip intro ↗</button>
    </section> : <section className="df-welcome-card">
      <div className="df-welcome-brand" aria-hidden="true">✳ dreamforge<span>.</span></div>
      <p className="df-welcome-eyebrow">YOUR IMAGINATION STARTS HERE</p>
      <h1 ref={heading} tabIndex={-1}>A little spark.<br /><span>Endless possibilities.</span></h1>
      <p>Sign in with your email to create images and keep your own private gallery.</p>
      {loading ? <p role="status">Checking your account…</p> : <div className="df-welcome-email"><AccountPanel compact /></div>}
      {message && <p className="df-welcome-error" role="alert">{message}</p>}

      <small>Your next idea deserves to be seen.</small>
    </section>}
  </main>;
}
