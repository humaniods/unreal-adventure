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

    // point the fingers along `dir` and turn the hand about them so the thumb side faces `thumbTo`
    function orient(b, side, dir, thumbTo) {
      const hand = b['hand_' + side], mid = b['middle_01_' + side], th = b['thumb_01_' + side]; if (!mid || !th) return;
      const H0 = wpos(hand, v3());
      aim(hand, H0, wpos(mid, v3()), dir);
      const tcur = wpos(th, v3()).sub(H0); tcur.sub(v3().copy(dir).multiplyScalar(tcur.dot(dir))).normalize();
      const twant = v3().copy(thumbTo); twant.sub(v3().copy(dir).multiplyScalar(twant.dot(dir))).normalize();
      Qa.setFromUnitVectors(tcur, twant); hand.getWorldQuaternion(Qb); Qb.premultiply(Qa);
      hand.parent.getWorldQuaternion(Qp); hand.quaternion.copy(Qp.invert().multiply(Qb)); hand.updateMatrixWorld(true);
    }
    // bend one finger (bones from the knuckle to the tip) round a cylinder (centre C, axis ax, radius R): each joint
    // is turned so the next one lands on the cylinder's surface, going round it in the `sense` direction
    function wrapChain(ch, C, ax, R, sense) {
      if (ch.some(x => !x)) return;
      for (let k = 0; k < ch.length - 1; k++) {
        const P = wpos(ch[k], v3()), Q = wpos(ch[k + 1], v3()), L = P.distanceTo(Q);
        const rel = v3().copy(P).sub(C), h = rel.dot(ax); rel.addScaledVector(ax, -h);
        const d = rel.length(); if (d < 1e-5 || L < 1e-5) return;
        const e1 = rel.divideScalar(d), e2 = v3().crossVectors(ax, e1).multiplyScalar(sense);
        const a = (R * R - L * L + d * d) / (2 * d), bq = R * R - a * a;
        let tgt;
        if (bq >= 0) tgt = v3().copy(C).addScaledVector(ax, h).addScaledVector(e1, a).addScaledVector(e2, Math.sqrt(bq));
        else tgt = v3().copy(P).addScaledVector(v3().copy(e1).multiplyScalar(d > R ? -0.55 : 0.55).addScaledVector(e2, 0.83).normalize(), L);   // cannot reach the surface: bend toward it
        aim(ch[k], P, Q, tgt.sub(P).normalize());
      }
    }
    // close the hand round a cylinder of radius R held across the palm (a glass, a bottle, a fork's handle).
    // The geometry comes from the bones themselves, so it does not depend on how the rig's joint axes point:
    // the cylinder lies along the knuckle line, just in front of the palm; the four fingers wrap round it from the
    // knuckles, the thumb from the other side. Returns the cylinder's centre and axis (index side = "up").
    function wrapGrip(b, side, R) {
      const hand = b['hand_' + side], m1 = b['middle_01_' + side], i1 = b['index_01_' + side], p1 = b['pinky_01_' + side], t1 = b['thumb_01_' + side];
      if (!m1 || !i1 || !p1 || !t1) return null;
      const Hw = wpos(hand, v3()), M = wpos(m1, v3()), fdir = v3().copy(M).sub(Hw).normalize();
      const ax = wpos(i1, v3()).sub(wpos(p1, v3())); ax.addScaledVector(fdir, -ax.dot(fdir)).normalize();
      const n = v3().crossVectors(fdir, ax);
      if (wpos(t1, v3()).sub(Hw).dot(n) < 0) n.negate();   // palm side: the thumb's root sits in front of the palm
      const C = v3().copy(M).addScaledVector(n, R + 0.006).addScaledVector(fdir, 0.008);
      const sense = Math.sign(v3().crossVectors(ax, v3().copy(M).sub(C)).dot(fdir)) || 1;
      const Rf = R + 0.008;                                                                      // finger bones run through the finger's middle
      for (const f of ['index', 'middle', 'ring', 'pinky']) wrapChain([1, 2, 3].map(k => b[`${f}_0${k}_${side}`]).concat([b[`${f}_04_leaf_${side}`]]), C, ax, Rf, sense);
      wrapChain([2, 3].map(k => b[`thumb_0${k}_${side}`]).concat([b[`thumb_04_leaf_${side}`]]), C, ax, Rf, -sense);
      return { C, ax, fdir, n };
    }
    const T = { chest: v3(), head: v3(), fwd: v3(), left: v3(), up: new THREE.Vector3(0, 1, 0) };
    const curL = v3(), curR = v3(); let haveCur = false;
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    // a real banana (about 19 cm, curved, five-sided, brown tips), gripped about a quarter of the way up.
    // Peeling: the top half of the skin is three strips; each folds down from the stalk end when the other hand pulls
    // it (open(i, k), k 0..1). Bites take the fruit down from the top (a flat cut face); at the end the skin is empty.
    function banana() {
      const g = new THREE.Group(), skinM = new THREE.MeshStandardMaterial({ color: 0xe8c43a, roughness: 0.55, side: THREE.DoubleSide }),
        fleshM = new THREE.MeshStandardMaterial({ color: 0xf3ead0, roughness: 0.75, side: THREE.DoubleSide }), tipM = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.8 });
      const L = 0.19, R = 0.15, A = L / R, PEEL = 0.5;
      const at = t => { const a = (t - 0.25) * A; return new THREE.Vector3(0, Math.sin(a) * R, (1 - Math.cos(a)) * R); };
      const tan = t => { const a = (t - 0.25) * A; return new THREE.Vector3(0, Math.cos(a), Math.sin(a)); };
      const rad = t => 0.004 + 0.019 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.92 + 0.04))), 0.55);
      function tube(t0, t1, k) {
        const N = 14, S = 5, pos = [], idx = [];
        for (let i = 0; i <= N; i++) {
          const t = t0 + (t1 - t0) * i / N, c = at(t), ty = tan(t), nx = new THREE.Vector3(1, 0, 0), nz = new THREE.Vector3().crossVectors(nx, ty);
          for (let j = 0; j < S; j++) { const q = j / S * Math.PI * 2, r = rad(t) * k; pos.push(c.x + (nx.x * Math.cos(q) + nz.x * Math.sin(q)) * r, c.y + (nx.y * Math.cos(q) + nz.y * Math.sin(q)) * r, c.z + (nx.z * Math.cos(q) + nz.z * Math.sin(q)) * r); }
        }
        for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) { const a0 = i * S + j, a1 = i * S + (j + 1) % S; idx.push(a0, a0 + S, a1, a1, a0 + S, a1 + S); }
        const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setIndex(idx); ge.computeVertexNormals(); return ge;
      }
      g.add(new THREE.Mesh(tube(0, PEEL + 0.01, 1), skinM));                                    // the lower skin, in the hand
      const tip0 = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), tipM); tip0.position.copy(at(0)); g.add(tip0);
      const flesh = new THREE.Mesh(tube(PEEL - 0.02, 1, 0.8), fleshM); g.add(flesh);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 5), fleshM); g.add(cap);            // the cut face of a bite
      // the three upper strips: each a thin curved shell over a third of the fruit, hinged at the peel line
      const base = at(PEEL), ty0 = tan(PEEL), strips = [];
      for (let i = 0; i < 3; i++) {
        const pos = [], idx = [], N = 10, S = 4;
        for (let a = 0; a <= N; a++) {
          const t = PEEL + (1 - PEEL) * a / N, c = at(t), ty = tan(t), nx = new THREE.Vector3(1, 0, 0), nz = new THREE.Vector3().crossVectors(nx, ty);
          for (let j = 0; j <= S; j++) { const q = (i + j / S) / 3 * Math.PI * 2, r = rad(t) * 1.02; pos.push(c.x + (nx.x * Math.cos(q) + nz.x * Math.sin(q)) * r - base.x, c.y + (nx.y * Math.cos(q) + nz.y * Math.sin(q)) * r - base.y, c.z + (nx.z * Math.cos(q) + nz.z * Math.sin(q)) * r - base.z); }
        }
        for (let a = 0; a < N; a++) for (let j = 0; j < S; j++) { const a0 = a * (S + 1) + j; idx.push(a0, a0 + S + 1, a0 + 1, a0 + 1, a0 + S + 1, a0 + S + 2); }
        const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setIndex(idx); ge.computeVertexNormals();
        const hinge = new THREE.Object3D(); hinge.position.copy(base); hinge.add(new THREE.Mesh(ge, skinM));
        const qm = (i + 0.5) / 3 * Math.PI * 2, nz0 = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), ty0);
        const out = new THREE.Vector3(1, 0, 0).multiplyScalar(Math.cos(qm)).addScaledVector(nz0, Math.sin(qm)).normalize();
        hinge.userData.axis = new THREE.Vector3().crossVectors(ty0, out).normalize();             // folds outward and down
        if (i === 0) { const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.022, 5), tipM); stem.position.copy(at(1.04)).sub(base); stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan(1)); hinge.add(stem); }
        g.add(hinge); strips.push(hinge);
      }
      let top = 1;
      function setTop(t) {
        top = t; flesh.visible = t > PEEL - 0.01;
        if (flesh.visible) { flesh.geometry.dispose(); flesh.geometry = tube(PEEL - 0.02, t, 0.8); const r = rad(t) * 0.8; cap.position.copy(at(t)); cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan(t)); cap.scale.setScalar(r); }
        cap.visible = flesh.visible && t < 0.99;
        g.userData.top = at(Math.max(t, PEEL)).y;
      }
      setTop(1);
      g.userData.open = (i, k) => { const h = strips[i]; if (h) h.quaternion.setFromAxisAngle(h.userData.axis, k * 2.75); };
      g.userData.bite = f => setTop(f >= 0.999 ? PEEL - 0.05 : 1 - (1 - PEEL + 0.02) * f);
      const tipL = new THREE.Vector3();
      g.userData.tipW = (i, out) => { const h = strips[i]; h.updateMatrixWorld(true); return out.copy(tipL.copy(at(1)).sub(base)).applyMatrix4(h.matrixWorld); };
      g.scale.setScalar(1.12);                         // a touch larger than life so it reads from the camera
      return g;
    }
    function smallItem(icon) {
      let m;
      if (icon === '💧') m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0x9fc9e0, roughness: 0.15, transparent: true, opacity: 0.8 }));
      else if (icon === '🍌') m = banana();
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
      { const ch = getChar(); if (ch && ch.U && ch.U.uJaw) ch.U.uJaw.value = 0; }
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
        // forkfuls: the targets are for the fork's tip (food on the plate, then the mouth); the tine direction turns
        // from down into the plate to toward the lips, and the wrist offset measured last frame gives the arm target
        const food = v3().copy(plate).addScaledVector(T.up, 0.03).addScaledVector(T.left, -0.02), inMouth = v3().copy(mouth).addScaledVector(T.fwd, 0.02).addScaledVector(T.up, 0.02);
        let tip = food, m = 0;
        if (j.phase === 'loop') {
          const cyc = 2.2, p = (j.t % cyc) / cyc;
          if (p < 0.25) m = 0; else if (p < 0.55) m = ease((p - 0.25) / 0.3); else if (p < 0.65) { m = 1; biteAt = true; } else m = 1 - ease((p - 0.65) / 0.35);
          tip = v3().copy(food).lerp(inMouth, m); j.m = m;
          fork.userData.bite.visible = p > 0.15 && p < 0.6;
          if (!biteAt) j.bit = false;
        }
        const fdScoop = v3().copy(T.up).multiplyScalar(-0.85).addScaledVector(T.fwd, 0.4).addScaledVector(T.left, 0.25).normalize();
        const fdMouth = v3().copy(T.fwd).multiplyScalar(-0.7).addScaledVector(T.left, 0.5).addScaledVector(T.up, 0.3).normalize();
        j.fd = fdScoop.lerp(fdMouth, m).normalize();
        gr = v3().copy(tip).sub(j.tipOff || v3().copy(j.fd).multiplyScalar(0.17));
      } else if (j.small && j.small.userData.open) {
        // a banana: out of the bag into the right hand, the left hand peels the three strips down one by one, then
        // bite (the top goes to the mouth), lower it and chew with the banana in view, and finally the empty skin goes
        // into the bag's side pocket (nothing is thrown on the trail)
        const bn = j.small, sc = bn.scale.x;
        const hold = v3().copy(T.chest).addScaledVector(T.fwd, 0.34).addScaledVector(T.up, -0.04).addScaledVector(T.left, -0.07);
        const lipOff = j.lipOff || v3().copy(T.up).multiplyScalar(0.12), ctrOff = j.ctrOff || v3();
        const biteP = v3().copy(mouth).addScaledVector(T.fwd, 0.035).addScaledVector(T.up, 0.03).addScaledVector(T.left, 0.02);
        j.tilt = 0;
        if (j.phase === 'reach') { gr = v3().copy(hold).sub(ctrOff); if (j.t > 0.6) { j.phase = 'peel'; j.t = 0; } }
        else if (j.phase === 'peel') {
          const D = 0.8, i = Math.min(2, Math.floor(j.t / D)), k = Math.min(1, (j.t - i * D) / D);
          for (let s2 = 0; s2 < 3; s2++) bn.userData.open(s2, s2 < i ? 1 : s2 === i ? ease(Math.max(0, (k - 0.25) / 0.75)) : 0);
          gr = v3().copy(hold).sub(ctrOff);
          bn.updateMatrixWorld(true);
          const tip = bn.userData.tipW(i, v3());
          gl = v3().copy(tip).sub(j.pinchOff || v3());
          if (j.t > 3 * D + 0.2) { j.phase = 'loop'; j.t = 0; }
        } else if (j.phase === 'loop') {
          const cyc = 3.4, p = (j.t % cyc) / cyc;
          let lp;
          if (p < 0.26) lp = v3().copy(hold).lerp(biteP, ease(p / 0.26)); else if (p < 0.38) { lp = biteP; biteAt = true; } else if (p < 0.6) lp = v3().copy(biteP).lerp(hold, ease((p - 0.38) / 0.22)); else lp = hold;
          gr = lp.sub(lipOff);
          if (!biteAt) j.bit = false;
          j.tilt = p < 0.26 ? ease(p / 0.26) : p < 0.38 ? 1 : p < 0.6 ? 1 - ease((p - 0.38) / 0.22) : 0;
        } else {   // 'away': the skin into the side pocket of the bag
          const k = ease(Math.min(1, j.t / 1.1));
          gr = v3().copy(hold).lerp(v3().copy(T.chest).addScaledVector(T.up, -0.42).addScaledVector(T.left, -0.26).addScaledVector(T.fwd, -0.02), k).sub(ctrOff);
          if (j.t > 0.95) bn.visible = false;
          if (j.t > 1.3) { finish(false); return; }
        }
        j.sc = sc;
      } else {
        // sip / drink / snack: the right hand picks it up (from where it was served) and lifts it to the mouth
        // (targets are for the held thing: its middle when picking it up, its lip point while drinking; the wrist
        // offsets measured on the previous frame turn them into wrist targets)
        const hold = v3().copy(T.chest).addScaledVector(T.fwd, 0.3).addScaledVector(T.up, -0.04).addScaledVector(T.left, -0.06);
        const lipOff = j.lipOff || v3().copy(T.left).multiplyScalar(0.05).addScaledVector(T.up, 0.07), ctrOff = j.ctrOff || v3().copy(T.left).multiplyScalar(0.05);
        const sipAt = v3().copy(mouth).addScaledVector(T.fwd, 0.025).addScaledVector(T.up, 0.045).addScaledVector(T.left, 0.03);   // the lower lip (mouth above is where a forkful goes in)
        if (j.phase === 'reach') { gr = j.from ? v3().copy(j.from).addScaledVector(T.up, 0.045).sub(ctrOff) : v3().copy(hold).sub(ctrOff); if (j.t > (j.from ? 0.8 : 0.3)) { j.phase = 'loop'; j.t = 0; } }
        else {
          const cyc = 2.6, p = (j.t % cyc) / cyc;
          let lp;
          if (p < 0.35) lp = v3().copy(hold).lerp(sipAt, ease(p / 0.35)); else if (p < 0.6) { lp = sipAt; biteAt = true; } else lp = v3().copy(sipAt).lerp(hold, ease((p - 0.6) / 0.4));
          gr = lp.sub(lipOff);
          if (!biteAt) j.bit = false;
          j.tilt = p < 0.35 ? ease(p / 0.35) : p < 0.6 ? 1 : 1 - ease((p - 0.6) / 0.4);
        }
      }
      // smooth the hand targets so nothing snaps, then solve both arms (elbows down and out)
      if (!haveCur) { wpos(b.hand_l, curL); wpos(b.hand_r, curR); haveCur = true; }
      curL.lerp(gl, 0.25); curR.lerp(gr, 0.3);
      twoBone(b.upperarm_l, b.lowerarm_l, b.hand_l, curL, v3().copy(T.chest).addScaledVector(T.up, -0.6).addScaledVector(T.left, 0.5));
      twoBone(b.upperarm_r, b.lowerarm_r, b.hand_r, curR, v3().copy(T.chest).addScaledVector(T.up, -0.6).addScaledVector(T.left, -0.5));
      // right hand: closes round the glass / bottle / snack / fork. A glass is held upright (knuckles stacked, fingers
      // round its front, thumb behind) and tipped toward the lips by turning the wrist; the left hand under the
      // plate stays open, palm up
      let G = null;
      if (j.kind === 'eat') {
        // fist round the handle, the thumb side (where the tines come out) turned toward the food or the mouth
        const fd = j.fd || T.up, fg = v3().copy(T.up).multiplyScalar(0.7).addScaledVector(T.fwd, 0.5).addScaledVector(T.left, 0.3);
        fg.addScaledVector(fd, -fg.dot(fd)).normalize();
        orient(b, 'r', fg, fd);
        G = wrapGrip(b, 'r', 0.012);
        if (j.phase !== 'reach') orient(b, 'l', v3().copy(T.fwd).addScaledVector(T.left, -0.4).normalize(), T.left);
      } else {
        const isB = !!(j.small && j.small.userData.open), a = 0.12 + (j.tilt || 0) * (isB ? 0.55 : 1.0), ca = Math.cos(a), sa = Math.sin(a);
        orient(b, 'r', v3().copy(T.fwd).multiplyScalar(ca).addScaledVector(T.up, sa).addScaledVector(T.left, 0.3).normalize(),
          v3().copy(T.up).multiplyScalar(ca).addScaledVector(T.fwd, -sa));
        G = wrapGrip(b, 'r', j.dish ? 0.034 : j.icon === '💧' ? 0.035 : isB ? 0.02 : 0.022);
        if (isB && j.phase === 'peel') {
          // left hand: fingers toward the strip's end, pinched on it; remember where the fingertips are from the wrist
          const tip = j.small.userData.tipW(Math.min(2, Math.floor(j.t / 0.8)), v3());
          orient(b, 'l', v3().copy(tip).sub(wpos(b.hand_l, v3())).normalize(), T.up);
          wrapGrip(b, 'l', 0.004);
          const f = b.index_03_l || b.middle_02_l; if (f) j.pinchOff = wpos(f, v3()).sub(wpos(b.hand_l, v3()));
        }
      }
      const HL = wpos(b.hand_l, v3()), HR = wpos(b.hand_r, v3());
      const C = G ? G.C : HR.clone(), ax = G ? G.ax : T.up;
      // where the held thing touches the lips (the near rim of a glass, the top of a bottle or snack): remember its
      // offset from the wrist so the next frame's arm target brings that point, not the wrist, to the mouth
      if (j.kind !== 'eat') {
        const half = j.dish ? 0.045 : j.icon === '💧' ? 0.11 : j.small && j.small.userData.top != null ? j.small.userData.top * j.small.scale.x : 0.06;
        const toFace = v3().copy(T.fwd).negate(); toFace.addScaledVector(ax, -toFace.dot(ax)).normalize();
        const lip = v3().copy(C).addScaledVector(ax, half).addScaledVector(toFace, j.dish ? 0.03 : 0);
        j.lipOff = v3().copy(lip).sub(HR); j.ctrOff = v3().copy(C).sub(HR);
      }
      // the plate rides in the left hand, a glass in the right; the fork or snack in the right
      if (j.dish && j.phase !== 'reach') {
        j.dish.scale.setScalar(1.0);
        if (j.kind === 'eat') { j.dish.rotation.set(0, ry, 0); j.dish.position.copy(HL).addScaledVector(T.fwd, 0.08).addScaledVector(T.left, -0.04).addScaledVector(T.up, 0.035); }   // resting on the open palm
        else { j.dish.quaternion.setFromUnitVectors(T.up, ax); j.dish.position.copy(C).addScaledVector(ax, -0.045); }   // the glass's base sits 4.5 cm below its middle
      }
      if (j.small) {
        if (j.icon === '💧' || j.icon === '🍌') j.small.quaternion.setFromUnitVectors(T.up, ax); else j.small.quaternion.setFromUnitVectors(v3().set(0, 0, 1), ax);
        j.small.position.copy(C);
      }
      // the fork's handle runs through the closed fist and comes out on the thumb side, tines toward the food or mouth
      if (fork.visible) {
        const fd = v3().copy(ax); fork.position.copy(C).addScaledVector(fd, 0.02); fork.lookAt(v3().copy(fork.position).add(fd));
        j.tipOff = v3().copy(C).addScaledVector(fd, 0.17).sub(HR);   // the food on the tines, 17 cm out along the handle
      }
      // the mouth opens as the food comes up, closes on the bite, and the jaw chews on the way back down
      { const now = performance.now(), dtp = Math.min(0.1, (now - (j.lastPose || now)) / 1000); j.lastPose = now;
        const drink = !!(j.dish && j.kind !== 'eat') || j.icon === '💧';
        let open = j.kind === 'eat' ? (j.m || 0) : (j.tilt || 0);
        open *= drink ? 0.35 : (biteAt && j.bit ? 0.25 : 1);
        if (j.chew > 0) { j.chew -= dtp; open = Math.max(open * 0.3, 0.32 * (0.5 + 0.5 * Math.sin(j.chew * 14))); }
        j.jaw = (j.jaw || 0) + (open - (j.jaw || 0)) * Math.min(1, dtp * 14);
        if (ch.U && ch.U.uJaw) ch.U.uJaw.value = j.jaw; }
      // a bite or sip lands
      if (biteAt && !j.bit) { j.bit = true; j.bites++; if (j.kind === 'eat' || (j.small && !(j.icon === '💧'))) j.chew = 1.7; if (fork.userData.bite) fork.userData.bite.visible = false; if (j.small && j.small.userData.bite) j.small.userData.bite(j.bites / j.need); if (j.onBite) j.onBite(j.bites); }
      if (j.bites >= j.need && !biteAt && j.phase === 'loop') { if (j.small && j.small.userData.open) { j.phase = 'away'; j.t = 0; } else finish(false); }
    }
    // the close camera: in front of the hiker and to one side, looking at the hands and the plate
    let orbit = 0;
    function frame(camera, dt) {
      const ch = getChar(); if (!ch || !bones) return false;
      orbit += (dt || 0.016) * 0.25;
      const ry = ch.root.rotation.y + 0.6 + Math.sin(orbit) * 0.2, f = v3().set(Math.sin(ry), 0, Math.cos(ry));
      const look = v3().copy(T.chest).addScaledVector(T.up, 0.02);
      const snack = job && job.small; if (snack) look.addScaledVector(T.up, 0.12);
      const eye = v3().copy(look).addScaledVector(f, snack ? 1.15 : 1.5).addScaledVector(T.up, 0.15);
      if (clearView) { const k = clearView(look.x, look.z, eye.x, eye.z); eye.x = look.x + (eye.x - look.x) * k; eye.z = look.z + (eye.z - look.z) * k; }   // never through a wall
      if (H) eye.y = Math.max(eye.y, H(eye.x, eye.z) + 0.5);
      camera.position.copy(eye); camera.lookAt(look);
      return true;
    }
    // a hand torch (the "headlamp" gear shown as a torch in the hand, which most Triund hikers carry): held in the
    // left hand in front of the chest, beam forward and a little down where the path is. After the clip; returns the
    // lens position and beam direction for the spot light, or null.
    const torchM = new THREE.Group();
    { const al = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.35, metalness: 0.7 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 12), al); body.position.y = 0.0; torchM.add(body);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.04, 14), al); head.position.y = 0.083; torchM.add(head);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 14), new THREE.MeshBasicMaterial({ color: 0xfff6dc })); lens.rotation.x = -Math.PI / 2; lens.position.y = 0.1035; torchM.add(lens); torchM.userData.lens = lens;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 10), al); cap.position.y = -0.07; torchM.add(cap); }
    torchM.visible = false; scene.add(torchM);
    const tOut = { p: v3(), d: v3() };
    function torch(on, aimDown) {
      const ch = getChar(); torchM.visible = false;
      if (!on || job || !ch || !ch.root.visible) return null;
      const b = findBones(ch); if (!b) return null;
      ch.root.updateMatrixWorld(true);
      wpos(b.spine_03, T.chest);
      const ry = ch.root.rotation.y; T.fwd.set(Math.sin(ry), 0, Math.cos(ry)); T.left.set(Math.cos(ry), 0, -Math.sin(ry));
      const beam = v3().copy(T.fwd).addScaledVector(T.up, -(aimDown == null ? 0.35 : aimDown)).normalize();
      const W = v3().copy(T.chest).addScaledVector(T.fwd, 0.33).addScaledVector(T.up, -0.02).addScaledVector(T.left, 0.11);
      twoBone(b.upperarm_l, b.lowerarm_l, b.hand_l, W, v3().copy(T.chest).addScaledVector(T.up, -0.6).addScaledVector(T.left, 0.6));
      // fist round the torch: fingers point across the body (to the right), the thumb side (index knuckle) along the beam
      const fing = v3().copy(T.left).negate().addScaledVector(T.up, -0.25); fing.addScaledVector(beam, -fing.dot(beam)).normalize();
      orient(b, 'l', fing, beam);
      let G = wrapGrip(b, 'l', 0.015); if (!G) return null;
      // the knuckle line is not exactly the thumb's direction: turn the hand until the grip's axis is on the beam
      for (let it = 0; it < 2; it++) {
        const ax0 = G.ax.dot(beam) < 0 ? G.ax.clone().negate() : G.ax.clone();
        Qa.setFromUnitVectors(ax0, beam); b.hand_l.getWorldQuaternion(Qb); Qb.premultiply(Qa);
        b.hand_l.parent.getWorldQuaternion(Qp); b.hand_l.quaternion.copy(Qp.invert().multiply(Qb)); b.hand_l.updateMatrixWorld(true);
        G = wrapGrip(b, 'l', 0.015); if (!G) return null;
      }
      const ax = G.ax.dot(beam) < 0 ? G.ax.clone().negate() : G.ax;
      torchM.quaternion.setFromUnitVectors(T.up, ax); torchM.position.copy(G.C).addScaledVector(ax, 0.01); torchM.visible = true;
      tOut.d.copy(ax); tOut.p.copy(torchM.position).addScaledVector(ax, 0.11);
      return tOut;
    }
    return { start, update, pose, frame, finish, torch, get busy() { return !!job; }, get kind() { return job && job.kind; }, get job() { return job; } };
  }
};
