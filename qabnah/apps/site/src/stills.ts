// Development-only harness used by scripts/render-stills.cjs to photograph the live scene for phones and no-WebGL fallbacks.
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import { createScene, type SceneHandle } from './scene';

declare global { interface Window { __scene: SceneHandle; __ready?: boolean } }
await document.fonts.load('700 58px "IBM Plex Sans Arabic"');
const scene = createScene(document.getElementById('stage') as HTMLCanvasElement, { screenUrl: '/img/phone-storefront.png', pixelRatio: 1, onReady: () => { window.__ready = true; } });
window.__scene = scene;
scene.render();
