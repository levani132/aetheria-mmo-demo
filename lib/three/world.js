// World construction: sky dome, terrain, city (buildings + walls + fountain
// + torches), and procedurally-placed forest. Pure THREE — no external assets.

import * as THREE from 'three';

// ─── Procedural canvas texture helpers ──────────────────────────────────────
function noiseTexture({ size = 512, base = '#3d4f2e', spots = '#2a3a20', density = 0.5 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * density * 0.02; i++) {
    ctx.fillStyle = spots;
    ctx.globalAlpha = Math.random() * 0.5 + 0.1;
    ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 4 + 1, Math.random() * 4 + 1);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stoneTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  // Warm cream-marble base — Lineage 2 castles & temples are pale stone.
  ctx.fillStyle = '#d8cdb4';
  ctx.fillRect(0, 0, size, size);
  // Mortar lines: warm taupe, much softer than before.
  ctx.strokeStyle = '#8a7c64';
  ctx.lineWidth = 2;
  const rowH = 32;
  for (let y = 0; y < size; y += rowH) {
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    const offset = (y / rowH) % 2 === 0 ? 0 : 32;
    for (let x = offset; x < size; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x, y + rowH); ctx.stroke();
    }
  }
  // Grain: light/dark flecks for stone variation.
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#b8ac90' : '#f0e6cc';
    ctx.globalAlpha = Math.random() * 0.35;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function woodTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  // Warm rich oak/teak base.
  ctx.fillStyle = '#8a5630';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(${50 + Math.random() * 40}, ${30 + Math.random() * 25}, 18, ${Math.random() * 0.5 + 0.3})`;
    ctx.lineWidth = Math.random() * 2 + 0.5;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    for (let x = 0; x < size; x += 4) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
    }
    ctx.stroke();
  }
  // Lighter grain highlights.
  for (let i = 0; i < 25; i++) {
    ctx.strokeStyle = `rgba(${180 + Math.random() * 30}, ${130 + Math.random() * 30}, 80, ${Math.random() * 0.25 + 0.1})`;
    ctx.lineWidth = Math.random() * 1.5 + 0.3;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    for (let x = 0; x < size; x += 4) {
      ctx.lineTo(x, y + Math.sin(x * 0.07 + i) * 2);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Sky dome shader (gradient + sun glow + drifting clouds) ────────────────
function buildSky() {
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTime:        { value: 0 },
      uTopColor:    { value: new THREE.Color('#3a85e8') },   // bright daylight blue
      uHorizon:     { value: new THREE.Color('#fce4c0') },   // warm cream
      uBottomColor: { value: new THREE.Color('#a89a78') },   // warm sandy haze
      uSunDir:      { value: new THREE.Vector3(0.4, 0.55, 0.35).normalize() },
      uSunColor:    { value: new THREE.Color('#fff8e0') },
      uCloudColor:  { value: new THREE.Color('#fffdf8') },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform vec3 uTopColor;
      uniform vec3 uHorizon;
      uniform vec3 uBottomColor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uCloudColor;

      // Cheap value-noise for clouds.
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * vnoise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = dir.y;
        vec3 col;
        if (h > 0.0) {
          col = mix(uHorizon, uTopColor, smoothstep(0.0, 0.55, h));
        } else {
          col = mix(uHorizon, uBottomColor, smoothstep(0.0, -0.3, h));
        }

        // Drifting clouds (visible above the horizon, fading near it).
        if (h > 0.04) {
          // Project the view direction onto a sky plane. Dividing by h gives
          // perspective so clouds compress near the horizon.
          vec2 cp = dir.xz * 1.4 / max(0.15, h);
          cp += vec2(uTime * 0.008, uTime * 0.004);  // gentle drift
          float c = fbm(cp);
          c = smoothstep(0.48, 0.78, c);
          c *= smoothstep(0.04, 0.22, h);  // fade into horizon
          c *= smoothstep(0.95, 0.6, h);   // also fade near zenith for depth
          col = mix(col, uCloudColor, c * 0.85);
        }

        // Sun glow.
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sunDot, 32.0) * 1.2;   // hot core
        col += uSunColor * pow(sunDot, 5.0) * 0.20;   // soft halo
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

// ─── Ground with subtle hills ───────────────────────────────────────────────
function buildGround(size) {
  const geo = new THREE.PlaneGeometry(size, size, 80, 80);
  geo.rotateX(-Math.PI / 2);
  // Gentle displacement for non-flat feel
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    // Keep central area perfectly flat (city plaza)
    const flatness = Math.max(0, 1 - Math.exp(-Math.max(0, r - 30) * 0.05));
    const h = (Math.sin(x * 0.03) * Math.cos(z * 0.025) * 1.2 +
               Math.sin(x * 0.08 + z * 0.05) * 0.5) * flatness;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();

  // Vibrant grass with subtle flecks (Lineage 2 fields are lush, not muddy).
  const grass = noiseTexture({ base: '#5a8a3a', spots: '#436c28', density: 0.55 });
  grass.repeat.set(20, 20);

  const mat = new THREE.MeshStandardMaterial({
    map: grass,
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

// ─── Building component ─────────────────────────────────────────────────────
function buildBuilding({ w = 6, d = 6, h = 4, roofH = 3, doorSide = 'front', stoneTex, woodTex }) {
  const grp = new THREE.Group();

  // Walls (stone box)
  const wallMat = new THREE.MeshStandardMaterial({
    map: stoneTex.clone(),
    roughness: 0.9,
    color: 0xeeeeee,
  });
  wallMat.map.repeat.set(w / 2, h / 2);
  const wallGeo = new THREE.BoxGeometry(w, h, d);
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = h / 2;
  walls.castShadow = walls.receiveShadow = true;
  grp.add(walls);

  // Roof: terracotta-tile look, much richer than the muddy brown.
  const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.78, roofH, 4);
  const roofMat = new THREE.MeshStandardMaterial({
    map: woodTex.clone(),
    color: 0xa84a28,
    roughness: 0.85,
  });
  roofMat.map.repeat.set(2, 1);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = h + roofH / 2;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  grp.add(roof);

  // Spire + banner on the roof peak — that little Lineage 2 silhouette detail.
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.7 })
  );
  spire.position.y = h + roofH + 0.7;
  grp.add(spire);
  // Banner cloth — randomized colors per building for flavor.
  const bannerColors = [0xc44040, 0x4080c8, 0xf0c050, 0x5aa860, 0x8050b0];
  const banColor = bannerColors[Math.floor(Math.random() * bannerColors.length)];
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.4),
    new THREE.MeshStandardMaterial({ color: banColor, roughness: 0.7, side: THREE.DoubleSide, emissive: banColor, emissiveIntensity: 0.05 })
  );
  banner.position.set(0.3, h + roofH + 1.0, 0);
  banner.rotation.y = Math.random() * Math.PI;
  grp.add(banner);

  // Door
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.7 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.15), doorMat);
  door.position.y = 1.1;
  if (doorSide === 'front') door.position.z = d / 2 + 0.05;
  if (doorSide === 'back')  { door.position.z = -d / 2 - 0.05; door.rotation.y = Math.PI; }
  if (doorSide === 'left')  { door.position.x = -w / 2 - 0.05; door.rotation.y = Math.PI / 2; }
  if (doorSide === 'right') { door.position.x =  w / 2 + 0.05; door.rotation.y = -Math.PI / 2; }
  grp.add(door);

  // Windows (warm but more subdued because it's daylight now).
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffd99c,
    emissive: 0xffaa50,
    emissiveIntensity: 0.45,
    roughness: 0.4,
  });
  const winGeo = new THREE.BoxGeometry(0.7, 0.7, 0.1);
  for (const sx of [-w / 4, w / 4]) {
    const wn = new THREE.Mesh(winGeo, winMat);
    wn.position.set(sx, h * 0.6, d / 2 + 0.06);
    grp.add(wn);
  }
  return grp;
}

function buildTorch() {
  const grp = new THREE.Group();
  // pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.9 })
  );
  pole.position.y = 1.2;
  pole.castShadow = true;
  grp.add(pole);
  // flame (billboard-ish sphere)
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffb04a, emissive: 0xff7a1a, emissiveIntensity: 2.5, roughness: 0.3,
    })
  );
  flame.position.y = 2.5;
  grp.add(flame);
  // light — toned down because daylight ambient is high; torches are accents.
  const light = new THREE.PointLight(0xff9b4a, 0.7, 9, 1.6);
  light.position.y = 2.6;
  light.castShadow = false;
  grp.add(light);
  grp.userData.flame = flame;
  grp.userData.light = light;
  return grp;
}

function buildFountain() {
  const grp = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xd0c4a8, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 0.6, 24), stone);
  base.position.y = 0.3; base.receiveShadow = true; base.castShadow = true;
  grp.add(base);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.4, 24), stone);
  inner.position.y = 0.7;
  grp.add(inner);
  // Bright cyan-blue water — like a sunny day pool, not a cursed well.
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(2.7, 2.7, 0.1, 24),
    new THREE.MeshStandardMaterial({
      color: 0x6ab8e0, roughness: 0.05, metalness: 0.5,
      emissive: 0x4a90c0, emissiveIntensity: 0.25,
    })
  );
  water.position.y = 0.85;
  grp.add(water);
  // central pillar
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.6, 12), stone);
  pillar.position.y = 1.6; pillar.castShadow = true;
  grp.add(pillar);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), stone);
  top.position.y = 2.6;
  grp.add(top);
  return grp;
}

function buildTree() {
  const grp = new THREE.Group();
  // Mix of pines and broadleaf for variety.
  const isBroadleaf = Math.random() < 0.45;
  const trunkH = 4 + Math.random() * 3;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.35, trunkH, 6),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.95 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  grp.add(trunk);

  if (isBroadleaf) {
    // Round canopy — bright fresh-leaf green with slight color jitter.
    const baseG = 0x6aa83a;
    const variance = Math.floor(Math.random() * 0x202010) - 0x101008;
    const leafColor = Math.max(0, Math.min(0xffffff, baseG + variance));
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.85 });
    const lumps = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < lumps; i++) {
      const r = 1.4 + Math.random() * 0.6;
      const lump = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafMat);
      lump.position.set(
        (Math.random() - 0.5) * 1.0,
        trunkH * 0.85 + Math.random() * 1.2,
        (Math.random() - 0.5) * 1.0,
      );
      lump.castShadow = true;
      grp.add(lump);
    }
  } else {
    // Pine: stacked cones, brighter forest green.
    const baseG = 0x4a8a3a;
    const variance = Math.floor(Math.random() * 0x202010) - 0x101008;
    const pineColor = Math.max(0, Math.min(0xffffff, baseG + variance));
    const needleMat = new THREE.MeshStandardMaterial({ color: pineColor, roughness: 0.9 });
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const r = 1.6 - i * 0.3;
      const ch = 1.4;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 8), needleMat);
      cone.position.y = trunkH * 0.55 + i * 0.9;
      cone.castShadow = true;
      grp.add(cone);
    }
  }
  return grp;
}

// 3D cloud clusters drifting at altitude. Pure white spheres clustered into
// fluffy lumps. We animate them slowly through tickWorld.
function buildClouds() {
  const grp = new THREE.Group();
  grp.name = 'clouds';
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    fog: false,
    depthWrite: false,
  });
  const COUNT = 14;
  for (let i = 0; i < COUNT; i++) {
    const cloud = new THREE.Group();
    const lumps = 4 + Math.floor(Math.random() * 4);
    for (let j = 0; j < lumps; j++) {
      const r = 3 + Math.random() * 5;
      const lump = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
      lump.position.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 14,
      );
      cloud.add(lump);
    }
    const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.5;
    const r = 80 + Math.random() * 110;
    cloud.position.set(
      Math.cos(angle) * r,
      45 + Math.random() * 35,
      Math.sin(angle) * r,
    );
    cloud.scale.setScalar(0.9 + Math.random() * 0.7);
    cloud.userData.driftAngle = angle;
    cloud.userData.driftSpeed = 0.005 + Math.random() * 0.01;
    cloud.userData.radius = r;
    cloud.userData.altitude = cloud.position.y;
    grp.add(cloud);
  }
  return grp;
}

// ─── City layout ────────────────────────────────────────────────────────────
function buildCity(stoneTex, woodTex) {
  const city = new THREE.Group();
  city.name = 'city';

  // Plaza paving (slightly raised disc)
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(20, 20, 0.2, 48),
    new THREE.MeshStandardMaterial({ map: (() => { const t = stoneTex.clone(); t.repeat.set(8, 8); return t; })(), color: 0xcccccc, roughness: 0.9 })
  );
  plaza.position.y = 0.05;
  plaza.receiveShadow = true;
  city.add(plaza);

  // Fountain at center
  const fountain = buildFountain();
  city.add(fountain);

  // Buildings ringed around plaza
  const ringR = 26;
  const buildings = [
    { kind: 'shop', label: 'Blacksmith', size: [7, 7, 5] },
    { kind: 'shop', label: 'Mage Tower', size: [6, 8, 5] },
    { kind: 'shop', label: 'Apothecary', size: [6, 6, 4] },
    { kind: 'inn',  label: 'Stag & Crown Inn', size: [9, 6, 5] },
    { kind: 'house', size: [5, 5, 4] },
    { kind: 'house', size: [6, 5, 4] },
    { kind: 'house', size: [5, 6, 4] },
    { kind: 'house', size: [7, 5, 5] },
  ];
  buildings.forEach((b, i) => {
    const angle = (i / buildings.length) * Math.PI * 2 + 0.2;
    const x = Math.cos(angle) * ringR;
    const z = Math.sin(angle) * ringR;
    const bldg = buildBuilding({
      w: b.size[0], d: b.size[1], h: b.size[2], roofH: 2.5,
      stoneTex, woodTex, doorSide: 'front',
    });
    bldg.position.set(x, 0, z);
    bldg.lookAt(0, b.size[2] / 2, 0);
    bldg.userData = { label: b.label, kind: b.kind };
    city.add(bldg);
  });

  // Torches around plaza
  const torchCount = 8;
  for (let i = 0; i < torchCount; i++) {
    const a = (i / torchCount) * Math.PI * 2;
    const t = buildTorch();
    t.position.set(Math.cos(a) * 18, 0, Math.sin(a) * 18);
    city.add(t);
  }

  // Outer wall (low, ornamental)
  const wallSegments = 32;
  const wallR = 32;
  const wallMat = new THREE.MeshStandardMaterial({ map: (() => { const t = stoneTex.clone(); t.repeat.set(2, 1); return t; })(), color: 0xf0e8d4, roughness: 0.85 });
  for (let i = 0; i < wallSegments; i++) {
    const a = (i / wallSegments) * Math.PI * 2;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(2.2 * Math.PI * wallR / wallSegments, 2.4, 0.6), wallMat);
    seg.position.set(Math.cos(a) * wallR, 1.2, Math.sin(a) * wallR);
    seg.lookAt(0, 1.2, 0);
    seg.rotateY(Math.PI / 2);
    seg.castShadow = seg.receiveShadow = true;
    // skip a few segments for "gate" gaps
    if (i === 0 || i === wallSegments / 2) continue;
    city.add(seg);
  }

  return city;
}

// ─── Forest placement ───────────────────────────────────────────────────────
function buildForest({ cityRadius, forestRadius }) {
  const forest = new THREE.Group();
  forest.name = 'forest';
  // Use deterministic-feeling random for consistent layout per session
  const TREE_COUNT = 220;
  for (let i = 0; i < TREE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = cityRadius + 6 + Math.random() * (forestRadius - cityRadius - 8);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const tree = buildTree();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.8 + Math.random() * 0.6);
    tree.rotation.y = Math.random() * Math.PI * 2;
    forest.add(tree);
  }
  // A few large boulders — lighter granite color so they read in daylight.
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.95 });
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = cityRadius + 4 + Math.random() * (forestRadius - cityRadius - 6);
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.6 + Math.random() * 1.2, 0),
      stoneMat
    );
    rock.position.set(Math.cos(angle) * r, 0.3, Math.sin(angle) * r);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = rock.receiveShadow = true;
    forest.add(rock);
  }
  return forest;
}

// ─── Safe-zone ring marker (subtle visual) ──────────────────────────────────
function buildSafeZoneRing(radius) {
  const ringGeo = new THREE.RingGeometry(radius - 0.5, radius + 0.5, 96);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd76e, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.12;
  return ring;
}

// ─── Public API ─────────────────────────────────────────────────────────────
export function buildWorld(scene, world) {
  const stoneTex = stoneTexture();
  const woodTex = woodTexture();

  // Sky
  const sky = buildSky();
  scene.add(sky);

  // ── Lighting: bright midday sun, generous ambient bounce ──────────────────
  const sun = new THREE.DirectionalLight(0xfff4d8, 2.2);
  sun.position.set(50, 90, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 250;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // Hemisphere light: bright sky-blue from above, warm grass bounce from below.
  // This is what kills the "everything is dark" feeling — fills shadows nicely.
  const hemi = new THREE.HemisphereLight(0xc6dcff, 0x8a9670, 0.85);
  scene.add(hemi);

  // Soft fog — pale sky tone, low density so distant city/forest is visible.
  scene.fog = new THREE.FogExp2(0xc8d4dc, 0.0034);

  // Ground
  const ground = buildGround(world.GROUND_SIZE);
  scene.add(ground);

  // City
  const city = buildCity(stoneTex, woodTex);
  scene.add(city);

  // Forest
  const forest = buildForest({ cityRadius: world.CITY_RADIUS, forestRadius: world.FOREST_RADIUS });
  scene.add(forest);

  // Clouds (above everything else)
  const clouds = buildClouds();
  scene.add(clouds);

  // Safe zone ring
  const ring = buildSafeZoneRing(world.CITY_RADIUS);
  scene.add(ring);

  // Collect torches for animation
  const torches = [];
  city.traverse(o => { if (o.userData?.flame) torches.push(o); });

  return { sky, sun, ground, city, forest, clouds, torches };
}

export function tickWorld(handles, time) {
  // Torch flicker — gentler now since they're not the dominant light source.
  for (const t of handles.torches) {
    const flick = 0.85 + Math.sin(time * 12 + t.position.x) * 0.1 + (Math.random() - 0.5) * 0.08;
    t.userData.light.intensity = 0.7 * flick;
    t.userData.flame.scale.setScalar(0.95 + flick * 0.08);
  }
  // Drift clouds slowly around the player.
  if (handles.clouds) {
    for (const cloud of handles.clouds.children) {
      const u = cloud.userData;
      if (u.driftAngle == null) continue;
      u.driftAngle += u.driftSpeed * 0.1;
      cloud.position.x = Math.cos(u.driftAngle) * u.radius;
      cloud.position.z = Math.sin(u.driftAngle) * u.radius;
    }
  }
  // Animate sky shader time uniform for cloud drift inside the dome.
  if (handles.sky?.material?.uniforms?.uTime) {
    handles.sky.material.uniforms.uTime.value = time;
  }
}

export function getHeightAt(/* x, z */) {
  // We could sample the ground heightfield, but our flat city + small forest
  // hills aren't tall enough to warrant per-frame raycasting. Return 0.
  return 0;
}
