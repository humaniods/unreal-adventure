'use strict';
/* Eating and drinking with the hiker's own arms.
   The player's character (the rigged hiker from crowd.js) is shown while eating, seen by a close camera in front
   of them, and its real arms do the work through two-bone IK on top of the sitting or idle clip:
   the left hand takes the plate from where the shopkeeper set it down and holds it at the chest, the right hand
   takes a forkful to the mouth; a glass of tea or a bottle is lifted to the lips and tipped; a snack comes up to
   the mouth. Food and water count only when a bite reaches the mouth (onBite). Afterwards the empty dish is put
   down and the view goes back to the player.
   Interface: start(kind, opts), update(dt, speed), pose(), frame(camera, dt), finish(abort), busy. */
window.TriundHands = {
  create({ THREE, scene, getChar, H, clearView }) {
    const v3 = () => new THREE.Vector3(), q4 = () => new THREE.Quaternion();
    const A = v3(), Qa = q4(), Qb = q4(), Qp = q4();
    let job = null, bones = null, boneChar = null;
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.3, metalness: 0.85 });
    const fork = new THREE.Group();
    { const h = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.15), steel); fork.add(h);
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.04), steel); t.position.set(-0.008 + i * 0.008, 0, 0.09); fork.add(t); }
      const bite = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8c04a, roughness: 0.7 })); bite.position.set(0, 0.01, 0.1); bite.scale.set(1.3, 0.6, 1.2); fork.add(bite); fork.userData.bite = bite; }
    fork.scale.setScalar(1.5); fork.visible = false; scene.add(fork);   // a touch larger than life so it reads from the camera

    function findBones(ch) {
      if (boneChar === ch) return bones;
      const b = {}; ch.root.traverse(n => { if (n.isBone) b[n.name] = n; });
      bones = b.upperarm_l && b.lowerarm_l && b.hand_l && b.upperarm_r && b.lowerarm_r && b.hand_r && b.Head && b.spine_03 ? b : null; boneChar = ch; return bones;
    }
    const wpos = (o, out) => out.setFromMatrixPosition(o.matrixWorld);
    // rotate `bone` (in world space) so that the direction from it to `childPos` turns onto `targetDir`
    function aim(bone, from, childPos, targetDir) {
      const cur = A.copy(childPos).sub(from).normalize();
      Qa.setFromUnitVectors(cur, targetDir);
      bone.getWorldQuaternion(Qb); Qb.premultiply(Qa);
      bone.parent.getWorldQuaternion(Qp); bone.quaternion.copy(Qp.invert().multiply(Qb));
      bone.updateMatrixWorld(true);
    }
    // two-bone IK: shoulder S, elbow E, wrist W -> target T, elbow bent toward the pole
    function twoBone(up, low, hand, T, pole) {
      const S = wpos(up, v3()), E = wpos(low, v3()), W = wpos(hand, v3());
      const a = S.distanceTo(E), b = E.distanceTo(W), toT = v3().copy(T).sub(S);
      const c = Math.min(Math.max(toT.length(), 0.05), a + b - 0.002), d = toT.normalize();
      const m = v3().copy(pole).sub(S); m.sub(v3().copy(d).multiplyScalar(m.dot(d))).normalize();
      const cosA = Math.min(1, Math.max(-1, (a * a + c * c - b * b) / (2 * a * c))), sinA = Math.sqrt(1 - cosA * cosA);
      const Ed = v3().copy(S).addScaledVector(d, a * cosA).addScaledVector(m, a * sinA);
      aim(up, S, E, v3().copy(Ed).sub(S).normalize());
      const E2 = wpos(low, v3()), W2 = wpos(hand, v3());
      aim(low, E2, W2, v3().copy(T).sub(E2).normalize());
    }

    // a closed grip: point the fingers along `dir`, turn the thumb toward `thumbTo`, then curl every finger joint
    function grip(b, side, dir, thumbTo, curl) {
      const hand = b['hand_' + side], mid = b['middle_01_' + side], th = b['thumb_01_' + side]; if (!mid || !th) return;
      const H0 = wpos(hand, v3());
      aim(hand, H0, wpos(mid, v3()), dir);
      // twist about the finger direction so the thumb side faces thumbTo
      const tcur = wpos(th, v3()).sub(H0); tcur.sub(v3().copy(dir).multiplyScalar(tcur.dot(dir))).normalize();
      const twant = v3().copy(thumbTo); twant.sub(v3().copy(dir).multiplyScalar(twant.dot(dir))).normalize();
      Qa.setFromUnitVectors(tcur, twant); hand.getWorldQuaternion(Qb); Qb.premultiply(Qa);
      hand.parent.getWorldQuaternion(Qp); hand.quaternion.copy(Qp.invert().multiply(Qb)); hand.updateMatrixWorld(true);
      if (!curl) return;
      // curl about the knuckle axis; which way closes the hand is found once per hand by trying both and keeping
      // the one that brings the fingertip toward the thumb tip
      const fdir = wpos(mid, v3()).sub(wpos(hand, v3())).normalize(), tdir = wpos(th, v3()).sub(wpos(hand, v3())).normalize();
      const axis = v3().crossVectors(fdir, tdir).normalize();
      const rot = (bone, ang) => { Qa.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(Qb); Qb.premultiply(Qa); bone.parent.getWorldQuaternion(Qp); bone.quaternion.copy(Qp.invert().multiply(Qb)); bone.updateMatrixWorld(true); };
      const key = 'curlSign_' + side;
      if (b[key] === undefined) {
        const i1 = b['index_01_' + side], tip = b['index_04_leaf_' + side] || b['index_03_' + side], ttip = b['thumb_04_leaf_' + side] || b['thumb_03_' + side];
        if (i1 && tip && ttip) {
          const q0 = i1.quaternion.clone(), d0 = wpos(tip, v3()).distanceTo(wpos(ttip, v3()));
          rot(i1, 0.5); const d1 = wpos(tip, v3()).distanceTo(wpos(ttip, v3())); i1.quaternion.copy(q0); i1.updateMatrixWorld(true);
          b[key] = d1 < d0 ? 1 : -1;
        } else b[key] = 1;
      }
      for (const f of ['index', 'middle', 'ring', 'pinky']) for (let k = 1; k <= 3; k++) {
        const bone = b[`${f}_0${k}_${side}`]; if (bone) rot(bone, b[key] * curl * (k === 1 ? 0.9 : 1.2));
      }
      for (let k = 2; k <= 3; k++) { const bone = b[`thumb_0${k}_${side}`]; if (bone) rot(bone, b[key] * curl * 0.4); }   // thumb folds over a little
    }
    const T = { chest: v3(), head: v3(), fwd: v3(), left: v3(), up: new THREE.Vector3(0, 1, 0) };
    const curL = v3(), curR = v3(); let haveCur = false;
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    function smallItem(icon) {
      let m;
      if (icon === '💧') m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0x9fc9e0, roughness: 0.15, transparent: true, opacity: 0.8 }));
      else if (icon === '🍌') m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.17, 8), new THREE.MeshStandardMaterial({ color: 0xf2d34a, roughness: 0.6 }));
      else { const c = { '🍪': 0xf2c230, '🍫': 0x5a3020, '🧃': 0xf28a1a, '🫓': 0xc8904a, '🥜': 0x9a6a3a }[icon] || 0xc0392b; m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })); }
      return m;
    }
    function start(kind, opts) {
      if (job) finish(true);
      job = { kind, t: 0, bites: 0, phase: 'reach', ...opts }; haveCur = false;
      if (job.dish) { job.dish.updateMatrixWorld(true); job.from = job.dish.getWorldPosition(v3()); job.dish.visible = true; }
      if (!job.dish && kind !== 'eat') { job.small = smallItem(opts.icon); scene.add(job.small); }
      fork.visible = kind === 'eat';
    }
    function finish(abort) {
      const j = job; if (!j) return; job = null; fork.visible = false;
      if (j.small) scene.remove(j.small);
      if (j.dish && j.onPutDown) j.onPutDown(j.dish);
      if (!abort && j.onDone) j.onDone();
    }
    function update(dt, speed) {
      if (!job) return; job.t += dt * Math.min(speed || 1, 4);
      // no character to animate (the crowd did not load): count bites on a timer so eating still completes
      if (!getChar() && job.t > 1.6) { job.t = 0; job.bites++; if (job.onBite) job.onBite(job.bites); if (job.bites >= job.need) finish(false); }
    }

    // after the character's clip has been applied: move the arms, the dish and the fork
    function pose() {
      const ch = getChar(); if (!job || !ch) return;
      const b = findBones(ch); if (!b) return;
      ch.root.updateMatrixWorld(true);
      wpos(b.spine_03, T.chest); wpos(b.Head, T.head);
      const ry = ch.root.rotation.y; T.fwd.set(Math.sin(ry), 0, Math.cos(ry)); T.left.set(Math.cos(ry), 0, -Math.sin(ry));   // the character's own left is its +x
      const j = job;
      const plate = v3().copy(T.chest).addScaledVector(T.fwd, 0.32).addScaledVector(T.up, -0.16).addScaledVector(T.left, 0.04);
      const mouth = v3().copy(T.head).addScaledVector(T.fwd, 0.1).addScaledVector(T.up, -0.07).addScaledVector(T.left, -0.03);
      const restR = v3().copy(T.chest).addScaledVector(T.fwd, 0.28).addScaledVector(T.up, -0.2).addScaledVector(T.left, -0.18);
      const restL = v3().copy(T.chest).addScaledVector(T.fwd, 0.25).addScaledVector(T.up, -0.25).addScaledVector(T.left, 0.2);
      let gl = restL, gr = restR, biteAt = false;
      if (j.kind === 'eat') {
        // reach for the plate, lift it to the chest, then forkfuls
        if (j.phase === 'reach') { gl = j.from || plate; if (j.t > 0.8) { j.phase = 'lift'; j.t = 0; } }
        else if (j.phase === 'lift') { gl = v3().copy(j.from || plate).lerp(plate, ease(Math.min(1, j.t / 0.8))); if (j.t > 0.8) { j.phase = 'loop'; j.t = 0; } }
        else gl = plate;
        const scoop = v3().copy(plate).addScaledVector(T.up, 0.05).addScaledVector(T.left, -0.07);
        gr = scoop;
        if (j.phase === 'loop') {
          const cyc = 2.2, p = (j.t % cyc) / cyc;
          if (p < 0.25) gr = scoop; else if (p < 0.55) gr = v3().copy(scoop).lerp(mouth, ease((p - 0.25) / 0.3));
          else if (p < 0.65) { gr = mouth; biteAt = true; } else gr = v3().copy(mouth).lerp(scoop, ease((p - 0.65) / 0.35));
          fork.userData.bite.visible = p > 0.15 && p < 0.6;
          if (!biteAt) j.bit = false;
        }
      } else {
        // sip / drink / snack: the right hand picks it up (from where it was served) and lifts it to the mouth
        const hold = v3().copy(T.chest).addScaledVector(T.fwd, 0.3).addScaledVector(T.up, -0.12).addScaledVector(T.left, -0.1);
        if (j.phase === 'reach') { gr = j.from || hold; if (j.t > (j.from ? 0.8 : 0.3)) { j.phase = 'loop'; j.t = 0; } }
        else {
          const cyc = 2.6, p = (j.t % cyc) / cyc;
          if (p < 0.35) gr = v3().copy(hold).lerp(mouth, ease(p / 0.35)); else if (p < 0.6) { gr = mouth; biteAt = true; } else gr = v3().copy(mouth).lerp(hold, ease((p - 0.6) / 0.4));
          if (!biteAt) j.bit = false;
          j.tilt = p < 0.35 ? p / 0.35 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
        }
      }
      // smooth the hand targets so nothing snaps, then solve both arms (elbows down and out)
      if (!haveCur) { wpos(b.hand_l, curL); wpos(b.hand_r, curR); haveCur = true; }
      curL.lerp(gl, 0.25); curR.lerp(gr, 0.3);
      twoBone(b.upperarm_l, b.lowerarm_l, b.hand_l, curL, v3().copy(T.chest).addScaledVector(T.up, -0.6).addScaledVector(T.left, 0.5));
      twoBone(b.upperarm_r, b.lowerarm_r, b.hand_r, curR, v3().copy(T.chest).addScaledVector(T.up, -0.6).addScaledVector(T.left, -0.5));
      // right hand closes round the fork / glass / snack: fingers forward and up, thumb on top; the left hand under
      // the plate stays open, palm up
      const holdDir = v3().copy(T.fwd).multiplyScalar(0.75).addScaledVector(T.up, 0.45).addScaledVector(T.left, 0.35).normalize();
      grip(b, 'r', holdDir, T.up, j.kind === 'eat' ? 0.9 : 1.0);
      if (j.kind === 'eat' && j.phase !== 'reach') grip(b, 'l', v3().copy(T.fwd).addScaledVector(T.left, -0.4).normalize(), T.left, 0);
      const HL = wpos(b.hand_l, v3()), HR = wpos(b.hand_r, v3());
      const palmR = b.middle_01_r ? wpos(b.middle_01_r, v3()).lerp(HR, 0.35) : HR.clone();
      // the plate rides in the left hand, a glass in the right; the fork or snack in the right
      if (j.dish && j.phase !== 'reach') {
        j.dish.scale.setScalar(1.0); j.dish.rotation.set(0, ry, 0);
        if (j.kind === 'eat') j.dish.position.copy(HL).addScaledVector(T.fwd, 0.08).addScaledVector(T.left, -0.04).addScaledVector(T.up, 0.035);   // resting on the open palm
        else { j.dish.position.copy(palmR).addScaledVector(T.up, -0.05); j.dish.rotateX(-(j.tilt || 0) * 1.0); }
      }
      if (j.small) { j.small.position.copy(palmR); j.small.rotation.set(-(j.tilt || 0) * 1.2, ry, 0); }
      // the fork sits in the closed fist and points where the fingers point, tines toward the food or the mouth
      if (fork.visible) { fork.position.copy(palmR).addScaledVector(holdDir, -0.02); fork.lookAt(v3().copy(palmR).addScaledVector(holdDir, 1)); }
      // a bite or sip lands
      if (biteAt && !j.bit) { j.bit = true; j.bites++; if (fork.userData.bite) fork.userData.bite.visible = false; if (j.onBite) j.onBite(j.bites); }
      if (j.bites >= j.need && !biteAt && j.phase === 'loop') finish(false);
    }
    // the close camera: in front of the hiker and to one side, looking at the hands and the plate
    let orbit = 0;
    function frame(camera, dt) {
      const ch = getChar(); if (!ch || !bones) return false;
      orbit += (dt || 0.016) * 0.25;
      const ry = ch.root.rotation.y + 0.6 + Math.sin(orbit) * 0.2, f = v3().set(Math.sin(ry), 0, Math.cos(ry));
      const look = v3().copy(T.chest).addScaledVector(T.up, 0.02);
      const eye = v3().copy(look).addScaledVector(f, 1.5).addScaledVector(T.up, 0.15);
      if (clearView) { const k = clearView(look.x, look.z, eye.x, eye.z); eye.x = look.x + (eye.x - look.x) * k; eye.z = look.z + (eye.z - look.z) * k; }   // never through a wall
      if (H) eye.y = Math.max(eye.y, H(eye.x, eye.z) + 0.5);
      camera.position.copy(eye); camera.lookAt(look);
      return true;
    }
    return { start, update, pose, frame, finish, get busy() { return !!job; }, get kind() { return job && job.kind; } };
  }
};
