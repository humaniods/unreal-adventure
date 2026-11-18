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
  // shortest signed angle from a to b
  angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
};
