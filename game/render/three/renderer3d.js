// Renderizador 3D (Three.js). Mesma interface do renderizador 2D: lê o estado
// do jogo (store) e nunca o altera. A cena é sincronizada por diferença: só o
// que mudou é recriado (terreno, paredes, aparelhos); bonecos e animações só
// mudam de posição a cada quadro. Textos (balões, valores, rótulos) vão numa
// camada 2D por cima, projetados da cena, com o mesmo desenho de antes.
import * as THREE from 'three';
import { CONFIG, getEquipmentDef } from '../../config.js';
import {
  COLS, ROWS, DOOR, footprintSize, footprintCells, frontCells, zoneAtCell, allZones, zoneById, buildUnlockedMask, isUnlocked,
} from '../../grid/grid.js';
import { conditionState, hasWear, CONDITION_STATES } from '../../systems/maintenance.js';
import { placementPreview } from '../../engine/store.js';
import { SceneDirector } from '../director.js';
import { floorOf, BLOCK_TINT, eraLook } from '../look.js';
import {
  PALETTE as P, INK, FONT_UI, FONT_TITLE, box, circle, line, speechBubble,
} from '../draw/primitives.js';
import { formatMoney } from '../../utils/format.js';
import { Builder, MATS, solid, col, setNoRaycast } from './kit.js';
import {
  makeEquipment, makePerson, posePerson, setMood, makeCleaner, poseCleaner, makeWhey, poseWhey,
} from './models.js';
import { USE_SPOT } from './moreEquipment.js';

const T = CONFIG.grid.tileSize;
const PI = Math.PI;
const GRASS = '#cfe6c0';
const LOCKED = '#c3dfb2';
const WALL_H = 0.85;
const WALL_LOW = 0.24;
const WALL_T = 0.16;
const FLOOR_Y = 0.02;

// Câmera elevada em ângulo (isométrica), olhando da rua para dentro da academia.
const AZIMUTH = THREE.MathUtils.degToRad(30);
const ELEVATION = THREE.MathUtils.degToRad(50);
const VIEW_DIR = new THREE.Vector3(
  Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION),
);
// Sol vindo da frente-esquerda: faces viradas para a câmera ficam claras e a sombra cai para trás.
const SUN_DIR = new THREE.Vector3(-0.5, 1, 0.55).normalize();
const HEMI_I = 2.0;
const SUN_I = 1.5;
// Zoom em pixels por célula (o 2D usava 48 px por célula no zoom 1).
const MIN_ZOOM = 9;
const MAX_ZOOM = 130;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Direção da frente do aparelho no mundo (mesma regra de frontCells). */
const FRONT = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/** Gira um ponto do modelo (frente +z) para a rotação do item no mundo. */
function rotateLocal(lx, lz, rot) {
  const a = (-rot * Math.PI) / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [lx * c + lz * s, -lx * s + lz * c];
}
/** Direções dos lados do modelo (-x, +x, -z, +z) giradas para o mundo. */
function sideDir(side, rot) {
  const [mx, mz] = [[-1, 0], [1, 0], [0, -1], [0, 1]][side];
  let x = mx;
  let z = mz;
  for (let i = 0; i < rot; i++) [x, z] = [-z, x];
  return [x, z];
}

const world = () => ({ x0: -0.6, z0: -0.6, x1: COLS + 0.6, z1: ROWS + 2.2 });

// Peças auxiliares (moldura, ladrilhos) reaproveitam uma caixa unitária.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_TILE = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2);
const basicCache = new Map();
function basic(color, opacity = 1) {
  const key = `${color}|${opacity}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: col(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    basicCache.set(key, m);
  }
  return m;
}

function frame(x0, z0, w, h, mat, { thick = 0.06, y = 0.04, height = 0.03 } = {}) {
  const g = new THREE.Group();
  const bars = [
    [x0 + w / 2, z0, w + thick, thick], [x0 + w / 2, z0 + h, w + thick, thick],
    [x0, z0 + h / 2, thick, h], [x0 + w, z0 + h / 2, thick, h],
  ];
  for (const [x, z, sx, sz] of bars) {
    const m = new THREE.Mesh(UNIT_BOX, mat);
    m.position.set(x, y + height / 2, z);
    m.scale.set(sx, height, sz);
    g.add(m);
  }
  setNoRaycast(g);
  return g;
}

function tile(x, z, mat, inset = 0.06, y = 0.035) {
  const m = new THREE.Mesh(UNIT_TILE, mat);
  m.position.set(x + 0.5, y, z + 0.5);
  m.scale.set(1 - inset * 2, 1, 1 - inset * 2);
  m.raycast = () => {};
  return m;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.userData.ownGeometry) o.geometry?.dispose();
    if (o.userData.ownMaterial) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}

export class Renderer3D extends SceneDirector {
  /**
   * @param {HTMLCanvasElement} canvas  canvas do WebGL
   * @param {HTMLCanvasElement} overlay canvas 2D transparente por cima (textos)
   */
  constructor(canvas, overlay, game) {
    super(game);
    this.canvas = canvas;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    // Lança erro se o navegador não tiver WebGL: quem chama cai para o 2D.
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.viewport = { w: 1, h: 1, dpr: 1 };
    this.cam = { zoom: T, target: new THREE.Vector3() };
    this.userMovedCamera = false;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmp = new THREE.Vector3();

    const scene = new THREE.Scene();
    scene.background = col(GRASS);
    this.scene = scene;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);

    this.hemi = new THREE.HemisphereLight(0xffffff, col('#dfe8d6'), HEMI_I);
    this.sun = new THREE.DirectionalLight(0xffffff, SUN_I);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.intensity = 0.55;
    scene.add(this.hemi, this.sun, this.sun.target);

    const grass = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-PI / 2), new THREE.MeshLambertMaterial({ color: col(GRASS) }));
    grass.position.y = -0.03;
    grass.receiveShadow = true;
    scene.add(grass);
    this.grass = grass;

    this.terrainRoot = new THREE.Group();
    this.itemsRoot = new THREE.Group();
    this.itemsRoot.position.y = FLOOR_Y;
    this.actorsRoot = new THREE.Group();
    this.actorsRoot.position.y = FLOOR_Y;
    this.helpersRoot = new THREE.Group();
    scene.add(this.terrainRoot, this.itemsRoot, this.actorsRoot, this.helpersRoot);

    this.terrainKey = null;
    this.zoneSigns = [];
    this.itemViews = new Map();
    this.dirtViews = new Map();
    this.personViews = new Map();
    this.staffViews = new Map();
    this.selectionKey = null;
    this.previewKey = null;

    this.wheyRig = makeWhey();
    this.wheyRig.root.position.set(this.whey.x / T, 0, this.whey.y / T);
    this.actorsRoot.add(this.wheyRig.root);
    this.wheyHeading = 0;

    this.smokeMat = new THREE.MeshLambertMaterial({ color: col('#8c8796'), transparent: true, opacity: 0.45, depthWrite: false });
    this.smokeGeo = new THREE.IcosahedronGeometry(0.12, 0);

    const pGeo = new THREE.BoxGeometry(1, 1, 1);
    this.particleMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial(), 600);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.particleMesh.raycast = () => {};
    scene.add(this.particleMesh);
    this.pDummy = new THREE.Object3D();
    this.pColor = new THREE.Color();

    this.gridLines = null;
    this.glow = null;

    // Fontes do jogo podem chegar depois do primeiro quadro: redesenha as placas.
    document.fonts?.ready?.then(() => { this.terrainKey = null; });
  }

  dispose() {
    this.disposed = true;
    for (const v of this.itemViews.values()) disposeTree(v.group);
    disposeTree(this.terrainRoot);
    if (this.inaug) disposeTree(this.inaug.group);
    this.gl.dispose();
  }

  // ------------------------------------------------------------ câmera
  resize(w, h, dpr) {
    this.viewport = { w, h, dpr };
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
    this.overlay.width = Math.round(w * dpr);
    this.overlay.height = Math.round(h * dpr);
    if (!this.userMovedCamera) this.fit();
    else this.clampCamera();
  }

  updateCamera() {
    const { w, h } = this.viewport;
    const z = this.cam.zoom;
    const c = this.camera;
    c.left = -w / 2 / z;
    c.right = w / 2 / z;
    c.top = h / 2 / z;
    c.bottom = -h / 2 / z;
    c.position.copy(this.cam.target).addScaledVector(VIEW_DIR, 200);
    c.lookAt(this.cam.target);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    // A sombra acompanha a área visível.
    const span = clamp((Math.max(w, h / Math.sin(ELEVATION)) / z) * 0.62, 8, 90);
    const sc = this.sun.shadow.camera;
    sc.left = -span;
    sc.right = span;
    sc.top = span;
    sc.bottom = -span;
    sc.near = 1;
    sc.far = 160;
    sc.updateProjectionMatrix();
    this.sun.position.copy(this.cam.target).addScaledVector(SUN_DIR, 70);
    this.sun.target.position.copy(this.cam.target);
    this.sun.target.updateMatrixWorld();
  }

  fit() {
    const { w, h } = this.viewport;
    const W = world();
    this.cam.target.set((W.x0 + W.x1) / 2, 0, (W.z0 + W.z1) / 2);
    this.cam.zoom = 1;
    this.updateCamera();
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const x of [W.x0, W.x1]) {
      for (const z of [W.z0, W.z1]) {
        for (const y of [0, WALL_H]) {
          const v = this.tmp.set(x, y, z).applyMatrix4(inv);
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
        }
      }
    }
    this.cam.zoom = clamp(Math.min(w / (maxX - minX), h / (maxY - minY)) * 0.96, MIN_ZOOM, T * 2.5);
    // Centraliza o retângulo projetado e devolve o alvo ao chão.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const p = this.cam.target.clone().addScaledVector(right, (minX + maxX) / 2).addScaledVector(up, (minY + maxY) / 2);
    p.addScaledVector(VIEW_DIR, -p.y / VIEW_DIR.y);
    this.cam.target.copy(p);
    this.fittedSize = `${COLS}x${ROWS}`;
    this.updateCamera();
  }

  resetCamera() {
    this.userMovedCamera = false;
    this.fit();
  }

  clampCamera() {
    const W = world();
    this.cam.target.x = clamp(this.cam.target.x, W.x0, W.x1);
    this.cam.target.z = clamp(this.cam.target.z, W.z0, W.z1);
    this.cam.target.y = 0;
    this.updateCamera();
  }

  followWorldGrowth() {
    if (this.refitCamera) {
      this.refitCamera = false;
      this.userMovedCamera = false;
      this.fittedSize = null;
    }
    if (this.fittedSize === `${COLS}x${ROWS}`) return;
    if (!this.userMovedCamera) this.fit();
    else {
      this.fittedSize = `${COLS}x${ROWS}`;
      this.clampCamera();
    }
  }

  /** Ponto do chão sob a posição da tela (px CSS). */
  groundAt(sx, sy, out = new THREE.Vector3()) {
    this.setRay(sx, sy);
    return this.raycaster.ray.intersectPlane(this.ground, out);
  }

  setRay(sx, sy) {
    const { w, h } = this.viewport;
    this.ndc.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  zoomAt(sx, sy, factor) {
    const before = this.groundAt(sx, sy);
    this.cam.zoom = clamp(this.cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.updateCamera();
    const after = this.groundAt(sx, sy);
    if (before && after) this.cam.target.add(before.sub(after));
    this.userMovedCamera = true;
    this.clampCamera();
  }

  pan(dx, dy) {
    const { w, h } = this.viewport;
    const a = this.groundAt(w / 2, h / 2);
    const b = this.groundAt(w / 2 + dx, h / 2 + dy);
    if (a && b) this.cam.target.add(a.sub(b));
    this.userMovedCamera = true;
    this.clampCamera();
  }

  /** Projeta um ponto do mundo para px CSS da tela. */
  toScreen(x, y, z) {
    const v = this.tmp.set(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.viewport.w, y: ((1 - v.y) / 2) * this.viewport.h };
  }

  // ------------------------------------------------------------ seleção
  /** Aparelho sob o cursor (raycast nas malhas), com a célula do aparelho atingida. */
  pickItem(sx, sy) {
    this.setRay(sx, sy);
    const groups = [];
    for (const v of this.itemViews.values()) if (v.group.visible) groups.push(v.group);
    const hits = this.raycaster.intersectObjects(groups, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && o.userData.itemId === undefined) o = o.parent;
      if (!o) continue;
      const item = this.game.state.items.find((i) => i.id === o.userData.itemId);
      if (!item) continue;
      const { w, h } = footprintSize(item.type, item.rot);
      const cell = {
        x: clamp(Math.floor(hit.point.x), item.x, item.x + w - 1),
        y: clamp(Math.floor(hit.point.z), item.y, item.y + h - 1),
      };
      return { item, cell };
    }
    return null;
  }

  cellAt(sx, sy) {
    if (this.game.ui.mode === 'normal') {
      const hit = this.pickItem(sx, sy);
      if (hit) return hit.cell;
    }
    const p = this.groundAt(sx, sy);
    return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : { x: -1, y: -1 };
  }

  /** O que está sob o cursor, em ordem de prioridade de clique. */
  hitTest(sx, sy) {
    const { state } = this.game;
    const g = this.groundAt(sx, sy);
    if (g) {
      for (const d of state.dirt) if (Math.hypot(d.x - g.x, d.y - g.z) < 0.38) return { kind: 'dirt', id: d.id };
    }
    const wp = this.wheyRig.root.position;
    const ws = this.toScreen(wp.x, 0.25, wp.z);
    if (Math.hypot(ws.x - sx, ws.y - sy) < Math.max(14, this.cam.zoom * 0.36)) return { kind: 'whey' };
    this.setRay(sx, sy);
    const signHit = this.raycaster.intersectObjects(this.zoneSigns.map((s) => s.mesh), false)[0];
    if (signHit) return { kind: 'zone', id: signHit.object.userData.zoneId, cell: this.cellAt(sx, sy) };
    const cell = this.cellAt(sx, sy);
    const zone = zoneAtCell(cell.x, cell.y);
    if (zone && !state.unlockedZones.includes(zone.id)) return { kind: 'zone', id: zone.id, cell };
    return { kind: 'cell', cell };
  }

  dirtAt(sx, sy) {
    const g = this.groundAt(sx, sy);
    if (!g) return null;
    return this.game.state.dirt.find((d) => Math.hypot(d.x - g.x, d.y - g.z) < 0.42) ?? null;
  }

  // ------------------------------------------------------------ quadro
  render(now) {
    const { state, rt, ui } = this.game;
    if (!state || !rt || this.disposed) return;
    this.followWorldGrowth();
    const dt = this.step(now);
    const t = this.time;
    this.syncTerrain(state, t);
    this.syncInauguration(state, t);
    this.syncItems(state, rt, ui, t, now);
    this.syncDirt(state, ui, t);
    this.syncActors(state, dt, t);
    this.syncSelection(state, ui, t);
    this.syncPreview(state, ui, t);
    this.updateParticles(now);
    this.updateLights(state, ui, t);
    this.gl.render(this.scene, this.camera);
    this.drawOverlay(state, rt, ui, now, t);
  }

  updateLights(state, ui, t) {
    const night = state.time.block === 2;
    const dim = ui.maintenanceView ? 0.72 : 1;
    this.hemi.intensity = HEMI_I * dim * (night ? 0.88 : 1);
    this.sun.intensity = SUN_I * dim * (night ? 0.7 : 1);
    this.sun.color.copy(col(state.time.block === 0 ? '#fff4e4' : night ? '#e4e4ff' : '#ffffff'));
    if (this.lamp) {
      this.lamp.light.intensity = night ? 1.6 : 0;
      this.lamp.mat.emissive.copy(col(night ? '#fff3b0' : '#000000'));
      this.lamp.pivot.rotation.z = Math.sin(t * 1.4) * 0.08;
    }
  }

  // ------------------------------------------------------------ inauguração
  /** Dia da mudança de era: caminhão de mudança na rua e fita vermelha na porta. */
  syncInauguration(state, t) {
    const show = state.closedDay != null && state.closedDay === state.time.day;
    if (!show) {
      if (this.inaug) this.inaug.group.visible = false;
      return;
    }
    if (!this.inaug) {
      const g = new THREE.Group();
      const truck = new Builder();
      truck.rbox(1.7, 0.95, 0.85, '#fffdf8', { x: -0.35, y: 0.18 }, 0.06);
      truck.box(1.5, 0.12, 0.02, P.pad, { x: -0.35, y: 0.62, z: 0.43 });
      truck.box(1.5, 0.05, 0.02, P.blueDark, { x: -0.35, y: 0.52, z: 0.43 });
      truck.rbox(0.62, 0.62, 0.8, P.orange, { x: 0.82, y: 0.18 }, 0.08);
      truck.box(0.03, 0.26, 0.6, '#bfe3f5', { x: 1.13, y: 0.5 });
      for (const z of [-0.43, 0.43]) truck.box(0.3, 0.22, 0.02, '#bfe3f5', { x: 0.85, y: 0.5, z });
      for (const x of [-0.85, 0.15, 0.82]) {
        for (const z of [-0.4, 0.4]) truck.cyl(0.17, 0.17, 0.1, P.rubber, { rx: Math.PI / 2, x, y: 0.17, z }, 10);
      }
      // caixas da mudança encostadas na calçada
      truck.rbox(0.3, 0.26, 0.3, '#d9b07a', { x: -1.5, z: -0.75 }, 0.02);
      truck.rbox(0.24, 0.2, 0.24, '#c9a27a', { x: -1.48, y: 0.26, z: -0.74, ry: 0.4 }, 0.02);
      const truckMesh = solid(truck.build());
      truckMesh.userData.ownGeometry = true;
      const ribbon = new Builder();
      ribbon.box(1.05, 0.06, 0.03, P.pad, {});
      ribbon.torus(0.07, 0.022, P.pad, { x: 0, y: 0.03, z: 0.02, ry: 0.3 });
      ribbon.torus(0.07, 0.022, P.pad, { x: 0, y: 0.03, z: 0.02, ry: -0.3, rz: 1.2 });
      const ribbonMesh = solid(ribbon.build(), { outline: MATS.outlineThin });
      ribbonMesh.userData.ownGeometry = true;
      g.add(truckMesh, ribbonMesh);
      setNoRaycast(g);
      this.scene.add(g);
      this.inaug = { group: g, truck: truckMesh, ribbon: ribbonMesh };
    }
    this.inaug.group.visible = true;
    this.inaug.truck.position.set(DOOR.x + 4.6, 0, ROWS + 1.25);
    this.inaug.ribbon.position.set(DOOR.x + 0.5, 0.32 + Math.sin(t * 2) * 0.01, DOOR.y + 1.06);
  }

  // ------------------------------------------------------------ terreno e paredes
  syncTerrain(state, t) {
    const zones = allZones(state);
    const key = `${state.era}|${COLS}x${ROWS}|${state.unlockedZones.join(',')}|${zones.map((z) => z.id).join(',')}`;
    if (key !== this.terrainKey) {
      this.terrainKey = key;
      this.buildTerrain(state, zones);
    }
    // Placas balançando (só as que já podem ser compradas) e brilho do terreno novo.
    for (const s of this.zoneSigns) s.mesh.position.y = s.baseY + (s.available ? Math.sin(t * 2) * 0.03 : 0);
    const glow = this.newZoneGlow;
    const k = glow ? (t * 1000 - glow.t0) / 3000 : 1;
    if (k < 1 && zoneById(glow.zoneId)) {
      const z = zoneById(glow.zoneId);
      if (!this.glow || this.glow.userData.zoneId !== z.id) {
        if (this.glow) this.helpersRoot.remove(this.glow);
        this.glowMat = this.glowMat ?? new THREE.MeshBasicMaterial({ color: col(P.yellow), transparent: true, depthWrite: false });
        this.glow = frame(z.x + 0.06, z.y + 0.06, z.w - 0.12, z.h - 0.12, this.glowMat, { thick: 0.12, height: 0.06, y: 0.02 });
        this.glow.userData.zoneId = z.id;
        this.helpersRoot.add(this.glow);
      }
      this.glowMat.opacity = (1 - k) * (0.6 + 0.4 * Math.sin(t * 10));
    } else if (this.glow) {
      this.helpersRoot.remove(this.glow);
      this.glow = null;
    }
  }

  buildTerrain(state, zones) {
    disposeTree(this.terrainRoot);
    this.terrainRoot.clear();
    this.zoneSigns = [];
    this.mask = buildUnlockedMask(state.unlockedZones);
    const unlocked = (x, y) => isUnlocked(this.mask, x, y);
    const look = eraLook(state.era);
    const WALL = look.wall;
    const own = (o) => {
      o.userData.ownGeometry = true;
      return o;
    };

    // Chão: pisos, rua, calçada e terrenos à venda (recebem sombra, sem contorno).
    const g = new Builder();
    const streetZ = ROWS + 0.25;
    const sx0 = -40;
    const sx1 = COLS + 40;
    g.box(sx1 - sx0, 0.02, 3, '#b9b4c4', { x: (sx0 + sx1) / 2, y: -0.02, z: streetZ + 1.5 });
    g.box(sx1 - sx0, 0.06, 0.5, '#e6e1d8', { x: (sx0 + sx1) / 2, y: -0.02, z: streetZ + 0.1 });
    for (let x = -2; x < COLS + 3; x += 1.5) g.box(0.7, 0.006, 0.085, '#fffdf8', { x: x + 0.35, z: streetZ + 1.2 });
    for (let y = DOOR.y + 1; y < ROWS; y++) g.rbox(0.75, 0.035, 0.83, '#efe6d6', { x: DOOR.x + 0.5, y: -0.01, z: y + 0.5 }, 0.08);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const z = zoneAtCell(x, y);
        if (!z || !state.unlockedZones.includes(z.id)) continue;
        const [a, b] = floorOf(z);
        g.box(1, 0.06, 1, (x + y) % 2 ? a : b, { x: x + 0.5, y: FLOOR_Y - 0.06, z: y + 0.5 });
      }
    }
    for (const z of zones) {
      if (state.unlockedZones.includes(z.id)) continue;
      g.box(z.w - 0.02, 0.03, z.h - 0.02, LOCKED, { x: z.x + z.w / 2, y: -0.02, z: z.y + z.h / 2 });
      for (let i = 0; i < z.w * z.h; i += 3) {
        g.box(0.07, 0.006, 0.07, '#d4e8c7', { x: z.x + ((i * 37) % (z.w * T)) / T, y: 0.01, z: z.y + ((i * 53) % (z.h * T)) / T });
      }
    }
    // tapete da porta
    g.rbox(0.75, 0.02, 0.6, '#c9a27a', { x: DOOR.x + 0.5, y: FLOOR_Y, z: DOOR.y + 0.55 }, 0.06);
    for (let i = 0; i < 4; i++) g.box(0.02, 0.004, 0.45, '#dcc0a2', { x: DOOR.x + 0.25 + i * 0.15, y: FLOOR_Y + 0.02, z: DOOR.y + 0.55 });
    const ground = own(new THREE.Mesh(g.build(), MATS.flat));
    ground.receiveShadow = true;
    ground.raycast = () => {};
    this.terrainRoot.add(ground);

    // Paredes: fundos e lado esquerdo altos; frente e lado direito baixos
    // (corte de maquete) para enxergar o interior pela câmera.
    const wb = new Builder();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!unlocked(x, y)) continue;
        if (!unlocked(x, y - 1)) {
          wb.box(1 + WALL_T, WALL_H, WALL_T, WALL, { x: x + 0.5, z: y });
          if (look.mullion) wb.box(0.06, WALL_H + 0.02, WALL_T + 0.03, look.mullion, { x, z: y });
        }
        if (!unlocked(x - 1, y)) {
          wb.box(WALL_T, WALL_H, 1 + WALL_T, WALL, { x, z: y + 0.5 });
          if (look.mullion) wb.box(WALL_T + 0.03, WALL_H + 0.02, 0.06, look.mullion, { x, z: y });
        }
        if (!unlocked(x + 1, y)) wb.box(WALL_T, WALL_LOW, 1 + WALL_T, WALL, { x: x + 1, z: y + 0.5 });
        if (!unlocked(x, y + 1) && !(x === DOOR.x && y === DOOR.y)) wb.box(1 + WALL_T, WALL_LOW, WALL_T, WALL, { x: x + 0.5, z: y + 1 });
      }
    }
    const dz = DOOR.y + 1;
    for (const x of [DOOR.x, DOOR.x + 1]) wb.box(WALL_T, WALL_H, WALL_T, WALL, { x, z: dz });
    if (look.door === 'glass') {
      // prédio: porta de vidro de correr aberta, batente branco e faixa neon
      wb.box(1.04, 0.1, WALL_T + 0.02, '#fffdf8', { x: DOOR.x + 0.5, y: WALL_H - 0.12, z: dz });
      for (const s of [-1, 1]) wb.box(0.42, WALL_H - 0.14, 0.03, '#bfe3f5', { x: DOOR.x + 0.5 + s * 0.62, z: dz + 0.06 });
      wb.box(1.2, 0.03, 0.03, P.pink, { x: DOOR.x + 0.5, y: WALL_H - 0.02, z: dz + 0.08 });
    } else if (look.door === 'awning') {
      // ponto de bairro: batente de porta de vidro e toldo listrado
      wb.box(1.04, 0.07, WALL_T, '#fffdf8', { x: DOOR.x + 0.5, y: WALL_H - 0.18, z: dz });
      for (let i = 0; i < 6; i++) {
        wb.box(0.2, 0.03, 0.42, i % 2 ? '#fffdf8' : P.pad, { x: DOOR.x - 0.0 + 0.1 + i * 0.2, y: WALL_H - 0.08, z: dz + 0.18, rx: 0.32 });
      }
      wb.box(1.24, 0.06, 0.04, P.padDark, { x: DOOR.x + 0.5, y: WALL_H - 0.2, z: dz + 0.38 });
    } else {
      // garagem: portão de enrolar aberto sobre a porta
      wb.rbox(1.25, 0.18, 0.24, '#9aa0b5', { x: DOOR.x + 0.5, y: WALL_H - 0.1, z: dz }, 0.05);
      for (let i = 1; i < 4; i++) wb.box(1.2, 0.012, 0.245, '#7f8499', { x: DOOR.x + 0.5, y: WALL_H - 0.1 + i * 0.045, z: dz });
    }
    const walls = own(solid(wb.build()));
    walls.receiveShadow = true;
    walls.raycast = () => {};
    this.terrainRoot.add(walls);

    // lâmpada pendurada (acende à noite)
    if (!this.lamp) {
      const mat = new THREE.MeshLambertMaterial({ color: col('#fffdf8') });
      const pivot = new THREE.Group();
      const wire = new THREE.Mesh(UNIT_BOX, basic(INK));
      wire.scale.set(0.012, 0.22, 0.012);
      wire.position.y = -0.11;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat);
      bulb.position.y = -0.25;
      const light = new THREE.PointLight(col('#ffe68c'), 0, 3.5, 1.6);
      light.position.y = -0.3;
      pivot.add(wire, bulb, light);
      setNoRaycast(pivot);
      this.scene.add(pivot);
      this.lamp = { pivot, mat, light };
    }
    this.lamp.pivot.position.set(DOOR.x + 0.5, WALL_H - 0.1, dz - 0.14);

    // Cenário: arbustos, placa da academia, cercas dos terrenos à venda.
    const d = new Builder();
    // Arbustos no jardim da frente, ao lado do caminho da porta.
    [[-0.7, 2.4], [1.6, 3.6], [-0.5, 4.3], [2.1, 4.4], [-1.2, 1.4], [3.4, 1.5]].forEach(([ox, oz]) => {
      const x = DOOR.x + ox;
      const z = DOOR.y + oz;
      if (z >= ROWS + 0.2 || x < -1 || zoneAtCell(Math.floor(x), Math.floor(z))) return;
      d.add(new THREE.IcosahedronGeometry(0.32, 0), '#9ccf8a', { x, y: 0.22, z });
      d.add(new THREE.IcosahedronGeometry(0.21, 0), '#b0dc9e', { x: x + 0.19, y: 0.38, z: z - 0.12 });
    });
    const signX = DOOR.x + 2.05;
    const signZ = DOOR.y + 1.55;
    const signLook = look.sign;
    const signHalf = signLook.w / T / 2 + 0.05;
    const signX2 = signX + signHalf - 0.8;
    if (signZ < ROWS + 0.2) for (const s of [-1, 1]) d.box(0.06, 0.5, 0.06, '#a07f5c', { x: signX2 + s * (signHalf - 0.25), z: signZ });
    for (const z of zones) {
      if (state.unlockedZones.includes(z.id)) continue;
      const x0 = z.x + 0.12;
      const z0 = z.y + 0.12;
      const x1 = z.x + z.w - 0.12;
      const z1 = z.y + z.h - 0.12;
      for (let x = x0; x <= x1 + 0.01; x += 0.5) {
        d.box(0.07, 0.28, 0.07, '#c9a27a', { x, z: z0 });
        d.box(0.07, 0.28, 0.07, '#c9a27a', { x, z: z1 });
      }
      for (let zz = z0 + 0.5; zz < z1 - 0.01; zz += 0.5) {
        d.box(0.07, 0.28, 0.07, '#c9a27a', { x: x0, z: zz });
        d.box(0.07, 0.28, 0.07, '#c9a27a', { x: x1, z: zz });
      }
      for (const y of [0.1, 0.2]) {
        d.box(x1 - x0, 0.035, 0.035, '#a07f5c', { x: (x0 + x1) / 2, y, z: z0 });
        d.box(x1 - x0, 0.035, 0.035, '#a07f5c', { x: (x0 + x1) / 2, y, z: z1 });
        d.box(0.035, 0.035, z1 - z0, '#a07f5c', { x: x0, y, z: (z0 + z1) / 2 });
        d.box(0.035, 0.035, z1 - z0, '#a07f5c', { x: x1, y, z: (z0 + z1) / 2 });
      }
      d.cyl(0.04, 0.04, 0.7, '#a07f5c', { x: z.x + z.w / 2, z: z.y + z.h / 2 }, 6);
      this.addZoneSign(state, z);
    }
    const decor = own(solid(d.build(), { outline: MATS.outlineThin }));
    decor.raycast = () => {};
    this.terrainRoot.add(decor);

    if (signZ < ROWS + 0.2) {
      const sw = signLook.w;
      const sign = this.signBoard(sw, 24, (ctx) => {
        box(ctx, -sw / 2, -12, sw, 24, 6, signLook.fill);
        ctx.textAlign = 'center';
        ctx.fillStyle = signLook.ink;
        if (signLook.neon) {
          ctx.shadowColor = signLook.ink;
          ctx.shadowBlur = 5;
        }
        if (signLook.sub) {
          // letreiro pintado à mão: nome grande e uma linha menor
          ctx.font = `700 10px ${FONT_TITLE}`;
          ctx.fillText(signLook.lines[0], 0, -1);
          ctx.fillStyle = signLook.sub;
          if (signLook.neon) ctx.shadowColor = signLook.sub;
          ctx.font = `700 7px ${FONT_UI}`;
          ctx.fillText(signLook.lines[1], 0, 9);
        } else {
          ctx.font = `700 10px ${FONT_TITLE}`;
          ctx.fillText(signLook.lines[0], 0, -1);
          ctx.fillText(signLook.lines[1], 0, 10);
        }
      });
      sign.position.set(signX2, 0.62, signZ);
      sign.raycast = () => {};
      this.terrainRoot.add(sign);
    }

    // Grade do modo edição.
    const pts = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!unlocked(x, y)) continue;
        pts.push(x, 0, y, x + 1, 0, y, x, 0, y, x, 0, y + 1);
        if (!unlocked(x + 1, y)) pts.push(x + 1, 0, y, x + 1, 0, y + 1);
        if (!unlocked(x, y + 1)) pts.push(x, 0, y + 1, x + 1, 0, y + 1);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.gridLines = own(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col(INK), transparent: true, opacity: 0.2 })));
    this.gridLines.userData.ownMaterial = true;
    this.gridLines.position.y = FLOOR_Y + 0.004;
    this.gridLines.raycast = () => {};
    this.terrainRoot.add(this.gridLines);

    // Paredes mudaram: itens de parede podem precisar virar para outro lado.
    for (const v of this.itemViews.values()) v.key = null;
  }

  /** Placa com textura desenhada no mesmo estilo 2D, virada para a câmera. */
  signBoard(wPx, hPx, draw) {
    const k = 4;
    const c = document.createElement('canvas');
    c.width = Math.ceil((wPx + 8) * k);
    c.height = Math.ceil((hPx + 8) * k);
    const ctx = c.getContext('2d');
    ctx.setTransform(k, 0, 0, k, c.width / 2, c.height / 2);
    draw(ctx);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry((wPx + 8) / T, (hPx + 8) / T), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    mesh.rotation.set(-0.5, AZIMUTH, 0, 'YXZ');
    mesh.userData.ownGeometry = true;
    mesh.userData.ownMaterial = true;
    return mesh;
  }

  addZoneSign(state, z) {
    const available = !z.requires || state.unlockedZones.includes(z.requires);
    const title = `${z.label} ${z.w}×${z.h}`;
    const sub = available ? formatMoney(z.cost) : `Requer ${zoneById(z.requires)?.label ?? 'a área ao lado'}`;
    const titleFont = `700 12px ${FONT_TITLE}`;
    const subFont = available ? `800 13px ${FONT_UI}` : `800 11px ${FONT_UI}`;
    const m = this.octx;
    m.font = titleFont;
    const tw = m.measureText(title).width;
    m.font = subFont;
    const sw = m.measureText(sub).width;
    const signW = Math.max(116, Math.min(Math.max(tw, sw) + 24, z.w * T - 16));
    const shrink = Math.min(1, (signW - 24) / Math.max(tw, sw));
    const mesh = this.signBoard(signW, 44, (ctx) => {
      box(ctx, -signW / 2, -22, signW, 44, 8, available ? '#fffdf8' : '#ece8ef');
      ctx.textAlign = 'center';
      ctx.scale(shrink, shrink);
      ctx.fillStyle = INK;
      ctx.font = titleFont;
      ctx.fillText(title, 0, -5 / shrink);
      ctx.font = subFont;
      ctx.fillStyle = available ? P.greenDark : P.metalDark;
      ctx.fillText(sub, 0, 13 / shrink);
    });
    const baseY = 0.9;
    mesh.position.set(z.x + z.w / 2, baseY, z.y + z.h / 2);
    mesh.userData.zoneId = z.id;
    this.terrainRoot.add(mesh);
    this.zoneSigns.push({ mesh, baseY, available, zoneId: z.id });
  }

  // ------------------------------------------------------------ aparelhos
  /** Lado do modelo (0 -x, 1 +x, 2 -z, 3 +z) que mais encosta em parede; -1 se nenhum. */
  wallSideOf(type, x, y, rot) {
    if (!this.mask) return -1;
    const cells = footprintCells(type, x, y, rot);
    const inside = new Set(cells.map((c) => `${c.x},${c.y}`));
    let best = -1;
    let bestN = 0;
    for (let side = 0; side < 4; side++) {
      const [dx, dz] = sideDir(side, rot);
      let n = 0;
      for (const c of cells) {
        const nx = c.x + dx;
        const ny = c.y + dz;
        if (!inside.has(`${nx},${ny}`) && !isUnlocked(this.mask, nx, ny)) n += 1;
      }
      if (n > bestN) {
        bestN = n;
        best = side;
      }
    }
    return best;
  }

  createItemView(item, side) {
    const model = makeEquipment(item.type, item.tier, side);
    const group = model.group;
    group.userData.itemId = item.id;
    const smoke = new THREE.Group();
    for (let i = 0; i < 3; i++) smoke.add(new THREE.Mesh(this.smokeGeo, this.smokeMat));
    setNoRaycast(smoke);
    smoke.visible = false;
    group.add(smoke);
    this.itemsRoot.add(group);
    return { group, model, smoke, key: null, frameKey: null, unreachable: null, maint: null };
  }

  removeItemView(id, v) {
    this.itemsRoot.remove(v.group);
    disposeTree(v.group);
    if (v.unreachable) this.itemsRoot.remove(v.unreachable);
    if (v.maint) {
      this.itemsRoot.remove(v.maint);
      v.maint.material.dispose();
    }
    this.itemViews.delete(id);
  }

  syncItems(state, rt, ui, t, now) {
    const seen = new Set();
    for (const item of state.items) {
      seen.add(item.id);
      const def = getEquipmentDef(item.type);
      const side = def.wallMounted ? this.wallSideOf(item.type, item.x, item.y, item.rot) : -1;
      const key = `${item.type}|${item.tier}|${side}`;
      let v = this.itemViews.get(item.id);
      if (!v || v.key !== key) {
        if (v) this.removeItemView(item.id, v);
        v = this.createItemView(item, side);
        v.key = key;
        this.itemViews.set(item.id, v);
      }
      const { w, h } = footprintSize(item.type, item.rot);
      const g = v.group;
      g.position.set(item.x + w / 2, 0, item.y + h / 2);
      g.rotation.y = (-item.rot * PI) / 2;
      g.visible = !(ui.mode === 'move' && ui.moving?.id === item.id);

      const info = rt.academy.itemInfo.get(item.id);
      const st = info?.state ?? 'ok';
      const worn = hasWear(item) ? st : 'ok';
      const active = !!rt.blockStats.perItem[item.id]?.uses && st !== 'quebrado';
      const mat = worn === 'quebrado' ? MATS.broken : worn === 'cansado' ? MATS.tired : MATS.body;
      const selected = ui.selectedId === item.id && ui.mode === 'normal';
      for (const m of v.model.meshes) {
        m.material = mat;
        if (m.userData.outline) m.userData.outline.material = selected ? MATS.selected : MATS.outline;
      }
      v.model.animate(t, { tier: item.tier, active, on: true });

      let scale = 1;
      const anim = this.itemAnims.get(item.id);
      if (anim) {
        const k = (now - anim.t0) / 1000;
        if (anim.kind === 'place' && k < 0.35) scale = 1 + Math.sin((k / 0.35) * PI) * 0.12;
        else if (anim.kind === 'repair' && k < 2) scale = 1 + Math.sin(k * 18) * 0.02;
        else this.itemAnims.delete(item.id);
      }
      g.scale.setScalar(scale);

      // fumaça do aparelho quebrado
      v.smoke.visible = st === 'quebrado';
      if (v.smoke.visible) {
        v.smoke.children.forEach((puff, i) => {
          const k = (t * 0.6 + i / 3) % 1;
          puff.position.set(Math.sin(k * 6 + i) * 0.12, v.model.height + 0.1 + k * 0.5, 0);
          puff.scale.setScalar(0.6 + k * 0.9);
        });
      }

      // contorno vermelho tracejado: sem corredor até a frente
      const unreachable = info && !info.reachable;
      if (unreachable && v.frameKey !== `${w}x${h}`) {
        if (v.unreachable) this.itemsRoot.remove(v.unreachable);
        v.unreachable = frame(-w / 2 + 0.06, -h / 2 + 0.06, w - 0.12, h - 0.12, basic('#e8646a'), { thick: 0.07, height: 0.03, y: 0.01 });
        v.frameKey = `${w}x${h}`;
        this.itemsRoot.add(v.unreachable);
      }
      if (v.unreachable) {
        v.unreachable.visible = !!unreachable && g.visible;
        v.unreachable.position.set(g.position.x, 0, g.position.z);
        v.unreachable.children.forEach((c, i) => { c.visible = Math.floor(t * 3 + i) % 2 === 0 || i % 2 === 0; });
      }

      // visão de manutenção: aparelho envolto na cor do estado
      if (ui.maintenanceView && hasWear(item)) {
        if (!v.maint) {
          v.maint = new THREE.Mesh(UNIT_BOX, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }));
          v.maint.userData.ownMaterial = true;
          v.maint.raycast = () => {};
          this.itemsRoot.add(v.maint);
        }
        v.maint.visible = g.visible;
        v.maint.material.color.copy(col(CONDITION_STATES[conditionState(item.condition)].color));
        v.maint.scale.set(w - 0.08, v.model.height + 0.08, h - 0.08);
        v.maint.position.set(g.position.x, (v.model.height + 0.08) / 2, g.position.z);
      } else if (v.maint) v.maint.visible = false;
    }
    for (const [id, v] of this.itemViews) if (!seen.has(id)) this.removeItemView(id, v);
  }

  // ------------------------------------------------------------ sujeira
  dirtGeo(kind) {
    this.dirtGeos ??= {};
    if (!this.dirtGeos[kind]) {
      const b = new Builder();
      if (kind === 'suor') {
        b.sphere(0.21, '#a9cbd8', { sy: 0.1, sz: 0.62 }, 10, 5);
        b.sphere(0.075, '#a9cbd8', { x: 0.13, z: -0.07, sy: 0.25, sz: 0.7 }, 8, 4);
        b.sphere(0.06, '#ffffff', { x: -0.06, y: 0.012, z: -0.04, sy: 0.15, sz: 0.5 }, 6, 4);
      } else {
        b.rbox(0.36, 0.015, 0.2, '#fffdf8', {}, 0.006);
        b.box(0.36, 0.004, 0.035, P.blue, { y: 0.015, z: 0.04 });
      }
      this.dirtGeos[kind] = b.build();
    }
    return this.dirtGeos[kind];
  }

  syncDirt(state, ui, t) {
    const seen = new Set();
    for (const d of state.dirt) {
      seen.add(d.id);
      let v = this.dirtViews.get(d.id);
      if (!v) {
        const mesh = solid(this.dirtGeo(d.kind), { outline: MATS.outlineThin, cast: false });
        mesh.rotation.y = -(0.4 + (d.id % 3) * 0.5);
        mesh.raycast = () => {};
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 4, 20).rotateX(-PI / 2), basic('#d9773a'));
        ring.raycast = () => {};
        ring.userData.ownGeometry = true;
        v = { mesh, ring };
        this.actorsRoot.add(mesh, ring);
        this.dirtViews.set(d.id, v);
      }
      v.mesh.position.set(d.x, 0.006, d.y);
      v.ring.visible = ui.maintenanceView;
      v.ring.position.set(d.x, 0.03, d.y);
      v.ring.scale.setScalar(1 + Math.sin(t * 5 + d.id) * 0.2);
    }
    for (const [id, v] of this.dirtViews) {
      if (seen.has(id)) continue;
      this.actorsRoot.remove(v.mesh, v.ring);
      v.ring.geometry.dispose();
      this.dirtViews.delete(id);
    }
  }

  // ------------------------------------------------------------ bonecos
  syncActors(state, dt, t) {
    const items = new Map(state.items.map((i) => [i.id, i]));
    const turn = Math.min(1, dt * 10);
    const ease = (a) => 1 - (1 - clamp(a, 0, 1)) ** 2;
    const face = (v, target) => {
      let d = target - v.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.heading += d * turn;
    };

    for (const [key, sp] of this.sprites) {
      let v = this.personViews.get(key);
      if (!v || v.studentId !== sp.student.id) {
        if (v) this.actorsRoot.remove(v.rig.root);
        const rig = makePerson(sp.student.look, sp.student.profile);
        v = { rig, studentId: sp.student.id, heading: 0, pos: new THREE.Vector3(sp.x / T, 0, sp.y / T) };
        this.actorsRoot.add(rig.root);
        this.personViews.set(key, v);
      }
      const moving = sp.path.length > 0;
      let pose = moving ? 'walk' : sp.target.state;
      let x = sp.x / T;
      let z = sp.y / T;
      let elev = 0;
      let heading = null;
      const item = !moving && sp.target.itemId != null ? items.get(sp.target.itemId) : null;
      if (item) {
        const { w, h } = footprintSize(item.type, item.rot);
        const cx = item.x + w / 2;
        const cz = item.y + h / 2;
        const [fx, fz] = FRONT[item.rot];
        const spot = pose.startsWith('use-') ? USE_SPOT[item.type] : null;
        if (spot) {
          // Em cima ou dentro do aparelho (lona, banco, barra...), na pose dele.
          const slots = getEquipmentDef(item.type).visualSlots ?? 1;
          const slot = Number(sp.target.key.split(':')[1]) || 0;
          const lx = (slot - (slots - 1) / 2) * (spot.spread ?? 0);
          const [ox, oz] = rotateLocal(lx, spot.z, item.rot);
          const [hx, hz] = rotateLocal(0, spot.face, item.rot);
          x = cx + ox;
          z = cz + oz;
          elev = spot.elev ?? 0;
          pose = spot.pose;
          heading = Math.atan2(hx, hz);
        } else if (pose === 'use-stretch') {
          elev = 0.05;
          heading = Math.atan2(fx, fz);
        } else heading = Math.atan2(cx - x, cz - z);
      }
      if (moving) v.pos.set(x, elev, z);
      else v.pos.lerp(this.tmp.set(x, elev, z), Math.min(1, dt * 8));
      const root = v.rig.root;
      if (moving) {
        const dx = v.pos.x - root.position.x;
        const dz = v.pos.z - root.position.z;
        if (dx * dx + dz * dz > 1e-6) heading = Math.atan2(dx, dz);
      }
      if (heading !== null) face(v, heading);
      root.position.copy(v.pos);
      root.rotation.y = v.heading;
      const a = ease(sp.alpha);
      root.visible = a > 0.01;
      root.scale.copy(root.userData.scale).multiplyScalar(Math.max(0.01, a));
      setMood(v.rig, sp.student.S >= 65 ? 'happy' : sp.student.S < 45 ? 'sad' : 'neutral');
      posePerson(v.rig, pose, t, sp.seed, sp.student.profile);
    }
    for (const [key, v] of this.personViews) {
      if (this.sprites.has(key)) continue;
      this.actorsRoot.remove(v.rig.root);
      this.personViews.delete(key);
    }

    for (const [id, sp] of this.staffSprites) {
      let v = this.staffViews.get(id);
      if (!v) {
        const rig = makeCleaner(sp.member.look, sp.member.role);
        v = { rig, heading: 0 };
        this.actorsRoot.add(rig.root);
        this.staffViews.set(id, v);
      }
      const root = v.rig.root;
      const x = sp.x / T;
      const z = sp.y / T;
      const dx = x - root.position.x;
      const dz = z - root.position.z;
      const job = sp.mode === 'fix' ? items.get(sp.itemId) : null;
      if (job) {
        // Olha para o aparelho que está consertando.
        const { w, h } = footprintSize(job.type, job.rot);
        face(v, Math.atan2(job.x + w / 2 - x, job.y + h / 2 - z));
      } else if (dx * dx + dz * dz > 1e-6) face(v, Math.atan2(dx, dz));
      root.position.set(x, 0, z);
      root.rotation.y = v.heading;
      const a = ease(sp.alpha);
      root.visible = a > 0.01;
      root.scale.copy(root.userData.scale).multiplyScalar(Math.max(0.01, a));
      poseCleaner(v.rig, sp.mode, t, sp.seed);
    }
    for (const [id, v] of this.staffViews) {
      if (this.staffSprites.has(id)) continue;
      this.actorsRoot.remove(v.rig.root);
      this.staffViews.delete(id);
    }

    // Whey
    const wr = this.wheyRig.root;
    const wx = this.whey.x / T;
    const wz = this.whey.y / T;
    const wdx = wx - wr.position.x;
    const wdz = wz - wr.position.z;
    if (wdx * wdx + wdz * wdz > 1e-6) {
      let d = Math.atan2(wdx, wdz) - this.wheyHeading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.wheyHeading += d * turn;
    }
    wr.position.set(wx, 0, wz);
    wr.rotation.y = this.wheyHeading;
    poseWhey(this.wheyRig, this.wheyWalking ? 'worried' : this.wheyMood ?? 'sleep', t);
  }

  // ------------------------------------------------------------ seleção e prévia
  syncSelection(state, ui, t) {
    const item = ui.mode === 'normal' && ui.selectedId ? state.items.find((i) => i.id === ui.selectedId) : null;
    const key = item ? `${item.id}|${item.x},${item.y},${item.rot}` : '';
    if (key !== this.selectionKey) {
      this.selectionKey = key;
      if (this.selection) this.helpersRoot.remove(this.selection);
      this.selection = null;
      if (item) {
        const g = new THREE.Group();
        const { w, h } = footprintSize(item.type, item.rot);
        g.add(frame(item.x + 0.03, item.y + 0.03, w - 0.06, h - 0.06, basic('#f2b13c'), { thick: 0.07, height: 0.025, y: FLOOR_Y }));
        if (getEquipmentDef(item.type).needsAccess) {
          for (const c of frontCells(item.type, item.x, item.y, item.rot)) g.add(tile(c.x, c.y, basic('#8ec5e8', 0.4), 0.12));
        }
        this.selection = g;
        this.helpersRoot.add(g);
      }
    }
    if (this.selection) this.selection.children[0].position.y = Math.sin(t * 4) * 0.01;
    if (this.gridLines) this.gridLines.visible = ui.editMode || ui.mode !== 'normal';
  }

  syncPreview(state, ui, t) {
    const pv = placementPreview();
    const movingItem = ui.mode === 'move' ? state.items.find((i) => i.id === ui.moving?.id) : null;
    const tier = movingItem?.tier ?? ui.placing?.tier ?? 'usado';
    const origin = movingItem && ui.moving.origin ? ui.moving.origin : null;
    const key = pv
      ? `${pv.type}|${tier}|${pv.x},${pv.y},${pv.rot}|${pv.ok}|${!!pv.warning}|${origin ? `${origin.x},${origin.y},${origin.rot}` : ''}`
      : '';
    if (key !== this.previewKey) {
      this.previewKey = key;
      if (this.preview) {
        this.helpersRoot.remove(this.preview.group);
        disposeTree(this.preview.group);
      }
      this.preview = null;
      if (pv) {
        const g = new THREE.Group();
        if (origin) {
          const { w: ow, h: oh } = footprintSize(movingItem.type, origin.rot);
          g.add(frame(origin.x + 0.08, origin.y + 0.08, ow - 0.16, oh - 0.16, basic(INK, 0.45), { thick: 0.05, height: 0.015, y: FLOOR_Y }));
        }
        const color = !pv.ok ? '#e8646a' : pv.warning ? '#f2b13c' : '#7cc98a';
        for (const c of pv.cells) g.add(tile(c.x, c.y, basic(color, 0.55), 0.04));
        for (const c of pv.front) g.add(tile(c.x, c.y, basic('#8ec5e8', 0.4), 0.14));
        const def = getEquipmentDef(pv.type);
        const side = def.wallMounted ? this.wallSideOf(pv.type, pv.x, pv.y, pv.rot) : -1;
        const model = makeEquipment(pv.type, tier, side);
        for (const m of model.meshes) {
          m.material = MATS.ghost;
          m.castShadow = false;
          if (m.userData.outline) m.userData.outline.visible = false;
        }
        const { w, h } = footprintSize(pv.type, pv.rot);
        model.group.position.set(pv.x + w / 2, FLOOR_Y, pv.y + h / 2);
        model.group.rotation.y = (-pv.rot * PI) / 2;
        setNoRaycast(model.group);
        g.add(model.group);
        this.preview = { group: g, ghost: model.group };
        this.helpersRoot.add(g);
      }
    }
    if (this.preview) this.preview.ghost.position.y = FLOOR_Y + 0.05 + Math.sin(t * 4) * 0.03;
  }

  // ------------------------------------------------------------ partículas
  updateParticles(now) {
    const mesh = this.particleMesh;
    const d = this.pDummy;
    let n = 0;
    for (const p of this.particles) {
      if (n >= mesh.instanceMatrix.count) break;
      const k = (now - p.t0) / 1000;
      if (k < 0) continue;
      const a = 1 - k / p.life;
      if (a <= 0) continue;
      const base = p.kind === 'dust' ? 0.08 : p.kind === 'confetti' ? 0.6 : 0.4;
      const up = (-p.vy * k - (p.kind === 'confetti' ? 60 * k * k : 0)) / T;
      d.position.set((p.x + p.vx * k) / T, Math.max(0.03, base + up), p.y / T);
      d.rotation.set(k * 6, k * 4, 0);
      if (p.kind === 'confetti') d.scale.set(0.1, 0.02, 0.06);
      else if (p.kind === 'dust') d.scale.setScalar(0.12 * (1 + k) * a);
      else d.scale.setScalar(0.08 * a);
      d.updateMatrix();
      mesh.setMatrixAt(n, d.matrix);
      mesh.setColorAt(n, this.pColor.set(p.color));
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ camada 2D
  drawOverlay(state, rt, ui, now, t) {
    const ctx = this.octx;
    const { w, h, dpr } = this.viewport;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    for (const item of state.items) {
      const v = this.itemViews.get(item.id);
      if (!v || !v.group.visible) continue;
      const info = rt.academy.itemInfo.get(item.id);
      const st = info?.state ?? 'ok';
      const gp = v.group.position;
      const top = v.model.height;
      if (ui.maintenanceView && hasWear(item)) {
        const s = this.toScreen(gp.x, top + 0.1, gp.z);
        const cs = conditionState(item.condition);
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fffdf8';
        ctx.fillStyle = INK;
        ctx.font = `800 13px ${FONT_UI}`;
        ctx.strokeText(`${Math.round(item.condition)}%`, s.x, s.y);
        ctx.fillText(`${Math.round(item.condition)}%`, s.x, s.y);
        ctx.font = `700 10px ${FONT_UI}`;
        ctx.strokeText(CONDITION_STATES[cs].label, s.x, s.y + 13);
        ctx.fillText(CONDITION_STATES[cs].label, s.x, s.y + 13);
      }
      if (hasWear(item) && st !== 'ok') {
        const s = this.toScreen(gp.x, top + 0.12, gp.z);
        const bx = s.x + 14;
        const by = s.y - 4;
        circle(ctx, bx, by, 8, CONDITION_STATES[st].color, INK, 1.5);
        ctx.fillStyle = INK;
        ctx.font = `900 10px ${FONT_UI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st === 'quebrado' ? '×' : st === 'cansado' ? '!' : '~', bx, by + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
      if (info && !info.reachable) {
        const s = this.toScreen(gp.x, top * 0.5 + 0.1, gp.z);
        circle(ctx, s.x, s.y, 11, '#e8646a', INK, 2);
        ctx.fillStyle = '#fff';
        ctx.font = `900 14px ${FONT_UI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', s.x, s.y + 1);
        ctx.textBaseline = 'alphabetic';
      }
      const anim = this.itemAnims.get(item.id);
      if (anim?.kind === 'repair') {
        const k = (now - anim.t0) / 1000;
        if (k < 2) {
          const s = this.toScreen(gp.x, top + 0.3, gp.z);
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(Math.sin(k * 14) * 0.6);
          line(ctx, -8, 8, 6, -6, INK, 5);
          line(ctx, -8, 8, 6, -6, P.metal, 3);
          circle(ctx, 7, -7, 5, P.metal, INK, 2);
          ctx.restore();
        }
      }
    }

    // Whey: "z" dormindo, "!" em alerta
    const wp = this.wheyRig.root.position;
    const mood = this.wheyWalking ? 'worried' : this.wheyMood ?? 'sleep';
    if (mood === 'sleep') {
      const s = this.toScreen(wp.x, 0.3, wp.z);
      const z = (t * 0.8) % 1;
      ctx.globalAlpha = 1 - z;
      ctx.fillStyle = 'rgba(61,53,80,0.7)';
      ctx.font = '700 11px "Fredoka", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('z', s.x - 4 + z * 6, s.y - 6 - z * 12);
      ctx.globalAlpha = 1;
    } else if (mood === 'alert') {
      const s = this.toScreen(wp.x, 0.62, wp.z);
      ctx.fillStyle = '#e8646a';
      ctx.font = '800 16px "Fredoka", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', s.x, s.y + Math.sin(t * 8) * 1.5);
    }

    // valores flutuando (+R$, -R$, Limpinho!, Combo)
    for (const f of this.floaters) {
      const k = (now - f.t0) / 1400;
      if (k < 0) continue;
      const s = this.toScreen(f.x / T, 0.8 + k * 0.7, f.y / T);
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.font = `900 13px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fffdf8';
      ctx.strokeText(f.text, s.x, s.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;

    // balões de fala dos alunos e dica do Whey
    for (const b of this.bubbles) {
      const v = this.personViews.get(b.key);
      if (!v || now < b.t0) continue;
      const k = (now - b.t0) / b.dur;
      const alpha = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
      const pop = k < 0.08 ? 0.7 + (k / 0.08) * 0.3 : 1;
      const r = v.rig.root;
      const s = this.toScreen(r.position.x, r.position.y + 0.85 * r.scale.y, r.position.z);
      speechBubble(ctx, s.x, s.y, b.text, { tone: b.tone, alpha, scale: pop });
    }
    const wb = ui.wheyBubble;
    if (wb && now < wb.until) {
      const s = this.toScreen(wp.x, 0.55, wp.z);
      speechBubble(ctx, s.x, s.y, wb.text, { tone: 'whey', maxWidth: 190 });
    }

    // tinta do período do dia (igual ao 2D)
    ctx.fillStyle = BLOCK_TINT[state.time.block];
    ctx.fillRect(0, 0, w, h);
  }
}

