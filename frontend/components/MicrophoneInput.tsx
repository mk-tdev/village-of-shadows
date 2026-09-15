"use client";
import { useEffect, useRef, useState } from "react";
import { transcribeCouncil } from "@/lib/api";
import type { GameAccessCredentials } from "@/lib/types";
import { usePreferences, type Language } from "./Preferences";

export function MicrophoneInput({sessionId,access,language,disabled,onText,onRecording}:{sessionId:string;access:GameAccessCredentials;language:Language;disabled:boolean;onText:(text:string)=>void;onRecording:(value:boolean)=>void}) {
  const {t}=usePreferences();
  const [recording,setRecording]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),abort=useRef<AbortController|null>(null);
  const generation=useRef(0);
  const stopTracks=()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(timer.current)clearTimeout(timer.current);};
  useEffect(()=>()=>{generation.current++;abort.current?.abort();if(recorder.current?.state==="recording")recorder.current.stop();stopTracks();onRecording(false);},[onRecording]);
  function cancel(){generation.current++;abort.current?.abort();if(recorder.current?.state==="recording")recorder.current.stop();stopTracks();setRecording(false);setBusy(false);onRecording(false);}
  async function start(){
    setError("");const version=++generation.current;setBusy(true);
    try {
      if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)throw new Error("Microphone unavailable. You can still type.");
      const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      if(version!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;
      const mime=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus"].find(value=>MediaRecorder.isTypeSupported(value));
      const rec=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=rec;
      const chunks:Blob[]=[];
      rec.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      rec.onstop=async()=>{
        stopTracks();if(version!==generation.current)return;
        setRecording(false);onRecording(false);setBusy(true);
        try{const controller=new AbortController();abort.current=controller;const text=await transcribeCouncil(sessionId,new Blob(chunks,{type:rec.mimeType}),language,access,controller.signal);if(version===generation.current)onText(text);}
        catch(reason){if(version===generation.current)setError(reason instanceof Error?reason.message:"Transcription failed");}
        finally{if(version===generation.current)setBusy(false);}
      };
      rec.start();setBusy(false);setRecording(true);onRecording(true);timer.current=setTimeout(()=>{if(rec.state==="recording")rec.stop();},60000);
    }catch(reason){if(version===generation.current){stopTracks();setBusy(false);setError(reason instanceof Error?reason.message:"Microphone unavailable. You can still type.");}}
  }
  return <div className="microphone-controls"><button type="button" className="btn btn-secondary" disabled={disabled||busy} onClick={()=>recording?recorder.current?.stop():void start()}>{t(recording?"Stop & transcribe":busy?"Transcribing…":"Speak with microphone")}</button>{(recording||busy)&&<button type="button" className="btn btn-secondary" onClick={cancel}>{t("Cancel recording")}</button>}<small>{t("Microphone audio is sent to OpenAI for transcription.")} {t("Review your words, then send.")}</small>{error&&<p role="alert">{t(error)}</p>}</div>;
}
