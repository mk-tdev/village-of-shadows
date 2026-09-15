"use client";
import { useEffect,useRef } from "react";
import type { LogEntry } from "@/lib/types";
import { usePreferences } from "./Preferences";
export function ChatPictureInPicture({entries,speakingSeq,onReturn}:{entries:LogEntry[];speakingSeq:number|null;onReturn:()=>void}){
  const {t}=usePreferences();const panel=useRef<HTMLDivElement>(null);
  const publicLines=entries.filter(entry=>entry.type==="statement"&&!entry.private);
  const spoken=publicLines.find(entry=>entry.seq===speakingSeq);
  const lines=spoken?[spoken]:publicLines.slice(-5);
  useEffect(()=>{const el=panel.current;if(el)el.scrollTop=el.scrollHeight;},[entries.length,speakingSeq]);
  return <aside className="chat-pip" aria-label={t("Live chat")}><header><b>{t(spoken?"Listening now":"Live chat")}</b><button onClick={onReturn}>↗ {t("Return to chat")}</button></header><div className="chat-pip-lines" ref={panel}>{lines.map(line=><article key={line.seq} aria-current={line.seq===speakingSeq}><strong>{line.name}</strong><p>{line.text}</p></article>)}{!lines.length&&<p>{t("Waiting for a public statement")}</p>}</div></aside>;
}
