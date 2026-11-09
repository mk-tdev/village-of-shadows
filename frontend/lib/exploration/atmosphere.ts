import * as THREE from "three";
import type { Glow } from "./architecture";

const seeded = (i: number, salt = 1) => ((Math.sin(i * 127.1 + salt * 311.7) * 43758.5453) % 1 + 1) % 1;
export const MOON_DIRECTION = new THREE.Vector3(.32, .42, -1).normalize();
export const FOG_COLOR = new THREE.Color("#26343b");
/** Daytime: a high late-morning sun and a pale, slightly hazy horizon. */
export const SUN_DIRECTION = new THREE.Vector3(.45, .78, -.42).normalize();
export const DAY_FOG_COLOR = new THREE.Color("#a3bfd2");

function softSprite(size = 128) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.25, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Sky, weather, smoke, light halos and lightning. Cheap enough to always run. */
export function createAtmosphere(scene: THREE.Scene, glows: Glow[], chimneys: THREE.Vector3[]) {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => { disposables.push(d); return d; };
  const uniforms = { time: { value: 0 }, flash: { value: 0 }, moonDir: { value: MOON_DIRECTION }, sunDir: { value: SUN_DIRECTION }, horizon: { value: FOG_COLOR.clone() }, day: { value: 0 } };

  // Sky dome: gradient, fbm clouds lit from behind by the moon, stars in the gaps.
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(400, 48, 24)), track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir; uniform float time; uniform float flash; uniform vec3 moonDir; uniform vec3 sunDir; uniform vec3 horizon; uniform float day;
      float hash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= .5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -.2, 1.);
        vec3 zenith = vec3(.012, .02, .032);
        vec3 col = mix(horizon * 1.05, zenith, pow(smoothstep(-.02, .55, h), .7));
        float m = max(dot(d, moonDir), 0.);
        col += vec3(.55, .66, .74) * (pow(m, 18.) * .35 + pow(m, 260.) * .9);
        float disc = smoothstep(.99955, .99975, m);
        // Stars only where clouds are thin.
        vec3 sp = d * 220.;
        float star = step(.9965, hash(floor(sp))) * smoothstep(.0, .25, h);
        vec2 cuv = d.xz / max(d.y + .12, .05);
        float c = fbm(vec3(cuv * .55 + vec2(time * .006, time * .002), time * .004));
        float clouds = smoothstep(.42, .78, c) * smoothstep(-.02, .2, h);
        float lit = pow(m, 6.) * .9 + .12;
        col = mix(col + star * vec3(.8, .85, 1.) * .7, mix(vec3(.05, .065, .08), vec3(.35, .42, .48), lit), clouds * .92);
        col += disc * vec3(.86, .9, .92) * (1. - clouds * .85);
        col += flash * vec3(.55, .62, .75) * (.4 + clouds);
        // Daytime sky: blue zenith, hazy horizon, sun glow and white, sun-lit cumulus.
        if (day > 0.) {
          float s = max(dot(d, sunDir), 0.);
          vec3 sky = mix(horizon * 1.2, vec3(.09, .28, .68), pow(smoothstep(-.02, .5, h), .75));
          sky += vec3(1., .86, .62) * (pow(s, 8.) * .25 + pow(s, 90.) * .6) + vec3(1., .97, .9) * smoothstep(.9993, .9996, s) * 4.;
          float dc = smoothstep(.5, .8, c) * smoothstep(-.02, .2, h);
          vec3 cloud = mix(vec3(.62, .66, .72), vec3(1.08, 1.05, 1.), smoothstep(.5, .9, c) * .6 + pow(s, 4.) * .4);
          sky = mix(sky, cloud, dc * .85);
          col = mix(col, sky, day);
        }
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // Rain streaks follow the camera inside a box; each streak's fall is computed in the shader.
  const rainCount = 2600;
  const rainGeo = track(new THREE.BufferGeometry());
  // Both ends of a streak share one anchor; wrapping is applied to the anchor so a
  // streak can never straddle the box edge and stretch across the sky.
  const rp = new Float32Array(rainCount * 2 * 3), ro = new Float32Array(rainCount * 2 * 3), rs = new Float32Array(rainCount * 2);
  for (let i = 0; i < rainCount; i++) {
    const x = (seeded(i, 1) - .5) * 40, y = seeded(i, 2) * 20, z = (seeded(i, 3) - .5) * 40;
    rp.set([x, y, z, x, y, z], i * 6); ro.set([0, 0, 0, .04, -.45, .02], i * 6); rs.set([seeded(i, 4), seeded(i, 4)], i * 2);
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3)); rainGeo.setAttribute("offset", new THREE.BufferAttribute(ro, 3)); rainGeo.setAttribute("seed", new THREE.BufferAttribute(rs, 1));
  const rainUniforms = { time: uniforms.time, center: { value: new THREE.Vector3() }, flash: uniforms.flash };
  const rain = new THREE.LineSegments(rainGeo, track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: rainUniforms,
    vertexShader: `attribute float seed; attribute vec3 offset; uniform float time; uniform vec3 center; varying float vFade;
      void main(){ vec3 p = position; p.y = mod(p.y - time * (13. + seed * 4.), 20.) - 4.;
        p.x = center.x + mod(p.x - center.x + 20., 40.) - 20.; p.z = center.z + mod(p.z - center.z + 20., 40.) - 20.;
        p += offset;
        vec4 mv = modelViewMatrix * vec4(p, 1.); vFade = smoothstep(26., 2., -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vFade; uniform float flash; void main(){ gl_FragColor = vec4(vec3(.62, .7, .76) * (1. + flash * 2.), .2 * vFade); }`,
  })));
  rain.frustumCulled = false; scene.add(rain);

  // Chimney smoke: soft sprites rising, spreading and fading.
  const sprite = track(softSprite());
  const perChimney = 14;
  const smokeGeo = track(new THREE.BufferGeometry());
  const sp = new Float32Array(chimneys.length * perChimney * 3), ss = new Float32Array(chimneys.length * perChimney);
  chimneys.forEach((c, j) => { for (let i = 0; i < perChimney; i++) { sp.set([c.x, c.y, c.z], (j * perChimney + i) * 3); ss[j * perChimney + i] = i / perChimney + seeded(j, 5) * .1; } });
  smokeGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3)); smokeGeo.setAttribute("seed", new THREE.BufferAttribute(ss, 1));
  const smoke = new THREE.Points(smokeGeo, track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { time: uniforms.time, map: { value: sprite }, flash: uniforms.flash },
    vertexShader: `attribute float seed; uniform float time; varying float vAge;
      void main(){ float age = fract(seed + time * .05); vAge = age; vec3 p = position;
        p.y += age * 7.; p.x += age * age * 4. + sin(time * .7 + seed * 20.) * age * .6; p.z += sin(seed * 31.) * age * 1.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = (90. + age * 380.) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float flash; varying float vAge;
      void main(){ float a = texture2D(map, gl_PointCoord).a * smoothstep(0., .12, vAge) * (1. - vAge) * .2;
        gl_FragColor = vec4(vec3(.42, .46, .48) * (1. + flash), a); }`,
  })));
  smoke.frustumCulled = false; scene.add(smoke);

  // Halos around lamps, windows and the forge read as light scattering in the wet air.
  const halos: THREE.Sprite[] = [];
  for (const g of glows) {
    const s = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: sprite, color: g.color, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending })));
    s.position.copy(g.position); s.scale.setScalar(g.size); scene.add(s); halos.push(s);
  }

  // Low ground mist drifting between the houses.
  const mist: THREE.Sprite[] = [];
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: sprite, color: "#8fa4aa", transparent: true, opacity: .08 + seeded(i, 7) * .07, depthWrite: false })));
    s.position.set(-34 + seeded(i, 8) * 72, .5 + seeded(i, 9) * 1.2, -54 + seeded(i, 10) * 80);
    s.scale.set(14 + seeded(i, 11) * 10, 2.5 + seeded(i, 12) * 2.5, 1);
    scene.add(s); mist.push(s);
  }

  let nextFlash = 25, flashStart = -10;
  return {
    uniforms,
    /** Returns lightning brightness (0..1) so the caller can lift scene lights in sync. */
    update(time: number, camera: THREE.Camera, reduced: boolean, onThunder: (delay: number, strength: number) => void, shelter = 0, day = 0) {
      uniforms.time.value = time;
      uniforms.day.value = day;
      uniforms.horizon.value.copy(FOG_COLOR).lerp(DAY_FOG_COLOR, day);
      halos.forEach(s => { s.material.opacity = .16 * (1 - day * .85); });
      mist.forEach((s, i) => { s.material.opacity = (.08 + seeded(i, 7) * .07) * (1 - day * .6); });
      sky.position.copy(camera.position);
      rainUniforms.center.value.copy(camera.position);
      rain.visible = !reduced && shelter < .35 && day < .5;
      mist.forEach((s, i) => { if (!reduced) s.position.x += Math.sin(time * .05 + i) * .004; });
      let flash = 0;
      // Clear days have no storm: lightning waits until night falls again.
      if (day > .5) nextFlash = Math.max(nextFlash, time + 8);
      if (!reduced && day <= .5) {
        if (time > nextFlash) {
          flashStart = time; nextFlash = time + 35 + seeded(Math.floor(time), 3) * 50;
          const strength = .5 + seeded(Math.floor(time), 4) * .5;
          onThunder(1.2 + seeded(Math.floor(time), 5) * 2.5, strength);
        }
        const e = time - flashStart;
        // Two quick strokes and a fading after-glow; photosensitivity-safe (no rapid repeats).
        flash = e < 0 ? 0 : (e < .08 ? 1 : e < .16 ? .2 : e < .26 ? .7 : Math.max(0, .7 - (e - .26) * 2.2)) * .55;
      }
      uniforms.flash.value = flash;
      return flash;
    },
    dispose() {
      [sky, rain, smoke, ...halos, ...mist].forEach(o => scene.remove(o));
      disposables.forEach(d => d.dispose());
    },
  };
}
