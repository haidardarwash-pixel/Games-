import * as THREE from 'three';
import type { ProceduralTexturePack } from './textures';
import type { TargetEntity } from './monolith';

export interface CockpitRig {
  group: THREE.Group;
  muzzleWorldPos: (out: THREE.Vector3) => THREE.Vector3;
  triggerMuzzleFlash: () => void;
  update: (params: {
    dt: number;
    elapsed: number;
    moveForward: number;
    moveRight: number;
    moveUp: number;
    pitchRad: number;
    rollRad: number;
    headingRad: number;
    lookYaw: number;
    lookPitch: number;
    missileWarning: boolean;
    hullPct: number;
    heliPos: THREE.Vector3;
    targets: TargetEntity[];
  }) => void;
  dispose: () => void;
}

/**
 * Builds a 14-part first-person military attack helicopter cockpit rig attached to the
 * player flight frame. Leaves the central 85%+ sightline crisp and unobstructed while
 * surrounding the periphery with armored struts, angled canopy glass, bolted glareshield,
 * live radar/attitude MFD screens, animated cyclic stick & collective lever, overhead
 * spinning rotor blur disc, and recoiling chin-mounted 30mm autocannon.
 */
export function createCockpitRig(
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean,
): CockpitRig {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Materials with distinct roughness/metalness contrast across adjacent parts
  const matteDashMat = new THREE.MeshStandardMaterial({
    map: textures.cockpitMetalColor,
    bumpMap: textures.cockpitMetalBump,
    bumpScale: 0.025,
    color: '#202420',
    roughness: 0.82,
    metalness: 0.25,
  });

  const strutArmorMat = new THREE.MeshStandardMaterial({
    map: textures.cockpitMetalColor,
    bumpMap: textures.cockpitMetalBump,
    bumpScale: 0.03,
    color: '#2e342c',
    roughness: 0.56,
    metalness: 0.58,
  });

  const gunmetalMat = new THREE.MeshStandardMaterial({
    color: '#1b1d1c',
    roughness: 0.32,
    metalness: 0.85,
  });

  const gripRubberMat = new THREE.MeshStandardMaterial({
    color: '#151515',
    roughness: 0.92,
    metalness: 0.05,
  });

  const canopyGlassMat = new THREE.MeshPhysicalMaterial({
    color: '#9ec4b0',
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: isSoftwareGl ? 0.08 : 0.09,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const hudGlassMat = new THREE.MeshBasicMaterial({
    color: '#4ade80',
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const warningLedMat = new THREE.MeshStandardMaterial({
    color: '#3a1410',
    emissive: '#ff2b1a',
    emissiveIntensity: 0.1,
    roughness: 0.35,
  });

  disposables.push(
    matteDashMat,
    strutArmorMat,
    gunmetalMat,
    gripRubberMat,
    canopyGlassMat,
    hudGlassMat,
    warningLedMat,
  );

  // Live CanvasTextures for Left MFD (Tactical Radar) & Right MFD (Attitude & Systems)
  const leftMfdCanvas = document.createElement('canvas');
  leftMfdCanvas.width = 256;
  leftMfdCanvas.height = 256;
  const leftCtx = leftMfdCanvas.getContext('2d')!;
  const leftMfdTex = new THREE.CanvasTexture(leftMfdCanvas);
  leftMfdTex.colorSpace = THREE.SRGBColorSpace;

  const rightMfdCanvas = document.createElement('canvas');
  rightMfdCanvas.width = 256;
  rightMfdCanvas.height = 256;
  const rightCtx = rightMfdCanvas.getContext('2d')!;
  const rightMfdTex = new THREE.CanvasTexture(rightMfdCanvas);
  rightMfdTex.colorSpace = THREE.SRGBColorSpace;

  const leftMfdMat = new THREE.MeshBasicMaterial({ map: leftMfdTex });
  const rightMfdMat = new THREE.MeshBasicMaterial({ map: rightMfdTex });
  disposables.push(leftMfdTex, rightMfdTex, leftMfdMat, rightMfdMat);

  // 1. Armored Lower Glareshield & Instrument Console (sits cleanly at bottom of pilot FOV)
  const dashGeo = new THREE.BoxGeometry(1.72, 0.36, 0.72);
  const dash = new THREE.Mesh(dashGeo, matteDashMat);
  dash.position.set(0, -0.58, -0.96);
  dash.rotation.x = 0.24;
  dash.receiveShadow = true;
  group.add(dash);

  // Beveled top coaming lip shielding the MFDs from desert glare
  const coamingGeo = new THREE.BoxGeometry(1.52, 0.07, 0.56);
  const coaming = new THREE.Mesh(coamingGeo, strutArmorMat);
  coaming.position.set(0, -0.39, -1.04);
  coaming.rotation.x = 0.08;
  group.add(coaming);

  // Center raised HUD projector housing
  const hudHoodGeo = new THREE.BoxGeometry(0.38, 0.14, 0.34);
  const hudHood = new THREE.Mesh(hudHoodGeo, strutArmorMat);
  hudHood.position.set(0, -0.34, -1.06);
  group.add(hudHood);

  // Angled combiner glass above the HUD hood
  const combinerGeo = new THREE.PlaneGeometry(0.32, 0.22);
  const combiner = new THREE.Mesh(combinerGeo, hudGlassMat);
  combiner.position.set(0, -0.22, -1.04);
  combiner.rotation.x = -0.36;
  combiner.renderOrder = 3;
  group.add(combiner);

  // 2. Left & Right Recessed Multi-Function Displays (MFDs) with Bezel Frames
  const mfdBezelGeo = new THREE.BoxGeometry(0.34, 0.27, 0.05);
  const mfdScreenGeo = new THREE.PlaneGeometry(0.29, 0.22);

  for (const side of [-1, 1]) {
    const bezel = new THREE.Mesh(mfdBezelGeo, gunmetalMat);
    bezel.position.set(side * 0.42, -0.51, -0.91);
    bezel.rotation.set(-0.28, side * -0.16, 0);
    group.add(bezel);

    const screen = new THREE.Mesh(
      mfdScreenGeo,
      side < 0 ? leftMfdMat : rightMfdMat,
    );
    screen.position.set(side * 0.42, -0.51, -0.882);
    screen.rotation.set(-0.28, side * -0.16, 0);
    group.add(screen);
  }

  // Master Caution / Missile Warning LED strip across top coaming
  const warnBarGeo = new THREE.BoxGeometry(0.28, 0.026, 0.03);
  const warnBar = new THREE.Mesh(warnBarGeo, warningLedMat);
  warnBar.position.set(0, -0.345, -0.88);
  group.add(warnBar);

  // 3. Peripheral Armored Canopy Frame Struts (Left/Right A-pillars & Overhead Bow)
  const addStrut = (
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    radius: number,
  ) => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(radius, radius * 1.15, len, 6);
    const mesh = new THREE.Mesh(geo, strutArmorMat);
    mesh.position.copy(p1).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    group.add(mesh);
    disposables.push(geo);
  };

  // Wide peripheral A-pillars framing the desert panorama without blocking center sightline
  addStrut(new THREE.Vector3(-0.92, -0.52, -0.98), new THREE.Vector3(-0.78, 0.62, -0.64), 0.042);
  addStrut(new THREE.Vector3(0.92, -0.52, -0.98), new THREE.Vector3(0.78, 0.62, -0.64), 0.042);
  // Overhead cockpit bow & twin roof longitudinal rails
  addStrut(new THREE.Vector3(-0.78, 0.62, -0.64), new THREE.Vector3(0.78, 0.62, -0.64), 0.044);
  addStrut(new THREE.Vector3(-0.78, 0.62, -0.64), new THREE.Vector3(-0.82, 0.66, 0.55), 0.04);
  addStrut(new THREE.Vector3(0.78, 0.62, -0.64), new THREE.Vector3(0.82, 0.66, 0.55), 0.04);
  // Side lower sill rails
  addStrut(new THREE.Vector3(-0.92, -0.52, -0.98), new THREE.Vector3(-0.96, -0.45, 0.45), 0.05);
  addStrut(new THREE.Vector3(0.92, -0.52, -0.98), new THREE.Vector3(0.96, -0.45, 0.45), 0.05);
  // Subtle lower nose-glass diagonal braces
  addStrut(new THREE.Vector3(-0.92, -0.52, -0.98), new THREE.Vector3(-0.56, -0.82, -1.48), 0.032);
  addStrut(new THREE.Vector3(0.92, -0.52, -0.98), new THREE.Vector3(0.56, -0.82, -1.48), 0.032);

  // Subtle angled canopy glass windscreen panel
  const windscreenGeo = new THREE.PlaneGeometry(1.66, 1.18);
  const windscreen = new THREE.Mesh(windscreenGeo, canopyGlassMat);
  windscreen.position.set(0, 0.08, -0.82);
  windscreen.rotation.x = 0.28;
  windscreen.renderOrder = 2;
  group.add(windscreen);

  // 4. Animated Cyclic Joystick (Center-lower) & Collective Lever (Left side)
  const cyclicPivot = new THREE.Group();
  cyclicPivot.position.set(0, -0.88, -0.58);
  group.add(cyclicPivot);

  const stickShaftGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.34, 8);
  const stickShaft = new THREE.Mesh(stickShaftGeo, gunmetalMat);
  stickShaft.position.y = 0.17;
  cyclicPivot.add(stickShaft);

  const stickGripGeo = new THREE.CylinderGeometry(0.032, 0.026, 0.14, 10);
  const stickGrip = new THREE.Mesh(stickGripGeo, gripRubberMat);
  stickGrip.position.set(0, 0.34, 0.01);
  stickGrip.rotation.x = 0.18;
  cyclicPivot.add(stickGrip);

  const triggerGuardGeo = new THREE.BoxGeometry(0.05, 0.04, 0.05);
  const triggerGuard = new THREE.Mesh(triggerGuardGeo, warningLedMat);
  triggerGuard.position.set(0, 0.4, -0.01);
  cyclicPivot.add(triggerGuard);

  // Left-side Collective Lever
  const collectivePivot = new THREE.Group();
  collectivePivot.position.set(-0.72, -0.68, -0.35);
  group.add(collectivePivot);

  const collShaftGeo = new THREE.CylinderGeometry(0.02, 0.022, 0.45, 8);
  collShaftGeo.rotateX(Math.PI / 2);
  const collShaft = new THREE.Mesh(collShaftGeo, gunmetalMat);
  collShaft.position.z = -0.22;
  collectivePivot.add(collShaft);

  const collHeadGeo = new THREE.BoxGeometry(0.09, 0.055, 0.12);
  const collHead = new THREE.Mesh(collHeadGeo, gripRubberMat);
  collHead.position.z = -0.45;
  collectivePivot.add(collHead);

  // 5. Overhead Main Rotor Blur Disc & Spinning Blades (visible at upper edge of canopy!)
  const rotorGroup = new THREE.Group();
  rotorGroup.position.set(0, 1.08, -0.15);
  group.add(rotorGroup);

  const rotorDiscGeo = new THREE.RingGeometry(0.55, 5.4, 32);
  rotorDiscGeo.rotateX(Math.PI / 2);
  const rotorDiscMat = new THREE.MeshBasicMaterial({
    color: '#1b1a18',
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const rotorDisc = new THREE.Mesh(rotorDiscGeo, rotorDiscMat);
  rotorGroup.add(rotorDisc);

  const bladeGeo = new THREE.BoxGeometry(10.6, 0.02, 0.24);
  const bladeMat = new THREE.MeshBasicMaterial({
    color: '#161614',
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
  const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
  blade2.rotation.y = Math.PI / 2;
  rotorGroup.add(blade1, blade2);

  // 6. Slaved Chin-Mounted 30mm Autocannon Barrel & Stub-Wing Rocket Pods
  const cannonPivot = new THREE.Group();
  cannonPivot.position.set(0, -0.98, -1.65);
  group.add(cannonPivot);

  const barrelGeo = new THREE.CylinderGeometry(0.036, 0.044, 1.35, 10);
  barrelGeo.rotateX(Math.PI / 2);
  const barrelMesh = new THREE.Mesh(barrelGeo, gunmetalMat);
  barrelMesh.position.set(0, 0, -0.58);
  cannonPivot.add(barrelMesh);

  const flashBrakeGeo = new THREE.CylinderGeometry(0.054, 0.044, 0.2, 8);
  flashBrakeGeo.rotateX(Math.PI / 2);
  const flashBrake = new THREE.Mesh(flashBrakeGeo, strutArmorMat);
  flashBrake.position.set(0, 0, -1.26);
  cannonPivot.add(flashBrake);

  // Stub-wing Hydra-70 rocket pod tips visible at lower outer flanks
  const podGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.95, 12);
  podGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(podGeo, strutArmorMat);
    pod.position.set(side * 1.48, -0.62, -1.15);
    group.add(pod);
  }

  // Muzzle flash sprite + dynamic warm PointLight illuminating the cockpit interior on shots!
  const muzzleLight = new THREE.PointLight('#ff9c3b', 0, 12, 2);
  muzzleLight.position.set(0, -0.82, -2.5);
  group.add(muzzleLight);

  const muzzleSpriteMat = new THREE.SpriteMaterial({
    map: textures.glowSprite,
    color: '#ffd27d',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const muzzleSprite = new THREE.Sprite(muzzleSpriteMat);
  muzzleSprite.position.set(0, 0, -1.42);
  muzzleSprite.scale.set(0.68, 0.68, 1);
  cannonPivot.add(muzzleSprite);

  disposables.push(
    dashGeo,
    coamingGeo,
    hudHoodGeo,
    combinerGeo,
    mfdBezelGeo,
    mfdScreenGeo,
    warnBarGeo,
    windscreenGeo,
    stickShaftGeo,
    stickGripGeo,
    triggerGuardGeo,
    collShaftGeo,
    collHeadGeo,
    rotorDiscGeo,
    rotorDiscMat,
    bladeGeo,
    bladeMat,
    barrelGeo,
    flashBrakeGeo,
    podGeo,
    muzzleSpriteMat,
  );

  let muzzleFlashTimer = 0;
  let recoilOffset = 0;
  let mfdTimer = 0;

  const drawLeftRadarMfd = (
    heliPos: THREE.Vector3,
    headingRad: number,
    targets: TargetEntity[],
    elapsed: number,
  ) => {
    leftCtx.fillStyle = '#071109';
    leftCtx.fillRect(0, 0, 256, 256);

    const cx = 128;
    const cy = 136;

    // Tactical radar range rings
    leftCtx.strokeStyle = 'rgba(74, 222, 128, 0.28)';
    leftCtx.lineWidth = 1.5;
    for (const r of [34, 68, 102]) {
      leftCtx.beginPath();
      leftCtx.arc(cx, cy, r, 0, Math.PI * 2);
      leftCtx.stroke();
    }

    // Crosshairs
    leftCtx.beginPath();
    leftCtx.moveTo(cx - 104, cy);
    leftCtx.lineTo(cx + 104, cy);
    leftCtx.moveTo(cx, cy - 104);
    leftCtx.lineTo(cx, cy + 104);
    leftCtx.stroke();

    // Rotating sweep line
    const sweep = (elapsed * 2.2) % (Math.PI * 2);
    leftCtx.strokeStyle = 'rgba(74, 222, 128, 0.55)';
    leftCtx.beginPath();
    leftCtx.moveTo(cx, cy);
    leftCtx.lineTo(cx + Math.cos(sweep) * 102, cy + Math.sin(sweep) * 102);
    leftCtx.stroke();

    // Rotate relative to helicopter heading
    const cosH = Math.cos(headingRad);
    const sinH = Math.sin(headingRad);
    const scale = 0.62;

    const plotWorld = (wx: number, wz: number) => {
      const dx = wx - heliPos.x;
      const dz = wz - heliPos.z;
      const rx = dx * cosH - dz * sinH;
      const rz = dx * sinH + dz * cosH;
      return {
        x: cx + rx * scale,
        y: cy + rz * scale,
      };
    };

    // Monolith center marker
    const monoP = plotWorld(0, 0);
    leftCtx.strokeStyle = '#f59e0b';
    leftCtx.lineWidth = 2;
    leftCtx.strokeRect(monoP.x - 8, monoP.y - 6, 16, 12);

    // Active target blips
    for (const t of targets) {
      if (t.destroyed) continue;
      const p = plotWorld(t.worldPos.x, t.worldPos.z);
      if (Math.hypot(p.x - cx, p.y - cy) > 104) continue;
      leftCtx.fillStyle = t.shielded ? '#94a3b8' : '#ef4444';
      leftCtx.beginPath();
      leftCtx.arc(p.x, p.y, t.kind === 'apex' ? 5 : 3.5, 0, Math.PI * 2);
      leftCtx.fill();
    }

    // Own helicopter triangle
    leftCtx.fillStyle = '#4ade80';
    leftCtx.beginPath();
    leftCtx.moveTo(cx, cy - 7);
    leftCtx.lineTo(cx - 5, cy + 6);
    leftCtx.lineTo(cx + 5, cy + 6);
    leftCtx.closePath();
    leftCtx.fill();

    leftCtx.fillStyle = '#4ade80';
    leftCtx.font = 'bold 14px monospace';
    leftCtx.fillText('TAD RADAR', 12, 22);
    leftCtx.fillText('RNG 180M', 168, 22);
    leftMfdTex.needsUpdate = true;
  };

  const drawRightAttitudeMfd = (
    pitchRad: number,
    rollRad: number,
    hullPct: number,
    missileWarning: boolean,
  ) => {
    rightCtx.fillStyle = '#071109';
    rightCtx.fillRect(0, 0, 256, 256);

    const cx = 128;
    const cy = 128;

    // Artificial horizon clipped inside inner box
    rightCtx.save();
    rightCtx.beginPath();
    rightCtx.rect(24, 34, 208, 168);
    rightCtx.clip();

    rightCtx.translate(cx, cy);
    rightCtx.rotate(-rollRad);
    const pitchShift = THREE.MathUtils.clamp(pitchRad * 140, -60, 60);

    // Sky / Ground tint
    rightCtx.fillStyle = '#12261e';
    rightCtx.fillRect(-160, -160 + pitchShift, 320, 160);
    rightCtx.fillStyle = '#251a0f';
    rightCtx.fillRect(-160, pitchShift, 320, 160);

    // Horizon line & pitch rungs
    rightCtx.strokeStyle = '#4ade80';
    rightCtx.lineWidth = 2;
    rightCtx.beginPath();
    rightCtx.moveTo(-120, pitchShift);
    rightCtx.lineTo(120, pitchShift);
    rightCtx.stroke();

    rightCtx.lineWidth = 1.2;
    for (const rung of [-36, -18, 18, 36]) {
      rightCtx.beginPath();
      rightCtx.moveTo(-36, pitchShift + rung);
      rightCtx.lineTo(36, pitchShift + rung);
      rightCtx.stroke();
    }
    rightCtx.restore();

    // Fixed aircraft boresight chevron
    rightCtx.strokeStyle = '#f59e0b';
    rightCtx.lineWidth = 2.5;
    rightCtx.beginPath();
    rightCtx.moveTo(cx - 22, cy);
    rightCtx.lineTo(cx - 8, cy);
    rightCtx.lineTo(cx, cy + 7);
    rightCtx.lineTo(cx + 8, cy);
    rightCtx.lineTo(cx + 22, cy);
    rightCtx.stroke();

    // Bottom hull integrity bar
    rightCtx.fillStyle = '#4ade80';
    rightCtx.font = 'bold 14px monospace';
    rightCtx.fillText('ADI / SYS', 14, 22);
    rightCtx.fillStyle = hullPct < 0.35 ? '#ef4444' : '#4ade80';
    rightCtx.fillText(`HULL ${Math.round(hullPct * 100)}%`, 24, 232);

    if (missileWarning) {
      rightCtx.fillStyle = '#ef4444';
      rightCtx.fillRect(138, 212, 98, 26);
      rightCtx.fillStyle = '#ffffff';
      rightCtx.fillText('SAM WARN', 148, 230);
    }

    rightMfdTex.needsUpdate = true;
  };

  return {
    group,
    muzzleWorldPos: (out: THREE.Vector3) => {
      flashBrake.getWorldPosition(out);
      return out;
    },
    triggerMuzzleFlash: () => {
      muzzleFlashTimer = 0.055;
      recoilOffset = 0.14;
      muzzleSprite.material.rotation = Math.random() * Math.PI * 2;
    },
    update: ({
      dt,
      elapsed,
      moveForward,
      moveRight,
      moveUp,
      pitchRad,
      rollRad,
      headingRad,
      lookYaw,
      lookPitch,
      missileWarning,
      hullPct,
      heliPos,
      targets,
    }) => {
      // High-speed overhead rotor spin
      rotorGroup.rotation.y += dt * 36.0;

      // Animate cyclic stick & collective lever smoothly
      cyclicPivot.rotation.x = THREE.MathUtils.damp(
        cyclicPivot.rotation.x,
        -moveForward * 0.24,
        10,
        dt,
      );
      cyclicPivot.rotation.z = THREE.MathUtils.damp(
        cyclicPivot.rotation.z,
        -moveRight * 0.24,
        10,
        dt,
      );
      collectivePivot.rotation.x = THREE.MathUtils.damp(
        collectivePivot.rotation.x,
        0.12 + moveUp * 0.28,
        9,
        dt,
      );

      // Slave chin 30mm cannon barrel smoothly to pilot look direction
      cannonPivot.rotation.y = THREE.MathUtils.clamp(lookYaw * 0.85, -0.55, 0.55);
      cannonPivot.rotation.x = THREE.MathUtils.clamp(lookPitch * 0.85, -0.5, 0.35);

      // Recoil & muzzle flash decay
      if (recoilOffset > 0) {
        recoilOffset = Math.max(0, recoilOffset - dt * 1.4);
      }
      barrelMesh.position.z = -0.58 + recoilOffset;
      flashBrake.position.z = -1.26 + recoilOffset;

      if (muzzleFlashTimer > 0) {
        muzzleFlashTimer = Math.max(0, muzzleFlashTimer - dt);
        const k = muzzleFlashTimer / 0.055;
        muzzleLight.intensity = 11 * k;
        muzzleSpriteMat.opacity = 0.95 * k;
      } else {
        muzzleLight.intensity = 0;
        muzzleSpriteMat.opacity = 0;
      }

      // Warning annunciator bar glow
      if (missileWarning || hullPct < 0.3) {
        const blink = Math.sin(elapsed * 18) > 0 ? 2.4 : 0.25;
        warningLedMat.emissiveIntensity = blink;
      } else {
        warningLedMat.emissiveIntensity = 0.08;
      }

      // Refresh cockpit MFD screens at ~12Hz for crisp performance
      mfdTimer += dt;
      if (mfdTimer >= 0.085) {
        mfdTimer = 0;
        drawLeftRadarMfd(heliPos, headingRad, targets, elapsed);
        drawRightAttitudeMfd(pitchRad, rollRad, hullPct, missileWarning);
      }
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
