import * as T from "three";
import { StaticBatch } from "./architecture";
import { buildCloister } from "./cloister";
import type { Assets } from "./assets";
import { ABBEY_GATE as gate, ABBEY_GRAVES, type Point } from "./world";

export type AbbeyCue = "crows" | "bell" | "chain" | "toll";
type Cue = (name: AbbeyCue, source: Point) => void;

/** An optional encounter, entirely local to this walk. No council/session state. */
export function buildAbbey(scene: T.Scene, assets: Assets) {
  const root = new T.Group(); scene.add(root);
  const batch = new StaticBatch();
  const stone = assets.surface("castle_brick_07", { metres: 1.8, color: "#80857c" });
  const wood = assets.surface("dark_wooden_planks", { metres: 1, color: "#79654b" });
  const plain = (color: string) => assets.track(new T.MeshStandardMaterial({color}));
  const bronze = plain("#826747"), bone = plain("#c3b999"), black = plain("#161820");
  const flame = assets.track(new T.MeshBasicMaterial({color:"#ffd186"}));
  const lamps: T.Vector3[] = [];
  const cloister=buildCloister(root,assets,lamps);
  function candle(x:number,y:number,z:number) {
    batch.cylinder(wood,.07,.1,.38,[x,y+.19,z]);
    batch.add(flame,new T.SphereGeometry(.065,6,5).scale(.8,1.7,.8),[x,y+.43,z]);
    lamps.push(new T.Vector3(x,y+.54,z));
  }
  // A crooked fingerpost bearing a bell; a warm pin of light marks the turn.
  batch.box(wood,[.24,2.3,.25],[-45,1.15,-71]);
  batch.box(wood,[1.7,.32,.14],[-45.4,1.85,-71],[0,.3,.14]);
  batch.cylinder(bronze,.09,.25,.32,[-46,1.49,-71]); candle(-45,2.3,-71);
  const bells: {pivot:T.Group; source:Point; start:number}[] = [];
  ABBEY_GRAVES.forEach(({x,z},i)=>{
    batch.box(stone,[1,.24,1.7],[x,.12,z]);
    batch.box(stone,[.82,1,.23],[x,.67,z-.6],[0,.08,Math.sin(i)*.12]);
    if(i%3!==1) return;
    batch.box(wood,[.09,1.8,.09],[x-.35,.9,z]);
    batch.box(wood,[.56,.08,.09],[x-.12,1.8,z]);
    const pivot=new T.Group(); pivot.position.set(x+.1,1.76,z); root.add(pivot);
    const b=new StaticBatch();
    b.add(bronze,new T.LatheGeometry([[.035,0],[.1,-.08],[.14,-.25],[.22,-.31],[.22,-.35],[.18,-.33],[.08,-.17]].map(([r,h])=>new T.Vector2(r,h)),12),[0,0,0]);
    b.cylinder(wood,.018,.018,1.43,[0,-1,0]); b.build(pivot);
    bells.push({pivot,source:{x,z},start:-Infinity});
  });
  const {x,z}=gate;
  // Dressed arch stones, steep turret caps and a single lit slit above the graves.
  for(const side of [-1,1]){
    batch.add(stone,new T.ConeGeometry(2.7,3.8,4),[x+4*side,8.7,z],[0,Math.PI/4,0]);
    batch.box(bronze,[.42,1.3,.1],[x+4*side,5.4,z+1.84]);
    candle(x+4*side,4.85,z+1.94);
  }
  for(let i=0;i<=16;i++){
    const a=Math.PI*i/16;
    batch.box(stone,[.56,.82,2],[x+2.75*Math.cos(a),4+2.75*Math.sin(a),z],[0,0,a-Math.PI/2]);
  }
  batch.box(wood,[6,.3,.34],[x,5.9,z+.85]);
  batch.build(root);
  const body=new T.Group(); body.position.set(x+.65,5.78,z+.85); root.add(body);
  const bones=new StaticBatch();
  bones.cylinder(wood,.035,.035,.95,[0,-.475,0]);
  bones.add(bone,new T.SphereGeometry(.19,12,9).scale(.9,1.15,.84),[0,-1.12,0]);
  bones.box(bone,[.22,.13,.18],[0,-1.31,.035]);
  for(const s of [-1,1]){
    bones.add(black,new T.SphereGeometry(.055,8,6),[s*.073,-1.13,.127]);
    bones.cylinder(bone,.046,.036,.39,[s*.32,-1.69,0],8,[0,0,s*.15]);
    bones.cylinder(bone,.035,.027,.38,[s*.36,-2.07,.015]);
    bones.cylinder(bone,.058,.045,.53,[s*.14,-2.42,0],8,[0,0,s*.08]);
    bones.cylinder(bone,.042,.03,.5,[s*.17,-2.93,0]);
    bones.box(bone,[.1,.08,.22],[s*.17,-3.19,.06]);
  }
  bones.cylinder(bone,.05,.045,.83,[0,-1.72,-.04]);
  bones.box(bone,[.52,.07,.12],[0,-1.48,0]);
  for(let i=0;i<6;i++) bones.add(bone,new T.TorusGeometry(.21-i*.012,.019,5,16).scale(1,.52,.7),[0,-1.54-i*.065,0],[.25,0,0]);
  bones.add(bone,new T.TorusGeometry(.155,.05,6,12).scale(1.2,.7,1),[0,-2.13,0]); bones.build(body);

  const birds=Array.from({length:7},(_,i)=>{
    const home=new T.Vector3(-47.7+i*.26,1.32,-73-i*.52);
    const perch=new StaticBatch(); perch.box(wood,[.13,1.3,.14],[home.x,.65,home.z]); perch.build(root);
    const bird=new T.Group(); root.add(bird);
    const b=new StaticBatch();
    b.add(black,new T.SphereGeometry(.2,9,7).scale(.68,.85,1.5),[0,.14,0]);
    b.add(black,new T.SphereGeometry(.115,8,7),[0,.29,.17]);
    b.add(bronze,new T.ConeGeometry(.055,.17,6),[0,.29,.31],[Math.PI/2,0,0]);
    b.box(black,[.14,.045,.29],[0,.12,-.3],[.24,0,0]); b.build(bird);
    const wings=[-1,1].map(s=>{
      const wing=new T.Group(); bird.add(wing);
      const w=new StaticBatch(); w.add(black,new T.SphereGeometry(1,7,5).scale(.3,.035,.13),[s*.26,.13,-.07],[0,s*.25,0]); w.build(wing); return wing;
    });
    return {bird,home,wings};
  });
  let flight=-Infinity, gateTime=-Infinity;
  function reset(){ cloister.reset(); flight=gateTime=-Infinity; bells.forEach(b=>b.start=-Infinity); }
  function update(t:number,p:Point,height:number,running:boolean,reduced:boolean,cue:Cue){
    root.visible=p.x<-15 && p.z<-50;
    if(!root.visible) return;
    cloister.update(t,p,height,reduced,()=>cue("toll",p));
    const distance=(q:Point)=>Math.hypot(q.x-p.x,q.z-p.z);
    if(!Number.isFinite(flight) && distance(birds[2].home)<(running?8:4.5)){flight=t;cue("crows",birds[2].home);}
    birds.forEach(({bird,home,wings},i)=>{
      const f=Number.isFinite(flight)?Math.max(0,t-flight-i*.065):0;
      bird.visible=f<4 && !(reduced && f>0); if(!bird.visible)return;
      bird.position.copy(home); bird.position.x-=f*(3+i*.22); bird.position.y+=f*(2+i*.12); bird.position.z-=f*2;
      bird.rotation.y=f?-2.1:Math.atan2(p.x-home.x,p.z-home.z);
      wings.forEach((w,j)=>w.rotation.z=(j?1:-1)*(f?Math.sin(f*17+i)*.88:-1.15));
    });
    bells.forEach(b=>{
      if(!Number.isFinite(b.start)&&distance(b.source)<4.4){b.start=t;cue("bell",b.source);}
      if(Number.isFinite(b.start)){const age=t-b.start;b.pivot.rotation.z=reduced?0:.64*Math.exp(-age*1.3)*Math.sin(age*9);b.pivot.position.y=1.76-.14*Math.exp(-age*5);}
      else {b.pivot.rotation.z=0;b.pivot.position.y=1.76;}
    });
    if(!Number.isFinite(gateTime)&&distance(gate)<7){gateTime=t;cue("chain",gate);}
    body.rotation.z=reduced?0:Math.sin(t*.95)*.075*(Number.isFinite(gateTime)?Math.exp(-(t-gateTime)*4):1);
  }
  return {lamps,reset,update};
}
