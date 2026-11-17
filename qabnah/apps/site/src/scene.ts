/**
 * Qabnah hero scene — a small product-photography studio rendered live with three.js:
 * a kraft parcel with brand tape and a shipping label, the Qabnah pin as a glossy object,
 * a phone showing the real storefront, a paper bag, and a relief map of the Muscat coast with a route.
 * Physically based materials, soft shadows, studio environment light, filmic tone mapping. No cartoon shading.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const GREEN = 0x0e7c66;
const SAFFRON = 0xf4a300;

export interface SceneHandle {
  setProgress(p: number): void;
  /** Shift the picture inside the frame, as a fraction of its size (x > 0 moves the subject left, y > 0 moves it up). */
  setShift(x: number, y: number): void;
  resize(): void;
  render(): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

/** Camera stations: position + look-at per chapter (0 hero, 1 customers, 2 merchants, 3 captains). */
const STATIONS = [
  { pos: [3.7, 2.2, 6.1], look: [0.0, 1.0, 0], fov: 30, aside: 1 },
  { pos: [-0.5, 1.3, 3.9], look: [-1.5, 0.95, 0.5], fov: 28, aside: 1 },
  { pos: [2.5, 2.7, 3.1], look: [0.5, 0.6, -0.1], fov: 28, aside: 1.1 },
  { pos: [0.4, 3.3, 8.6], look: [0.4, 0.25, 3.8], fov: 30, aside: 1.7 },
] as const;

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function kraftBump() {
  const rand = mulberry32(7);
  const bump = canvasTexture(512, 512, (c) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) { const v = 105 + Math.floor(rand() * 70); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(rand() * 512, rand() * 512, 1 + rand() * 4, 1); }
    for (let y = 0; y < 512; y += 5) { c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(0, y, 512, 1); }
  });
  bump.colorSpace = THREE.NoColorSpace;
  return bump;
}

/** One printed kraft face: paper fibres, edge darkening, handling marks and the brand stamp in ink. */
function kraftFace(print: 'front' | 'side' | 'top' | 'plain', tone = '#b88957') {
  const rand = mulberry32(print.length * 13 + 3);
  return canvasTexture(1024, 768, (c) => {
    c.fillStyle = tone; c.fillRect(0, 0, 1024, 768);
    for (let i = 0; i < 7000; i++) {
      const x = rand() * 1024, y = rand() * 768, l = 8 + rand() * 30;
      c.strokeStyle = rand() > 0.5 ? `rgba(255,232,196,${0.03 + rand() * 0.05})` : `rgba(64,36,12,${0.03 + rand() * 0.06})`;
      c.lineWidth = 0.6 + rand(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + (rand() - 0.5) * 3); c.stroke();
    }
    for (let y = 0; y < 768; y += 8) { c.fillStyle = 'rgba(60,35,10,0.022)'; c.fillRect(0, y, 1024, 2); }
    const g = c.createRadialGradient(512, 384, 220, 512, 384, 700); g.addColorStop(0, 'rgba(40,20,5,0)'); g.addColorStop(1, 'rgba(40,20,5,0.36)');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 768);
    c.strokeStyle = 'rgba(50,28,8,0.55)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, 1021, 765);
    const ink = 'rgba(52,30,10,0.8)';
    if (print === 'side') {
      c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
      const arrow = (x: number) => { c.beginPath(); c.moveTo(x, 560); c.lineTo(x, 400); c.moveTo(x - 34, 440); c.lineTo(x, 396); c.lineTo(x + 34, 440); c.stroke(); };
      arrow(150); arrow(240); c.beginPath(); c.moveTo(105, 590); c.lineTo(285, 590); c.stroke();
      c.beginPath(); c.moveTo(380, 400); c.lineTo(470, 400); c.lineTo(455, 480); c.quadraticCurveTo(425, 500, 395, 480); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(425, 500); c.lineTo(425, 570); c.moveTo(385, 590); c.lineTo(465, 590); c.stroke();
      c.font = '700 40px "IBM Plex Sans Arabic", sans-serif'; c.direction = 'rtl'; c.textAlign = 'left'; c.fillText('يُحمل بعناية', 105, 690);
    }
    if (print === 'top' || print === 'side') {
      c.save(); c.translate(print === 'top' ? 800 : 810, print === 'top' ? 560 : 300); c.globalAlpha = 0.85;
      c.fillStyle = '#0c6a57'; c.beginPath(); c.arc(-34, -78, 20, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(34, -78, 20, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(0, 118); c.bezierCurveTo(-18, 78, -62, 44, -62, 0); c.arc(0, 0, 62, Math.PI, 0, false); c.bezierCurveTo(62, 44, 18, 78, 0, 118); c.fill();
      c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(0, 0, 24, 0, Math.PI * 2); c.fill(); c.restore();
    }
  });
}

function labelTexture() {
  return canvasTexture(768, 512, (c) => {
    c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, 768, 512);
    c.fillStyle = '#0e7c66'; c.fillRect(0, 0, 768, 92);
    c.fillStyle = '#fff'; c.font = '700 58px "IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif'; c.textBaseline = 'middle';
    c.textAlign = 'right'; c.direction = 'rtl'; c.fillText('قبناه', 736, 48);
    c.textAlign = 'left'; c.direction = 'ltr'; c.font = '700 34px "IBM Plex Sans", sans-serif'; c.fillText('QABNAH', 32, 50);
    c.fillStyle = '#0b1f1c'; c.font = '600 30px "IBM Plex Sans Arabic", sans-serif'; c.textAlign = 'right'; c.direction = 'rtl';
    c.fillText('إلى: القرم، مسقط', 736, 150);
    c.fillStyle = '#5b6b68'; c.font = '400 24px "IBM Plex Sans Arabic", sans-serif';
    c.fillText('من: الخوير', 736, 196);
    c.fillStyle = '#0b1f1c'; c.direction = 'ltr'; c.textAlign = 'left'; c.font = '600 40px "IBM Plex Sans", monospace';
    c.fillText('QB100032', 32, 170);
    const rnd = mulberry32(21); let x = 32;
    while (x < 736) { const w = 2 + Math.floor(rnd() * 7); if (rnd() > 0.42) { c.fillStyle = '#0b1f1c'; c.fillRect(x, 250, w, 170); } x += w + 2; }
    c.fillStyle = '#5b6b68'; c.font = '400 22px "IBM Plex Sans", monospace'; c.fillText('MCT · OM · 1 / 1', 32, 462);
    c.fillStyle = '#f4a300'; c.beginPath(); c.arc(700, 458, 16, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(656, 458, 16, 0, Math.PI * 2); c.fill();
  });
}

/** Relief map: land tone, the coast, a street grid; used on the map slab. */
function mapTexture() {
  return canvasTexture(1024, 768, (c) => {
    c.fillStyle = '#103029'; c.fillRect(0, 0, 1024, 768);
    const sea = c.createLinearGradient(0, 0, 0, 260); sea.addColorStop(0, '#07231f'); sea.addColorStop(1, '#0b4039');
    c.fillStyle = sea; c.beginPath(); c.moveTo(0, 0); c.lineTo(1024, 0); c.lineTo(1024, 150);
    c.bezierCurveTo(820, 220, 700, 120, 560, 190); c.bezierCurveTo(420, 260, 260, 150, 0, 240); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(244,163,0,0.4)'; c.lineWidth = 2; c.beginPath(); c.moveTo(1024, 150);
    c.bezierCurveTo(820, 220, 700, 120, 560, 190); c.bezierCurveTo(420, 260, 260, 150, 0, 240); c.stroke();
    const rnd = mulberry32(5);
    c.strokeStyle = 'rgba(227,243,239,0.16)'; c.lineWidth = 1.4;
    for (let i = 0; i < 26; i++) { const y = 270 + i * 20 + rnd() * 6; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(300, y - 30 * rnd(), 700, y + 30 * rnd(), 1024, y - 10); c.stroke(); }
    for (let i = 0; i < 34; i++) { const x = i * 31 + rnd() * 8; c.beginPath(); c.moveTo(x, 250 + rnd() * 40); c.lineTo(x + 40 * (rnd() - 0.5), 768); c.stroke(); }
    c.strokeStyle = 'rgba(227,243,239,0.45)'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 420); c.bezierCurveTo(300, 360, 700, 470, 1024, 380); c.stroke();
  });
}

/** The Qabnah mark as an object: a glossy teardrop pin with a green core and two saffron dots above. */
function buildPin() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.15);
  shape.bezierCurveTo(-0.16, -0.78, -0.56, -0.42, -0.56, 0.02);
  shape.absarc(0, 0.02, 0.56, Math.PI, 0, true);
  shape.bezierCurveTo(0.56, -0.42, 0.16, -0.78, 0, -1.15);
  const hole = new THREE.Path(); hole.absarc(0, 0.04, 0.215, 0, Math.PI * 2, false); shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.08, bevelSegments: 14, curveSegments: 64 });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(0, 0, -(bb.max.z + bb.min.z) / 2);
  const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xf7f3ea, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1 }));
  body.castShadow = true; g.add(body);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.14, 48), new THREE.MeshPhysicalMaterial({ color: GREEN, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }));
  core.rotation.x = Math.PI / 2; core.position.set(0, 0.04, 0); g.add(core);
  const dotMat = new THREE.MeshPhysicalMaterial({ color: SAFFRON, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, emissive: SAFFRON, emissiveIntensity: 0.42 });
  for (const x of [-0.27, 0.27]) { const dd = new THREE.Mesh(new THREE.SphereGeometry(0.16, 48, 32), dotMat); dd.position.set(x, 0.98, 0); dd.castShadow = true; g.add(dd); }
  return g;
}

function buildParcel(bump: THREE.Texture) {
  const g = new THREE.Group();
  const w = 1.7, h = 1.1, d = 1.3;
  const face = (print: 'front' | 'side' | 'top' | 'plain') => new THREE.MeshStandardMaterial({ map: kraftFace(print), bumpMap: bump, bumpScale: 0.8, roughness: 0.94, metalness: 0, envMapIntensity: 0.35 });
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [face('side'), face('plain'), face('top'), face('plain'), face('front'), face('plain')]);
  box.castShadow = true; box.receiveShadow = true; box.position.y = h / 2; g.add(box);
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a3d20, roughness: 1 });
  const seam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.999, 0.003, 0.014), dark); seam.position.set(0, h + 0.0005, 0); g.add(seam);
  for (const sgn of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, d * 0.999), dark); e.position.set(sgn * (w / 2 + 0.0005), h - 0.21, 0); g.add(e); }
  const tapeMat = new THREE.MeshPhysicalMaterial({ color: GREEN, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
  const tapeTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.008, 0.004, 0.19), tapeMat); tapeTop.position.set(0, h + 0.003, 0); tapeTop.castShadow = true; g.add(tapeTop);
  for (const sgn of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.3, 0.19), tapeMat); t.position.set(sgn * (w / 2 + 0.003), h - 0.15, 0); g.add(t); }
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.56), new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.7, envMapIntensity: 0.4 }));
  label.position.set(0.28, h * 0.52, d / 2 + 0.003); label.rotation.z = -0.02; g.add(label);
  return g;
}

function buildPhone() {
  const g = new THREE.Group();
  const w = 0.74, h = 1.52, t = 0.075;
  const frame = new THREE.Mesh(new RoundedBoxGeometry(w, h, t, 6, 0.07), new THREE.MeshPhysicalMaterial({ color: 0x1a1d1c, metalness: 0.9, roughness: 0.24, clearcoat: 0.5 }));
  frame.castShadow = true; g.add(frame);
  // the display shows the screenshot in true colours (not tone-mapped), under a thin reflective glass layer
  const display = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.045, h - 0.045), new THREE.MeshBasicMaterial({ color: 0x101312, toneMapped: false }));
  display.position.z = t / 2 + 0.0012; display.name = 'display'; g.add(display);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3 }));
  glass.position.z = t / 2 + 0.0024; g.add(glass);
  const cam = new THREE.Mesh(new THREE.CircleGeometry(0.014, 24), new THREE.MeshBasicMaterial({ color: 0x050606 })); cam.position.set(0, h / 2 - 0.06, t / 2 + 0.003); g.add(cam);
  return g;
}

function buildBag(bump: THREE.Texture) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: kraftFace('plain', '#d8bf98'), bumpMap: bump, bumpScale: 0.6, roughness: 0.95, envMapIntensity: 0.3 });
  const geo = new THREE.BoxGeometry(0.72, 0.9, 0.42, 1, 6, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) * (1 - Math.max(0, y) * 0.12)); pos.setZ(i, pos.getZ(i) * (1 - Math.max(0, y) * 0.5)); }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, mat); body.position.y = 0.45; body.castShadow = true; body.receiveShadow = true; g.add(body);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xcdb48c, roughness: 0.9 });
  for (const z of [-0.05, 0.05]) { const hnd = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 10, 40, Math.PI), handleMat); hnd.position.set(0, 0.9, z); hnd.castShadow = true; g.add(hnd); }
  const sticker = new THREE.Mesh(new THREE.CircleGeometry(0.1, 48), new THREE.MeshPhysicalMaterial({ color: GREEN, roughness: 0.3, clearcoat: 0.8 }));
  sticker.position.set(0, 0.3, 0.2105); g.add(sticker);
  return g;
}

function buildMap() {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new RoundedBoxGeometry(4.6, 0.12, 3.2, 4, 0.04), new THREE.MeshPhysicalMaterial({ map: mapTexture(), roughness: 0.4, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }));
  slab.receiveShadow = true; slab.castShadow = true; slab.position.y = 0.06; g.add(slab);
  const pts = [new THREE.Vector3(-1.5, 0.14, 0.7), new THREE.Vector3(-0.8, 0.14, 0.15), new THREE.Vector3(-0.1, 0.14, 0.45), new THREE.Vector3(0.7, 0.14, -0.05), new THREE.Vector3(1.45, 0.14, 0.35)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const route = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.022, 10, false), new THREE.MeshStandardMaterial({ color: SAFFRON, emissive: SAFFRON, emissiveIntensity: 1.6, roughness: 0.4 }));
  g.add(route);
  const stopMat = new THREE.MeshPhysicalMaterial({ color: 0xfbf7ef, roughness: 0.3, clearcoat: 1 });
  for (const p of [pts[0], pts[pts.length - 1]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 32), stopMat); s.position.copy(p).setY(0.135); g.add(s); }
  const rider = new THREE.Mesh(new THREE.SphereGeometry(0.06, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 1.2 }));
  g.add(rider);
  // low city blocks on the land side give the slab real relief
  const rnd = mulberry32(11);
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x1b4a41, roughness: 0.65, envMapIntensity: 0.4 });
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMat, 150);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  let n = 0;
  while (n < 150) {
    const x = (rnd() - 0.5) * 4.2, z = -0.75 + rnd() * 2.2;
    const near = curve.getPoints(40).some((pt) => Math.hypot(pt.x - x, pt.z - z) < 0.16);
    if (near) continue;
    const hgt = 0.03 + rnd() * rnd() * 0.22;
    sc.set(0.07 + rnd() * 0.12, hgt, 0.07 + rnd() * 0.12); ps.set(x, 0.12 + hgt / 2, z);
    blocks.setMatrixAt(n++, m4.compose(ps, q, sc));
  }
  blocks.castShadow = true; blocks.receiveShadow = true; g.add(blocks);
  g.userData = { curve, rider };
  return g;
}

export function createScene(canvas: HTMLCanvasElement, opts: { screenUrl?: string; pixelRatio?: number; onReady?: () => void } = {}): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(opts.pixelRatio ?? Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const bg = new THREE.Color(0x061a16);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 12, 30);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  // lights: warm key with a soft shadow, cool fill from the opposite side, saffron rim from behind
  const key = new THREE.DirectionalLight(0xfff8f0, 2.9);
  key.position.set(5, 7.5, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 24;
  key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.radius = 7; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fd0c2, 0.55); fill.position.set(-5, 3, 5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffb52e, 0.4); rim.position.set(-3.5, 3.4, -6); scene.add(rim);

  // studio floor: deep green satin that catches the soft shadow
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: 0x07342d, roughness: 0.96, metalness: 0, envMapIntensity: 0.05, emissive: 0x031a16, emissiveIntensity: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // a soft pool of light on the backdrop, for depth
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), new THREE.MeshBasicMaterial({
    map: canvasTexture(512, 256, (c) => { const gr = c.createRadialGradient(256, 150, 10, 256, 150, 260); gr.addColorStop(0, 'rgba(24,120,100,0.75)'); gr.addColorStop(0.45, 'rgba(14,80,68,0.28)'); gr.addColorStop(1, 'rgba(6,26,22,0)'); c.fillStyle = gr; c.fillRect(0, 0, 512, 256); }),
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
  }));
  glow.position.set(0, 3.2, -9); scene.add(glow);

  const bump = kraftBump();
  const parcel = buildParcel(bump); parcel.rotation.y = -0.38; scene.add(parcel);
  const pin = buildPin(); scene.add(pin);
  const bag = buildBag(bump); bag.position.set(-0.55, 0, -1.8); bag.rotation.y = -0.3; scene.add(bag);
  const phone = buildPhone(); phone.position.set(-1.6, 0.86, 0.45); phone.rotation.set(-0.14, 0.4, 0.02); scene.add(phone);
  const map = buildMap(); map.position.set(0.4, 0, 3.9); map.rotation.y = -0.06; scene.add(map);

  let ready = !opts.screenUrl;
  if (opts.screenUrl) {
    new THREE.TextureLoader().load(opts.screenUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const m = (phone.getObjectByName('display') as THREE.Mesh).material as THREE.MeshBasicMaterial;
      const glassAspect = (0.74 - 0.045) / (1.52 - 0.045); const imgAspect = tex.image.width / tex.image.height;
      if (imgAspect < glassAspect) { const v = imgAspect / glassAspect; tex.repeat.set(1, v); tex.offset.set(0, 1 - v); }
      m.map = tex; m.color.set(0xffffff); m.needsUpdate = true;
      ready = true; render(); opts.onReady?.();
    }, undefined, () => { ready = true; opts.onReady?.(); });
  }

  let progress = 0, shown = 0, raf = 0, running = false, lastT = 0;
  let shiftX = 0, shiftY = 0, vw = 1, vh = 1, aside = 1;
  const clock = new THREE.Clock();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), look = new THREE.Vector3();
  const ease = (x: number) => x * x * (3 - 2 * x);
  const PIN_HOME = new THREE.Vector3(0, 2.05, 0);

  function applyCamera(p: number) {
    const i = Math.min(STATIONS.length - 2, Math.max(0, Math.floor(p)));
    const f = ease(Math.min(1, Math.max(0, p - i)));
    const a = STATIONS[i], b = STATIONS[i + 1];
    // pull back on narrow screens, and a little when the picture is shifted aside to make room for copy
    const narrow = (camera.aspect < 0.62 ? 1.62 : camera.aspect < 0.8 ? 1.5 : camera.aspect < 1.2 ? 1.2 : 1) * (1 + Math.abs(shiftX) * 0.9);
    tmpA.set(a.pos[0], a.pos[1], a.pos[2]); tmpB.set(b.pos[0], b.pos[1], b.pos[2]);
    camera.position.lerpVectors(tmpA, tmpB, f);
    tmpA.set(a.look[0], a.look[1], a.look[2]); tmpB.set(b.look[0], b.look[1], b.look[2]);
    look.lerpVectors(tmpA, tmpB, f);
    // on narrow screens pull the camera back along its view direction so the subject stays in frame
    camera.position.sub(look).multiplyScalar(narrow).add(look);
    camera.fov = a.fov + (b.fov - a.fov) * f;
    aside = a.aside + (b.aside - a.aside) * f; // some chapters need the subject pushed further away from the copy
    applyShift();
    camera.updateProjectionMatrix();
    camera.lookAt(look);
  }

  function render() {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.25, t - lastT); lastT = t;
    shown += (progress - shown) * (1 - Math.exp(-dt * 5.5)); // time-based easing: same feel at any frame rate
    if (Math.abs(progress - shown) < 0.0005) shown = progress;
    applyCamera(shown);
    // the pin hovers over the parcel, then travels to the customer's end of the route in the last chapter
    const travel = ease(Math.min(1, Math.max(0, shown - 2.15) / 0.75));
    const mapEnd = tmpA.set(1.45, 0.62, 0.35).applyEuler(map.rotation).add(map.position);
    pin.position.lerpVectors(PIN_HOME, mapEnd, travel);
    pin.position.y += Math.sin(t * 1.2) * 0.05 * (1 - travel);
    pin.rotation.y = (Math.sin(t * 0.5) * 0.3 + Math.min(shown, 2) * 0.3) * (1 - travel) - 0.25 * travel;
    pin.scale.setScalar(0.5 - travel * 0.18);
    const { curve, rider } = map.userData as { curve: THREE.CatmullRomCurve3; rider: THREE.Mesh };
    rider.position.copy(curve.getPointAt((t * 0.07) % 1)).setY(0.19);
    renderer.render(scene, camera);
  }
  function loop() { if (!running) return; render(); raf = requestAnimationFrame(loop); }
  function applyShift() {
    if (shiftX || shiftY) camera.setViewOffset(vw, vh, vw * shiftX * aside, vh * shiftY, vw, vh); else camera.clearViewOffset();
  }
  function resize() {
    vw = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    vh = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh; applyShift(); camera.updateProjectionMatrix();
  }
  resize();
  applyCamera(0);
  if (ready) opts.onReady?.();

  return {
    setProgress(p) { progress = Math.min(STATIONS.length - 1, Math.max(0, p)); },
    setShift(x, y) { shiftX = x; shiftY = y; applyShift(); camera.updateProjectionMatrix(); },
    resize,
    render() { shown = progress; render(); },
    start() { if (running) return; running = true; clock.start(); loop(); },
    stop() { running = false; cancelAnimationFrame(raf); },
    dispose() { running = false; cancelAnimationFrame(raf); pmrem.dispose(); renderer.dispose(); },
  };
}
