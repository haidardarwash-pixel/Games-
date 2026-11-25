import * as THREE from 'three';
import type { ProceduralTexturePack } from './textures';

/**
 * Deterministic desert canyon & dune heightfield shared by terrain mesh,
 * props, AA emplacements, and helicopter ground collision.
 */
export function groundHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Sweeping desert sand dunes
  const dunes =
    Math.sin(x * 0.022 + z * 0.015) * 3.8 +
    Math.cos(x * 0.012 - z * 0.026) * 2.9 +
    Math.sin(x * 0.055 - z * 0.042) * 1.1;

  // Gently excavated dry dust basin directly beneath the colossal monolith
  const basinBlend = THREE.MathUtils.smoothstep(r, 24, 72);
  let h = dunes * (0.28 + 0.72 * basinBlend);

  // Natural outer canyon mesa ring sealing the horizon cleanly
  if (r > 185) {
    const rimT = THREE.MathUtils.clamp((r - 185) / 140, 0, 1);
    const angle = Math.atan2(z, x);
    const mesaNotches =
      0.72 +
      0.28 * Math.sin(angle * 7 + 0.4) +
      0.18 * Math.cos(angle * 13 - 1.1);
    // Stepped sandstone mesa profile
    const stepped = Math.pow(rimT, 1.35) * 84 * mesaNotches;
    h += Math.min(stepped, 96);
  }

  return h;
}

export interface DesertEnvironment {
  group: THREE.Group;
  sunDirection: THREE.Vector3;
  sunLight: THREE.DirectionalLight;
  update: (dt: number, elapsed: number, focusPos: THREE.Vector3) => void;
  dispose: () => void;
}

interface SmokePuff {
  sprite: THREE.Sprite;
  origin: THREE.Vector3;
  age: number;
  maxAge: number;
  driftX: number;
  driftZ: number;
  baseScale: number;
}

/**
 * Builds the golden-hour desert warzone: sky dome with blazing low sun,
 * raking directional shadows, cool zenith hemisphere fill, displaced desert dunes,
 * outer canyon mesas, instanced boulders, smoking wrecks, and sunlit dust motes.
 */
export function createDesertEnvironment(
  scene: THREE.Scene,
  textures: ProceduralTexturePack,
  isSoftwareGl: boolean,
): DesertEnvironment {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Golden-hour atmosphere matching low desert dust haze
  const fogColor = new THREE.Color('#c88d56');
  scene.background = fogColor;
  scene.fog = new THREE.FogExp2('#c88d56', 0.0029);

  // Low-angle golden-hour sun direction (raking across the monolith from front-right-west
  // to carve dramatic deep shadows through the arches, bowls, and central chasm!)
  const sunDirection = new THREE.Vector3(0.76, 0.34, 0.55).normalize();

  // 1. Custom Golden-Hour Atmospheric Sky Dome
  const skyGeo = new THREE.SphereGeometry(760, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: sunDirection.clone() },
      uZenithColor: { value: new THREE.Color('#2c435d') },
      uMidSkyColor: { value: new THREE.Color('#8c7a6b') },
      uHorizonColor: { value: new THREE.Color('#d79758') },
      uSunColor: { value: new THREE.Color('#fff0cc') },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uZenithColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);

        // Dust-thickened golden horizon transitioning to dusty slate zenith
        vec3 col = mix(uHorizonColor, uMidSkyColor, smoothstep(0.0, 0.24, h));
        col = mix(col, uZenithColor, smoothstep(0.22, 0.78, h));

        // Sun glow halo & crisp solar disc
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float mieGlow = pow(sunDot, 7.0) * 0.45 + pow(sunDot, 42.0) * 0.55;
        float sunDisc = smoothstep(0.9965, 0.9992, sunDot) * 1.8;

        // Warm dust band near horizon toward sun
        float dustBand = (1.0 - smoothstep(0.0, 0.28, h)) * pow(sunDot, 2.0) * 0.32;

        col += uSunColor * (mieGlow + sunDisc + dustBand);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyDome);
  disposables.push(skyGeo, skyMat);

  // 2. Studio Three-Point Desert Lighting Rig (Warm Sun Key + Cool Zenith Hemi + Rim Fill)
  const sunLight = new THREE.DirectionalLight('#ffbe73', 3.4);
  sunLight.position.copy(sunDirection).multiplyScalar(210);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 30;
  sunLight.shadow.camera.far = 420;
  const shadowExtent = 135;
  sunLight.shadow.camera.left = -shadowExtent;
  sunLight.shadow.camera.right = shadowExtent;
  sunLight.shadow.camera.top = shadowExtent;
  sunLight.shadow.camera.bottom = -shadowExtent;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.04;
  sunLight.shadow.radius = 2.5;
  group.add(sunLight);
  group.add(sunLight.target);

  // Cool sky-to-warm-sand hemisphere bounce
  const hemiLight = new THREE.HemisphereLight('#7ba0c4', '#7a512d', 1.15);
  group.add(hemiLight);

  // Subtle cool-amber back/rim directional light to carve silhouettes on shadow sides
  const rimLight = new THREE.DirectionalLight('#7ea2c9', 0.65);
  rimLight.position.set(-140, 65, -130);
  group.add(rimLight);

  // 3. Displaced Desert Terrain Mesh
  const terrainSize = 680;
  const terrainSegs = 136;
  const terrainGeo = new THREE.PlaneGeometry(
    terrainSize,
    terrainSize,
    terrainSegs,
    terrainSegs,
  );
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const lowSand = new THREE.Color('#c6925e');
  const ridgeSand = new THREE.Color('#ddb17e');
  const cliffRock = new THREE.Color('#7c5a3d');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    const rockBlend = THREE.MathUtils.smoothstep(y, 14, 46);
    const crestBlend = THREE.MathUtils.clamp((y + 4) / 14, 0, 1);
    tmpColor.copy(lowSand).lerp(ridgeSand, crestBlend).lerp(cliffRock, rockBlend);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: textures.sandColor,
    bumpMap: textures.sandBump,
    bumpScale: 0.75,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 4. Instanced Sandstone Boulders & Rock Outcrops (grounded bottom-center)
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  // Roughen boulder vertices for craggy desert sandstone
  const rPos = rockGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const vx = rPos.getX(i);
    const vy = rPos.getY(i);
    const vz = rPos.getZ(i);
    const n =
      0.82 +
      0.24 * Math.sin(vx * 4.2 + vy * 3.1) +
      0.16 * Math.cos(vz * 5.0 - vx * 2.5);
    rPos.setXYZ(i, vx * n, vy * n * 0.72 + 0.52, vz * n);
  }
  rockGeo.computeVertexNormals();

  const rockMat = new THREE.MeshStandardMaterial({
    map: textures.monolithColor,
    bumpMap: textures.monolithBump,
    bumpScale: 0.55,
    color: '#b5885c',
    roughness: 0.9,
    metalness: 0.05,
  });

  const boulderCount = 150;
  const boulders = new THREE.InstancedMesh(rockGeo, rockMat, boulderCount);
  boulders.castShadow = !isSoftwareGl;
  boulders.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const rockTint = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < boulderCount * 2 && placed < boulderCount; i++) {
    const angle = (i * 2.39996) % (Math.PI * 2);
    const dist = 42 + ((i * 19.7) % 175);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    // Keep front-south staging lane clear for dramatic monolith sightlines
    if (z > 28 && Math.abs(x) < 26 && dist < 110) continue;

    const gy = groundHeightAt(x, z);
    const sx = 2.2 + ((i * 7.3) % 7.5);
    const sy = 1.6 + ((i * 5.1) % 6.2);
    const sz = 2.2 + ((i * 6.7) % 7.2);

    dummy.position.set(x, gy - 0.5, z);
    dummy.rotation.set(
      ((i * 1.1) % 0.3) - 0.15,
      (i * 1.73) % (Math.PI * 2),
      ((i * 0.9) % 0.3) - 0.15,
    );
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    boulders.setMatrixAt(placed, dummy.matrix);

    const shade = 0.8 + ((i * 0.17) % 0.35);
    rockTint.setRGB(shade, shade * 0.94, shade * 0.86);
    boulders.setColorAt(placed, rockTint);
    placed++;
  }
  boulders.count = placed;
  boulders.instanceMatrix.needsUpdate = true;
  if (boulders.instanceColor) boulders.instanceColor.needsUpdate = true;
  boulders.computeBoundingSphere();
  group.add(boulders);
  disposables.push(rockGeo, rockMat);

  // 5. Military Action Battlefield Storytelling: Distant Smoking Armored Wrecks & Plumes
  const wreckCoords: Array<[number, number, number]> = [
    [-46, 54, 0.6],
    [58, 38, -1.1],
    [-68, -42, 2.2],
  ];
  const wreckHullGeo = new THREE.BoxGeometry(5.6, 1.9, 3.1);
  const wreckTurretGeo = new THREE.CylinderGeometry(1.0, 1.25, 1.0, 8);
  const wreckBarrelGeo = new THREE.CylinderGeometry(0.14, 0.16, 4.2, 6);
  const wreckMat = new THREE.MeshStandardMaterial({
    color: '#2e2b25',
    roughness: 0.88,
    metalness: 0.35,
  });
  const emberMat = new THREE.MeshBasicMaterial({
    color: '#ff6e1a',
  });
  const emberGeo = new THREE.SphereGeometry(0.65, 8, 8);
  disposables.push(
    wreckHullGeo,
    wreckTurretGeo,
    wreckBarrelGeo,
    wreckMat,
    emberMat,
    emberGeo,
  );

  const smokePuffs: SmokePuff[] = [];
  const smokeMatBase = new THREE.SpriteMaterial({
    map: textures.smokeSprite,
    color: '#342c24',
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  disposables.push(smokeMatBase);

  for (const [wx, wz, rotY] of wreckCoords) {
    const wy = groundHeightAt(wx, wz);
    const wreck = new THREE.Group();
    wreck.position.set(wx, wy, wz);
    wreck.rotation.y = rotY;
    wreck.rotation.z = 0.08;

    const hull = new THREE.Mesh(wreckHullGeo, wreckMat);
    hull.position.y = 0.95;
    hull.castShadow = !isSoftwareGl;
    hull.receiveShadow = true;
    wreck.add(hull);

    const turret = new THREE.Mesh(wreckTurretGeo, wreckMat);
    turret.position.set(0.3, 2.2, 0);
    turret.rotation.z = 0.18;
    wreck.add(turret);

    const barrel = new THREE.Mesh(wreckBarrelGeo, wreckMat);
    barrel.rotation.z = Math.PI * 0.44;
    barrel.position.set(2.4, 2.45, 0);
    wreck.add(barrel);

    const ember = new THREE.Mesh(emberGeo, emberMat);
    ember.position.set(-0.6, 1.8, 0.2);
    wreck.add(ember);

    group.add(wreck);

    // Rising battlefield smoke column
    for (let k = 0; k < 7; k++) {
      const mat = smokeMatBase.clone();
      disposables.push(mat);
      const sprite = new THREE.Sprite(mat);
      const maxAge = 6.5 + Math.random() * 2.5;
      smokePuffs.push({
        sprite,
        origin: new THREE.Vector3(wx, wy + 2.5, wz),
        age: (k / 7) * maxAge,
        maxAge,
        driftX: -5.5 + Math.random() * 1.4,
        driftZ: -3.2 + Math.random() * 1.4,
        baseScale: 5.5 + Math.random() * 3.0,
      });
      group.add(sprite);
    }
  }

  // 6. Sunlit Golden Desert Dust Motes drifting in the canyon airspace
  const dustCount = 260;
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 260;
    dustPositions[i * 3 + 1] = 4 + Math.random() * 95;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 260;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    map: textures.smokeSprite,
    color: '#f7c988',
    size: 1.85,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  group.add(dustPoints);
  disposables.push(dustGeo, dustMat);

  scene.add(group);

  const update = (dt: number, elapsed: number, focusPos: THREE.Vector3) => {
    // Animate rising battlefield smoke plumes
    for (let i = 0; i < smokePuffs.length; i++) {
      const p = smokePuffs[i];
      p.age += dt;
      if (p.age >= p.maxAge) p.age -= p.maxAge;
      const t = p.age / p.maxAge;
      p.sprite.position.set(
        p.origin.x + p.driftX * t * 7.5 + Math.sin(elapsed * 0.7 + i) * 1.2,
        p.origin.y + t * 54,
        p.origin.z + p.driftZ * t * 7.5,
      );
      const s = p.baseScale * (0.7 + t * 3.8);
      p.sprite.scale.set(s, s, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity =
        Math.sin(t * Math.PI) * 0.42;
    }

    // Drift golden desert dust around active helicopter zone
    const pos = dustGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dustCount; i++) {
      let x = pos.getX(i) - dt * 4.2;
      let y = pos.getY(i) + Math.sin(elapsed * 0.6 + i) * dt * 0.6;
      let z = pos.getZ(i) - dt * 2.1;

      if (x < focusPos.x - 130) x += 260;
      if (x > focusPos.x + 130) x -= 260;
      if (z < focusPos.z - 130) z += 260;
      if (z > focusPos.z + 130) z -= 260;
      if (y < 3) y = 85;
      if (y > 105) y = 8;

      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  };

  return {
    group,
    sunDirection,
    sunLight,
    update,
    dispose: () => {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
