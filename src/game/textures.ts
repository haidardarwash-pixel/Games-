import * as THREE from 'three';

export interface ProceduralTexturePack {
  sandColor: THREE.CanvasTexture;
  sandBump: THREE.CanvasTexture;
  monolithColor: THREE.CanvasTexture;
  monolithBump: THREE.CanvasTexture;
  copperCoreColor: THREE.CanvasTexture;
  copperCoreBump: THREE.CanvasTexture;
  cockpitMetalColor: THREE.CanvasTexture;
  cockpitMetalBump: THREE.CanvasTexture;
  smokeSprite: THREE.CanvasTexture;
  glowSprite: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  referenceArtwork: THREE.Texture | null;
  dispose: () => void;
}

function configureTexture(
  tex: THREE.CanvasTexture,
  isColor: boolean,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates procedural PBR textures (albedo + bump/roughness) matching the golden-hour desert,
 * impasto carved bone-sandstone of the reference artwork, weathered olive gunmetal cockpit,
 * and volumetric smoke/glow sprites.
 */
export function createTexturePack(
  renderer: THREE.WebGLRenderer,
  onReferenceLoaded?: (tex: THREE.Texture) => void,
): ProceduralTexturePack {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // 1. Desert Sand Ripples (Color + Bump)
  const sandColorCanvas = document.createElement('canvas');
  sandColorCanvas.width = 512;
  sandColorCanvas.height = 512;
  const scCtx = sandColorCanvas.getContext('2d')!;

  const sandBumpCanvas = document.createElement('canvas');
  sandBumpCanvas.width = 512;
  sandBumpCanvas.height = 512;
  const sbCtx = sandBumpCanvas.getContext('2d')!;

  scCtx.fillStyle = '#c99b68';
  scCtx.fillRect(0, 0, 512, 512);
  sbCtx.fillStyle = '#808080';
  sbCtx.fillRect(0, 0, 512, 512);

  // Wind-carved sand ripples
  for (let y = 0; y < 512; y += 2) {
    const wave = Math.sin((y / 512) * Math.PI * 26) * 0.5 + 0.5;
    const tone = Math.floor(182 + wave * 34);
    const g = Math.floor(136 + wave * 30);
    const b = Math.floor(86 + wave * 24);
    scCtx.fillStyle = `rgba(${tone},${g},${b},0.42)`;
    scCtx.fillRect(0, y, 512, 2);

    const bh = Math.floor(100 + wave * 75);
    sbCtx.fillStyle = `rgb(${bh},${bh},${bh})`;
    sbCtx.fillRect(0, y, 512, 2);
  }

  // Fine sandstone grit & ochre wind streaks
  for (let i = 0; i < 4800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 1 + Math.random() * 8;
    const h = 1 + Math.random() * 2;
    const bright = Math.random() > 0.5;
    scCtx.fillStyle = bright
      ? 'rgba(232, 198, 150, 0.16)'
      : 'rgba(116, 78, 42, 0.18)';
    scCtx.fillRect(x, y, w, h);

    sbCtx.fillStyle = bright
      ? 'rgba(220,220,220,0.18)'
      : 'rgba(55,55,55,0.18)';
    sbCtx.fillRect(x, y, w, h);
  }

  const sandColor = configureTexture(
    new THREE.CanvasTexture(sandColorCanvas),
    true,
    maxAniso,
    24,
    24,
  );
  const sandBump = configureTexture(
    new THREE.CanvasTexture(sandBumpCanvas),
    false,
    maxAniso,
    24,
    24,
  );

  // 2. Impasto Carved Ivory-Bone & Weathered Sandstone (Inspired directly by reference painting)
  const monoColorCanvas = document.createElement('canvas');
  monoColorCanvas.width = 512;
  monoColorCanvas.height = 512;
  const mcCtx = monoColorCanvas.getContext('2d')!;

  const monoBumpCanvas = document.createElement('canvas');
  monoBumpCanvas.width = 512;
  monoBumpCanvas.height = 512;
  const mbCtx = monoBumpCanvas.getContext('2d')!;

  mcCtx.fillStyle = '#d3c5a6';
  mcCtx.fillRect(0, 0, 512, 512);
  mbCtx.fillStyle = '#7c7c7c';
  mbCtx.fillRect(0, 0, 512, 512);

  // Directional oil-impasto ridge strokes matching the sculpted striation in the reference artwork
  const impastoPalette = [
    '#e4dbc5',
    '#d6c7a8',
    '#bfb08f',
    '#9a8868',
    '#6d5d43',
    '#ece3ce',
  ];
  for (let i = 0; i < 3400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const len = 10 + Math.random() * 34;
    const thick = 1.5 + Math.random() * 4.2;
    const angle =
      (Math.sin((y / 512) * Math.PI * 4) * 0.25) +
      (Math.random() - 0.5) * 0.35;

    mcCtx.save();
    mcCtx.translate(x, y);
    mcCtx.rotate(angle);
    mcCtx.fillStyle =
      impastoPalette[Math.floor(Math.random() * impastoPalette.length)];
    mcCtx.globalAlpha = 0.45 + Math.random() * 0.38;
    mcCtx.fillRect(-len * 0.5, -thick * 0.5, len, thick);
    mcCtx.restore();

    const bumpVal = Math.floor(80 + Math.random() * 145);
    mbCtx.save();
    mbCtx.translate(x, y);
    mbCtx.rotate(angle);
    mbCtx.fillStyle = `rgba(${bumpVal},${bumpVal},${bumpVal},0.55)`;
    mbCtx.fillRect(-len * 0.5, -thick * 0.5, len, thick);
    mbCtx.restore();
  }

  // Subtle dark carved crevice veins
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    mcCtx.strokeStyle = 'rgba(54, 43, 30, 0.35)';
    mcCtx.lineWidth = 1 + Math.random() * 1.5;
    mcCtx.beginPath();
    mcCtx.moveTo(x, y);
    mcCtx.lineTo(x + (Math.random() - 0.5) * 56, y + (Math.random() - 0.5) * 28);
    mcCtx.stroke();

    mbCtx.strokeStyle = 'rgba(20, 20, 20, 0.6)';
    mbCtx.lineWidth = 1.5;
    mbCtx.beginPath();
    mbCtx.moveTo(x, y);
    mbCtx.lineTo(x + (Math.random() - 0.5) * 56, y + (Math.random() - 0.5) * 28);
    mbCtx.stroke();
  }

  const monolithColor = configureTexture(
    new THREE.CanvasTexture(monoColorCanvas),
    true,
    maxAniso,
    3,
    3,
  );
  const monolithBump = configureTexture(
    new THREE.CanvasTexture(monoBumpCanvas),
    false,
    maxAniso,
    3,
    3,
  );

  // 3. Russet-Copper Core Texture (matching the two burnt-ochre circular cores)
  const coreColorCanvas = document.createElement('canvas');
  coreColorCanvas.width = 256;
  coreColorCanvas.height = 256;
  const ccCtx = coreColorCanvas.getContext('2d')!;

  const coreBumpCanvas = document.createElement('canvas');
  coreBumpCanvas.width = 256;
  coreBumpCanvas.height = 256;
  const cbCtx = coreBumpCanvas.getContext('2d')!;

  const coreGrad = ccCtx.createRadialGradient(128, 128, 12, 128, 128, 128);
  coreGrad.addColorStop(0, '#c66a35');
  coreGrad.addColorStop(0.55, '#9d4c23');
  coreGrad.addColorStop(1, '#582510');
  ccCtx.fillStyle = coreGrad;
  ccCtx.fillRect(0, 0, 256, 256);

  cbCtx.fillStyle = '#808080';
  cbCtx.fillRect(0, 0, 256, 256);

  // Concentric armored organic rings & stippled brush texture
  for (let r = 18; r < 120; r += 16) {
    ccCtx.strokeStyle = 'rgba(245, 165, 92, 0.35)';
    ccCtx.lineWidth = 2;
    ccCtx.beginPath();
    ccCtx.arc(128, 128, r, 0, Math.PI * 2);
    ccCtx.stroke();

    cbCtx.strokeStyle = 'rgba(235, 235, 235, 0.65)';
    cbCtx.lineWidth = 3;
    cbCtx.beginPath();
    cbCtx.arc(128, 128, r, 0, Math.PI * 2);
    cbCtx.stroke();
  }
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ccCtx.fillStyle =
      Math.random() > 0.5
        ? 'rgba(220, 130, 68, 0.25)'
        : 'rgba(65, 25, 10, 0.28)';
    ccCtx.fillRect(x, y, 4, 3);
    const bv = Math.floor(60 + Math.random() * 140);
    cbCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    cbCtx.fillRect(x, y, 3, 3);
  }

  const copperCoreColor = configureTexture(
    new THREE.CanvasTexture(coreColorCanvas),
    true,
    maxAniso,
  );
  const copperCoreBump = configureTexture(
    new THREE.CanvasTexture(coreBumpCanvas),
    false,
    maxAniso,
  );

  // 4. Military Cockpit Brushed Olive-Gunmetal Texture
  const metalColorCanvas = document.createElement('canvas');
  metalColorCanvas.width = 256;
  metalColorCanvas.height = 256;
  const mlCtx = metalColorCanvas.getContext('2d')!;

  const metalBumpCanvas = document.createElement('canvas');
  metalBumpCanvas.width = 256;
  metalBumpCanvas.height = 256;
  const mlbCtx = metalBumpCanvas.getContext('2d')!;

  mlCtx.fillStyle = '#252a24';
  mlCtx.fillRect(0, 0, 256, 256);
  mlbCtx.fillStyle = '#808080';
  mlbCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1600; i++) {
    const y = Math.random() * 256;
    const x = Math.random() * 256;
    const w = 10 + Math.random() * 40;
    mlCtx.fillStyle =
      Math.random() > 0.5
        ? 'rgba(255,255,255,0.035)'
        : 'rgba(0,0,0,0.08)';
    mlCtx.fillRect(x, y, w, 1);
  }
  // Panel seam & rivets
  mlCtx.strokeStyle = 'rgba(10,12,10,0.65)';
  mlCtx.lineWidth = 2;
  mlCtx.strokeRect(8, 8, 240, 240);
  mlbCtx.strokeStyle = '#222222';
  mlbCtx.lineWidth = 3;
  mlbCtx.strokeRect(8, 8, 240, 240);

  for (let p = 20; p <= 236; p += 36) {
    for (const [rx, ry] of [
      [p, 16],
      [p, 240],
      [16, p],
      [240, p],
    ]) {
      mlCtx.fillStyle = '#3d453b';
      mlCtx.beginPath();
      mlCtx.arc(rx, ry, 2.2, 0, Math.PI * 2);
      mlCtx.fill();
      mlbCtx.fillStyle = '#dfdfdf';
      mlbCtx.beginPath();
      mlbCtx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      mlbCtx.fill();
    }
  }

  const cockpitMetalColor = configureTexture(
    new THREE.CanvasTexture(metalColorCanvas),
    true,
    maxAniso,
    2,
    2,
  );
  const cockpitMetalBump = configureTexture(
    new THREE.CanvasTexture(metalBumpCanvas),
    false,
    maxAniso,
    2,
    2,
  );

  // 5. Soft Smoke & Dust Sprite
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = 128;
  smokeCanvas.height = 128;
  const smCtx = smokeCanvas.getContext('2d')!;
  const smGrad = smCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  smGrad.addColorStop(0, 'rgba(255,255,255,0.88)');
  smGrad.addColorStop(0.45, 'rgba(235,220,200,0.48)');
  smGrad.addColorStop(1, 'rgba(210,190,165,0)');
  smCtx.fillStyle = smGrad;
  smCtx.fillRect(0, 0, 128, 128);
  const smokeSprite = new THREE.CanvasTexture(smokeCanvas);
  smokeSprite.colorSpace = THREE.SRGBColorSpace;

  // 6. Hot Additive Glow Sprite (Explosions, Muzzle Flash, Flares)
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const glCtx = glowCanvas.getContext('2d')!;
  const glGrad = glCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  glGrad.addColorStop(0, 'rgba(255,255,245,1)');
  glGrad.addColorStop(0.28, 'rgba(255,195,95,0.85)');
  glGrad.addColorStop(0.65, 'rgba(235,90,25,0.32)');
  glGrad.addColorStop(1, 'rgba(200,40,0,0)');
  glCtx.fillStyle = glGrad;
  glCtx.fillRect(0, 0, 128, 128);
  const glowSprite = new THREE.CanvasTexture(glowCanvas);
  glowSprite.colorSpace = THREE.SRGBColorSpace;

  // 7. Radial Contact Shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const shCtx = shadowCanvas.getContext('2d')!;
  const shGrad = shCtx.createRadialGradient(128, 128, 18, 128, 128, 124);
  shGrad.addColorStop(0, 'rgba(22,14,8,0.85)');
  shGrad.addColorStop(0.55, 'rgba(28,18,10,0.42)');
  shGrad.addColorStop(1, 'rgba(28,18,10,0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);

  const pack: ProceduralTexturePack = {
    sandColor,
    sandBump,
    monolithColor,
    monolithBump,
    copperCoreColor,
    copperCoreBump,
    cockpitMetalColor,
    cockpitMetalBump,
    smokeSprite,
    glowSprite,
    contactShadow,
    referenceArtwork: null,
    dispose: () => {
      sandColor.dispose();
      sandBump.dispose();
      monolithColor.dispose();
      monolithBump.dispose();
      copperCoreColor.dispose();
      copperCoreBump.dispose();
      cockpitMetalColor.dispose();
      cockpitMetalBump.dispose();
      smokeSprite.dispose();
      glowSprite.dispose();
      contactShadow.dispose();
      pack.referenceArtwork?.dispose();
    },
  };

  // Load the user's reference image (uses embedded data URI in standalone HTML builds)
  const embeddedArt = (
    window as unknown as { __EMBEDDED_REFERENCE_ART__?: string }
  ).__EMBEDDED_REFERENCE_ART__;
  const referenceSrc = embeddedArt || '/assets/aistudio/painted_3da5eda8.png';
  const loader = new THREE.TextureLoader();
  loader.load(
    referenceSrc,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
      pack.referenceArtwork = tex;
      onReferenceLoaded?.(tex);
    },
    undefined,
    () => {
      // Graceful fallback — procedural impasto monolith textures remain active
    },
  );

  return pack;
}
