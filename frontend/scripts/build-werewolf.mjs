/** Offline authoring: smooth-union anatomy, skeleton, skin weights and groomed fur. */
import * as T from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
// GLTFExporter uses FileReader for buffers even without image assets.
globalThis.FileReader = class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(data => { this.result = data; this.onloadend?.(); }); } };
const root = new T.Group(); root.name = 'Werewolf';
const bones = [], positions = [];
function bone(name, xyz, parent) {
 const b = new T.Bone(); b.name = name; const p = new T.Vector3(...xyz); positions.push(p); bones.push(b);
 b.position.copy(p); if (parent) { b.position.sub(positions[bones.indexOf(parent)]); parent.add(b); } else root.add(b); return b;
}
const hips=bone('Hips',[0,1.05,-.1]);
const spine=bone('Spine',[0,1.55,-.14],hips);
const chest=bone('Chest',[0,2,-.1],spine);
const neck=bone('Neck',[0,2.25,.04],chest);
const head=bone('Head',[0,2.39,.27],neck);
const jaw=bone('Jaw',[0,2.26,.33],head);
const limbs={};
for(const side of [-1,1]) {
 const tag=side<0?'L':'R';
 const arm=bone('Arm'+tag,[side*.46,2,-.04],chest);
 const fore=bone('Forearm'+tag,[side*.73,1.43,.07],arm);
 const hand=bone('Hand'+tag,[side*.84,.9,.22],fore);
 const thigh=bone('Thigh'+tag,[side*.21,1.03,-.1],hips);
 const shin=bone('Shin'+tag,[side*.28,.59,.17],thigh);
 const foot=bone('Foot'+tag,[side*.27,.22,-.1],shin);
 limbs[tag]={arm,fore,hand,thigh,shin,foot};
}
root.updateMatrixWorld(true);
const skeleton=new T.Skeleton(bones);
const parts=[];
function ell(c,r){ parts.push({c,r}); }
ell([0,1.13,-.11],[.31,.3,.23]);
ell([0,1.47,-.12],[.29,.42,.21]);
ell([0,1.91,-.08],[.48,.39,.3]);
ell([0,2.13,-.16],[.34,.3,.31]); // raised shoulder/back ridge
ell([0,2.27,.1],[.23,.27,.26]);
ell([0,2.4,.29],[.205,.235,.245]);
ell([0,2.32,.49],[.145,.12,.24]); // long, narrow upper muzzle
ell([0,2.32,.64],[.107,.083,.12]);
for(const side of [-1,1]) {
 ell([side*.4,1.98,-.02],[.22,.26,.25]);
 ell([side*.59,1.72,.02],[.18,.34,.18]);
 ell([side*.73,1.42,.075],[.125,.18,.125]);
 ell([side*.78,1.17,.15],[.12,.29,.13]);
 ell([side*.84,.87,.23],[.125,.16,.11]);
 ell([side*.23,.91,-.055],[.2,.3,.22]);
 ell([side*.28,.65,.13],[.135,.17,.15]);
 ell([side*.28,.43,.03],[.09,.25,.13]);
 ell([side*.27,.22,-.085],[.082,.115,.1]);
 ell([side*.27,.12,.08],[.125,.1,.24]);
 // brow and cheekbone; ears are separate tapered geometry below.
 ell([side*.145,2.48,.4],[.112,.074,.145]);
 ell([side*.16,2.32,.35],[.11,.12,.14]);
}
const size=88, extent=3.6;
const field=new MarchingCubes(size,new T.MeshStandardMaterial(),false,false,90000);field.isolation=0;
function smoothMin(a,b,k){ const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25; }
for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
 const px=(x/size-.5)*extent, py=y/size*extent-.2,pz=(z/size-.5)*extent;
 let d=10;
 for(const {c,r} of parts){ const q=Math.hypot((px-c[0])/r[0],(py-c[1])/r[1],(pz-c[2])/r[2]); const e=(q-1)*Math.min(...r);d=smoothMin(d,e,.065); }
 field.field[z*size*size+y*size+x]=-d;
}
field.update();
const geometry=new T.BufferGeometry(); const source=field.geometry.attributes.position.array;
const count=field.count; const vertices=new Float32Array(count*3);
for(let i=0;i<count;i++){vertices[i*3]=source[i*3]*extent/2;vertices[i*3+1]=(source[i*3+1]+1)*extent/2-.2;vertices[i*3+2]=source[i*3+2]*extent/2;}
geometry.setAttribute('position',new T.BufferAttribute(vertices,3));geometry.computeVertexNormals();
const rand=(i,s=1)=>{const f=Math.sin(i*127.1+s*311.7)*43758.5453;return f-Math.floor(f);};
function influences(x,y,z){
 let a=hips,b=spine,t=T.MathUtils.clamp((y-1.15)/.4,0,1);
 const tag=x<0?'L':'R'; const l=limbs[tag];
 if(y<1.06 && Math.abs(x)>.13){a=l.thigh;b=l.shin;t=T.MathUtils.clamp((.9-y)/.35,0,1);if(y<.45){a=l.shin;b=l.foot;t=T.MathUtils.clamp((.45-y)/.2,0,1);}}
 else if(Math.abs(x)>.46 && y<2.12){a=l.arm;b=l.fore;t=T.MathUtils.clamp((1.69-y)/.36,0,1);if(y<1.15){a=l.fore;b=l.hand;t=T.MathUtils.clamp((1.17-y)/.27,0,1);}}
 else if(y>2.18){a=neck;b=head;t=T.MathUtils.clamp((y-2.18+Math.max(0,z-.2))/.23,0,1);}
 else if(y>1.55){a=spine;b=chest;t=T.MathUtils.clamp((y-1.55)/.38,0,1);}
 return {ids:[bones.indexOf(a),bones.indexOf(b),0,0],weights:[1-t,t,0,0]};
}
function skin(g){const p=g.attributes.position;const ids=[],weights=[],colors=[];for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const inf=influences(x,y,z);ids.push(...inf.ids);weights.push(...inf.weights);const shade=.045+rand(i,4)*.048+(z>.15?.018:0);colors.push(shade*1.1,shade,shade*.84);}g.setAttribute('skinIndex',new T.Uint16BufferAttribute(ids,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));}
skin(geometry);
const skinMaterial=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.9});
const body=new T.SkinnedMesh(geometry,skinMaterial);body.name='ContinuousAnatomy';root.add(body);body.bind(skeleton);body.castShadow=body.receiveShadow=true;
// Tapered, curved hair ribbons grow from the same surface and share its skeleton.
const hairPos=[],hairColor=[];const p=geometry.attributes.position,n=geometry.attributes.normal;
for(let i=0;i<19000;i++){
 const index=Math.floor(rand(i,8)*p.count);const v=new T.Vector3().fromBufferAttribute(p,index);const normal=new T.Vector3().fromBufferAttribute(n,index).normalize();
 if(v.z>.43 && v.y>2.19 || v.y<.2)continue;
 const mane=v.y>1.85&&v.y<2.4;const length=(mane?.09:.035)+rand(i,9)*(mane?.18:.095);
 const down=new T.Vector3(normal.x*.65,-.9,normal.z*.8-.15).normalize();
 const tangent=new T.Vector3().crossVectors(normal,new T.Vector3(.1,1,.2)).normalize();
 const width=.002+rand(i,10)*.005;
 const start=v.clone().addScaledVector(normal,-.008);const mid=v.clone().addScaledVector(normal,length*.3).addScaledVector(down,length*.5);const end=v.clone().addScaledVector(normal,length*.22).addScaledVector(down,length);
 const points=[start.clone().addScaledVector(tangent,-width),start.clone().addScaledVector(tangent,width),mid.clone().addScaledVector(tangent,width*.5),start.clone().addScaledVector(tangent,-width),mid.clone().addScaledVector(tangent,width*.5),mid.clone().addScaledVector(tangent,-width*.5),mid.clone().addScaledVector(tangent,-width*.5),mid.clone().addScaledVector(tangent,width*.5),end];
 const shade=.032+rand(i,12)*.1;for(const [j,q]of points.entries()){hairPos.push(q.x,q.y,q.z);const s=shade*(j===8?1.5:1);hairColor.push(s*1.08,s,s*.82);}
}
const hairGeometry=new T.BufferGeometry();hairGeometry.setAttribute('position',new T.Float32BufferAttribute(hairPos,3));hairGeometry.computeVertexNormals();skin(hairGeometry);hairGeometry.setAttribute('color',new T.Float32BufferAttribute(hairColor,3));
const hair=new T.SkinnedMesh(hairGeometry,new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.92,side:T.DoubleSide}));hair.name='GroomedFur';root.add(hair);hair.bind(skeleton);hair.castShadow=true;
const dark=new T.MeshStandardMaterial({color:'#171613',roughness:.38});const gum=new T.MeshStandardMaterial({color:'#321d1b',roughness:.35});const teeth=new T.MeshStandardMaterial({color:'#b2a183',roughness:.32});
function mesh(b,geo,mat,pos,scale){const m=new T.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);b.add(m);m.castShadow=true;return m;}
const orb=new T.SphereGeometry(1,16,12);
mesh(head,orb,dark,[0,-.07,.455],[.095,.055,.05]);
mesh(jaw,orb,gum,[0,-.025,.19],[.119,.05,.23]);
mesh(jaw,orb,new T.MeshStandardMaterial({color:'#39362d',roughness:.8}),[0,-.08,.13],[.13,.068,.21]).material.vertexColors=false;
for(const side of [-1,1]){
 mesh(head,orb,dark,[side*.163,.027,.139],[.056,.033,.055]);
 const iris=mesh(head,orb,new T.MeshStandardMaterial({color:'#947744',emissive:'#7a4615',emissiveIntensity:.35,roughness:.23}),[side*.169,.027,.18],[.021,.016,.016]);iris.rotation.y=side*.4;
 mesh(head,orb,dark,[side*.171,.027,.192],[.005,.011,.004]);
 const earGeo=new T.BufferGeometry();const xx=side*.16;
 earGeo.setAttribute('position',new T.Float32BufferAttribute([xx-.08,.13,-.02,xx+.08,.13,-.02,xx+side*.06,.44,-.09,xx-.08,.13,-.02,xx+side*.06,.44,-.09,xx,.17,-.12,xx+.08,.13,-.02,xx,.17,-.12,xx+side*.06,.44,-.09],3));earGeo.computeVertexNormals();mesh(head,earGeo,new T.MeshStandardMaterial({color:'#302e26',side:T.DoubleSide,roughness:1}),[0,0,0],[1,1,1]);
 for(let i=0;i<6;i++){
 const fang=i===3?.105:.035;
 mesh(head,new T.ConeGeometry(i===3?.025:.014,fang,9),teeth,[side*(.08+i*.004),-.13-fang*.25,.07+i*.054],[1,-1,1]);
 mesh(jaw,new T.ConeGeometry(.013,.034,8),teeth,[side*.085,.025,.07+i*.046],[1,1,1]);
 }
 const l=limbs[side<0?'L':'R'];
 for(let i=0;i<4;i++){
 const xx=(i-1.5)*.059;const curve=new T.CatmullRomCurve3([new T.Vector3(xx,-.04,.04),new T.Vector3(xx*1.15,-.17,.1),new T.Vector3(xx*1.15,-.25,.17)]);
 const finger=new T.TubeGeometry(curve,8,.028,7,false);mesh(l.hand,finger,new T.MeshStandardMaterial({color:'#39362d',roughness:.8}),[0,0,0],[1,1,1]).material.vertexColors=false;
 const claw=new T.CatmullRomCurve3([new T.Vector3(xx*1.15,-.24,.17),new T.Vector3(xx*1.15,-.3,.2),new T.Vector3(xx*1.15,-.34,.26)]);
 const clawGeo=new T.TubeGeometry(claw,9,.016,7,false);const cp=clawGeo.attributes.position;
 for(let j=0;j<cp.count;j++){const row=Math.floor(j/8);const center=claw.getPointAt(Math.min(1,row/9));const factor=1-row/9;cp.setXYZ(j,center.x+(cp.getX(j)-center.x)*factor,center.y+(cp.getY(j)-center.y)*factor,center.z+(cp.getZ(j)-center.z)*factor);}clawGeo.computeVertexNormals();mesh(l.hand,clawGeo,teeth,[0,0,0],[1,1,1]);
 }
}
root.updateMatrixWorld(true);
const buffer=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});
await writeFile(new URL('../public/exploration/werewolf.glb',import.meta.url),Buffer.from(buffer));
console.log(JSON.stringify({bytes:buffer.byteLength,bodyTriangles:count/3,furTriangles:hairPos.length/9,bones:bones.length}));
