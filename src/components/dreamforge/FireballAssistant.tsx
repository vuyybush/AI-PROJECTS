'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_PROMPT_LENGTH, STYLE_SUFFIXES, type Canvas, type Engine, type GenerationStyle } from '../../config/generation';
import './creative-studio.css';
import './fireball-assistant.css';
import './colorful-theme.css';
import ThemeControls from './ThemeControls';
import {IdeaCloud,GenerationCanvas} from './CreativeAtmosphere';
import { useAccount } from './AccountProvider';
import HumanCheck, { type HumanCheckHandle } from './HumanCheck';


type FireballState =
  | 'WELCOME'
  | 'WAITING_FOR_IDEA'
  | 'ENHANCING_PROMPT'
  | 'PROMPT_READY'
  | 'ASK_IMAGE_COUNT'
  | 'ASK_STYLE'
  | 'ASK_CANVAS'
  | 'READY'
  | 'GENERATING'
  | 'RESULT'
  | 'AUTH_REQUIRED'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'GENERATION_FAILED';
type Settings = { style: GenerationStyle; engine: Engine; canvas: Canvas; styleNotes: string };
type Result = {
  id: string;
  url: string;
  prompt: string;
  settings: Settings;
  batchId: string;
  saved: boolean;
  filename: string;
};
const initialSettings: Settings = { style: 'Cinematic', engine: 'schnell', canvas: 'square', styleNotes: '' };
export default function FireballAssistant({ initialIdea }: { initialIdea?: string } = {}) {
  const { user, loading: accountLoading, refresh: refreshAccount } = useAccount();
  const humanCheckRef = useRef<HumanCheckHandle>(null);
  const enhanceCheckRef = useRef<HumanCheckHandle>(null);
  const [state, setState] = useState<FireballState>('WELCOME');
  const [idea, setIdea] = useState<string>(initialIdea ?? '');
  const [enhancedPrompt, setEnhancedPrompt] = useState<string>('');
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [count, setCount] = useState<number>(1);
  const [busy, setBusy] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [activeBatch, setActiveBatch] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<string>('');
  const controllerRef = useRef<AbortController | null>(null);
  const ownedRef = useRef<Result[]>([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const countRef = useRef<HTMLSelectElement>(null);
  const canvasRef = useRef<HTMLSelectElement>(null);
  const result = results.find(x => x.id === selected) ?? results[0];
  const changed = !!result && (result.prompt !== (enhancedPrompt.trim() || idea.trim()) ||
    (Object.keys(initialSettings) as (keyof Settings)[]).some(key => result.settings[key] !== settings[key]));
  const previousBatch = !!result && busy && result.batchId !== activeBatch;
  // Cleanup AbortController and revoke object URLs on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      ownedRef.current.forEach(x => URL.revokeObjectURL(x.url));
    };
  }, []);
  // Reset state when user changes
  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    ownedRef.current.forEach(x => URL.revokeObjectURL(x.url));
    ownedRef.current = [];
    setResults([]);
    setSelected('');
    setNotice('');
    setError('');
    setIdea(initialIdea ?? '');
    setEnhancedPrompt('');
    // Reset to WELCOME state when user changes? Or keep the state?
    // We'll reset to WELCOME so that the user has to go through the flow again for a new user.
    setState('WELCOME');
    setBusy(false);
    setSettings(initialSettings);
    setCount(1);
  }, [user?.id, initialIdea]);
  // Optional: auto-advance hero prompt into WAITING_FOR_IDEA
  useEffect(() => {
    if (initialIdea && initialIdea.trim().length >= 3 && state === 'WELCOME') {
      setIdea(initialIdea);
      setState('WAITING_FOR_IDEA');
    }
  }, [initialIdea, state]);
  // Focus the idea prompt when entering WAITING_FOR_IDEA state
  useEffect(() => {
    if (state === 'WAITING_FOR_IDEA') {
      promptRef.current?.focus({ preventScroll: true });
    }
  }, [state]);
  // A visible cancel window; no request starts on review/count/style steps.
  useEffect(() => {
    if (state !== 'READY') return;
    const timer = setTimeout(() => { void handleGenerate(); }, 3000);
    return () => clearTimeout(timer);
    // READY is entered only by the final explicit Next action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, user?.id]);

  function advance(event: FormEvent) {
    event.preventDefault();
    if (busy || controllerRef.current) return;
    if (state === 'WELCOME' || state === 'WAITING_FOR_IDEA') { void enhancePrompt(); return; }
    if (state === 'PROMPT_READY') {
      if (enhancedPrompt.trim().length < 3) { setError('Write a prompt first.'); return; }
      setState('ASK_IMAGE_COUNT');
    } else if (state === 'ASK_IMAGE_COUNT') setState('ASK_STYLE');
    else if (state === 'ASK_STYLE') setState('ASK_CANVAS');
    else if (state === 'ASK_CANVAS') setState('READY');
  }

  async function enhancePrompt() {
    if (controllerRef.current || busy) return;
    if (!user) { setError('Sign in before enhancing.'); setState('AUTH_REQUIRED'); return; }
    if (idea.trim().length < 3 || idea.trim().length > 700) { setError('Use 3–700 characters for your idea.'); return; }
    const control = new AbortController();
    controllerRef.current = control;
    setBusy(true); setError(''); setNotice(''); setState('ENHANCING_PROMPT');
    const timeout = setTimeout(() => control.abort(), 65000);
    try {
      const turnstileToken = await enhanceCheckRef.current?.verify(control.signal);
      if (!turnstileToken) throw new Error('Human verification is unavailable.');
      if (control.signal.aborted || controllerRef.current !== control) return;
      const response = await fetch('/api/enhance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: idea.trim(), turnstileToken }), signal: control.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Enhancement failed.');
      const prompt = body.prompt;
      if (typeof prompt !== 'string' || prompt.length < 20 || prompt.length > 1500) throw new Error('The enhanced prompt was invalid.');
      if (control.signal.aborted || controllerRef.current !== control) return;
      setEnhancedPrompt(prompt); setState('PROMPT_READY');
    } catch (failure) {
      if (controllerRef.current === control) {
        setError(control.signal.aborted ? 'Enhancement timed out. Try again.' : failure instanceof Error ? failure.message : 'Enhancement failed.');
        setState('WAITING_FOR_IDEA');
      }
    } finally {
      clearTimeout(timeout);
      if (controllerRef.current === control) { controllerRef.current = null; setBusy(false); }
    }
  }
  function stopGeneration() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setNotice('Stopped waiting. Completed images are kept; an in-flight request may still use quota.');
    setState('RESULT'); // Go to result state to show what we have
  }
  async function handleGenerate() {
    if (controllerRef.current) return;
    if (!user) {
      setError('Sign in before generating.');
      setState('AUTH_REQUIRED');
      return;
    }
    const promptToUse = enhancedPrompt.trim() || idea.trim();
    if (promptToUse.length < 3 || promptToUse.length > MAX_PROMPT_LENGTH) {
      setError(`Use 3–${MAX_PROMPT_LENGTH} characters.`);
      return;
    }
    const control = new AbortController();
    controllerRef.current = control;
    setBusy(true);
    setState('GENERATING');
    setProgress(0);
    setError('');
    setNotice('');
    const batchId = crypto.randomUUID();
    setActiveBatch(batchId);
    const snapshot = {
      prompt: promptToUse,
      ...settings,
    };
    const total = count;
    let completed = 0;
    let fallbackUsed = false;
    try {
      for (let index = 0; index < total; index++) {
        setProgress(index + 1);
        if (index > 0) {
          setNotice('Waiting 31 seconds before the next variation to respect the studio limit.');
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(new Error('Cancelled.')); };
            const timer = setTimeout(() => {
              control.signal.removeEventListener('abort', abort);
              resolve();
            }, 31000);
            if (control.signal.aborted) abort();
            else control.signal.addEventListener('abort', abort, { once: true });
          });
        }
        const turnstileToken = await humanCheckRef.current?.verify(control.signal);
        if (!turnstileToken) throw new Error('Human verification is unavailable.');
        if (control.signal.aborted || controllerRef.current !== control) return;
        const timeout = setTimeout(() => control.abort(), 65000);
        try {
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...snapshot, turnstileToken }),
            signal: control.signal,
          });
          if (!response.ok) {
            if (response.status === 401) void refreshAccount();
            const body = await response.json().catch(() => null);
            throw new Error(body?.error?.message ?? 'Generation failed. Try again later.');
          }
          const mime = response.headers.get('content-type')?.split(';')[0];
          if (mime !== 'image/jpeg' && mime !== 'image/png') throw new Error('The server did not return an image.');
          const blob = await response.blob();
          if (!blob.size || blob.size > 3 * 1024 * 1024) throw new Error('The image is empty or too large.');
          if (controllerRef.current !== control || control.signal.aborted) return;
          const usedFallback = response.headers.get('X-Generation-Fallback') === 'true';
          const item = {
            id: crypto.randomUUID(),
            url: URL.createObjectURL(blob),
            prompt: snapshot.prompt,
            settings: { ...settings },
            batchId,
            saved: response.headers.get('X-History-Saved') === 'true',
            filename: `dreamforge-${Date.now()}-${index + 1}.${mime === 'image/png' ? 'png' : 'jpg'}`,
          };
          if (index === 0) {
            ownedRef.current.forEach(x => URL.revokeObjectURL(x.url));
            ownedRef.current = [];
          }
          ownedRef.current = [...ownedRef.current, item];
          setResults(ownedRef.current);
          setSelected(item.id);
          completed++;
          if (usedFallback) fallbackUsed = true;
          if (item.saved) window.dispatchEvent(new Event('dreamforge-history'));
        } finally {
          clearTimeout(timeout);
        }
      }
      setNotice(
        `${completed} image${completed === 1 ? '' : 's'} ready. Download your favorites before leaving.${fallbackUsed ? ' The selected model was full, so Cloudflare\'s backup generated the result.' : ''}`
      );
      setState('RESULT');
    } catch (failure) {
      if (controllerRef.current === control) {
        const errorMessage =
          control.signal.aborted
            ? 'Generation timed out.'
            : failure instanceof Error
            ? failure.message
            : 'Connection failed.';
        setError(`${errorMessage}${completed ? ` ${completed} completed image(s) kept.` : ''}`);
        // Handle specific errors
        if (failure instanceof Error && failure.message.includes('Daily generation allowance exhausted')) {
          setState('QUOTA_EXHAUSTED');
        } else if (failure instanceof Error && failure.message.includes('rate-limited')) {
          setState('RATE_LIMITED');
        } else {
          setState('GENERATION_FAILED');
        }
      }
    } finally {
      if (controllerRef.current === control) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  }
  // Determine speech bubble content based on state
  let speechBubbleContent = '';
  switch (state) {
    case 'WELCOME':
      speechBubbleContent = 'Hello! I am Fireball, your creative guide. Let\'s start by describing your idea.';
      break;
    case 'WAITING_FOR_IDEA':
      speechBubbleContent = 'Tell me what you\'d like to create. For example: "an image of apple"';
      break;
    case 'ENHANCING_PROMPT':
      speechBubbleContent = 'Enhancing your idea with professional details...';
      break;
    case 'PROMPT_READY':
      speechBubbleContent = 'Here\'s your enhanced idea. You can edit it if you like, or use it as is.';
      break;
    case 'ASK_IMAGE_COUNT':
      speechBubbleContent = 'How many variations would you like?';
      break;
    case 'ASK_STYLE':
      speechBubbleContent = 'Choose a style for your image.';
      break;
    case 'ASK_CANVAS':
      speechBubbleContent = 'Select the canvas size or aspect ratio.';
      break;
    case 'READY':
      speechBubbleContent = 'Starting in 3 seconds. You can still cancel.';
      break;
    case 'GENERATING':
      speechBubbleContent = 'Creating your images...';
      break;
    case 'RESULT':
      speechBubbleContent = 'Your images are ready! You can download them or create another.';
      break;
    case 'AUTH_REQUIRED':
      speechBubbleContent = 'Please sign in to generate and save your images.';
      break;
    case 'QUOTA_EXHAUSTED':
      speechBubbleContent = 'You\'ve reached your daily generation limit. Please try again later.';
      break;
    case 'RATE_LIMITED':
      speechBubbleContent = 'The service is busy. Please wait a moment and try again.';
      break;
    case 'GENERATION_FAILED':
      speechBubbleContent = 'Something went wrong. Please try again.';
      break;
    default:
      speechBubbleContent = 'Hello! I am Fireball, your creative guide.';
  }
  return (
    <section id="studio" data-fireball-state={state} className="df-studio df-section df-creative df-fireball-studio" aria-labelledby="fireball-title">
      <ThemeControls/>
      <div className="df-section-top">
        <p className="df-eyebrow">01 / THE STUDIO</p>
        <span className="df-demo-badge">TEXT → IMAGE</span>
      </div>
      <div className="df-section-heading">
        <h2 id="fireball-title">Your next frame.</h2>
        <p>Describe. Refine. Make it yours.</p>
      </div>
      <div className="df-workspace">
        {/* Fireball Character */}
        <div className="df-fireball-character">
          {/* Placeholder for animated Fireball */}
          <div className="df-assistant-mascot"><span className="df-mascot-halo"/><img src="/images/dreamforge/fireball-guide.png" alt="Fireball, your creative guide"/><span className="df-mascot-spark" aria-hidden="true">✦</span></div>
          <div className="df-fireball-speech-bubble">
            {/* Speech bubble content based on state */}
            <span className="df-guide-label">FIREBALL · YOUR CREATIVE COMPANION</span>
            <p>{speechBubbleContent}</p>
          </div>
          <IdeaCloud active={state==='GENERATING'}/>
        </div>
        {/* Main Form Area */}
        <form
          onSubmit={advance}
          className="df-form"
          noValidate
        >
          {/* Idea Input */}
          {(state === 'WELCOME' || state === 'WAITING_FOR_IDEA') && (
            <>
              <div className="df-label-line">
                <label htmlFor="fireball-prompt">Your imagination, in words</label>
                <span>{idea.length} / 700</span>
              </div>
              <textarea
                id="fireball-prompt"
                ref={promptRef}
                maxLength={700}
                value={idea}
                disabled={busy || accountLoading}
                onChange={e => {
                  setIdea(e.target.value);
                  if (state === 'WELCOME') setState('WAITING_FOR_IDEA');
                }}
                placeholder="A quiet observatory above a sea of clouds…"
              />

            </>
          )}
          {/* Enhancing Prompt feedback */}
          {state === 'ENHANCING_PROMPT' && (
            <div className="df-enhancement">
              <p className="df-note" role="status">Enhancing your idea with AI...</p>
            </div>
          )}
          {/* Enhanced Prompt Display and Editing */}
          {(state === 'PROMPT_READY' || state === 'ASK_IMAGE_COUNT' || state === 'ASK_STYLE' || state === 'ASK_CANVAS' || state === 'READY') && (
            <div className="df-enhancement">
              <label htmlFor="fireball-enhanced">Review and edit your enhanced idea</label>
              <textarea
                id="fireball-enhanced"
                value={enhancedPrompt}
                maxLength={MAX_PROMPT_LENGTH}
                disabled={busy || state === 'READY'}
                onChange={e => setEnhancedPrompt(e.target.value)}
              />
              <p>AI-enhanced prompt · uses shared Cloudflare allowance.</p>
              <div className="df-helper-actions">
                <button type="button" disabled={busy || state === 'READY'} onClick={() => { setIdea(enhancedPrompt); }}>
                  Use this idea
                </button>
                <button type="button" disabled={busy || state === 'READY'} onClick={() => { setEnhancedPrompt(idea); }}>
                  Revert to original idea
                </button>
              </div>
            </div>
          )}
          {/* Image Count Selection */}
          {state === 'ASK_IMAGE_COUNT' && (
            <fieldset disabled={busy}>
              <legend>How many images?</legend>
              <div className="df-control-grid">
                <label>
                  Variations<select
                    aria-label="Variations"
                    disabled={busy}
                    ref={countRef}
                    value={count}
                    onChange={e => setCount(Number(e.target.value))}
                  >
                    {[1, 2, 4].map(n => (
                      <option key={n} value={n}>
                        {n} image{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="df-note">
                  {count} separate generation request{count > 1 ? 's' : ''}. Variations are fresh interpretations of the same prompt, not edits of an image.
                </p>
              </div>
            </fieldset>
          )}
          {/* Style Selection */}
          {state === 'ASK_STYLE' && (
            <fieldset disabled={busy}>
              <legend>Visual direction</legend>
              <div className="df-styles">
                {Object.keys(STYLE_SUFFIXES).map(style => (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={settings.style === style}
                    onClick={() => setSettings({ ...settings, style: style as GenerationStyle })}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {/* Canvas Selection */}
          {state === 'ASK_CANVAS' && (
            <>
              <label className="df-control-label" htmlFor="fireball-style-notes">
                Your style notes <span>optional</span>
              </label>
              <input
                id="fireball-style-notes"
                maxLength={160}
                value={settings.styleNotes}
                disabled={busy}
                onChange={e => setSettings({ ...settings, styleNotes: e.target.value })}
                placeholder="Muted earth tones, soft grain…"
              />
              <div className="df-control-grid">
                <label>
                  Model<select
                    aria-label="Model"
                    disabled={busy}
                    value={settings.engine}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        engine: e.target.value as Engine,
                        canvas: e.target.value === 'schnell' ? 'square' : settings.canvas,
                      })
                    }
                  >
                    <option value="schnell">Schnell · lower usage</option>
                    <option value="phoenix">Phoenix · flexible canvas</option>
                  </select>
                </label>
                <label>
                  Canvas
                  <select
                    aria-label="Canvas"
                    disabled={busy || settings.engine === 'schnell'}
                    ref={canvasRef}
                    value={settings.canvas}
                    onChange={e => setSettings({ ...settings, canvas: e.target.value as Canvas })}
                  >
                    <option value="square">
                      {settings.engine === 'schnell' ? 'Model default' : 'Square · 1:1'}
                    </option>
                    {settings.engine === 'phoenix' && (
                      <>
                        <option value="landscape">Landscape · 4:3</option>
                        <option value="portrait">Portrait · 3:4</option>
                      </>
                    )}
                  </select>
                </label>
                <p className="df-note">
                  {settings.engine === 'phoenix'
                    ? 'Phoenix uses substantially more quota per image. Canvas sizes are generated natively; access depends on your Cloudflare account.'
                    : 'Schnell uses its default canvas. Choose Phoenix for other ratios.'}
                </p>
              </div>
              <p className="df-note df-preview-note">
                This preview clears on refresh or sign-out. Successfully saved images remain in your private gallery.
              </p>
            </>
          )}
          {/* Ready State - Auto Generate */}
          {state === 'READY' && (
            <div className="df-ready">
              <p className="df-note">Starting automatically in 3 seconds…</p>
              <button type="button" onClick={() => setState('ASK_CANVAS')}>Cancel automatic start</button>
              {/* The useEffect above will trigger generation */}
            </div>
          )}
          {/* Generation Progress */}
          {busy && state !== 'ENHANCING_PROMPT' && (
            <>
              <p className="df-note">
                Generating {progress} of {count}…
              </p>
              <button type="button" className="df-text-button" onClick={stopGeneration}>
                Stop remaining variations
              </button>
            </>
          )}
          {/* Authentication Required */}
          {state === 'AUTH_REQUIRED' && (
            <p className="df-auth-required">
              {accountLoading ? 'Checking your account…' : (
                <>
                  <a href="#account">Sign in or create an account</a> to generate and save images.
                </>
              )}
            </p>
          )}
          {/* Quota Exhausted */}
          {state === 'QUOTA_EXHAUSTED' && (
            <p className="df-error" role="alert">
              Daily generation allowance exhausted. Please try again later.
            </p>
          )}
          {/* Rate Limited */}
          {state === 'RATE_LIMITED' && (
            <p className="df-error" role="alert">
              The image service is busy or rate-limited. Please try again later.
            </p>
          )}
          {/* Generation Failed */}
          {state === 'GENERATION_FAILED' && (
            <p className="df-error" role="alert">
              Generation failed. Please try again.
            </p>
          )}
          {/* Notice and Error */}
          {!busy && notice && <p className="df-note" role="status">{notice}</p>}
          {error && <p className="df-error" role="alert">{error}</p>}
          <div aria-label="Prompt verification"><HumanCheck ref={enhanceCheckRef} action="enhance" /></div>
          <div aria-label="Image verification"><HumanCheck ref={humanCheckRef} action="generate" /></div>
          {state === 'ENHANCING_PROMPT' && <button type="button" onClick={() => { stopGeneration(); setState('WAITING_FOR_IDEA'); }}>Cancel enhancement</button>}
          {['RESULT', 'GENERATION_FAILED', 'RATE_LIMITED', 'QUOTA_EXHAUSTED'].includes(state) && <button type="button" className="df-generate" onClick={() => { setState('WAITING_FOR_IDEA'); setError(''); }}>Start another idea</button>}
          {!user && state!=='AUTH_REQUIRED' && <p className="df-auth-required">{accountLoading?'Checking your account…':<><a href="#account">Sign in</a> to create with Fireball.</>}</p>}
          {/* Submit Button - only show in states where we need user action to proceed */}
          {!busy &&
            (((state === 'WELCOME' || state === 'WAITING_FOR_IDEA') && idea.trim().length >= 3) ||
              (state === 'PROMPT_READY' && enhancedPrompt.trim().length >= 3) ||
              state === 'ASK_IMAGE_COUNT' ||
              state === 'ASK_STYLE' ||
              state === 'ASK_CANVAS') && (
              <button type="submit" className="df-generate" disabled={!user}>
                {(state === 'WELCOME' || state === 'WAITING_FOR_IDEA') ? 'Enhance idea' : state === 'PROMPT_READY' ? 'Continue' : 'Next'}
              </button>
            )}
          {/* Results Preview - same as CreativeStudio */}
          <div className="df-preview">
            <div className="df-preview-bar">
              <span>YOUR CANVAS</span>
              <span>
                {busy ? (progress + ' / ' + count) : (results.length + ' IMAGE' + (results.length === 1 ? '' : 'S'))}
              </span>
            </div>
            {result && (changed || previousBatch) && (
              <p className="df-result-warning" role="status">
                {previousBatch
                  ? 'Generating new images. The image below is from an earlier batch.'
                  : busy
                  ? 'The form changed. This image belongs to the submitted prompt shown below.'
                  : 'Prompt or settings changed. This is an earlier result — press Generate to update.'}
              </p>
            )}
            {result && (
              <div className="df-result-source">
                <span>Generated from</span>
                <p>{result.prompt}</p>
                <small>
                  {result.settings.engine === 'schnell' ? 'Schnell' : 'Phoenix'} ·
                  {result.settings.style} ·
                  {result.settings.engine === 'schnell' ? 'Default canvas' : result.settings.canvas}
                </small>
                {result.settings.styleNotes && (
                  <small>Style notes: {result.settings.styleNotes}</small>
                )}
              </div>
            )}
            <div className="df-preview-stage" data-generating={state==='GENERATING'} aria-busy={state==='GENERATING'}>
              {state==='GENERATING' && <GenerationCanvas progress={progress} count={count}/>}
              {result ? (
                <img key={result.id} src={result.url} alt={result.prompt} />
              ) : (
                <div className="df-empty">
                  <span className={busy ? 'df-orbit' : 'df-canvas-symbol'} aria-hidden="true">
                    ✳
                  </span>
                  <h3>{busy ? 'An idea taking shape.' : 'The canvas is yours.'}</h3>
                  <p>
                    {busy ? 'Your image will appear here.' : 'Write a prompt, choose a direction, and create your first image.'}
                  </p>
                </div>
              )}
            </div>
            <div className="df-preview-footer" role="status">
              {busy
                ? ('Generating ' + progress + ' of ' + count + '...')
                : result
                ? 'Choose your favorite. Make it yours.'
                : 'Your next idea belongs here.'}
            </div>
            {results.length > 0 && (
              <div className="df-variation-grid" aria-label="Generated variations">
                {results.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-label={'View variation ' + (index + 1)}
                    aria-pressed={result?.id === item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <img src={item.url} alt="" />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
            {result && (
              <p className="df-save-status" data-saved={result.saved}>
                {result.saved
                  ? 'Saved to your private gallery.'
                  : 'Not saved to history. Download this image now to keep it.'}
              </p>
            )}
            {result && (
              <a className="df-download" href={result.url} download={result.filename}>
                Download selected image ↓
              </a>
            )}
            <p className="df-note df-preview-note">
              This preview clears on refresh or sign-out. Successfully saved images remain in your private gallery.
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}