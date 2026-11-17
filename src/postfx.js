import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { BLOOM } from './config.js'

// Optional bloom, so the neon lane rails, the waterfall, the VIP gate and the
// particles glow like the reference. The scene renders into a half-float
// target (HDR, before tone mapping); the bloom pass only picks up what is
// brighter than BLOOM.threshold, which ordinary sunlit surfaces stay under,
// so materials opt in by going HDR (emissive or a colour scaled above 1).
// OutputPass then applies the renderer's tone mapping + sRGB. Off on the
// lighter graphics presets: there the plain renderer.render path is used.
// Radial "zoom" blur for speed: each pixel averages samples along the line to
// the screen centre, weighted by its distance from the centre, so the middle
// (the cart) stays sharp and the edges streak. strength 0 = pass skipped.
const SpeedBlur = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec2 toC = vec2(0.5, 0.55) - vUv;
      float edge = smoothstep(0.12, 0.75, length(toC * vec2(1.6, 1.0)));
      vec2 stepv = toC * strength * edge * 0.016;
      vec4 sum = vec4(0.0);
      for (int i = 0; i < 10; i++) sum += texture2D(tDiffuse, vUv + stepv * float(i));
      gl_FragColor = sum / 10.0;
    }`,
}

export function createPostFx(renderer, scene, camera) {
  let composer = null
  let bloom = null
  let blur = null
  let blurK = 0
  let enabled = false
  const size = new Vector2()

  function build(samples) {
    composer?.dispose()
    renderer.getSize(size)
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples })
    composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new Vector2(size.x, size.y), BLOOM.strength, BLOOM.radius, BLOOM.threshold)
    composer.addPass(bloom)
    blur = new ShaderPass(SpeedBlur)
    blur.enabled = false
    composer.addPass(blur)
    composer.addPass(new OutputPass())
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(size.x, size.y)
  }

  return {
    get bloom() {
      return bloom // for tuning from the dev console
    },
    // preset: a graphicsPreset() result (bloom + antialias decide the setup).
    configure(preset) {
      enabled = !!preset.bloom
      if (!enabled) {
        composer?.dispose()
        composer = null
        bloom = null
        blur = null
        return
      }
      build(preset.antialias ? 4 : 0)
    },
    setSize(w, h) {
      if (!composer) return
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(w, h)
    },
    // k 0..1: eased toward, so speed changes don't pop.
    setBlur(k, dt = 0.016) {
      blurK += (k - blurK) * Math.min(1, dt * 5)
      if (!blur) return
      blur.enabled = blurK > 0.02
      blur.uniforms.strength.value = blurK
    },
    render() {
      if (enabled && composer) composer.render()
      else renderer.render(scene, camera)
    },
  }
}
