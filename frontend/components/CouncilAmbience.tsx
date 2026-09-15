"use client";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "./Preferences";

export function CouncilAmbience({duck,paused}:{duck:boolean;paused:boolean}){
  const {t}=usePreferences();const [enabled,setEnabled]=useState(false),[volume,setVolume]=useState(.15);
  const context=useRef<AudioContext|null>(null),master=useRef<GainNode|null>(null);
  useEffect(()=>{const ctx=context.current;if(!ctx||!master.current)return;master.current.gain.setTargetAtTime(enabled&&!paused?volume*(duck?.18:1):0,ctx.currentTime,.35);},[enabled,volume,duck,paused]);
  useEffect(()=>()=>{void context.current?.close();},[]);
  async function toggle(){
    if(!context.current){const ctx=new AudioContext();context.current=ctx;const gain=ctx.createGain();gain.gain.value=0;gain.connect(ctx.destination);master.current=gain;
      [36.7,55,58.27,77.78].forEach((frequency,i)=>{const tone=ctx.createOscillator(),filter=ctx.createBiquadFilter(),level=ctx.createGain(),drift=ctx.createOscillator(),depth=ctx.createGain();tone.type=i<2?"sine":"triangle";tone.frequency.value=frequency;filter.type="lowpass";filter.frequency.value=180;level.gain.value=.065;drift.frequency.value=.035+i*.011;depth.gain.value=1.4;drift.connect(depth);depth.connect(tone.detune);tone.connect(filter);filter.connect(level);level.connect(gain);tone.start();drift.start();});
    }
    await context.current.resume();setEnabled(v=>!v);
  }
  return <div className="microphone-controls"><button className="btn btn-secondary" aria-pressed={enabled} onClick={()=>void toggle()}>{t(enabled?"Music off":"Music on")}</button>{enabled&&<label>{t("Music")} <input aria-label={t("Music")} type="range" min="0" max=".4" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label>}</div>;
}
