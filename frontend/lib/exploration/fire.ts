import * as THREE from "three";

/** Layered turbulent flames with a coal bed; no solid flame geometry. */
export function createCouncilFire(scene: THREE.Scene, z: number) {
  const group = new THREE.Group(); group.position.z = z; scene.add(group);
  const char = new THREE.MeshStandardMaterial({ color: "#211c18", roughness: 1 });
  const rock = new THREE.MeshStandardMaterial({ color: "#4c4a43", roughness: 1 });
  const coal = new THREE.MeshStandardMaterial({ color: "#54200b", emissive: "#f94608", emissiveIntensity: 1.5, roughness: .9 });
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.24, 1), rock);
    stone.position.set(Math.sin(a) * 1.08, .14, Math.cos(a) * 1.08);
    stone.scale.set(1.2, .7, 1); stone.rotation.set(i, i * 2, .1); stone.castShadow = true; group.add(stone);
  }
  for (let i = 0; i < 6; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(.115, .15, 1.55, 9), char);
    log.rotation.set(Math.PI / 2, 0, i * 1.08); log.position.set(Math.sin(i) * .18, .18 + i % 2 * .15, Math.cos(i) * .16); log.castShadow = true; group.add(log);
    const ember = new THREE.Mesh(new THREE.DodecahedronGeometry(.16, 1), coal);
    ember.position.set(Math.sin(i * 2.4) * .45, .12, Math.cos(i * 2.4) * .45); ember.scale.set(1.4, .4, 1); group.add(ember);
  }
  const uniforms = { time: { value: 0 } };
  const flameMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.57+noise(p*2.07)*.28+noise(p*4.13)*.15;}
      void main(){
        vec2 uv=vUv; float y=uv.y;
        float turbulence=fbm(vec2(uv.x*5.,y*5.-time*2.5));
        float sway=sin(y*8.-time*2.)*.07*y+sin(y*15.+time)*.03;
        float x=abs(uv.x-.5+sway);
        float width=.38*pow(1.-y,1.1);
        float tongue=fbm(vec2(uv.x*8.,y*3.-time*1.8));
        float density=(width-x)+(turbulence-.5)*.24-(y*y)*.06;
        float a=smoothstep(-.07,.09,density)*smoothstep(0.,.08,y)*(1.-smoothstep(.55,1.,y+ (tongue-.5)*.36));
        vec3 color=mix(vec3(1.,.11,.012),vec3(1.,.57,.08),smoothstep(.0,.26,density));
        color=mix(color,vec3(1.,.88,.48),smoothstep(.12,.32,density)*(1.-y));
        gl_FragColor=vec4(color*1.5,a*.62);
      }`,
  });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const height = 1.4 + i % 3 * .28;
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(1.35, height), flameMaterial);
    flame.position.set(Math.sin(i * 2.4) * .27, height / 2 + .16, Math.cos(i * 2.4) * .24);
    group.add(flame); flames.push(flame);
  }
  const sparkGeo = new THREE.BufferGeometry(); const positions = new Float32Array(48 * 3);
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: "#ffac3f", size: .025, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending })); group.add(sparks);
  const light = new THREE.PointLight("#ffa346", 30, 17, 1.7); light.position.y = 1.1; group.add(light);
  return { update(time: number, camera: THREE.Camera, reduced: boolean) {
    uniforms.time.value = reduced ? 1.7 : time;
    flames.forEach(flame => { flame.quaternion.copy(camera.quaternion); });
    sparks.visible = !reduced;
    for (let i = 0; i < 48; i++) {
      const age = (time * .37 + i * .618) % 1;
      positions[i * 3] = Math.sin(i * 8.3 + age * 3) * (.18 + age * .5);
      positions[i * 3 + 1] = .2 + age * 3.2;
      positions[i * 3 + 2] = Math.cos(i * 7.1 + age * 2) * (.18 + age * .5);
    }
    sparkGeo.attributes.position.needsUpdate = true;
    light.intensity = reduced ? 30 : 29 + Math.sin(time * 8) * 2 + Math.sin(time * 13.7) * 1.7;
  } };
}
