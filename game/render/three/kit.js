// Kit 3D: cores da paleta, materiais compartilhados, contorno roxo e um
// construtor que junta várias peças simples numa única geometria com cores
// por vértice (um draw call por modelo, reaproveitado por todas as cópias).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK } from '../draw/primitives.js';

const colorCache = new Map();
/** Cor da paleta (hex sRGB) já convertida para o espaço linear do three. */
export function col(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

/** Contorno por "casco invertido": a malha é inflada pela normal e só as costas são desenhadas. */
function outlineMaterial(color, width) {
  const m = new THREE.MeshBasicMaterial({ color: col(color), side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: width };
    shader.vertexShader = `uniform float uOutline;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = vec3( position ) + normalize( normal ) * uOutline;',
    )}`;
  };
  m.customProgramCacheKey = () => `outline-${width}`;
  return m;
}

const lambert = (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });

// Materiais foscos compartilhados. A cor do material multiplica as cores dos
// vértices: "cansado" e "quebrado" escurecem o aparelho sem duplicar geometria.
export const MATS = {
  body: lambert(),
  tired: lambert({ color: col('#d9d3df') }),
  broken: lambert({ color: col('#9d96aa') }),
  ghost: lambert({ transparent: true, opacity: 0.62, depthWrite: false }),
  flat: new THREE.MeshLambertMaterial({ vertexColors: true }),
  outline: outlineMaterial(INK, 0.022),
  outlineThin: outlineMaterial(INK, 0.012),
  selected: outlineMaterial('#f2b13c', 0.045),
};

// ------------------------------------------------------------ construtor
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/**
 * Junta peças numa geometria só. Posições em células (1 = um quadrado da grade).
 * Opções de cada peça: x, y, z (centro), rx, ry, rz (rotação), sx, sy, sz (escala).
 */
export class Builder {
  constructor() {
    this.parts = [];
  }

  add(geo, color, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    const keep = color === null ? ['position', 'normal', 'color'] : ['position', 'normal'];
    for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    tmpE.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.order ?? 'XYZ');
    tmpQ.setFromEuler(tmpE);
    tmpS.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    tmpP.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    g.applyMatrix4(tmpM.compose(tmpP, tmpQ, tmpS));
    if (color === null) {
      this.parts.push(g);
      return this;
    }
    const c = col(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return this;
  }

  /** Caixa com a base em y (o = {x, y, z, ...}). */
  box(w, h, d, color, o = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, { ...o, y: (o.y ?? 0) + h / 2 });
  }

  /** Caixa de cantos arredondados (estilo do desenho 2D), base em y. */
  rbox(w, h, d, color, o = {}, r = 0.04) {
    const rr = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    return this.add(new RoundedBoxGeometry(w, h, d, 2, rr), color, { ...o, y: (o.y ?? 0) + h / 2 });
  }

  /** Cilindro em pé com a base em y; use rx/rz para deitar (aí y vira o centro). */
  cyl(rTop, rBot, h, color, o = {}, seg = 10) {
    const lying = o.rx || o.rz;
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, { ...o, y: (o.y ?? 0) + (lying ? 0 : h / 2) });
  }

  /** Esfera centrada em (x, y, z); sx/sy/sz achatam em elipsoide. */
  sphere(r, color, o = {}, w = 8, h = 6) {
    return this.add(new THREE.SphereGeometry(r, w, h), color, o);
  }

  cone(r, h, color, o = {}, seg = 6) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, { ...o, y: (o.y ?? 0) + h / 2 });
  }

  torus(r, tube, color, o = {}, arc = Math.PI * 2) {
    return this.add(new THREE.TorusGeometry(r, tube, 5, 14, arc), color, o);
  }

  /** Calota (parte de cima de uma esfera), usada para cabelo e boné. */
  cap(r, color, o = {}, theta = Math.PI / 2) {
    return this.add(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, theta), color, o);
  }

  /** Junta outro Builder já montado, com uma transformação extra (x, z, ry...). */
  merge(other, o = {}) {
    return this.add(other.build(), null, o);
  }

  build() {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------ malhas
const hullCache = new WeakMap();
/** Casco do contorno: mesmas posições, normais suavizadas para não abrir nas quinas. */
export function hullOf(geo) {
  let h = hullCache.get(geo);
  if (!h) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geo.attributes.position.clone());
    h = mergeVertices(g, 1e-4);
    g.dispose();
    h.computeVertexNormals();
    hullCache.set(geo, h);
  }
  return h;
}

const noRaycast = () => {};

/** Malha sólida com contorno roxo e sombra. */
export function solid(geo, { outline = MATS.outline, cast = true, receive = false, mat = MATS.body } = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  if (outline) {
    const o = new THREE.Mesh(hullOf(geo), outline);
    o.raycast = noRaycast;
    mesh.add(o);
    mesh.userData.outline = o;
  }
  return mesh;
}

export function setNoRaycast(obj) {
  obj.traverse((o) => { o.raycast = noRaycast; });
}

/** Cache simples de geometrias montadas por chave (aparelho + nível, aparência...). */
const geoCache = new Map();
export function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
