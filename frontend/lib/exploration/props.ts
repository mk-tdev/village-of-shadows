import * as THREE from "three";
import { LANDMARKS } from "./world";

/** Small, supported keepsakes with physical materials, never floating quest markers. */
export function createKeepsakes(scene: THREE.Scene, timber: THREE.Material) {
  const patina = document.createElement("canvas"); patina.width = patina.height = 128;
  const ctx = patina.getContext("2d")!;
  ctx.fillStyle = "#8d7852"; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2200; i++) {
    const n = (Math.sin(i * 42.71) + 1) / 2;
    ctx.fillStyle = i % 3 ? `rgba(30,49,40,${n * .5})` : `rgba(197,171,112,${n * .6})`;
    ctx.fillRect((i * 37) % 128, (i * 53) % 127, 1 + n * 5, 1 + n * 2);
  }
  const map = new THREE.CanvasTexture(patina); map.colorSpace = THREE.SRGBColorSpace;
  const brass = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .003, color: "#a9a088", roughness: .73, metalness: .65 });
  const rust = new THREE.MeshStandardMaterial({ map, color: "#554133", roughness: .85, metalness: .38 });
  const wax = new THREE.MeshStandardMaterial({ color: "#562922", roughness: .86 });
  const paper = new THREE.MeshStandardMaterial({ color: "#b2a489", roughness: 1, map, bumpMap: map, bumpScale: .002 });
  const leather = new THREE.MeshStandardMaterial({ color: "#473d2c", roughness: 1 });
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x=0, y=0, z=0) {
    const item = new THREE.Mesh(geometry, material); item.position.set(x,y,z); item.castShadow = item.receiveShadow = true; parent.add(item); return item;
  }
  const groups = LANDMARKS.map(() => { const g = new THREE.Group(); scene.add(g); return g; });
  // Letter lies on a weathered crate beside the lantern.
  mesh(scene, new THREE.BoxGeometry(.68,.62,.48), timber, -2.6,.31,13.8);
  for (const x of [-2.88,-2.32]) mesh(scene,new THREE.BoxGeometry(.055,.65,.5),timber,x,.325,13.8);
  groups[0].position.set(-2.6,.64,13.8); groups[0].rotation.y = -.23;
  const letter = mesh(groups[0],new THREE.BoxGeometry(.33,.012,.23),paper); letter.rotation.z = -.015;
  mesh(groups[0],new THREE.BoxGeometry(.018,.017,.245),leather,0,.01,0);
  mesh(groups[0],new THREE.CylinderGeometry(.038,.041,.008,24),wax,.02,.024,.015);
  // Heavy iron key rests flat on the well rim, with a shank and cut teeth.
  groups[1].position.set(2.5,1.13,-2.02); groups[1].rotation.y = .65;
  const bow=mesh(groups[1],new THREE.TorusGeometry(.052,.011,10,32),rust,-.10,0,0); bow.rotation.x=Math.PI/2;
  const stem=mesh(groups[1],new THREE.CylinderGeometry(.012,.014,.19,12),rust,.018,0,0); stem.rotation.z=Math.PI/2;
  mesh(groups[1],new THREE.BoxGeometry(.052,.021,.05),rust,.09,0,.024);
  mesh(groups[1],new THREE.BoxGeometry(.012,.023,.021),rust,.075,0,.054);
  mesh(groups[1],new THREE.BoxGeometry(.012,.023,.025),rust,.105,0,.055);
  // A tarnished stamped medallion hangs against a timber board beside the chapel.
  mesh(scene,new THREE.BoxGeometry(.36,.48,.055),timber,-1.8,1.16,-23.2);
  groups[2].position.set(-1.8,1.1,-23.16);
  const coin=mesh(groups[2],new THREE.CylinderGeometry(.075,.075,.012,48),brass); coin.rotation.x=Math.PI/2;
  const edge=mesh(groups[2],new THREE.TorusGeometry(.065,.003,6,48),rust,0,0,.01);
  edge.rotation.z=.1;
  mesh(groups[2],new THREE.BoxGeometry(.022,.074,.005),rust,0,0,.011);
  mesh(groups[2],new THREE.BoxGeometry(.065,.018,.005),rust,0,.015,.012);
  mesh(groups[2],new THREE.CylinderGeometry(.004,.004,.18,8),leather,0,.15,0);
  return groups;
}
