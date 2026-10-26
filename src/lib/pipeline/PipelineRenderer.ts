import * as THREE from 'three';
import { pipelineVertexShader, stagePreamble, presentFragmentShader } from '../../shaders/pipeline/common';
import { sourceFragmentShader } from '../../shaders/pipeline/sourceShader';
import { MAX_VIDEO_GRADIENT_STOPS, type VideoGradientStop, type VideoShaderParams } from '../types';
import { resolveAnimationValue } from '../videoPositionAnimation';
import { getShaderDefinition } from './registry';
import type { PipelineStage, StageParamValue } from './types';

const rtOptions: THREE.RenderTargetOptions = {
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
  depthBuffer: false, stencilBuffer: false,
};

interface StageMaterial { type: string; material: THREE.ShaderMaterial }

/**
 * Runs the video through: source pass -> each enabled stage in order -> present to canvas.
 * Intermediate passes ping-pong between two render targets with blending off so alpha
 * is carried through untouched; only the final present pass blends onto the canvas.
 */
export class PipelineRenderer {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private source: THREE.ShaderMaterial;
  private present: THREE.ShaderMaterial;
  private stageMaterials = new Map<string, StageMaterial>();
  private resolution = new THREE.Vector2(1, 1);

  constructor(private renderer: THREE.WebGLRenderer) {
    this.targets = [new THREE.WebGLRenderTarget(1, 1, rtOptions), new THREE.WebGLRenderTarget(1, 1, rtOptions)];
    this.scene.add(this.quad);
    const common = { uResolution: { value: this.resolution }, uTime: { value: 0 }, tInput: { value: null } };
    this.source = new THREE.ShaderMaterial({
      vertexShader: pipelineVertexShader, fragmentShader: sourceFragmentShader, blending: THREE.NoBlending, depthTest: false,
      uniforms: {
        ...common,
        uUvScale: { value: new THREE.Vector2(1, 1) },
        uPositionX: { value: 0 }, uPositionY: { value: 0 }, uPositionRotation: { value: 0 }, uPositionScale: { value: 1 },
      },
    });
    // Same transparent blending the legacy shader uses, so exports/preview composite identically.
    this.present = new THREE.ShaderMaterial({
      vertexShader: pipelineVertexShader, fragmentShader: presentFragmentShader, transparent: true, depthTest: false,
      uniforms: { tInput: { value: null } },
    });
  }

  setSize(width: number, height: number) {
    this.resolution.set(width, height);
    this.targets.forEach((t) => t.setSize(width, height));
  }

  render(params: VideoShaderParams, video: THREE.Texture, uvScale: THREE.Vector2, time: number) {
    // The Shader switch bypasses everything except gradients, matching the legacy behaviour.
    const stages = (params.pipeline ?? []).filter((s) => s.enabled && getShaderDefinition(s.type) && (params.shaderEnabled || s.type === 'gradient'));
    this.pruneMaterials(params.pipeline ?? []);
    const r = this.renderer;

    this.applySource(params, video, uvScale, time);
    let read = 0;
    this.draw(this.source, this.targets[0]);
    for (const stage of stages) {
      const mat = this.materialFor(stage);
      mat.uniforms.tInput.value = this.targets[read].texture;
      mat.uniforms.uTime.value = time;
      this.applyStageParams(mat, stage, time);
      const write = 1 - read;
      this.draw(mat, this.targets[write]);
      read = write;
    }
    this.present.uniforms.tInput.value = this.targets[read].texture;
    r.setClearColor(0x000000, 0);
    this.draw(this.present, null, true);
  }

  private draw(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = false) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  private applySource(p: VideoShaderParams, video: THREE.Texture, uvScale: THREE.Vector2, time: number) {
    const u = this.source.uniforms;
    u.tInput.value = video;
    u.uTime.value = time;
    (u.uUvScale.value as THREE.Vector2).copy(uvScale);
    const a = p.positionAnimation;
    u.uPositionX.value = resolveAnimationValue(a.horizontal, p.positionX, time);
    u.uPositionY.value = resolveAnimationValue(a.vertical, p.positionY, time);
    u.uPositionRotation.value = resolveAnimationValue(a.rotation, p.positionRotation, time);
    u.uPositionScale.value = resolveAnimationValue(a.scale, p.positionScale, time);
  }

  private materialFor(stage: PipelineStage): THREE.ShaderMaterial {
    const cached = this.stageMaterials.get(stage.id);
    if (cached && cached.type === stage.type) return cached.material;
    cached?.material.dispose();
    const def = getShaderDefinition(stage.type)!;
    const uniforms: Record<string, THREE.IUniform> = {
      tInput: { value: null }, uResolution: { value: this.resolution }, uTime: { value: 0 },
    };
    for (const [key, value] of Object.entries(def.defaults)) {
      if (Array.isArray(value)) {
        // Gradient stops: parallel arrays so GLSL can index them.
        uniforms[`u_${key}Count`] = { value: 2 };
        uniforms[`u_${key}Colors`] = { value: Array.from({ length: MAX_VIDEO_GRADIENT_STOPS }, () => new THREE.Color()) };
        uniforms[`u_${key}Opacities`] = { value: new Array(MAX_VIDEO_GRADIENT_STOPS).fill(1) };
        uniforms[`u_${key}Positions`] = { value: new Array(MAX_VIDEO_GRADIENT_STOPS).fill(1) };
      } else {
        uniforms[`u_${key}`] = { value: typeof value === 'string' ? new THREE.Color(value) : value };
      }
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: pipelineVertexShader, fragmentShader: stagePreamble + def.fragment,
      uniforms, blending: THREE.NoBlending, depthTest: false,
    });
    this.stageMaterials.set(stage.id, { type: stage.type, material });
    return material;
  }

  private applyStageParams(material: THREE.ShaderMaterial, stage: PipelineStage, time: number) {
    for (const [key, raw] of Object.entries(stage.params)) {
      if (Array.isArray(raw)) { this.applyStops(material, key, raw); continue; }
      const uniform = material.uniforms[`u_${key}`];
      if (!uniform) continue;
      let value: StageParamValue = raw;
      const range = stage.animation?.[key];
      if (typeof raw === 'number' && range) value = resolveAnimationValue(range, raw, time);
      if (typeof value === 'string') (uniform.value as THREE.Color).set(value);
      else uniform.value = value;
    }
  }

  private applyStops(material: THREE.ShaderMaterial, key: string, stops: VideoGradientStop[]) {
    const u = material.uniforms;
    if (!u[`u_${key}Count`] || stops.length === 0) return;
    u[`u_${key}Count`].value = Math.min(MAX_VIDEO_GRADIENT_STOPS, stops.length);
    for (let i = 0; i < MAX_VIDEO_GRADIENT_STOPS; i += 1) {
      const stop = stops[Math.min(i, stops.length - 1)];
      (u[`u_${key}Colors`].value as THREE.Color[])[i].set(stop.color);
      u[`u_${key}Opacities`].value[i] = stop.opacity;
      u[`u_${key}Positions`].value[i] = stop.position;
    }
  }

  private pruneMaterials(stages: PipelineStage[]) {
    if (this.stageMaterials.size <= stages.length) return;
    const live = new Set(stages.map((s) => s.id));
    for (const [id, entry] of this.stageMaterials) {
      if (!live.has(id)) { entry.material.dispose(); this.stageMaterials.delete(id); }
    }
  }

  dispose() {
    this.targets.forEach((t) => t.dispose());
    this.source.dispose();
    this.present.dispose();
    this.stageMaterials.forEach((e) => e.material.dispose());
    this.stageMaterials.clear();
    this.quad.geometry.dispose();
  }
}
