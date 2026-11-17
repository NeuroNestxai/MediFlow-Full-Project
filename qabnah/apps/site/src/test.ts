import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import { createScene } from './scene';
await document.fonts.load('700 58px "IBM Plex Sans Arabic"');
const s = createScene(document.getElementById('stage') as HTMLCanvasElement, { screenUrl: '/img/screen-storefront.png', onReady: () => ((window as any).__ready = true) });
(window as any).__scene = s;
s.render();
