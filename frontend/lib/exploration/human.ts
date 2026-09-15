import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Lee Perry-Smith's attributed head scan, fitted into the authored clothing rig. */
export function loadHumanFaces(heads: THREE.Group[], loading: THREE.LoadingManager, onError: () => void) {
  let disposed = false;
  const textureLoader = new THREE.TextureLoader(loading);
  const color = textureLoader.load('/exploration/watchman/skin.jpg'); color.colorSpace=THREE.SRGBColorSpace; color.flipY=false;
  const normal = textureLoader.load('/exploration/watchman/normal.jpg'); normal.flipY=false;
  const material = new THREE.MeshStandardMaterial({map:color,normalMap:normal,normalScale:new THREE.Vector2(.6,.6),roughness:.83,color:'#b4afa2'});
  new GLTFLoader(loading).load('/exploration/watchman/head.glb', gltf => {
    if (disposed) { gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh) {o.geometry.dispose(); if(!Array.isArray(o.material))o.material.dispose();}}); return; }
    const source = gltf.scene.getObjectByName('LeePerrySmith') as THREE.Mesh;
    if (!source) { onError(); return; }
    const geometry = source.geometry;
    // Trim the scanned shoulders beneath a raised coat collar, retaining face/neck detail.
    const positions=geometry.getAttribute('position'), index=geometry.index!; const triangles:number[]=[];
    for(let i=0;i<index.count;i+=3) {
      const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
      if(Math.max(positions.getY(a),positions.getY(b),positions.getY(c))> -1.35) triangles.push(a,b,c);
    }
    geometry.setIndex(triangles);
    if (!Array.isArray(source.material)) source.material.dispose();
    heads.forEach((head,i)=>{
      head.clear();
      const face=new THREE.Mesh(geometry,material); face.scale.setScalar(.064); face.position.set(0,-.12,-.045);
      face.castShadow=face.receiveShadow=true; head.add(face);
      // A close-fitting cap gives the witness a different silhouette; no spherical proxy head.
      if(i===1) { const cap=new THREE.Mesh(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI*.47),new THREE.MeshStandardMaterial({color:'#302f2a',roughness:1}));cap.scale.set(.128,.092,.145);cap.position.set(0,.075,-.033);head.add(cap); }
    });
  },undefined,()=>{if(!disposed)onError();});
  return () => { disposed=true; color.dispose();normal.dispose();material.dispose(); };
}

export function coatTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d')!;context.fillStyle='#72746a';context.fillRect(0,0,256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
    const n=(Math.sin(x*73.1+y*27.7)+1)/2;
    context.fillStyle=`rgba(${x%2?20:170},${x%2?23:166},${x%2?21:148},${.06+n*.18})`;context.fillRect(x,y,1,1);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,3);return texture;
}
