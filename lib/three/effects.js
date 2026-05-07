// Lightweight FX: damage popups, hit sparks, mage projectiles, level-up flare.

import * as THREE from 'three';

export class FxManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
  }

  spawnDamage(pos, amount, color = '#ff5050') {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 40px serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = color;
    ctx.strokeText(`-${amount}`, 64, 44);
    ctx.fillText(`-${amount}`, 64, 44);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4, 0.7, 1);
    sprite.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 1.6, pos.z);
    sprite.renderOrder = 1000;
    this.scene.add(sprite);
    this.active.push({ obj: sprite, t: 0, life: 1.0, kind: 'dmg', startY: sprite.position.y });
  }

  spawnHitSparks(pos, color = 0xffe080) {
    const count = 12;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y + 1;
      positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 2;
      velocities.push(new THREE.Vector3(
        Math.cos(a) * r,
        Math.random() * 3 + 1,
        Math.sin(a) * r,
      ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 0.16, transparent: true, opacity: 1, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.active.push({ obj: pts, t: 0, life: 0.45, kind: 'sparks', velocities });
  }

  spawnSpellProjectile(from, to, color = 0x6a8aff, onHit) {
    const grp = new THREE.Group();
    const orbMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 2, transparent: true, opacity: 0.9,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), orbMat);
    grp.add(orb);
    const light = new THREE.PointLight(color, 1.2, 6, 1.5);
    grp.add(light);
    grp.position.set(from.x, from.y + 1.4, from.z);
    this.scene.add(grp);
    const dir = new THREE.Vector3(to.x - from.x, (to.y + 1) - (from.y + 1.4), to.z - from.z);
    const dist = dir.length();
    dir.normalize();
    const speed = 18;
    this.active.push({
      obj: grp, t: 0, life: dist / speed, kind: 'spell',
      vel: dir.multiplyScalar(speed), onHit, hitPos: { x: to.x, y: to.y, z: to.z },
    });
  }

  spawnLevelUpBurst(pos) {
    // Expanding ring + column of light
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.7, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd76e, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.05, pos.z);
    this.scene.add(ring);
    this.active.push({ obj: ring, t: 0, life: 1.2, kind: 'levelring' });

    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 4, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    column.position.set(pos.x, pos.y + 2, pos.z);
    this.scene.add(column);
    this.active.push({ obj: column, t: 0, life: 1.2, kind: 'levelcolumn' });
  }

  tick(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.t += dt;
      if (fx.t >= fx.life) {
        if (fx.kind === 'spell' && fx.onHit) fx.onHit(fx.hitPos);
        this.scene.remove(fx.obj);
        if (fx.obj.geometry) fx.obj.geometry.dispose?.();
        if (fx.obj.material) {
          if (fx.obj.material.map) fx.obj.material.map.dispose?.();
          fx.obj.material.dispose?.();
        }
        this.active.splice(i, 1);
        continue;
      }
      const p = fx.t / fx.life;
      if (fx.kind === 'dmg') {
        fx.obj.position.y = fx.startY + p * 1.0;
        fx.obj.material.opacity = 1 - p;
      } else if (fx.kind === 'sparks') {
        const positions = fx.obj.geometry.attributes.position.array;
        for (let j = 0; j < fx.velocities.length; j++) {
          positions[j * 3 + 0] += fx.velocities[j].x * dt;
          positions[j * 3 + 1] += fx.velocities[j].y * dt;
          positions[j * 3 + 2] += fx.velocities[j].z * dt;
          fx.velocities[j].y -= 9.8 * dt;
        }
        fx.obj.geometry.attributes.position.needsUpdate = true;
        fx.obj.material.opacity = 1 - p;
      } else if (fx.kind === 'spell') {
        fx.obj.position.x += fx.vel.x * dt;
        fx.obj.position.y += fx.vel.y * dt;
        fx.obj.position.z += fx.vel.z * dt;
      } else if (fx.kind === 'levelring') {
        fx.obj.scale.setScalar(1 + p * 6);
        fx.obj.material.opacity = 1 - p;
      } else if (fx.kind === 'levelcolumn') {
        fx.obj.material.opacity = (1 - p) * 0.6;
        fx.obj.scale.y = 1 + Math.sin(p * Math.PI) * 0.5;
      }
    }
  }
}
