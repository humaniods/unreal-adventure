'use strict';
/* Animation helpers for the Triund walk test.
   clipSpeed measures the ground speed an in-place locomotion clip was authored for. Then playback can be scaled
   so that a planted foot moves backwards exactly as fast as the character moves forwards, which removes foot
   sliding. Method: play the clip on a clone, track the lowest bone each frame (that is the planted foot or hoof)
   and take the median horizontal speed of that bone while it stays planted. Works for people and animals. */
window.TriundAnim = {
  // root: a gltf scene (it is cloned, the original is not touched); returns metres per second at scale 1, or 0
  clipSpeed(THREE, root, clip) {
    if (!clip || !THREE.SkeletonUtils) return 0;
    const r = THREE.SkeletonUtils.clone(root);
    r.position.set(0, 0, 0); r.rotation.set(0, 0, 0); r.scale.set(1, 1, 1);
    const bones = []; r.traverse(n => { if (n.isBone) bones.push(n); });
    if (!bones.length) return 0;
    const mixer = new THREE.AnimationMixer(r), act = mixer.clipAction(clip); act.play();
    const N = Math.max(24, Math.round(clip.duration * 60)), dt = clip.duration / N, V = new THREE.Vector3();
    // record every bone's path, then ignore bones that hardly move (root / IK helpers sit still on the ground)
    const path = bones.map(() => []);
    for (let i = 0; i <= N; i++) {
      mixer.setTime(i * dt); r.updateMatrixWorld(true);
      bones.forEach((b, k) => { V.setFromMatrixPosition(b.matrixWorld); path[k].push([V.x, V.y, V.z]); });
    }
    const moving = bones.map((b, k) => {
      if (/^(root|ik)/i.test(b.name)) return false;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const q of path[k]) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[2]); z1 = Math.max(z1, q[2]); }
      return Math.max(x1 - x0, z1 - z0) > 0.01;
    });
    const low = [];
    for (let i = 0; i <= N; i++) {
      let best = null, by = Infinity;
      bones.forEach((b, k) => { if (!moving[k]) return; const q = path[k][i]; if (q[1] < by) { by = q[1]; best = { b, x: q[0], y: q[1], z: q[2] }; } });
      if (best) low.push(best);
    }
    if (low.length < 8) return 0;
    const minY = Math.min(...low.map(p => p.y)), vs = [];
    for (let i = 1; i < low.length; i++) {
      const a = low[i - 1], c = low[i];
      if (a.b !== c.b || c.y > minY + 0.05 || a.y > minY + 0.05) continue;    // only while the same foot is near the ground
      vs.push([(c.x - a.x) / dt, (c.z - a.z) / dt]);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(r);
    if (vs.length < 3) return 0;
    // a planted foot slides straight back at a steady speed; a foot swinging low moves forward, faster.
    // Project on the main horizontal axis and keep the side most samples are on (the stance phase).
    let sxx = 0, szz = 0, sxz = 0; for (const v of vs) { sxx += v[0] * v[0]; szz += v[1] * v[1]; sxz += v[0] * v[1]; }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang);
    const pr = vs.map(v => v[0] * ux + v[1] * uz).sort((a, b) => a - b), med = pr[pr.length >> 1];
    const side = pr.filter(x => Math.sign(x) === Math.sign(med)).map(Math.abs).sort((a, b) => a - b);
    return side.length ? side[side.length >> 1] : 0;
  },
  // Feet on uneven ground. Animation clips are authored on a flat floor and the character's origin stands on the
  // ground under its centre, so on a slope or a staircase the uphill foot goes into the ground and the downhill one
  // hangs in the air. legIK (call right after the mixer update) finds the ground under each ankle with
  // groundAt(x, z), lowers the hips if a foot has to reach down, then bends each knee (two-bone IK: thigh, calf) so
  // the ankle sits as high above that ground as the clip had it above the flat floor. The foot keeps its animated
  // world orientation. Returns the hip offset applied to root.position.y (the caller resets it next frame).
  // Bone names are the Quaternius / UE mannequin ones (thigh_l, calf_l, foot_l).
  legIK(THREE, root, groundAt, baseY) {
    const K = this._ik || (this._ik = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(),
      u: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), p: new THREE.Quaternion(), w: new THREE.Quaternion(), f: new THREE.Quaternion() });
    let legs = root.userData.legs;
    if (!legs) {
      legs = root.userData.legs = [];
      for (const sd of ['l', 'r']) { const th = root.getObjectByName('thigh_' + sd), ca = root.getObjectByName('calf_' + sd), ft = root.getObjectByName('foot_' + sd), ba = root.getObjectByName('ball_' + sd); if (th && ca && ft) legs.push({ th, ca, ft, ba }); }
    }
    if (legs.length !== 2) return 0;
    root.userData.ikAt = performance.now();
    root.updateMatrixWorld(true);
    // how far each foot must move: the ground under it minus the ground the clip assumed (the origin's). Both the
    // ankle and the ball of the foot are tested, so the toes never go into the riser of the next step up.
    let off = 0;
    for (const L of legs) {
      L.ft.getWorldPosition(K.c); let g = groundAt(K.c.x, K.c.z);
      if (L.ba) { L.ba.getWorldPosition(K.c); g = Math.max(g, groundAt(K.c.x, K.c.z)); }
      let d = g - baseY; d = Math.max(-0.45, Math.min(0.45, d));
      L.d = d; if (d < off) off = d;
    }
    if (off < -1e-3) { root.position.y += off; root.updateMatrixWorld(true); }
    const rot = (bone, qWorld) => {      // apply a world-space rotation to a bone
      bone.parent.getWorldQuaternion(K.p); bone.getWorldQuaternion(K.w);
      bone.quaternion.copy(K.p.invert().multiply(K.q.copy(qWorld).multiply(K.w))); bone.updateMatrixWorld(true);
    };
    for (const L of legs) {
      const lift = L.d - off; if (Math.abs(lift) < 0.005) continue;
      L.ft.getWorldQuaternion(K.f);                                   // keep the foot's own orientation
      L.th.getWorldPosition(K.a); L.ca.getWorldPosition(K.b); L.ft.getWorldPosition(K.c);
      K.t.copy(K.c); K.t.y += lift;
      const l1 = K.a.distanceTo(K.b), l2 = K.b.distanceTo(K.c);
      const dt = Math.max(0.05, Math.min(l1 + l2 - 1e-3, K.a.distanceTo(K.t)));
      // knee: open or close the hinge (axis across the leg) to the bend that gives the hip-ankle distance dt
      K.u.subVectors(K.a, K.b).normalize(); K.v.subVectors(K.c, K.b).normalize();
      K.n.crossVectors(K.u, K.v);
      if (K.n.lengthSq() > 1e-8) {
        K.n.normalize();
        const cur = Math.acos(Math.max(-1, Math.min(1, K.u.dot(K.v))));
        const want = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - dt * dt) / (2 * l1 * l2))));
        rot(L.ca, K.q.setFromAxisAngle(K.n, want - cur));
      }
      // hip: swing the whole leg so the ankle lands on the target
      L.ft.getWorldPosition(K.c);
      K.u.subVectors(K.c, K.a).normalize(); K.v.subVectors(K.t, K.a).normalize();
      rot(L.th, K.q.setFromUnitVectors(K.u, K.v));
      // the foot: back to its animated world orientation
      L.ca.getWorldQuaternion(K.p); L.ft.quaternion.copy(K.p.invert().multiply(K.f)); L.ft.updateMatrixWorld(true);
    }
    return off;
  },
  // Arms for carrying (a shopkeeper's tray): two-bone IK of each arm to a world target (null leaves that arm as
  // the clip has it), elbows down and out, then the hand turned so its fingers point along `dir` with the thumb
  // toward `thumb` (palm up under a tray: fingers forward, thumb outward). Call after the mixer update.
  // targets: { l: {p, dir, thumb} | null, r: {...} | null }; yaw: the character's facing (root.rotation.y).
  armIK(THREE, root, targets, yaw) {
    const K = this._ak || (this._ak = { S: new THREE.Vector3(), E: new THREE.Vector3(), W: new THREE.Vector3(), d: new THREE.Vector3(), m: new THREE.Vector3(),
      x: new THREE.Vector3(), y: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion() });
    let A = root.userData.arms;
    if (!A) {
      A = root.userData.arms = {};
      for (const sd of ['l', 'r']) { const g = n => root.getObjectByName(n + '_' + sd); A[sd] = { up: g('upperarm'), lo: g('lowerarm'), ha: g('hand'), mid: g('middle_01'), th: g('thumb_01') }; }
    }
    root.updateMatrixWorld(true);
    const wp = (o, v) => v.setFromMatrixPosition(o.matrixWorld);
    const aim = (bone, from, child, dir) => {   // turn bone (world space) so from->child points along dir
      K.x.copy(child).sub(from).normalize(); K.q.setFromUnitVectors(K.x, dir);
      bone.getWorldQuaternion(K.w); K.w.premultiply(K.q); bone.parent.getWorldQuaternion(K.p); bone.quaternion.copy(K.p.invert().multiply(K.w)); bone.updateMatrixWorld(true);
    };
    const lx = Math.cos(yaw), lz = -Math.sin(yaw);
    for (const sd of ['l', 'r']) {
      const t = targets[sd], B = A[sd]; if (!t || !B.up || !B.lo || !B.ha) continue;
      wp(B.up, K.S); wp(B.lo, K.E); wp(B.ha, K.W);
      const a = K.S.distanceTo(K.E), b = K.E.distanceTo(K.W);
      K.d.copy(t.p).sub(K.S); const c = Math.min(Math.max(K.d.length(), 0.05), a + b - 0.002); K.d.normalize();
      const out = sd === 'l' ? 1 : -1;
      K.m.set(lx * out * 0.5, -0.6, lz * out * 0.5); K.m.addScaledVector(K.d, -K.m.dot(K.d)).normalize();   // elbow: down and out
      const ca = Math.min(1, Math.max(-1, (a * a + c * c - b * b) / (2 * a * c))), sa = Math.sqrt(1 - ca * ca);
      K.y.copy(K.S).addScaledVector(K.d, a * ca).addScaledVector(K.m, a * sa).sub(K.S).normalize();
      aim(B.up, K.S, K.E, K.y);
      wp(B.lo, K.E); wp(B.ha, K.W); K.y.copy(t.p).sub(K.E).normalize(); aim(B.lo, K.E, K.W, K.y);
      if (t.dir && B.mid && B.th) {
        wp(B.ha, K.W); wp(B.mid, K.E); aim(B.ha, K.W, K.E, t.dir);
        wp(B.th, K.S).sub(K.W); K.S.addScaledVector(t.dir, -K.S.dot(t.dir)).normalize();
        K.y.copy(t.thumb).addScaledVector(t.dir, -t.thumb.dot(t.dir)).normalize();
        K.q.setFromUnitVectors(K.S, K.y); B.ha.getWorldQuaternion(K.w); K.w.premultiply(K.q);
        B.ha.parent.getWorldQuaternion(K.p); B.ha.quaternion.copy(K.p.invert().multiply(K.w)); B.ha.updateMatrixWorld(true);
      }
    }
  },
  // Whole-body poses built on top of a clip (bone names: the UE mannequin ones). Call after the mixer update.
  //  'cross': sitting on the ground cross-legged (sukhasana): knees out to the sides, each shin across in front of
  //           the body (the left one ahead of the right), feet tucked under the opposite knee, hands resting on the knees.
  //           Use with the Sitting_Idle clip and the root lowered so the hips are on the ground (see groundSitRoot).
  //  'squat': down on the heels to reach something low (a dog): thighs forward, shins back, hips 0.45 m lower.
  //  opts.hands === false leaves the arms to someone else (eating, patting a dog).
  pose(THREE, root, kind, opts) {
    const K = this._pk || (this._pk = { a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3(), f: new THREE.Vector3(), l: new THREE.Vector3(), u: new THREE.Vector3(0, 1, 0), x: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion() });
    let B = root.userData.poseBones;
    if (!B) { B = root.userData.poseBones = {}; root.traverse(n => { if (n.isBone) B[n.name] = n; }); }
    const o = opts || {};
    root.updateMatrixWorld(true);
    const ry = root.rotation.y; K.f.set(Math.sin(ry), 0, Math.cos(ry)); K.l.set(Math.cos(ry), 0, -Math.sin(ry));
    const wp = (b, v) => v.setFromMatrixPosition(b.matrixWorld);
    const aim = (bone, child, dir) => {
      wp(bone, K.a); wp(child, K.b); K.x.copy(K.b).sub(K.a).normalize(); K.q.setFromUnitVectors(K.x, dir);
      bone.getWorldQuaternion(K.w); K.w.premultiply(K.q); bone.parent.getWorldQuaternion(K.p); bone.quaternion.copy(K.p.invert().multiply(K.w)); bone.updateMatrixWorld(true);
    };
    const dir = (f, l, u) => K.d.set(0, 0, 0).addScaledVector(K.f, f).addScaledVector(K.l, l).addScaledVector(K.u, u).normalize();
    const knees = {}, w = o.w == null ? 1 : o.w, saved = [];
    if (w < 1) for (const sd of ['l', 'r']) for (const n of ['thigh_', 'calf_', 'foot_']) { const bn = B[n + sd]; if (bn) saved.push([bn, bn.quaternion.clone()]); }
    for (const sd of ['l', 'r']) {
      const s = sd === 'l' ? 1 : -1, th = B['thigh_' + sd], ca = B['calf_' + sd], ft = B['foot_' + sd], ba = B['ball_' + sd];
      if (!th || !ca || !ft) continue;
      if (kind === 'cross') {
        aim(th, ca, dir(0.62, s * 0.74, -0.12));                                   // knee forward and out, near the ground
        aim(ca, ft, dir(s > 0 ? 0.3 : 0.02, -s * 0.94, -0.08));                    // shin across the front; the left one ahead
        if (ba) aim(ft, ba, dir(0.55, -s * 0.55, -0.35));                          // foot tucked, toes forward and in
      } else if (kind === 'squat') {
        aim(th, ca, dir(0.86, s * 0.2, -0.42));
        aim(ca, ft, dir(-0.42, s * 0.05, -0.9));
        if (ba) aim(ft, ba, dir(1, s * 0.12, -0.05));
      }
      knees[sd] = wp(ca, new THREE.Vector3());
    }
    if (w < 1) { for (const [bn, q0] of saved) { const q1 = bn.quaternion.clone(); bn.quaternion.copy(q0).slerp(q1, w); } root.updateMatrixWorld(true); }
    if (o.hands !== false && kind === 'cross' && knees.l && knees.r) {
      // hands resting on the knees, palms down, fingers forward and in
      const tg = {};
      for (const sd of ['l', 'r']) { const s = sd === 'l' ? 1 : -1; tg[sd] = { p: knees[sd].clone().addScaledVector(K.u, 0.07).addScaledVector(K.l, -s * 0.04).addScaledVector(K.f, -0.02), dir: dir(0.8, -s * 0.45, -0.4).clone(), thumb: dir(0.2, -s * 0.6, 0.3).clone() }; }
      if (o.only) for (const k of ['l', 'r']) if (k !== o.only) tg[k] = null;
      this.armIK(THREE, root, tg, ry);
    }
    return knees;
  },
  // shortest signed angle from a to b
  angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
};
