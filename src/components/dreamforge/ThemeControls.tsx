'use client';
import {useEffect,useState} from 'react';
export default function ThemeControls(){
 const [theme,setTheme]=useState<'dark'|'light'>('dark'),[paused,setPaused]=useState(false);
 useEffect(()=>{try{const saved=localStorage.getItem('dreamforge-theme');if(saved==='light'||saved==='dark'){setTheme(saved);document.documentElement.dataset.dfTheme=saved;}const stopped=localStorage.getItem('dreamforge-effects')==='paused';setPaused(stopped);document.documentElement.dataset.dfEffects=stopped?'paused':'playing';window.dispatchEvent(new Event('dreamforge-effects'));}catch{/* Preferences are optional. */}},[]);
 function changeTheme(){const next=theme==='dark'?'light':'dark';setTheme(next);document.documentElement.dataset.dfTheme=next;try{localStorage.setItem('dreamforge-theme',next);}catch{}}
 function changeMotion(){const next=!paused;setPaused(next);document.documentElement.dataset.dfEffects=next?'paused':'playing';try{localStorage.setItem('dreamforge-effects',next?'paused':'playing');}catch{}window.dispatchEvent(new Event('dreamforge-effects'));}
 return <div className="df-appearance" role="group" aria-label="Appearance"><button type="button" onClick={changeTheme} aria-label={`Switch to ${theme==='dark'?'light':'dark'} mode`}><span aria-hidden="true">{theme==='dark'?'☀':'☾'}</span>{theme==='dark'?'Light mode':'Dark mode'}</button><span className="df-appearance-divider"/><button type="button" onClick={changeMotion} aria-pressed={paused} aria-label={paused?'Play colorful effects':'Pause colorful effects'}><span aria-hidden="true">{paused?'▷':'Ⅱ'}</span><span className="df-motion-word">{paused?'Play':'Pause'}</span></button></div>;
}
