"use client";

import { Select } from "./Select";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Language = "en" | "zh";
const chinese: Record<string, string> = {
"The villagers wait for someone to break the silence":"村民们等待有人打破沉默",
"Your fellow players are gathered around the council fire":"其他玩家已围坐在议会篝火旁",
"Set the discussion length":"设置讨论长度",
"Each round gives every living player one turn before voting. Choose one for a quick demo.":"每轮讨论让每位存活玩家发言一次，然后投票。快速演示请选择一轮。",
"Quick demo":"快速演示",
"Short discussion":"简短讨论",
"Full debate":"完整辩论",
"Discussion rounds":"讨论轮数",
"Your village character":"你的村庄角色",
"Ready":"已就绪",
"Optional":"可选",
"Upload a clear photo of one person. Generate a realistic village character while preserving their face.":"上传一张清晰的单人照片，生成保留面部特征的写实村庄角色。",
"Reference photo":"参考照片",
"Generate sends this photo to OpenAI. We save only the generated character, visible to everyone in your room. AI likeness may vary; preview before using.":"点击生成会将照片发送至 OpenAI。我们仅保存生成的角色，房间中的所有人都可看到。AI 生成的相貌可能存在差异，请先预览。",
"Working…":"处理中…",
"Generate character":"生成角色",
"This can take a couple of minutes. Keep this page open.":"生成可能需要几分钟，请保持此页面打开。",
"Use this character":"使用此角色",
"Use default character":"使用默认角色",
"Generated character preview":"生成角色预览",
"Preview · not yet applied":"预览 · 尚未应用",
"Character selected":"已选择角色",
"Photo must be smaller than 8 MB.":"照片必须小于 8 MB。",
"Character generation failed.":"角色生成失败。",
"Could not save character.":"无法保存角色。",
"Character generation needs the server's OpenAI API key.":"角色生成需要配置服务器的 OpenAI API 密钥。",
"Choose your character before the host starts the game.":"请在房主开始游戏之前选择角色。",

"Privately persuade your fellow werewolf and propose tonight's target.":"秘密说服你的狼人同伴，并提出今晚的目标。",
"Who should the village eliminate?":"村庄应该淘汰谁？",
"A quiet night. No one was harmed.":"平静的一夜，没有人受到伤害。",
"Persuade your teammate, explain the threat, or coordinate tomorrow’s deception...":"说服你的同伴，解释威胁，或协调明天的计划……",
"Private message":"秘密消息",
"Voice pace":"语速",
"Voices are off":"语音已关闭",

"Invite more human players":"邀请其他真人玩家",
"Speaking now":"正在发言",
"Your place in the circle":"你的座位",
"Listening":"正在聆听",
"Fallen":"已死亡",
"Under accusation":"受到质疑",
"is speaking":"正在发言",
"is in focus":"处于焦点",
"Six AI villagers wait for someone to break the silence":"六位 AI 村民等待有人打破沉默",
"AGENT FOCUS":"角色特写",
"THE WHOLE VILLAGE":"整个村庄",
"you":"你",
"human player":"真人玩家",
"HUMAN":"真人",
"villager":"村民",
"werewolf":"狼人",
"doctor":"医生",
"seer":"预言家",
"hunter":"猎人",
"mayor":"镇长",
"jester":"小丑",
"Choose which villager to attack.":"选择要袭击的村民。",
"Choose one player to secretly investigate.":"选择一位玩家进行秘密查验。",
"Seats are configured and the event stream is already live. The graph hasn’t run a single node yet — start it and you’ll see every step from the first one.":"玩家配置已完成。点击开始游戏后，可以查看从第一步开始的完整运行过程。",
"Which agent will gain trust, misread the evidence, or change the outcome — and why? Your prediction stays in this browser and returns in the post-game debrief.":"哪位角色会获得信任、误读证据或改变结局？为什么？你的预测保存在此浏览器中，并在复盘时显示。",
"Custom agent laboratory":"自定义 AI 实验室",
"Versioned personality, reasoning, memory and tool strategy":"配置性格、推理、记忆和工具策略",
"You have entered a village inhabited by six independent AI agents":"你进入了一个住着六位独立 AI 角色的村庄",
"Every agent is present in the clearing":"所有角色都在空地上",
"The jungle has claimed one of the villagers":"丛林夺走了一位村民的生命",

"← Return to the village gates":"← 返回村庄入口",
"Configure the seven seats, then begin.":"配置七个座位，然后开始。",
"How to play":"玩法说明",
"Relationship archive":"关系档案",
"Game archive":"游戏档案",
"YOUR PLACE IN THE VILLAGE":"你在村庄中的位置",
"Which character do you want to play?":"你想扮演哪个角色？",
"Choose any of the seven seats. The other six remain AI unless you invite more people below.":"选择任意一个座位。其余六位由 AI 扮演，你也可以邀请其他玩家。",
"YOU PLAY HERE":"你的座位",
"INVITED HUMAN":"受邀玩家",
"CHOOSE":"选择",
"optional":"可选",
"Solo human game":"单人游戏",
"Model name or custom ID":"模型名称或自定义 ID",
"WORLD RULES · VERSION 1":"世界规则 · 版本 1",
"Choose how strange this village becomes":"选择村庄的规则",
"Night of the Missing Villager":"失踪村民之夜",
"Follow a scream, inspect two clues, question three witnesses, and bring your evidence to the council. One human investigator, six AI villagers, standard roles.":"追踪尖叫声，检查两条线索，询问三位证人，并向议会出示证据。一名人类调查员，六名 AI 村民，使用标准角色。",
"Expanded roles":"扩展角色",
"Add Hunter, Mayor, and Jester with server-enforced rules.":"增加猎人、镇长和小丑，由服务器执行角色规则。",
"Dynamic village events":"动态村庄事件",
"Deterministic silence, sealed ballots, forced testimony, and discovered evidence.":"包含禁言、秘密投票、强制作证和发现证据等事件。",
"Cross-game relationships":"跨局关系记忆",
"Opt in to inspectable memories from previous games. Roles are never carried forward.":"启用可查看的历史关系记忆，角色身份不会跨局继承。",
"LEARNING EXPERIMENT · OPTIONAL":"学习实验 · 可选",
"Predict before you play":"开始前先预测",
"Seat names must be unique.":"玩家姓名不能重复。",
"Test every AI model":"测试每个 AI 模型",
"Create your village":"创建你的村庄",
"AI model readiness":"AI 模型就绪状态",
"Checking every AI model...":"正在检查所有 AI 模型……",
"Creating your village...":"正在创建村庄……",
"Waking the backend...":"正在连接服务器……",
"Choose who to secretly protect tonight.":"选择今晚要秘密保护的人。",
"Choose who to secretly investigate tonight.":"选择今晚要秘密查验的人。",
"Who do you want to eliminate?":"你想淘汰谁？",
"The village must vote. Who will be cast out?":"村民必须投票，谁将被驱逐？",
"Seven villagers gather as the sun sets. Among them, some are not what they seem.":"夕阳下，七位村民聚在一起，其中有人隐藏着另一重身份。",
"Vote":"投票",
"ROUND EVENT":"本轮事件",
"God view":"上帝视角",
"VOICE COUNCIL":"语音议会",
"Go straight to player setup":"直接配置玩家",
"Find the council. Take your seat.":"找到议会，坐上你的座位。",
"Keep your lantern close. Something hunts here.":"拿好灯笼，有东西正在这里狩猎。",
"Enter the village":"进入村庄",
"Continue the night":"继续探索",
"Find the council fire":"寻找议会篝火",
"Take the empty chair":"坐上空椅子",
"Sit down & choose players":"坐下并配置玩家",
"Open journal":"打开日志",
"Sound on":"声音开启",
"Sound off":"声音关闭",
"You found the council":"你找到了议会",
"Your story starts here.":"你的故事从这里开始。",
"The intro is complete. Choose each player and their AI model before starting the council.":"序章结束。请配置每位玩家及其 AI 模型，然后开始议会。",
"Taking your seat and opening player setup…":"正在入座并打开玩家配置……",
"Choose players & models":"选择玩家和模型",
"A playable horror prologue":"可游玩的恐怖序章",
"The last light":"最后的灯火",
"Follow the lamps north, past the well and chapel. The council fire is your destination.":"沿着灯光向北走，经过水井和教堂，寻找议会篝火。",
"Find the empty wooden chair on this side of the fire. Press E to finish the intro, then choose your players and models.":"找到篝火近侧的空木椅。按 E 结束序章，然后选择玩家和模型。",

  "Village of Shadows":"暗影村庄", "Compact":"紧凑", "Wide":"宽屏", "Language":"语言", "Layout":"布局",
  "Name":"姓名", "Personality":"性格", "Controller":"控制者", "Provider":"供应商", "Model":"模型", "YOU":"你",
  "Speak":"发送发言", "Continue":"继续", "Pause":"暂停", "Round":"回合", "Night":"夜晚", "Day":"白天", "Not started":"尚未开始", "Investigation":"调查",
  "What do you want to say to the village?":"你想对村民说什么？", "The village is deciding what happens next...":"村民正在决定下一步……",
  "PRIVATE WEREWOLF COUNCIL":"狼人秘密议会", "Send private plan":"发送秘密计划", "Pass this council turn":"跳过本次发言",
  "Choose your character":"选择你的角色", "Set every AI seat to":"统一设置所有 AI 玩家", "Test Models & Start Game":"测试模型并创建游戏",
  "Council language":"议会语言", "Discussion passes before voting":"投票前的讨论轮数", "Players & models":"玩家与模型",
  "Live chat":"实时聊天", "Return to chat":"返回聊天", "Return to council":"返回议会", "Listening now":"正在播放", "Live transcript":"实时文字记录",
  "Enable AI voices":"开启 AI 语音", "Disable voices":"关闭语音", "Skip line":"跳过本句", "Replay line":"重播本句", "Retry audio":"重试语音", "Preparing voice…":"正在生成语音……", "AI-generated voices":"AI 合成语音",
  "Voice unavailable. Text remains available.":"语音暂不可用，仍可阅读文字。", "Waiting for a public statement":"等待公开发言", "Music":"背景音乐", "Music off":"关闭音乐", "Music on":"开启音乐",
  "Speak with microphone":"使用麦克风发言", "Stop & transcribe":"停止并转为文字", "Cancel recording":"取消录音", "Transcribing…":"正在转录……", "Review your words, then send.":"请检查转录文字后再发送。",
  "Microphone audio is sent to OpenAI for transcription.":"麦克风音频将发送至 OpenAI 进行转录。", "Microphone unavailable. You can still type.":"麦克风不可用，你仍可以输入文字。",
  "Starting...":"正在开始……", "▶ Start Game":"▶ 开始游戏", "⏸ Pause":"⏸ 暂停", "▶ Continue":"▶ 继续", "⏹ New Game":"⏹ 新游戏", "Stopping...":"正在停止……", "Leave game":"离开游戏",
  "A multi-agent game of Werewolf, played out in real time":"多个 AI 玩家实时参与的狼人杀游戏", "Collapse":"收起", "Enter clearing":"进入空地", "◉ My place":"◉ 我的座位", "◇ Close-up":"◇ 近景", "⟐ Wide view":"⟐ 全景",
  "THE JUNGLE COUNCIL · LIVE":"丛林议会 · 实时", "Waiting for the room host to begin the game…":"等待房主开始游戏……",
  "Game paused — the orchestrator has suspended between turns.":"游戏已暂停，流程将在继续后恢复。", "Discussion":"讨论",
};
const PreferencesContext = createContext<{language:Language;wide:boolean;setLanguage:(value:Language)=>void;setWide:(value:boolean)=>void}>({ language:"en", wide:false, setLanguage:()=>{}, setWide:()=>{} });
export function PreferencesProvider({children}:{children:ReactNode}) {
  const [language,setLanguageState]=useState<Language>("en");
  const [wide,setWideState]=useState(false);
  useEffect(()=>{queueMicrotask(()=>{try {setLanguageState(localStorage.getItem("village-language")==="zh"?"zh":"en");setWideState(localStorage.getItem("village-layout")==="wide");}catch{}});},[]);
  useEffect(()=>{document.documentElement.lang=language==="zh"?"zh-Hans":"en";document.documentElement.dataset.layout=wide?"wide":"compact";},[language,wide]);
  function setLanguage(value:Language){setLanguageState(value);try{localStorage.setItem("village-language",value);}catch{}}
  function setWide(value:boolean){setWideState(value);try{localStorage.setItem("village-layout",value?"wide":"compact");}catch{}}
  return <PreferencesContext.Provider value={{language,wide,setLanguage,setWide}}>{children}</PreferencesContext.Provider>;
}
export function usePreferences(){const context=useContext(PreferencesContext);return {...context,t:(text:string)=>context.language==="zh"?(chinese[text]??text):text};}
export function DisplayPreferences() {
  const { language, wide, setLanguage, setWide, t } = usePreferences();
  return (
    <div className="display-preferences">
      <div role="group" aria-label={t("Layout")}>
        <button type="button" aria-pressed={!wide} onClick={() => setWide(false)}>{t("Compact")}</button>
        <button type="button" aria-pressed={wide} onClick={() => setWide(true)}>{t("Wide")}</button>
      </div>
      <div className="preference-language">
        <span>{t("Language")}</span>
        <Select
          ariaLabel={t("Language")}
          value={language}
          options={[{ value: "en", label: "English" }, { value: "zh", label: "简体中文" }]}
          onChange={value => setLanguage(value as Language)}
        />
      </div>
    </div>
  );
}
