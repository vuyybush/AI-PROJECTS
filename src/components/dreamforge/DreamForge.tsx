'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type StylePreset } from "./presets";
import "./dreamforge.css";
import CinematicIntro from "./CinematicIntro";
// Import FireballAssistant instead of CreativeStudio
import FireballAssistant from "./FireballAssistant";
// import CreativeStudio from "./CreativeStudio"; // Commented out
import AccountProvider from "./AccountProvider";
import AccountPanel from "./AccountPanel";
import History from "./History";
import StoryLab from "./StoryLab";
import "./generation.css";


function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M5 19 19 5M5 5h14v14" : "M4 12h16m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.7" /></svg>;
}

export default function DreamForge(){return <AccountProvider><DreamForgePage/></AccountProvider>;}
function DreamForgePage() {
  const root = useRef<HTMLDivElement>(null);
  const [introOpen, setIntroOpen] = useState(true);
  const [introReplay, setIntroReplay] = useState(0);
  const completeIntro = useCallback(() => setIntroOpen(false), []);
  const [motion, setMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(false);
  // State for initial idea to pass to FireballAssistant (for quick start from hero)
  const [initialIdea, setInitialIdea] = useState<string>('');
  // Motion effect setup remains the same
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let stop: (() => void) | undefined;
    let version = 0;
    let disposed = false;
    const update = async () => {
      const current = ++version;
      stop?.(); stop = undefined;
      const enabled = query.matches && !paused && !introOpen;
      setMotion(enabled);
      if (!enabled) return;
      const module = await import("./desktop-motion");
      if (!disposed && current === version && root.current) stop = module.attachDesktopMotion(root.current);
    };
    void update();
    query.addEventListener("change", update);
    return () => { disposed = true; version++; stop?.(); query.removeEventListener("change", update); };
  }, [paused, introOpen]);

  return <div ref={root} className="dreamforge" data-motion={motion} data-visible="true">
    <CinematicIntro replay={introReplay} onComplete={completeIntro} />
    <a className="df-skip" href="#studio">Skip to image studio</a>

    <header className="df-header">
      <a href="#home" className="df-brand" aria-label="DreamForge home"><span className="df-mark" aria-hidden="true">✳</span>dreamforge<span className="df-brand-dot">.</span></a>
      <nav className={menu ? "df-nav df-nav-open" : "df-nav"} aria-label="Main navigation">
        <a href="#studio" onClick={() => setMenu(false)}>Create</a>
        <a href="#lab" onClick={() => setMenu(false)}>Story Lab</a>
        <a href="#explore" onClick={() => setMenu(false)}>Explore</a>
        <a href="#account" onClick={() => setMenu(false)}>Account</a><a href="#history" onClick={() => setMenu(false)}>History</a>
      </nav>
      <a className="df-header-cta" href="#studio">Open the studio <Arrow diagonal /></a>
      <button className="df-menu" aria-expanded={menu} aria-label={menu ? "Close navigation" : "Open navigation"} onClick={() => setMenu(!menu)}>{menu ? "Close" : "Menu"}</button>
    </header>

    <section className="df-hero" id="home" aria-labelledby="hero-title">
      <div className="df-art" aria-hidden="true"><div className="df-art-image" /></div>
      <div className="df-hero-content">
        <p className="df-eyebrow">THE IMAGE STUDIO FOR YOUR NEXT BIG IDEA</p>
        <h1 id="hero-title" tabIndex={-1}><span>Make the</span><span>unreal.</span></h1>
        <p className="df-hero-copy">A passing thought. An impossible world.<br/>See what happens when you make it.</p>
        {/* Hero prompt input - when submitted, passes the idea to FireballAssistant as initial idea */}
        <form className="df-hero-prompt" onSubmit={e=>{e.preventDefault(); setInitialIdea(document.getElementById('hero-prompt') instanceof HTMLInputElement ? (document.getElementById('hero-prompt') as HTMLInputElement).value : '');}}>
          <label htmlFor="hero-prompt" className="df-sr">Describe your idea</label>
          <input id="hero-prompt" value={initialIdea} onChange={e=>setInitialIdea(e.target.value)} maxLength={1700} placeholder="What do you want to see?"/>
          <button type="submit">Create <Arrow diagonal/></button>
        </form>
        <div className="df-prompt-ideas">
          <span>TRY AN IDEA</span>
          <button onClick={()=>setInitialIdea("An enormous translucent orange silk ribbon floating above a turquoise ocean and limestone cliffs at sunset")}>Something impossible ↗</button>
          <button onClick={()=>setInitialIdea("An architectural photograph of a minimalist concrete house suspended above the clouds at sunrise")}>A new perspective ↗</button>
        </div>
      </div>
      <div className="df-hero-bottom"><span>01 — FLIGHT OF IMAGINATION <small>AI-created sample artwork</small></span><button className="df-motion-toggle" onClick={()=>setPaused(!paused)} aria-pressed={paused}>{paused?"Play motion":"Pause motion"}</button><a href="#studio">Enter the studio ↓</a></div>
    </section>
    <div className="df-manifesto"><span>THINK IT.</span><span>DESCRIBE IT.</span><span className="df-coral">MAKE IT REAL. ↗</span></div>

    <main>
      {/* FireballAssistant receives the initial idea from the hero section */}
      <FireballAssistant initialIdea={initialIdea} />
      <AccountPanel/>
      <History/>
      <StoryLab onUse={setInitialIdea}/>

      <section id="explore" className="df-explore df-section" aria-labelledby="explore-title">
        <p className="df-eyebrow">02 / START SOMEWHERE UNEXPECTED</p>
        <div className="df-section-heading"><h2 id="explore-title">Break your own brief.</h2><p>A few words can change everything.</p></div>
        <div className="df-idea-grid">{[
          {number:"01",title:"Bend reality.",text:"Impossible places. Believable details.",prompt:"A glass greenhouse floating above a field of clouds, cinematic morning light, realistic architectural photography"},
          {number:"02",title:"Find the quiet.",text:"Small moments. A different kind of wonder.",prompt:"Macro photograph of morning dew on an orange flower, delicate textures, soft daylight, shallow depth of field"},
          {number:"03",title:"Go off-script.",text:"Unexpected materials. Unfamiliar worlds.",prompt:"A sculptural chair made entirely from folded red silk, editorial product photography, white studio"}
        ].map(item=><button key={item.number} className="df-idea-card" onClick={()=>setInitialIdea(item.prompt)}><span>{item.number} <Arrow diagonal/></span><h3>{item.title}</h3><p>{item.text}</p><small>Try this prompt →</small></button>)}</div>
      </section>
      <section id="about" className="df-about df-section"><p className="df-eyebrow">BUILT FOR EXPERIMENTING</p><h2>No perfect prompt required.<br/>Just a place to start.</h2><a href="#studio" className="df-pill df-ink">Make your first image <Arrow diagonal/></a></section>

    </main>
    <footer className="df-footer"><a href="#home" className="df-brand"><span className="df-mark" aria-hidden="true">✳</span>dreamforge.</a><p>Create once. Imagine endlessly.</p><button type="button" className="df-intro-replay" onClick={() => { setIntroOpen(true); setIntroReplay(value => value + 1); }}>Replay entrance ↗</button><a href="#home">Back to top ↑</a></footer>
  </div>;
}