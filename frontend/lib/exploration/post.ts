import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

/**
 * Grade runs after tone mapping (OutputPass) in display space: split-tone
 * shadows teal and highlights amber, lift blacks slightly, vignette, film
 * grain, edge chromatic aberration, and a red "danger" pulse during the hunt.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null }, time: { value: 0 }, danger: { value: 0 }, grain: { value: 1 },
    resolution: { value: new THREE.Vector2(1, 1) }, fade: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float danger; uniform float grain; uniform float fade; uniform vec2 resolution; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5; float r = length(c);
      float ca = (.0016 + danger * .004) * r;
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ca).b);
      float l = dot(col, vec3(.2126, .7152, .0722));
      vec3 shadowTint = vec3(.86, 1.0, 1.06), highTint = vec3(1.08, 1.0, .88);
      col *= mix(shadowTint, highTint, smoothstep(.05, .6, l));
      col = mix(vec3(l), col, .88 - danger * .35);
      col = col * .97 + vec3(.008, .011, .013);
      col = mix(col, col * vec3(1.25, .55, .5), danger * (.25 + .15 * sin(time * 5.5)));
      float v = smoothstep(.95, .28, r * (1. + danger * .25));
      col *= mix(.38, 1., v);
      col += (rand(vUv * resolution + fract(time * 17.)) - .5) * .045 * grain;
      col *= 1. - fade;
      gl_FragColor = vec4(col, 1.);
    }`,
};

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: "high" | "low") {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality === "high" ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .55, .5, .78);
  if (quality === "high") composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const smaa = quality === "low" ? new SMAAPass() : null;
  if (smaa) composer.addPass(smaa);
  return {
    grade: grade.uniforms as typeof GradeShader.uniforms,
    bloom,
    setSize(width: number, height: number, ratio: number) {
      composer.setPixelRatio(ratio); composer.setSize(width, height);
      grade.uniforms.resolution.value.set(width * ratio, height * ratio);
    },
    render(dt: number) { composer.render(dt); },
    dispose() { composer.dispose(); target.dispose(); bloom.dispose(); grade.dispose(); smaa?.dispose(); },
  };
}
