// Procedural humanoid + mob meshes. Each character is a small skeletal-ish
// rig built from primitives — head / torso / arms / legs — that we can
// animate by rotating limbs in code. Equipment swaps in via slot meshes.
//
// One exception: race=elves + female + mage uses a GLB skinned mesh (the
// Icebound Enchantress) loaded from /models/. The Group returned still has
// the same shape so Game.js doesn't need to special-case anything — the
// animation functions below branch on userData.kind.

import * as THREE from 'three';
import { ITEMS } from '../gamedata';
import { loadElfMageFemale, cloneElfMageFemale, isElfMageFemaleReady } from './glbAssets';

const SKIN_TONES = {
  warrior_male:   0xd1a07a,
  warrior_female: 0xe1b48e,
  mage_male:      0xc89376,
  mage_female:    0xdcb094,
};

// Elves are paler-toned for contrast against humans.
const ELF_SKIN_TONES = {
  warrior_male:   0xe8d4bc,
  warrior_female: 0xf0dccc,
  mage_male:      0xe0c8b0,
  mage_female:    0xeed3c0,
};

const HAIR_COLORS = [0x2a1810, 0x4a2c14, 0x6a4424, 0x8a6634, 0xb88c5c, 0xd9c094];
const ELF_HAIR_COLORS = [0xe8d6a8, 0xc89858, 0xf0e2c0, 0x7a5a3a, 0xb89878];

// The Meshy armature is authored at 100x its intended display scale; we
// compensate with a uniform 0.01 root scale (matches the GLB itself). The
// reciprocal is needed when re-parenting non-rigged props (like a staff)
// into a bone so they don't shrink to nothing.
const ARMATURE_SCALE = 0.01;
const BONE_INV_SCALE = 1 / ARMATURE_SCALE;

function makeMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.7, metalness: 0, ...opts,
  });
}

// Helper: build a body part as a Group so we can rotate around its top
function pivotMesh(mesh, pivotOffset) {
  const grp = new THREE.Group();
  mesh.position.copy(pivotOffset);
  grp.add(mesh);
  return grp;
}

export function buildCharacter({ charClass, gender, race = 'human', level = 1, equipment = {}, isSelf = false }) {
  const grp = new THREE.Group();
  const isElf = race === 'elves';

  // Elf-female-mage uses the GLB rig. The placeholder body is built procedurally
  // (so the player sees something on the way in), then swapped on load.
  const useGlb = isElf && gender === 'female' && charClass === 'mage';

  const skinPalette = isElf ? ELF_SKIN_TONES : SKIN_TONES;
  const hairPalette = isElf ? ELF_HAIR_COLORS : HAIR_COLORS;
  const skin = skinPalette[`${charClass}_${gender}`] || 0xd1a07a;
  const hair = hairPalette[Math.floor(Math.random() * hairPalette.length)];

  const skinMat = makeMaterial(skin);
  const hairMat = makeMaterial(hair, { roughness: 0.5 });

  // Body proportions vary by gender
  const torsoW = gender === 'female' ? 0.55 : 0.65;
  const torsoH = 0.85;
  const torsoD = 0.35;
  const legH = 0.95;
  const armH = 0.85;
  const headR = 0.22;

  // Class-flavored base outfit color (covered by armor if equipped)
  const baseColor = charClass === 'warrior' ? 0x4a3322 : 0x2a2444;
  const baseMat = makeMaterial(baseColor);

  // ── Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), baseMat);
  torso.position.y = legH + torsoH / 2;
  torso.castShadow = true;
  grp.add(torso);

  // ── Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), skinMat);
  head.position.y = legH + torsoH + headR * 0.85;
  head.castShadow = true;
  grp.add(head);

  // hair (a half-sphere on top of head)
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(headR * 1.05, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    hairMat
  );
  hairCap.position.copy(head.position);
  hairCap.position.y += 0.02;
  grp.add(hairCap);

  // longer hair for female
  if (gender === 'female') {
    const longHair = new THREE.Mesh(
      new THREE.CylinderGeometry(headR * 0.9, headR * 0.6, 0.5, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: hair, roughness: 0.5, side: THREE.DoubleSide })
    );
    longHair.position.set(0, head.position.y - 0.2, -0.1);
    grp.add(longHair);
  }

  // eyes (tiny dark dots)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const sx of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMat);
    eye.position.set(sx, head.position.y + 0.02, headR - 0.03);
    grp.add(eye);
  }

  // Elf ears — pointed cones angling up-and-out from the side of the head.
  if (isElf) {
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(headR * 0.18, headR * 0.7, 6),
        skinMat
      );
      ear.position.set(sx * (headR + 0.02), head.position.y + headR * 0.4, 0);
      ear.rotation.z = sx * Math.PI * 0.35;
      ear.rotation.x = -Math.PI * 0.05;
      grp.add(ear);
    }
  }

  // ── Arms
  const armGeo = new THREE.BoxGeometry(0.16, armH, 0.18);
  const leftArmGrp = new THREE.Group();
  const rightArmGrp = new THREE.Group();
  const leftArm = new THREE.Mesh(armGeo, baseMat);
  const rightArm = new THREE.Mesh(armGeo, baseMat);
  leftArm.position.y = -armH / 2;
  rightArm.position.y = -armH / 2;
  leftArm.castShadow = rightArm.castShadow = true;
  leftArmGrp.add(leftArm);
  rightArmGrp.add(rightArm);
  leftArmGrp.position.set(-(torsoW / 2 + 0.1), legH + torsoH * 0.95, 0);
  rightArmGrp.position.set(torsoW / 2 + 0.1, legH + torsoH * 0.95, 0);
  grp.add(leftArmGrp);
  grp.add(rightArmGrp);

  // ── Legs
  const legGeo = new THREE.BoxGeometry(0.22, legH, 0.24);
  const legMat = makeMaterial(charClass === 'warrior' ? 0x382818 : 0x1a1830);
  const leftLegGrp = new THREE.Group();
  const rightLegGrp = new THREE.Group();
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.y = -legH / 2;
  rightLeg.position.y = -legH / 2;
  leftLeg.castShadow = rightLeg.castShadow = true;
  leftLegGrp.add(leftLeg);
  rightLegGrp.add(rightLeg);
  leftLegGrp.position.set(-0.13, legH, 0);
  rightLegGrp.position.set(0.13, legH, 0);
  grp.add(leftLegGrp);
  grp.add(rightLegGrp);

  // ── Equipment overlays: armor / helmet / weapon
  const equipGroups = { weapon: null, armor: null, helmet: null };

  if (equipment.armor && ITEMS[equipment.armor]) {
    const armor = buildArmorMesh(ITEMS[equipment.armor], { torsoW, torsoH, torsoD });
    armor.position.copy(torso.position);
    grp.add(armor);
    equipGroups.armor = armor;
  }
  if (equipment.helmet && ITEMS[equipment.helmet]) {
    const helm = buildHelmetMesh(ITEMS[equipment.helmet]);
    helm.position.copy(head.position);
    grp.add(helm);
    equipGroups.helmet = helm;
  }
  if (equipment.weapon && ITEMS[equipment.weapon]) {
    const wpn = buildWeaponMesh(ITEMS[equipment.weapon]);
    rightArmGrp.add(wpn);                        // attach to right hand pivot
    wpn.position.set(0.05, -armH + 0.1, 0.1);
    equipGroups.weapon = wpn;
  }

  // ── Nameplate slot (filled by Game.js with sprite)
  grp.userData = {
    type: 'character',
    kind: useGlb ? 'glb-pending' : 'procedural',
    charClass, gender, race, level,
    isSelf,
    parts: { head, torso, leftArmGrp, rightArmGrp, leftLegGrp, rightLegGrp },
    equipGroups,
    bobPhase: Math.random() * Math.PI * 2,
    placeholderChildren: useGlb ? grp.children.slice() : null,
    equipment,
  };

  // Self-indicator: subtle ground halo
  if (isSelf) {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd76e, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    grp.add(halo);
    grp.userData.halo = halo;
  }

  // Async swap to GLB rig for elf-female-mage. The placeholder procedural body
  // stays visible until the load finishes (which is usually instant on the
  // second character since the asset is cached).
  if (useGlb) {
    if (isElfMageFemaleReady()) {
      attachElfMageGlb(grp);
    } else {
      loadElfMageFemale()
        .then(() => attachElfMageGlb(grp))
        .catch((err) => console.warn('Elf mage GLB failed to load — keeping procedural placeholder.', err));
    }
  }

  return grp;
}

// Swap the procedural placeholder out for the cloned GLB rig. The Group object
// identity is preserved so callers (Game.js) keep a valid reference and
// nameplate/halo children survive.
function attachElfMageGlb(grp) {
  const u = grp.userData;
  if (!u || u.kind === 'glb') return;
  const rig = cloneElfMageFemale();
  if (!rig) return;

  // Remove placeholder body parts (keep nameplate/halo and any unrelated children).
  if (u.placeholderChildren) {
    for (const child of u.placeholderChildren) grp.remove(child);
    u.placeholderChildren = null;
  }
  u.parts = null;

  // Add the rig. The GLB ships with Armature scale = 0.01 already applied, so
  // the model lands at roughly 1.4–1.6m tall — feet near y=0 of the rig root.
  grp.add(rig.object);
  u.kind = 'glb';
  u.mixer = rig.mixer;
  u.actions = rig.actions;
  u.bones = rig.bones;
  u.castAction = null;
  u.castActive = false;
  u.moveActive = false;

  // The 5.5 m/s player speed is jogging pace, so the Running clip fits better
  // than Walking_Woman; we keep the latter as a fallback if the export ever
  // drops it.
  u.moveAction = rig.actions.Running || rig.actions.Walking_Woman || rig.actions.Walking || null;
  u.castClips = ['mage_soell_cast_4', 'mage_soell_cast', 'mage_soell_cast_1', 'mage_soell_cast_7']
    .map(name => rig.actions[name])
    .filter(Boolean);

  // We need the SkinnedMesh so we can call skeleton.pose() to reset bones to
  // bind pose for the idle stance — the GLB has no idle clip, so freezing the
  // run action would leave her stuck mid-stride.
  let skinned = null;
  rig.object.traverse((n) => { if (!skinned && n.isSkinnedMesh) skinned = n; });
  u.skinnedMesh = skinned;

  // Start at idle: bind pose, no action playing.
  if (skinned?.skeleton) skinned.skeleton.pose();

  // Re-attach equipment that was passed in at build time. Right now the only
  // overlay we re-parent is the weapon (staff) — armor and helmet from the
  // procedural pipeline don't fit the rigged silhouette and would clip badly.
  if (u.equipment?.weapon && u.bones?.RightHand && ITEMS[u.equipment.weapon]) {
    const wpn = buildWeaponMesh(ITEMS[u.equipment.weapon]);
    const holder = new THREE.Group();
    holder.scale.setScalar(BONE_INV_SCALE);
    holder.rotation.set(0, Math.PI / 2, 0);
    holder.position.set(0, 0, 0);
    holder.add(wpn);
    wpn.position.set(0, -0.15, 0);
    u.bones.RightHand.add(holder);
    u.equipGroups = { ...(u.equipGroups || {}), weapon: holder };
  }
}

function buildArmorMesh(item, dims) {
  const tier = item.tier || 1;
  const colors = item.id.includes('robe')
    ? [0x4a2050, 0x6a2070, 0x8a3090]
    : item.id === 'leather_vest' ? [0x6a4528, 0x6a4528, 0x6a4528]
    : item.id === 'chainmail'    ? [0x9a9a9a, 0x9a9a9a, 0x9a9a9a]
    : [0xc8c8d0, 0xd0d0e0, 0xe0e0f0];
  const color = colors[tier - 1] || colors[0];
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: item.id === 'plate_armor' ? 0.4 : 0.7,
    metalness: item.id === 'plate_armor' || item.id === 'chainmail' ? 0.6 : 0.05,
  });
  const geo = new THREE.BoxGeometry(dims.torsoW + 0.06, dims.torsoH + 0.04, dims.torsoD + 0.06);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function buildHelmetMesh(item) {
  if (item.id === 'iron_helm') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb0b0b8, roughness: 0.4, metalness: 0.7 });
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.7), mat);
    helm.castShadow = true;
    return helm;
  }
  if (item.id === 'leather_cap') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.85 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    cap.castShadow = true;
    return cap;
  }
  if (item.id === 'hood_of_focus') {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a1838, roughness: 0.85 });
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.85), mat);
    hood.castShadow = true;
    grp.add(hood);
    return grp;
  }
  return new THREE.Group();
}

function buildWeaponMesh(item) {
  const grp = new THREE.Group();
  if (item.slot !== 'weapon') return grp;
  if (item.class === 'warrior') {
    // Sword: blade + crossguard + grip + pommel
    const tier = item.tier || 1;
    const bladeColor = tier === 1 ? 0x7a7a7a : tier === 2 ? 0xc0c0c8 : 0xe0e8f0;
    const bladeMat = new THREE.MeshStandardMaterial({
      color: bladeColor, roughness: 0.25, metalness: 0.85,
      emissive: tier === 3 ? 0x4080ff : 0x000000,
      emissiveIntensity: tier === 3 ? 0.4 : 0,
    });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.18), bladeMat);
    blade.position.y = 0.55;
    blade.castShadow = true;
    grp.add(blade);
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.05, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x6a4a20, metalness: 0.7, roughness: 0.4 })
    );
    guard.position.y = 0.1; grp.add(guard);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.8 })
    );
    grip.position.y = 0; grp.add(grip);
    const pommel = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xb8902a, metalness: 0.8, roughness: 0.3 })
    );
    pommel.position.y = -0.1; grp.add(pommel);
    grp.rotation.z = -Math.PI / 8;
    return grp;
  }
  if (item.class === 'mage') {
    // Staff: shaft + glowing orb on top
    const tier = item.tier || 1;
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.9 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 8), shaftMat);
    shaft.position.y = 0.5;
    shaft.castShadow = true;
    grp.add(shaft);
    const orbColor = tier === 1 ? 0x6a8aff : tier === 2 ? 0xc060ff : 0xff40c0;
    const orbMat = new THREE.MeshStandardMaterial({
      color: orbColor, emissive: orbColor, emissiveIntensity: 1.6, roughness: 0.2,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), orbMat);
    orb.position.y = 1.25;
    grp.add(orb);
    const orbLight = new THREE.PointLight(orbColor, 0.8, 4, 1.5);
    orbLight.position.y = 1.25;
    grp.add(orbLight);
    grp.rotation.z = -Math.PI / 10;
    return grp;
  }
  return grp;
}

// ── Mob meshes ─────────────────────────────────────────────────────────────
export function buildMob(kind) {
  const grp = new THREE.Group();
  if (kind === 'forest_wolf') return buildWolf(grp);
  if (kind === 'goblin')      return buildGoblin(grp);
  if (kind === 'bandit')      return buildBandit(grp);
  if (kind === 'dire_bear')   return buildBear(grp);
  if (kind === 'troll')       return buildTroll(grp);
  return grp;
}

function buildWolf(grp) {
  const fur = new THREE.MeshStandardMaterial({ color: 0x6a665e, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 1.3), fur);
  body.position.y = 0.7; body.castShadow = true;
  grp.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.5), fur);
  head.position.set(0, 0.85, 0.85); head.castShadow = true;
  grp.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.3), fur);
  snout.position.set(0, 0.78, 1.15);
  grp.add(snout);
  // Ears
  for (const sx of [-0.12, 0.12]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 4), fur);
    ear.position.set(sx, 1.08, 0.78);
    grp.add(ear);
  }
  // Eyes — yellow glow
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xffaa20, emissiveIntensity: 0.8 });
  for (const sx of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), eyeMat);
    eye.position.set(sx, 0.92, 1.05);
    grp.add(eye);
  }
  // Legs
  const legMat = fur;
  const legGeo = new THREE.BoxGeometry(0.14, 0.55, 0.14);
  for (const [sx, sz] of [[-0.22, 0.4], [0.22, 0.4], [-0.22, -0.4], [0.22, -0.4]]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(sx, 0.27, sz);
    leg.castShadow = true;
    grp.add(leg);
  }
  // Tail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), fur);
  tail.position.set(0, 0.78, -0.85);
  tail.rotation.x = -0.4;
  grp.add(tail);
  return grp;
}

function buildGoblin(grp) {
  const skin = new THREE.MeshStandardMaterial({ color: 0x4a6840, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.3), cloth);
  torso.position.y = 0.85; torso.castShadow = true; grp.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.3; head.castShadow = true; grp.add(head);
  // pointed ears
  for (const sx of [-0.18, 0.18]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), skin);
    ear.position.set(sx, 1.35, 0); ear.rotation.z = sx > 0 ? -1.1 : 1.1;
    grp.add(ear);
  }
  // arms
  const armGeo = new THREE.BoxGeometry(0.1, 0.45, 0.1);
  for (const sx of [-0.27, 0.27]) {
    const arm = new THREE.Mesh(armGeo, skin);
    arm.position.set(sx, 0.85, 0); arm.castShadow = true; grp.add(arm);
  }
  // legs
  const legGeo = new THREE.BoxGeometry(0.13, 0.55, 0.13);
  for (const sx of [-0.1, 0.1]) {
    const leg = new THREE.Mesh(legGeo, cloth);
    leg.position.set(sx, 0.3, 0); leg.castShadow = true; grp.add(leg);
  }
  // crude club
  const club = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.95 }));
  club.position.set(0.32, 0.7, 0.05);
  club.rotation.z = 0.6;
  grp.add(club);
  return grp;
}

function buildBandit(grp) {
  const cloth = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89376, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), cloth);
  torso.position.y = 1.4; torso.castShadow = true; grp.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skin);
  head.position.y = 2.0; head.castShadow = true; grp.add(head);
  // hood
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.9 });
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hoodMat);
  hood.position.copy(head.position); grp.add(hood);
  // arms
  const armGeo = new THREE.BoxGeometry(0.14, 0.7, 0.14);
  for (const sx of [-0.36, 0.36]) {
    const arm = new THREE.Mesh(armGeo, cloth);
    arm.position.set(sx, 1.4, 0); arm.castShadow = true; grp.add(arm);
  }
  // legs
  const legGeo = new THREE.BoxGeometry(0.18, 0.85, 0.2);
  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(legGeo, cloth);
    leg.position.set(sx, 0.5, 0); leg.castShadow = true; grp.add(leg);
  }
  return grp;
}

function buildBear(grp) {
  const fur = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 1.7), fur);
  body.position.y = 1.0; body.castShadow = true; grp.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.65, 0.7), fur);
  head.position.set(0, 1.25, 1.0); head.castShadow = true; grp.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.4), fur);
  snout.position.set(0, 1.1, 1.45); grp.add(snout);
  // eyes glow red
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 1 });
  for (const sx of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
    eye.position.set(sx, 1.32, 1.32); grp.add(eye);
  }
  // legs
  const legGeo = new THREE.BoxGeometry(0.25, 0.85, 0.25);
  for (const [sx, sz] of [[-0.35, 0.55], [0.35, 0.55], [-0.35, -0.55], [0.35, -0.55]]) {
    const leg = new THREE.Mesh(legGeo, fur);
    leg.position.set(sx, 0.42, sz); leg.castShadow = true; grp.add(leg);
  }
  return grp;
}

function buildTroll(grp) {
  const skin = new THREE.MeshStandardMaterial({ color: 0x2d4a30, roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.95 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.6), skin);
  torso.position.y = 2.0; torso.castShadow = true; grp.add(torso);
  // Hunched neck/head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.6), skin);
  head.position.set(0, 2.85, 0.15); head.castShadow = true; grp.add(head);
  // tusks
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xeae0c8, roughness: 0.4 });
  for (const sx of [-0.12, 0.12]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), tuskMat);
    tusk.position.set(sx, 2.65, 0.42); tusk.rotation.x = Math.PI;
    grp.add(tusk);
  }
  // arms (long, hanging)
  const armGeo = new THREE.BoxGeometry(0.28, 1.5, 0.28);
  for (const sx of [-0.7, 0.7]) {
    const arm = new THREE.Mesh(armGeo, skin);
    arm.position.set(sx, 1.65, 0.05); arm.castShadow = true; grp.add(arm);
  }
  // legs
  const legGeo = new THREE.BoxGeometry(0.4, 1.3, 0.4);
  for (const sx of [-0.28, 0.28]) {
    const leg = new THREE.Mesh(legGeo, cloth);
    leg.position.set(sx, 0.65, 0); leg.castShadow = true; grp.add(leg);
  }
  return grp;
}

// ── Animation: limb walk cycle ─────────────────────────────────────────────
//
// The procedural and GLB paths share the same external API. Game.js calls
// animateCharacter(mesh, dt, isMoving) every frame regardless of rig type.
export function animateCharacter(grp, dt, isMoving) {
  const u = grp.userData || {};
  if (u.kind === 'glb') return animateGlbCharacter(grp, dt, isMoving);
  if (!u.parts) return;
  u._t = (u._t || 0) + dt;
  if (isMoving) {
    const speed = 8;
    const swing = Math.sin(u._t * speed) * 0.7;
    u.parts.leftLegGrp.rotation.x = swing;
    u.parts.rightLegGrp.rotation.x = -swing;
    u.parts.leftArmGrp.rotation.x = -swing * 0.6;
    u.parts.rightArmGrp.rotation.x = swing * 0.6;
  } else {
    // settle to idle
    const lerp = (a, b, t) => a + (b - a) * t;
    u.parts.leftLegGrp.rotation.x  = lerp(u.parts.leftLegGrp.rotation.x,  0, 0.15);
    u.parts.rightLegGrp.rotation.x = lerp(u.parts.rightLegGrp.rotation.x, 0, 0.15);
    u.parts.leftArmGrp.rotation.x  = lerp(u.parts.leftArmGrp.rotation.x,  0, 0.15);
    u.parts.rightArmGrp.rotation.x = lerp(u.parts.rightArmGrp.rotation.x, 0, 0.15);
    // gentle idle bob
    grp.position.y = Math.sin(u._t * 2 + (u.bobPhase || 0)) * 0.02;
  }
}

function animateGlbCharacter(grp, dt, isMoving) {
  const u = grp.userData;
  if (!u.mixer) return;

  // Cast end → fall back to either run (if moving) or idle (bind pose).
  if (u.castActive && u.castAction) {
    if (u.castAction.time >= u.castAction.getClip().duration - 0.05) {
      u.castActive = false;
      u.castAction.setEffectiveWeight(0);
      u.castAction.stop();
      if (isMoving) startGlbMove(u);
      else          startGlbIdle(u);
    }
  } else if (!u.castActive) {
    // Move ↔ idle transitions. moveActive is the persistent flag so we don't
    // restart the run action every frame.
    if (isMoving && !u.moveActive) {
      startGlbMove(u);
    } else if (!isMoving && u.moveActive) {
      startGlbIdle(u);
    }
  }

  u.mixer.update(dt);
}

function startGlbMove(u) {
  if (!u.moveAction) return;
  u.moveAction.reset();
  u.moveAction.setEffectiveWeight(1);
  u.moveAction.paused = false;
  u.moveAction.play();
  u.moveActive = true;
}

// Drop the rig back to a clean standing bind pose. Three.js's AnimationMixer
// only writes to bones for active actions, so stopping the run action and
// then calling skeleton.pose() leaves her in a proper stance — not the frozen
// mid-stride pose that pausing would give.
function startGlbIdle(u) {
  if (u.moveAction) u.moveAction.stop();
  u.moveActive = false;
  if (u.skinnedMesh?.skeleton) u.skinnedMesh.skeleton.pose();
}

export function playAttackSwing(grp) {
  const u = grp.userData;
  if (!u) return;
  if (u.kind === 'glb') {
    triggerGlbCast(grp);
    return;
  }
  if (!u.parts) return;
  u.swingT = 0;
  u.swinging = true;
}

function triggerGlbCast(grp) {
  const u = grp.userData;
  if (!u.castClips || u.castClips.length === 0) return;
  // Pick a random cast variant so the four exported clips all see screen time.
  // The base clip is intentionally misspelled "soell" in the source GLB.
  const cast = u.castClips[Math.floor(Math.random() * u.castClips.length)];

  // Pause the run action while the cast plays — the cast clip animates the
  // full body and would crossfade weirdly with running legs.
  if (u.moveAction) u.moveAction.stop();
  u.moveActive = false;

  cast.reset();
  cast.setLoop(THREE.LoopOnce, 1);
  cast.clampWhenFinished = true;
  cast.setEffectiveWeight(1);
  cast.play();
  u.castAction = cast;
  u.castActive = true;
}

export function tickAttackSwing(grp, dt) {
  const u = grp.userData;
  if (!u) return;
  // GLB rig drives its cast action through animateCharacter's mixer.update,
  // so this is a no-op for the GLB path.
  if (u.kind === 'glb') return;
  if (!u.swinging) return;
  u.swingT += dt;
  const phase = u.swingT / 0.35; // 350ms
  if (phase >= 1) {
    u.swinging = false;
    u.parts.rightArmGrp.rotation.x = 0;
    return;
  }
  // simple sine arc forward then back
  u.parts.rightArmGrp.rotation.x = -Math.sin(phase * Math.PI) * 1.6;
}

// Nameplate / level sprite
export function buildNameplate(name, level, color = '#ffe9b0') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 22px serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000';
  ctx.fillStyle = color;
  ctx.strokeText(`${name}  ⟪Lv ${level}⟫`, 128, 32);
  ctx.fillText(`${name}  ⟪Lv ${level}⟫`, 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.6, 1);
  sprite.renderOrder = 999;
  return sprite;
}
