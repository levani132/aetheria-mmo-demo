// GLB asset loader/cache. Currently hosts the Icebound Enchantress elf-mage
// (the first rigged character in Aetheria). The character body and the
// merged-animations clips ship as two separate GLBs from Meshy; we load both
// once and clone the skinned mesh per-instance via SkeletonUtils.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const CHAR_URL = '/models/elf_mage_female.glb';
const ANIM_URL = '/models/elf_mage_female_anims.glb';

let pendingPromise = null;
let cache = null;

export function loadElfMageFemale() {
  if (cache) return Promise.resolve(cache);
  if (pendingPromise) return pendingPromise;

  const loader = new GLTFLoader();
  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

  pendingPromise = Promise.all([load(CHAR_URL), load(ANIM_URL)])
    .then(([charGltf, animGltf]) => {
      // The base scene we'll clone from. Walk the tree once to set shadow
      // flags and disable frustum culling on the skinned mesh — skinned bounds
      // are notoriously unreliable and the model will pop out when bones
      // animate beyond the bind-pose AABB.
      charGltf.scene.traverse((obj) => {
        if (obj.isMesh || obj.isSkinnedMesh) {
          obj.castShadow = true;
          obj.receiveShadow = false;
          obj.frustumCulled = false;
        }
      });
      cache = { scene: charGltf.scene, animations: animGltf.animations };
      return cache;
    })
    .catch((err) => {
      pendingPromise = null;
      throw err;
    });

  return pendingPromise;
}

// Each character instance gets its own clone (skeleton + mesh) so they can
// animate independently. SkeletonUtils.clone handles SkinnedMesh + Bone graph
// correctly; a plain .clone() shares bones across instances.
export function cloneElfMageFemale() {
  if (!cache) return null;
  const object = cloneSkeleton(cache.scene);
  const mixer = new THREE.AnimationMixer(object);
  const actions = {};
  for (const clip of cache.animations) actions[clip.name] = mixer.clipAction(clip);
  // Find named bones we care about. The Meshy biped uses these exact names.
  const bones = {};
  object.traverse((n) => {
    if (n.isBone) bones[n.name] = n;
  });
  return { object, mixer, actions, bones };
}

export function isElfMageFemaleReady() {
  return !!cache;
}
