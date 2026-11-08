import * as T from "three";
import { StaticBatch } from "./architecture";
import { TOWER as s, arcadePiers, CLOISTER, type Point } from "./world";
import type { Assets } from "./assets";

/** An open nave: the north arcade screens the Keeper from the eastbound player. */
export function buildCloister(root:T.Group, assets:Assets, lamps:T.Vector3[]) {
  const b=new StaticBatch();
  const stone=assets.surface("castle_brick_07",{metres:1.7,color:"#909ca3"});
  const moss=assets.surface("worn_mossy_plasterwall",{metres:2.8,color:"#6c786a"});
  const timber=assets.surface("dark_wooden_planks",{metres:1.6,color:"#705a42"});
  const brass=assets.track(new T.MeshStandardMaterial({color:0xb19566,roughness:.46,metalness:.42}));
  const wax=assets.track(new T.MeshBasicMaterial({color:0xffcb80}));
  const cloth=assets.track(new T.MeshStandardMaterial({color:0x322f30,roughness:1,flatShading:true}));
  function taper(x:number,y:number,z:number) {
    for(let i=0;i<3;i++){
      b.cylinder(brass,.05,.08,.24,[x+i*.12,y+.12,z],8);
      b.add(wax,new T.SphereGeometry(.048,6,5).scale(.85,1.9,.85),[x+i*.12,y+.29,z]);
    }
    lamps.push(new T.Vector3(x,y+.4,z));
  }
  b.box(stone,[CLOISTER.w,.12,CLOISTER.d],[CLOISTER.x,-.025,CLOISTER.z]);
  for(const p of arcadePiers){
    if(p.x===-53&&p.z===-105) continue; // fallen bay opens directly onto the gatehouse
    b.box(moss,[.95,.34,.95],[p.x,.17,p.z]);
    b.cylinder(stone,.34,.4,3,[p.x,1.82,p.z],8);
    b.box(stone,[.91,.34,.91],[p.x,3.38,p.z]);
  }
  for(const z of [-111,-105]) for(let i=0;i<4;i++){
    const x=-53+i*5;
    for(const side of [-1,1]){
      if(z===-105 && i===0 && side===-1) continue;
      const curve=new T.QuadraticBezierCurve3(new T.Vector3(x+2.5+side*2.5,3.48,z),new T.Vector3(x+2.5+side*2.45,5,z),new T.Vector3(x+2.5,6,z));
      b.add(stone,new T.TubeGeometry(curve,12,.28,6,false),[0,0,0]);
    }
    if((i+(z===-111?1:0))%3!==0) b.box(moss,[4.9,.32,.75],[x+2.5,6.14,z]);
  }
  taper(-50,.05,-110); taper(-35,.05,-106);

  const top=s.count*s.rise, end=s.start+s.count*s.run;
  for(let i=0;i<s.count;i++){
    const h=(i+1)*s.rise, x=s.start+(i+.5)*s.run;
    b.box(stone,[s.run,h,s.width],[x,h/2,s.z]);
    for(const side of [-1,1]) b.box(moss,[s.run,h+.95,.36],[x,(h+.95)/2,s.z+side*(s.width/2+.18)]);
    if(i%7===0)taper(x,h+.96,s.z-1.95);
  }
  b.box(stone,[s.landing,top,s.width],[end+s.landing/2,top/2,s.z]);
  for(const side of [-1,1]){
    b.box(stone,[s.landing,top+1,.36],[end+s.landing/2,(top+1)/2,s.z+side*(s.width/2+.18)]);
    for(const x of [end,end+s.landing]) {
      b.box(stone,[.56,top+5,.56],[x,(top+5)/2,s.z+side*1.98]);
      b.add(stone,new T.ConeGeometry(.44,1.6,4),[x,top+5.8,s.z+side*1.98]);
    }
    b.box(timber,[4,.36,.4],[end+1.5,top+4.7,s.z+side*1.98]);
  }
  b.box(stone,[.36,top+1,s.width+.72],[end+s.landing+.18,(top+1)/2,s.z]);
  b.box(timber,[.5,.6,4.4],[end+1.5,top+4.5,s.z]);
  const profile=[[.09,0],[.39,-.16],[.52,-.43],[.63,-1],[.91,-1.29],[.91,-1.39],[.79,-1.36],[.49,-.94],[.33,-.23],[.09,-.13]];
  b.add(brass,new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),32),[end+1.5,top+4.2,s.z]);
  b.cylinder(timber,.035,.025,.74,[end+1.5,top+3.88,s.z+.73]);
  taper(end+.35,top,s.z+.92);
  b.build(root);

  const keeper=new T.Group(); root.add(keeper);
  const k=new StaticBatch();
  k.add(cloth,new T.CylinderGeometry(.26,.51,1.63,11).scale(1,1,.68),[0,.84,0]);
  k.add(cloth,new T.SphereGeometry(.32,11,9).scale(1,1.18,.9),[0,1.86,0]);
  k.add(brass,new T.SphereGeometry(.23,10,9).scale(.81,1.12,.48),[0,1.88,.23]);
  for(const side of [-1,1]) k.box(cloth,[.083,.032,.03],[side*.079,1.93,.327],[0,0,side*.13]);
  k.cylinder(cloth,.12,.09,.65,[.38,1.33,.02],8,[0,0,.55]);
  k.box(brass,[.27,.08,.24],[.54,1.04,.06]); k.box(brass,[.27,.08,.24],[.54,.7,.06]);
  k.add(wax,new T.SphereGeometry(.09,8,8).scale(.8,1.38,.8),[.54,.86,.06]); k.build(keeper);
  keeper.visible=false;
  let entered:number|null=null, tolled=false;
  return {
    reset(){entered=null;tolled=false;keeper.visible=false;},
    update(t:number,p:Point,height:number,reduced:boolean,toll:()=>void){
      if(entered===null && p.z<-103 && p.x>-57 && p.x<-32) entered=t;
      keeper.visible=entered!==null && p.z<-99 && p.x<-30;
      if(keeper.visible){
        const phase=reduced?0:(1-Math.cos((t-entered!)*.19))*.5;
        keeper.position.set(-49+12*phase,0,-112.2);
        keeper.rotation.y=Math.atan2(p.x-keeper.position.x,p.z-keeper.position.z);
      }
      if(!tolled && p.x>end && p.x<end+s.landing && Math.abs(p.z-s.z)<s.width/2 && height>=top-.05){tolled=true;toll();}
    }
  };
}
