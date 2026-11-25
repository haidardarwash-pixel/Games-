import * as THREE from 'three';
import { groundHeightAt } from './environment';
import type { ProceduralTexturePack } from './textures';
import type { TargetKind } from './types';

export interface TargetEntity {
  id: string;
  label: string;
  kind: TargetKind;
  stage: 1 | 2 | 3;
  worldPos: THREE.Vector3;
  hitRadius: number;
  hp: number;
  maxHp: number;
  shielded: boolean;
  destroyed: boolean;
  hitFlash: number;
  fireCooldown: number;
  meshGroup: THREE.Group;
  coreMaterial: THREE.MeshStandardMaterial;
  shieldMesh?: THREE.Mesh;
  turretPivot?: THREE.Object3D;
  radarPivot?: THREE.Object3D;
  glowLight?: THREE.PointLight;
  baseEmissive: THREE.Color;
}

export interface MonolithAssembly {
  group: THREE.Group;
  targets: TargetEntity[];
  colliderSpheres: Array<{ center: THREE.Vector3; radius: number }>;
  applyReferenceTexture: (tex: THREE.Texture) => void;
  update: (dt: number, elapsed: number, playerPos: THREE.Vector3) => void;
  resetTargets: () => void;
  dispose: () => void;
}

/**
 * Builds the colossal sculpted desert monolith faithfully modeled on the user's
 * reference artwork (twin sweeping outer arches, striated medial bowls, dual
 * russet-copper cores, perforated central chasm, basal twin nodes, twin root
 * pedestals, and apex diamond aperture) plus flanking military AA flak batteries.
 */
export function createMonolithAssembly(
  scene: THREE.Scene,
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean,
): MonolithAssembly {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const targets: TargetEntity[] = [];
  const colliderSpheres: Array<{ center: THREE.Vector3; radius: number }> = [];

  const baseY = groundHeightAt(0, 0) - 2.0;
  const monoRoot = new THREE.Group();
  monoRoot.position.set(0, baseY, 0);
  group.add(monoRoot);

  // Shared sculpted stone/bone PBR materials with varied roughness for realistic shading
  const ivoryStoneMat = new THREE.MeshStandardMaterial({
    map: textures.monolithColor,
    bumpMap: textures.monolithBump,
    bumpScale: 1.45,
    color: '#dfd3b8',
    roughness: 0.84,
    metalness: 0.06,
  });

  const recessedOchreMat = new THREE.MeshStandardMaterial({
    map: textures.monolithColor,
    bumpMap: textures.monolithBump,
    bumpScale: 1.8,
    color: '#a99370',
    roughness: 0.92,
    metalness: 0.04,
  });

  const darkChasmMat = new THREE.MeshStandardMaterial({
    color: '#231b13',
    roughness: 0.96,
    metalness: 0.1,
  });

  const weatheredBronzeMat = new THREE.MeshStandardMaterial({
    color: '#5a402c',
    roughness: 0.45,
    metalness: 0.68,
  });

  const referenceReliefMat = new THREE.MeshStandardMaterial({
    map: textures.monolithColor,
    bumpMap: textures.monolithBump,
    bumpScale: 1.9,
    color: '#e6dcc6',
    roughness: 0.82,
    metalness: 0.08,
    transparent: true,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  disposables.push(
    ivoryStoneMat,
    recessedOchreMat,
    darkChasmMat,
    weatheredBronzeMat,
    referenceReliefMat,
  );

  // Soft contact shadow grounding the colossal monolith into the desert basin
  const shadowGeo = new THREE.PlaneGeometry(135, 95);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 2.25, 0);
  monoRoot.add(contactShadow);
  disposables.push(shadowGeo, shadowMat);

  // Helper to displace organic carved striations onto TubeGeometry / SphereGeometry
  const applyOrganicRidges = (geo: THREE.BufferGeometry, amp = 0.65) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ridge =
        Math.sin(y * 0.45 + x * 0.22) * amp +
        Math.cos(z * 0.38 - y * 0.65) * (amp * 0.5);
      const len = Math.hypot(x, z) || 1;
      pos.setXYZ(i, x + (x / len) * ridge * 0.35, y + ridge * 0.25, z + ridge * 0.45);
    }
    geo.computeVertexNormals();
  };

  // 1. Twin Flared Root Pedestals & Joined Basal Trunk (matching bottom stumps of reference)
  for (const side of [-1, 1]) {
    const rootCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 12.5, -2, 3.5),
      new THREE.Vector3(side * 9.5, 6.5, 2.2),
      new THREE.Vector3(side * 5.2, 13.5, 1.4),
      new THREE.Vector3(0, 17.5, 1.0),
    ]);
    const rootGeo = new THREE.TubeGeometry(rootCurve, 22, 4.9, 14, false);
    applyOrganicRidges(rootGeo, 0.55);
    const rootMesh = new THREE.Mesh(rootGeo, ivoryStoneMat);
    rootMesh.castShadow = !isSoftwareGl;
    rootMesh.receiveShadow = true;
    monoRoot.add(rootMesh);
    disposables.push(rootGeo);

    // Flared sandy stone plinth collars
    const plinthGeo = new THREE.CylinderGeometry(5.6, 8.8, 6.5, 14);
    const plinth = new THREE.Mesh(plinthGeo, recessedOchreMat);
    plinth.position.set(side * 12.5, 2.5, 3.5);
    plinth.castShadow = !isSoftwareGl;
    plinth.receiveShadow = true;
    monoRoot.add(plinth);
    disposables.push(plinthGeo);
  }

  // Central lower basal belly & iconic circular lower nozzle aperture
  const bellyGeo = new THREE.SphereGeometry(13.5, 24, 18);
  bellyGeo.scale(1.15, 0.92, 0.85);
  applyOrganicRidges(bellyGeo, 0.5);
  const belly = new THREE.Mesh(bellyGeo, recessedOchreMat);
  belly.position.set(0, 25.5, 1.2);
  belly.castShadow = !isSoftwareGl;
  belly.receiveShadow = true;
  monoRoot.add(belly);
  disposables.push(bellyGeo);

  const nozzleRingGeo = new THREE.TorusGeometry(2.1, 0.72, 10, 20);
  const nozzleRing = new THREE.Mesh(nozzleRingGeo, ivoryStoneMat);
  nozzleRing.position.set(0, 21.5, 11.4);
  nozzleRing.castShadow = !isSoftwareGl;
  monoRoot.add(nozzleRing);
  const nozzleHoleGeo = new THREE.CylinderGeometry(1.5, 1.5, 2.5, 12);
  nozzleHoleGeo.rotateX(Math.PI / 2);
  const nozzleHole = new THREE.Mesh(nozzleHoleGeo, darkChasmMat);
  nozzleHole.position.set(0, 21.5, 10.6);
  monoRoot.add(nozzleHole);
  disposables.push(nozzleRingGeo, nozzleHoleGeo);

  // 2. Twin Sweeping Outer Cradling Arches (Primary Iconic Silhouette of Reference Artwork)
  for (const side of [-1, 1]) {
    // Primary monumental sweeping arch
    const outerArchCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 6.5, 15.0, 2.2),
      new THREE.Vector3(side * 24.0, 26.5, 1.5),
      new THREE.Vector3(side * 40.5, 45.0, 0.5),
      new THREE.Vector3(side * 44.0, 62.5, 0.0),
      new THREE.Vector3(side * 34.0, 74.5, 0.8),
      new THREE.Vector3(side * 20.5, 70.5, 1.2),
    ]);
    const outerGeo = new THREE.TubeGeometry(outerArchCurve, 44, 6.2, 16, false);
    applyOrganicRidges(outerGeo, 0.85);
    const outerMesh = new THREE.Mesh(outerGeo, ivoryStoneMat);
    outerMesh.castShadow = !isSoftwareGl;
    outerMesh.receiveShadow = true;
    monoRoot.add(outerMesh);
    disposables.push(outerGeo);

    // Secondary sculpted inner buttress ridge creating deep chiaroscuro shadow channels
    const innerRimCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 12.0, 24.0, 3.8),
      new THREE.Vector3(side * 29.5, 36.0, 3.0),
      new THREE.Vector3(side * 35.5, 54.0, 2.6),
      new THREE.Vector3(side * 25.5, 65.5, 2.5),
    ]);
    const innerRimGeo = new THREE.TubeGeometry(innerRimCurve, 30, 3.8, 12, false);
    applyOrganicRidges(innerRimGeo, 0.55);
    const innerRimMesh = new THREE.Mesh(innerRimGeo, recessedOchreMat);
    innerRimMesh.castShadow = !isSoftwareGl;
    innerRimMesh.receiveShadow = true;
    monoRoot.add(innerRimMesh);
    disposables.push(innerRimGeo);

    // 3. Sculpted Striated Medial Bowls (Left & Right recessed amphitheater shells)
    const bowlGeo = new THREE.SphereGeometry(16.5, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.65);
    bowlGeo.scale(1.12, 1.0, 0.72);
    applyOrganicRidges(bowlGeo, 0.7);
    const bowlMesh = new THREE.Mesh(bowlGeo, ivoryStoneMat);
    bowlMesh.position.set(side * 16.5, 45.0, -1.5);
    bowlMesh.rotation.set(Math.PI * 0.45, side * -0.28, side * 0.25);
    bowlMesh.castShadow = !isSoftwareGl;
    bowlMesh.receiveShadow = true;
    monoRoot.add(bowlMesh);
    disposables.push(bowlGeo);

    // Curved radial stone lip rimming each medial bowl
    const lipGeo = new THREE.TorusGeometry(13.5, 2.6, 12, 28, Math.PI * 1.15);
    const lipMesh = new THREE.Mesh(lipGeo, ivoryStoneMat);
    lipMesh.position.set(side * 15.8, 46.2, 4.2);
    lipMesh.rotation.set(0.18, side * -0.32, side > 0 ? -Math.PI * 0.78 : Math.PI * 0.22);
    lipMesh.castShadow = !isSoftwareGl;
    lipMesh.receiveShadow = true;
    monoRoot.add(lipMesh);
    disposables.push(lipGeo);
  }

  // 4. Upper Cranial Twin-Lobed Crown Dome (housing the two copper cores & apex diamond)
  for (const side of [-1, 1]) {
    const lobeGeo = new THREE.SphereGeometry(14.8, 24, 20);
    lobeGeo.scale(0.95, 1.18, 0.88);
    applyOrganicRidges(lobeGeo, 0.6);
    const lobe = new THREE.Mesh(lobeGeo, ivoryStoneMat);
    lobe.position.set(side * 6.4, 62.5, 0.8);
    lobe.castShadow = !isSoftwareGl;
    lobe.receiveShadow = true;
    monoRoot.add(lobe);
    disposables.push(lobeGeo);
  }

  // Back structural dorsal spine (so flying 360° behind the monolith reveals rich architectural buttresses)
  const dorsalGeo = new THREE.CylinderGeometry(16, 22, 58, 16);
  dorsalGeo.scale(1.15, 1, 0.68);
  applyOrganicRidges(dorsalGeo, 0.9);
  const dorsal = new THREE.Mesh(dorsalGeo, recessedOchreMat);
  dorsal.position.set(0, 44, -9.5);
  dorsal.castShadow = !isSoftwareGl;
  dorsal.receiveShadow = true;
  monoRoot.add(dorsal);
  disposables.push(dorsalGeo);

  // 5. Dark Perforated Central Chasm (Interpeduncular Cavity)
  const chasmGeo = new THREE.ConeGeometry(7.2, 19.0, 12);
  chasmGeo.scale(0.92, 1.0, 0.65);
  const chasm = new THREE.Mesh(chasmGeo, darkChasmMat);
  chasm.position.set(0, 41.5, 6.5);
  monoRoot.add(chasm);
  disposables.push(chasmGeo);

  // Dark perforated pores & glowing ember vents inside the chasm
  const poreGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.4, 8);
  poreGeo.rotateX(Math.PI / 2);
  const emberVentMat = new THREE.MeshStandardMaterial({
    color: '#3a1a0a',
    emissive: '#ff5d14',
    emissiveIntensity: 1.4,
    roughness: 0.6,
  });
  disposables.push(poreGeo, emberVentMat);

  for (let i = 0; i < 11; i++) {
    const row = Math.floor(i / 3);
    const col = (i % 3) - 1;
    const pore = new THREE.Mesh(poreGeo, i % 3 === 1 ? emberVentMat : darkChasmMat);
    pore.position.set(col * 1.9 + (row % 2) * 0.5, 36.5 + row * 2.8, 10.6 - row * 0.4);
    monoRoot.add(pore);
  }

  // 6. Sculpted Curved Reference Artwork Relief Mantle (fuses the user's exact painting
  // seamlessly onto the frontal carved contour with full PBR golden-hour shadows & bump!)
  const reliefGeo = new THREE.PlaneGeometry(88, 76, 32, 28);
  const rAttr = reliefGeo.attributes.position;
  for (let i = 0; i < rAttr.count; i++) {
    const px = rAttr.getX(i);
    const py = rAttr.getY(i);
    // Curve gently around the 3D sculptural contours so it sits flush across the front relief
    const nx = px / 44;
    const ny = py / 38;
    const archDepth = Math.cos(nx * Math.PI * 0.48) * 6.5 + Math.cos(ny * Math.PI * 0.42) * 3.0;
    rAttr.setZ(i, archDepth);
  }
  reliefGeo.computeVertexNormals();
  const reliefMesh = new THREE.Mesh(reliefGeo, referenceReliefMat);
  reliefMesh.position.set(0, 45.0, 5.4);
  reliefMesh.receiveShadow = true;
  reliefMesh.visible = false; // Enabled automatically once user's reference PNG texture finishes loading
  monoRoot.add(reliefMesh);
  disposables.push(reliefGeo);

  // Solid collision spheres approximating the monolith bulk so the helicopter cannot clip inside
  colliderSpheres.push(
    { center: new THREE.Vector3(0, baseY + 46, 0), radius: 24 },
    { center: new THREE.Vector3(-34, baseY + 54, 0), radius: 13 },
    { center: new THREE.Vector3(34, baseY + 54, 0), radius: 13 },
    { center: new THREE.Vector3(0, baseY + 68, 0), radius: 15 },
    { center: new THREE.Vector3(0, baseY + 22, 0), radius: 16 },
  );

  // =========================================================================
  // DESTRUCTIBLE TACTICAL TARGET NODES (7 TOTAL ACROSS 3 ESCALATING STAGES)
  // =========================================================================

  // Helper to register a target embedded on the monolith
  const addMonolithNode = (opts: {
    id: string;
    label: string;
    kind: TargetKind;
    stage: 1 | 2 | 3;
    localPos: THREE.Vector3;
    radius: number;
    hp: number;
    colorHex: string;
    emissiveHex: string;
    useCopperTexture?: boolean;
    hasShield?: boolean;
    isDiamond?: boolean;
  }) => {
    const nodeGroup = new THREE.Group();
    nodeGroup.position.copy(opts.localPos);
    monoRoot.add(nodeGroup);

    // Armored bronze socket housing
    const socketGeo = new THREE.TorusGeometry(opts.radius * 1.12, opts.radius * 0.24, 12, 24);
    const socket = new THREE.Mesh(socketGeo, weatheredBronzeMat);
    socket.castShadow = !isSoftwareGl;
    socket.receiveShadow = true;
    nodeGroup.add(socket);
    disposables.push(socketGeo);

    // Primary glowing destructible core geometry
    const coreGeo = opts.isDiamond
      ? new THREE.OctahedronGeometry(opts.radius * 1.05, 0)
      : new THREE.SphereGeometry(opts.radius, 22, 18);
    if (opts.isDiamond) {
      coreGeo.scale(0.85, 1.38, 0.85);
    } else if (opts.kind === 'copper') {
      coreGeo.scale(1.0, 1.0, 0.62);
    }

    const baseEmissive = new THREE.Color(opts.emissiveHex);
    const coreMaterial = new THREE.MeshStandardMaterial({
      map: opts.useCopperTexture ? textures.copperCoreColor : undefined,
      bumpMap: opts.useCopperTexture ? textures.copperCoreBump : textures.monolithBump,
      bumpScale: 0.7,
      color: opts.colorHex,
      emissive: baseEmissive.clone(),
      emissiveIntensity: opts.hasShield ? 0.65 : 1.1,
      roughness: opts.kind === 'copper' ? 0.36 : 0.28,
      metalness: opts.kind === 'copper' ? 0.62 : 0.45,
    });

    const coreMesh = new THREE.Mesh(coreGeo, coreMaterial);
    coreMesh.castShadow = !isSoftwareGl;
    coreMesh.receiveShadow = true;
    nodeGroup.add(coreMesh);
    disposables.push(coreGeo, coreMaterial);

    // Radial mechanical armor fins
    const finGeo = new THREE.BoxGeometry(opts.radius * 0.24, opts.radius * 0.72, opts.radius * 0.45);
    disposables.push(finGeo);
    for (let f = 0; f < 4; f++) {
      const ang = (f / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = new THREE.Mesh(finGeo, weatheredBronzeMat);
      fin.position.set(
        Math.cos(ang) * opts.radius * 1.12,
        Math.sin(ang) * opts.radius * 1.12,
        opts.radius * 0.15,
      );
      fin.rotation.z = ang;
      nodeGroup.add(fin);
    }

    // Optional containment energy shield (Stages 2 & 3 start shielded until prior stage falls)
    let shieldMesh: THREE.Mesh | undefined;
    if (opts.hasShield) {
      const shieldGeo = new THREE.IcosahedronGeometry(opts.radius * 1.52, 1);
      const shieldMat = new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#ff8a1f',
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.28,
        wireframe: true,
        depthWrite: false,
      });
      shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
      nodeGroup.add(shieldMesh);
      disposables.push(shieldGeo, shieldMat);
    }

    // Local warm glow light on the primary cores (limited to 3 total for performance)
    let glowLight: THREE.PointLight | undefined;
    if (opts.kind === 'copper' || opts.kind === 'apex') {
      glowLight = new THREE.PointLight(opts.emissiveHex, 8, 36, 1.8);
      glowLight.position.set(0, 0, opts.radius * 1.4);
      nodeGroup.add(glowLight);
    }

    const worldPos = opts.localPos.clone().add(monoRoot.position);
    targets.push({
      id: opts.id,
      label: opts.label,
      kind: opts.kind,
      stage: opts.stage,
      worldPos,
      hitRadius: opts.radius * 1.45,
      hp: opts.hp,
      maxHp: opts.hp,
      shielded: Boolean(opts.hasShield),
      destroyed: false,
      hitFlash: 0,
      fireCooldown: 1.5 + Math.random() * 2.5,
      meshGroup: nodeGroup,
      coreMaterial,
      shieldMesh,
      glowLight,
      baseEmissive,
    });
  };

  // Stage 1: Twin Basal Defense Nodes (matching the two small rounded spheres below the dark chasm)
  addMonolithNode({
    id: 'basal-left',
    label: 'BASAL NODE WEST',
    kind: 'basal',
    stage: 1,
    localPos: new THREE.Vector3(-4.8, 31.2, 13.8),
    radius: 3.1,
    hp: 150,
    colorHex: '#d4be96',
    emissiveHex: '#e66b1e',
  });
  addMonolithNode({
    id: 'basal-right',
    label: 'BASAL NODE EAST',
    kind: 'basal',
    stage: 1,
    localPos: new THREE.Vector3(4.8, 31.2, 13.8),
    radius: 3.1,
    hp: 150,
    colorHex: '#d4be96',
    emissiveHex: '#e66b1e',
  });

  // Stage 1: Flanking Military Desert AA Flak Emplacements (6-part composite turrets)
  const addFlakBattery = (id: string, label: string, x: number, z: number) => {
    const gy = groundHeightAt(x, z);
    const battery = new THREE.Group();
    battery.position.set(x, gy, z);
    group.add(battery);

    // Concrete octagonal bunker base
    const baseGeo = new THREE.CylinderGeometry(5.6, 6.8, 2.2, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      map: textures.monolithColor,
      color: '#8f7b5e',
      roughness: 0.92,
      metalness: 0.08,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 1.1;
    baseMesh.castShadow = !isSoftwareGl;
    baseMesh.receiveShadow = true;
    battery.add(baseMesh);

    // Sandbag perimeter ring
    const ringGeo = new THREE.TorusGeometry(6.2, 0.95, 8, 18);
    ringGeo.rotateX(Math.PI / 2);
    const ringMesh = new THREE.Mesh(ringGeo, recessedOchreMat);
    ringMesh.position.y = 0.8;
    battery.add(ringMesh);

    // Armored rotating AA turret housing
    const turretPivot = new THREE.Group();
    turretPivot.position.y = 2.6;
    battery.add(turretPivot);

    const turretMat = new THREE.MeshStandardMaterial({
      map: textures.cockpitMetalColor,
      color: '#4f4938',
      roughness: 0.65,
      metalness: 0.45,
    });
    const hullGeo = new THREE.BoxGeometry(3.8, 2.0, 4.4);
    const hullMesh = new THREE.Mesh(hullGeo, turretMat);
    hullMesh.position.y = 1.0;
    hullMesh.castShadow = !isSoftwareGl;
    turretPivot.add(hullMesh);

    // Twin elevated flak autocannon barrels
    const barrelGeo = new THREE.CylinderGeometry(0.18, 0.24, 5.2, 8);
    barrelGeo.rotateX(Math.PI / 2);
    for (const bx of [-0.72, 0.72]) {
      const barrel = new THREE.Mesh(barrelGeo, weatheredBronzeMat);
      barrel.position.set(bx, 1.5, 3.1);
      barrel.rotation.x = -0.35;
      turretPivot.add(barrel);
    }

    // Glowing vulnerable power pack & targeting sensor
    const baseEmissive = new THREE.Color('#ff5514');
    const coreMat = new THREE.MeshStandardMaterial({
      color: '#d97236',
      emissive: baseEmissive.clone(),
      emissiveIntensity: 1.4,
      roughness: 0.35,
      metalness: 0.55,
    });
    const coreGeo = new THREE.BoxGeometry(2.4, 1.2, 1.5);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 1.9, -1.2);
    turretPivot.add(coreMesh);

    // Spinning acquisition radar dish
    const radarPivot = new THREE.Group();
    radarPivot.position.set(0, 2.7, -1.2);
    turretPivot.add(radarPivot);

    const dishGeo = new THREE.CylinderGeometry(1.6, 0.5, 0.5, 10, 1, false, 0, Math.PI);
    dishGeo.rotateZ(Math.PI / 2);
    const dish = new THREE.Mesh(dishGeo, turretMat);
    radarPivot.add(dish);

    disposables.push(baseGeo, baseMat, ringGeo, turretMat, hullGeo, barrelGeo, coreGeo, coreMat, dishGeo);

    targets.push({
      id,
      label,
      kind: 'flak',
      stage: 1,
      worldPos: new THREE.Vector3(x, gy + 3.8, z),
      hitRadius: 5.8,
      hp: 120,
      maxHp: 120,
      shielded: false,
      destroyed: false,
      hitFlash: 0,
      fireCooldown: 1.2 + Math.random() * 1.8,
      meshGroup: battery,
      coreMaterial: coreMat,
      turretPivot,
      radarPivot,
      baseEmissive,
    });
  };

  addFlakBattery('flak-west', 'AA BATTERY WEST', -56, 36);
  addFlakBattery('flak-east', 'AA BATTERY EAST', 58, 32);

  // Stage 2: Dual Russet-Copper Cores (Exact iconic twin burnt-copper circles in reference image)
  addMonolithNode({
    id: 'copper-left',
    label: 'COPPER CORE ALPHA',
    kind: 'copper',
    stage: 2,
    localPos: new THREE.Vector3(-6.4, 57.5, 14.4),
    radius: 5.2,
    hp: 260,
    colorHex: '#b85b2c',
    emissiveHex: '#e65a17',
    useCopperTexture: true,
    hasShield: true,
  });
  addMonolithNode({
    id: 'copper-right',
    label: 'COPPER CORE BRAVO',
    kind: 'copper',
    stage: 2,
    localPos: new THREE.Vector3(6.4, 57.5, 14.4),
    radius: 5.2,
    hp: 260,
    colorHex: '#b85b2c',
    emissiveHex: '#e65a17',
    useCopperTexture: true,
    hasShield: true,
  });

  // Stage 3: Apex Diamond Sanctum Core (Exact top diamond aperture in reference image)
  addMonolithNode({
    id: 'apex-diamond',
    label: 'APEX DIAMOND CORE',
    kind: 'apex',
    stage: 3,
    localPos: new THREE.Vector3(0, 72.2, 13.0),
    radius: 3.8,
    hp: 360,
    colorHex: '#ffd796',
    emissiveHex: '#ff9d26',
    hasShield: true,
    isDiamond: true,
  });

  scene.add(group);

  const applyReferenceTexture = (tex: THREE.Texture) => {
    referenceReliefMat.map = tex;
    referenceReliefMat.needsUpdate = true;
    reliefMesh.visible = true;
  };

  const resetTargets = () => {
    for (const t of targets) {
      t.hp = t.maxHp;
      t.destroyed = false;
      t.shielded = t.stage > 1;
      t.hitFlash = 0;
      t.fireCooldown = 1.4 + Math.random() * 2.0;
      t.meshGroup.visible = true;
      t.coreMaterial.color.set(
        t.kind === 'copper'
          ? '#b85b2c'
          : t.kind === 'apex'
            ? '#ffd796'
            : t.kind === 'basal'
              ? '#d4be96'
              : '#d97236',
      );
      t.coreMaterial.emissive.copy(t.baseEmissive);
      t.coreMaterial.emissiveIntensity = t.shielded ? 0.55 : 1.15;
      if (t.shieldMesh) {
        t.shieldMesh.visible = t.shielded;
      }
      if (t.glowLight) {
        t.glowLight.intensity = t.shielded ? 4 : 9;
      }
    }
  };

  const update = (dt: number, elapsed: number, playerPos: THREE.Vector3) => {
    for (const t of targets) {
      if (t.destroyed) continue;

      // Hit-flash white decay
      if (t.hitFlash > 0) {
        t.hitFlash = Math.max(0, t.hitFlash - dt * 6.5);
      }

      const pulse = 0.85 + Math.sin(elapsed * (t.kind === 'apex' ? 5.2 : 3.2)) * 0.25;
      if (t.hitFlash > 0.05) {
        t.coreMaterial.emissive.set('#ffffff');
        t.coreMaterial.emissiveIntensity = 2.8;
      } else {
        t.coreMaterial.emissive.copy(t.baseEmissive);
        t.coreMaterial.emissiveIntensity = (t.shielded ? 0.45 : 1.25) * pulse;
      }

      if (t.shieldMesh) {
        t.shieldMesh.visible = t.shielded;
        if (t.shielded) {
          t.shieldMesh.rotation.y += dt * 0.65;
          t.shieldMesh.rotation.x += dt * 0.35;
        }
      }

      if (t.glowLight) {
        t.glowLight.intensity = t.destroyed ? 0 : (t.shielded ? 4 : 10) * pulse;
      }

      // Track helicopter on flanking military AA turrets
      if (t.turretPivot) {
        const dx = playerPos.x - t.worldPos.x;
        const dz = playerPos.z - t.worldPos.z;
        const desiredYaw = Math.atan2(dx, dz);
        t.turretPivot.rotation.y = THREE.MathUtils.lerp(
          t.turretPivot.rotation.y,
          desiredYaw,
          1 - Math.exp(-3.5 * dt),
        );
      }
      if (t.radarPivot) {
        t.radarPivot.rotation.y += dt * 2.8;
      }
    }
  };

  return {
    group,
    targets,
    colliderSpheres,
    applyReferenceTexture,
    update,
    resetTargets,
    dispose: () => {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
