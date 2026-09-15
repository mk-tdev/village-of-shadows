"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCouncilVoice } from "@/lib/api";
import type { GameAccessCredentials, LogEntry, Player } from "@/lib/types";
import { usePreferences } from "./Preferences";

export function VoiceCouncil({sessionId,access,entries,players,onSpeaking,onLine,paused=false}:{
  sessionId:string; access?:GameAccessCredentials; entries:LogEntry[]; players:Player[];
  onSpeaking:(seatId:string|null)=>void; onLine:(seq:number|null)=>void; paused?:boolean;
}) {
  const {t}=usePreferences();
  const [enabled,setEnabled]=useState(false);
  const [current,setCurrent]=useState<LogEntry|null>(null);
  const [status,setStatus]=useState("Waiting for a public statement");
  const [failed,setFailed]=useState(false);
  const [queued,setQueued]=useState(0);
  const [pace,setPace]=useState(1);
  const audio=useRef<HTMLAudioElement|null>(null);
  const queue=useRef<LogEntry[]>([]);
  const seen=useRef(new Set<number>());
  const cache=useRef(new Map<number,string>());
  const request=useRef<AbortController|null>(null);
  const generation=useRef(0);
  const running=useRef(false);
  const enabledRef=useRef(false);
  const pausedRef=useRef(paused);
  const paceRef=useRef(1);
  const failedLine=useRef<LogEntry|null>(null);
  const activeLine=useRef<LogEntry|null>(null);
  const lastLine=useRef<LogEntry|null>(null);
  const pumpRef=useRef<()=>void>(()=>{});

  const clearPlayback=useCallback(()=>{
    generation.current++; request.current?.abort(); request.current=null;
    if(audio.current){audio.current.onended=null;audio.current.onerror=null;audio.current.onplaying=null;audio.current.pause();audio.current.removeAttribute("src");}
    audio.current=null; running.current=false;onSpeaking(null);onLine(null);setCurrent(null);
  },[onSpeaking,onLine]);

  const pump=useCallback(async()=>{
    if(running.current || !enabledRef.current || pausedRef.current || failedLine.current) return;
    const line=queue.current.shift();setQueued(queue.current.length);
    if(!line)return;
    activeLine.current=line;running.current=true;setStatus("Preparing voice…");
    const version=generation.current;
    try {
      let url=cache.current.get(line.seq);
      if(!url){const controller=new AbortController();request.current=controller;const blob=await fetchCouncilVoice(sessionId,line.seq,access,controller.signal);
        if(version!==generation.current)return;
        url=URL.createObjectURL(blob);cache.current.set(line.seq,url);
        if(cache.current.size>80){const first=cache.current.keys().next().value!;URL.revokeObjectURL(cache.current.get(first)!);cache.current.delete(first);}
      }
      if(version!==generation.current)return;
      const element=new Audio(url);audio.current=element;element.playbackRate=paceRef.current;
      element.onplaying=()=>{if(version!==generation.current)return;setCurrent(line);lastLine.current=line;onSpeaking(line.seat_id??null);onLine(line.seq);setStatus("AI-generated voices");};
      const fail=()=>{if(version!==generation.current)return;running.current=false;failedLine.current=line;setFailed(true);setStatus("Voice unavailable. Text remains available.");onSpeaking(null);onLine(null);};
      element.onerror=fail;
      element.onended=()=>{if(version!==generation.current)return;audio.current=null;running.current=false;setCurrent(null);onSpeaking(null);onLine(null);setStatus("Waiting for a public statement");pumpRef.current();};
      if(!pausedRef.current) await element.play().catch(fail);
    }catch(error){if(version!==generation.current || (error instanceof DOMException && error.name==="AbortError"))return;running.current=false;failedLine.current=line;setFailed(true);setStatus("Voice unavailable. Text remains available.");}
  },[sessionId,access,onSpeaking,onLine]);
  useEffect(()=>{pumpRef.current=()=>{void pump();};},[pump]);
  useEffect(()=>{
    if(!enabled)return;
    for(const line of entries){if(line.type!=="statement" || line.private || !line.text || !line.seat_id || seen.current.has(line.seq))continue;seen.current.add(line.seq);queue.current.push(line);}
    queueMicrotask(()=>{setQueued(queue.current.length);pumpRef.current();});
  },[entries,enabled]);
  useEffect(()=>{
    pausedRef.current=paused;
    if(paused){audio.current?.pause();onSpeaking(null);onLine(null);}
    else if(audio.current && running.current){void audio.current.play().catch(()=>{failedLine.current=activeLine.current;running.current=false;setFailed(true);setStatus("Voice unavailable. Text remains available.");});}
    else pumpRef.current();
  },[paused,onSpeaking,onLine]);
  useEffect(()=>{const urls=cache.current;const lifecycle=generation;return()=>{lifecycle.current++;request.current?.abort();audio.current?.pause();urls.forEach(url=>URL.revokeObjectURL(url));};},[]);

  function enable(){
    // Start at the current conversation, not the beginning of a reconnected transcript.
    entries.forEach(line=>seen.current.add(line.seq));
    const latest=[...entries].reverse().find(line=>line.type==="statement"&&!line.private&&line.text&&line.seat_id);
    if(latest)queue.current.push(latest);
    enabledRef.current=true;setEnabled(true);void pump();
  }
  function disable(){enabledRef.current=false;setEnabled(false);queue.current=[];failedLine.current=null;setFailed(false);setQueued(0);clearPlayback();}
  function skip(){clearPlayback();failedLine.current=null;setFailed(false);void pump();}
  function retry(){const line=failedLine.current;clearPlayback();failedLine.current=null;setFailed(false);if(line)queue.current.unshift(line);void pump();}
  function replay(){const line=lastLine.current;if(!line)return;clearPlayback();failedLine.current=null;setFailed(false);queue.current.unshift(line);void pump();}
  return <section className="voice-council" aria-label={t("AI-generated voices")}>
    <div><span>{t("AI-generated voices")} · English / 普通话</span><strong role="status">{t(enabled ? status : "Voices are off")}{enabled&&queued>0?` · ${queued}`:""}</strong></div>
    <button onClick={enabled?disable:enable}>{t(enabled?"Disable voices":"Enable AI voices")}</button>
    {enabled&&<><button onClick={skip}>{t("Skip line")}</button><button onClick={replay}>{t("Replay line")}</button>{failed&&<button onClick={retry}>{t("Retry audio")}</button>}<select aria-label={t("Voice pace")} value={pace} onChange={e=>{const value=Number(e.target.value);setPace(value);paceRef.current=value;if(audio.current)audio.current.playbackRate=value;}}>{[.85,1,1.15,1.3].map(value=><option value={value} key={value}>{value}×</option>)}</select></>}
    {current&&<div className="voice-caption" aria-live="off"><b>{t("Listening now")} · {players.find(p=>p.seat_id===current.seat_id)?.name}</b><p>{current.text}</p></div>}
  </section>;
}
