'use client';
import {useEffect,useState} from 'react';
import WhimsyArt from './WhimsyArt';
const kinds=['flower','cat','cloud','dog','flower','rabbit'] as const;
const ideas=[
 {icon:'🌸',title:'A little flower magic',text:'A tiny glass greenhouse floating above a meadow of pink flowers.',friends:['🌷','🦋','🌼']},
 {icon:'🐱',title:'Small paws. Big adventures.',text:'A fluffy kitten in a yellow raincoat exploring a miniature garden.',friends:['🐾','🌻','🐈']},
 {icon:'☁️',title:'Somewhere above the ordinary',text:'A pastel cloud carrying a tiny library through a peach-colored sky.',friends:['✨','🌈','☁️']},
 {icon:'🐶',title:'Meet your next main character',text:'A curious corgi watching glowing fireflies beside a forest pond.',friends:['🐾','🍃','🐕']},
 {icon:'🌺',title:'Let the details bloom',text:'Morning dew sparkling on a violet flower, close-up in soft daylight.',friends:['🌸','🦋','🌷']},
 {icon:'🐰',title:'A pocket-sized daydream',text:'A little rabbit having a tea party inside an oversized tulip.',friends:['🌼','🐾','🍄']},
];
export function IdeaCloud({active}:{active:boolean}){
 const [index,setIndex]=useState(0),[paused,setPaused]=useState(false);
 useEffect(()=>{const reduced=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setPaused(reduced.matches||document.documentElement.dataset.dfEffects==='paused'||document.hidden);update();reduced.addEventListener('change',update);window.addEventListener('dreamforge-effects',update);document.addEventListener('visibilitychange',update);return()=>{reduced.removeEventListener('change',update);window.removeEventListener('dreamforge-effects',update);document.removeEventListener('visibilitychange',update);};},[]);
 useEffect(()=>{if(!active||paused)return;const timer=setInterval(()=>setIndex(current=>(current+1+Math.floor(Math.random()*(ideas.length-1)))%ideas.length),10000);return()=>clearInterval(timer);},[active,paused]);
 if(!active)return null;const idea=ideas[index];
 return <aside className="df-idea-cloud" aria-label="Inspiration while you wait"><div className="df-cloud-puffs" aria-hidden="true"><i/><i/><i/></div><div className="df-cloud-content" key={index}><div className="df-cloud-label"><span>WHILE YOU WAIT</span><span aria-hidden="true">✦</span></div><div className="df-cloud-art" aria-hidden="true"><span><WhimsyArt kind="spark"/></span><strong><WhimsyArt kind={kinds[index]}/></strong><span><WhimsyArt kind="flower"/></span><i><WhimsyArt kind="paw"/></i></div><h4>{idea.title}</h4><p>{idea.text}</p><small>Idea inspiration · {paused?'rotation paused':'new idea every 10 seconds'}</small></div></aside>;
}
export function GenerationCanvas({progress,count}:{progress:number;count:number}){
 return <div className="df-making" role="status" aria-label={`Generating image ${Math.max(1,progress)} of ${count}`}><div className="df-making-aurora" aria-hidden="true"/><div className="df-making-grid" aria-hidden="true"/><div className="df-making-particles" aria-hidden="true">{(['spark','flower','cloud','paw','spark','flower'] as const).map((kind,i)=><span key={i}><WhimsyArt kind={kind}/></span>)}</div><div className="df-making-center"><span className="df-making-tag">IMAGINATION IN MOTION</span><div className="df-making-orbit" aria-hidden="true"><i/><i/><img src="/images/dreamforge/fireball-guide.png" alt=""/></div><h3>A little spark.<br/>A whole new world.</h3><p>Creating image {Math.max(1,progress)} of {count}</p><div className="df-making-dots" aria-hidden="true"><i/><i/><i/></div><small>Your image will appear here when it’s ready.</small></div></div>;
}
