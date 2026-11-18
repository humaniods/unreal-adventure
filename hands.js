'use strict';
/* First-person hands for eating and drinking.
   The hands are a small rig parented to the camera (jacket sleeve, palm, thumb, curled fingers). Nothing gets eaten
   without them: a served plate is picked up and held in the left hand while the right hand takes a forkful to the
   mouth; a glass of tea is lifted for a sip; a snack comes out of the bag in the right hand; a bottle is tipped up.
   Food only goes down when a bite or sip reaches the mouth (onBite), so the plate empties bite by bite.
   Camera near plane is 0.4 m, so the rig keeps everything at least 0.42 m in front of the eye. */
window.TriundHands = {
  create({ THREE, camera, scene }) {
    if (!camera.parent) scene.add(camera);
    const rig = new THREE.Group(); rig.visible = false; camera.add(rig);
    const mat = (c, r) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: r == null ? 0.7 : r });
    const skin = mat(0xb07a56, 0.6), sleeve = mat(0x2f6e8f, 0.85), steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.3, metalness: 0.85 });
    // one hand: sleeve along +z (toward the elbow), palm at the origin, fingers curled around the grip point
    function hand(left) {
      const g = new THREE.Group(), s = left ? -1 : 1;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.34, 10), sleeve); arm.rotation.x = Math.PI / 2; arm.position.z = 0.2; g.add(arm);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.06, 10), skin); wrist.rotation.x = Math.PI / 2; wrist.position.z = 0.04; g.add(wrist);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.085), skin); palm.position.set(0, 0, -0.02); g.add(palm);
      for (let i = 0; i < 4; i++) {               // fingers, curled under
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 6), skin);
        f.position.set(-0.027 + i * 0.018, -0.018, -0.07); f.rotation.x = 1.0; g.add(f);
      }
      const th = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.05, 6), skin); th.position.set(s * 0.04, 0.0, -0.035); th.rotation.set(0.4, 0, s * 1.1); g.add(th);
      return g;
    }
    const L = hand(true), R = hand(false); rig.add(L, R);
    const fork = new THREE.Group();
    { const h = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.13), steel); h.position.z = 0.02; fork.add(h);
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.04), steel); t.position.set(-0.008 + i * 0.008, 0, -0.065); fork.add(t); }
      const bite = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat(0xe8c04a)); bite.position.set(0, 0.008, -0.07); bite.scale.set(1.3, 0.6, 1.2); fork.add(bite); fork.userData.bite = bite; }
    fork.position.set(0, -0.005, -0.06); fork.rotation.set(0.2, 0, 0); fork.visible = false; R.add(fork);

    // poses in camera space (x right, y up, -z forward)
    const POSE = {
      rest:     { L: [-0.32, -0.42, -0.3], R: [0.32, -0.42, -0.3] },
      holdL:    [-0.08, -0.17, -0.52],    // plate held in front, low in the view
      forkDown: [0.02, -0.135, -0.52],    // fork in the plate
      mouth:    [0.0, -0.045, -0.44],     // fork / glass at the mouth
      holdR:    [0.13, -0.15, -0.5]       // glass, snack or bottle held
    };
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    L.position.copy(V(POSE.rest.L)); R.position.copy(V(POSE.rest.R));
    L.rotation.set(-0.15, 0.25, 0.2); R.rotation.set(-0.15, -0.25, -0.2);

    let job = null;   // { kind, item, cycle, t, phase, onBite, onDone, bites, held }
    const lerpV = (o, a, b, k) => o.copy(a).lerp(b, k);
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const tmp = new THREE.Vector3();

    // take a world object (a served plate or glass) into the hand
    function takeInto(obj, parent, local) {
      if (!obj) return;
      obj.updateMatrixWorld(true); const wp = obj.getWorldPosition(new THREE.Vector3());
      parent.updateMatrixWorld(true); parent.worldToLocal(wp);
      parent.add(obj); obj.position.copy(wp); obj.rotation.set(0, 0, 0); obj.scale.setScalar(0.9); obj.visible = true;
      obj.userData.from = wp.clone(); obj.userData.to = local.clone(); obj.userData.k = 0;
    }
    function smallItem(icon) {   // a packet, a fruit or a bottle for the right hand
      let m;
      if (icon === '💧') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x9fc9e0, roughness: 0.15, transparent: true, opacity: 0.75 })); m.rotation.x = Math.PI / 2; }
      else if (icon === '🍌') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.15, 8), mat(0xf2d34a)); m.rotation.set(Math.PI / 2, 0, 0.5); }
      else { const c = { '🍪': 0xf2c230, '🍫': 0x5a3020, '🧃': 0xf28a1a, '🫓': 0xc8904a, '🥜': 0x9a6a3a }[icon] || 0xc0392b; m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.11), mat(c, 0.5)); }
      m.position.set(0, -0.01, -0.07); return m;
    }

    /* jobs
       eat:   plate in the left hand, forkfuls with the right (bites over `total` seconds of real time)
       sip:   glass of tea in the right hand, sips
       snack: something from the bag, two or three bites
       drink: water bottle tipped up once */
    function start(kind, opts) {
      if (job) finish(true);
      job = { kind, t: 0, k: 0, bites: 0, phase: 'reach', ...opts };
      rig.visible = true; fork.visible = kind === 'eat'; if (fork.userData.bite) fork.userData.bite.visible = false;
      if (kind === 'eat') takeInto(opts.dish, L, new THREE.Vector3(0.02, 0.0, -0.13));
      else if (kind === 'sip') takeInto(opts.dish, R, new THREE.Vector3(0.0, -0.02, -0.06));
      else { job.small = smallItem(opts.icon); R.add(job.small); }
    }
    function finish(abort) {
      const j = job; if (!j) return; job = null;
      if (j.small) { R.remove(j.small); }
      fork.visible = false;
      if (j.dish && j.onPutDown) {            // the empty plate or glass goes back down
        j.dish.updateMatrixWorld(true); const wp = j.dish.getWorldPosition(new THREE.Vector3());
        scene.add(j.dish); j.dish.position.copy(wp); j.onPutDown(j.dish);
      }
      if (!abort && j.onDone) j.onDone();
    }
    // speed: 1 normal, higher when the player lets time pass faster
    function update(dt, speed) {
      const pace = Math.min(speed || 1, 4);
      // move a picked-up object into its place in the hand
      for (const h of [L, R]) for (const c of h.children) if (c.userData.to && c.userData.k < 1) { c.userData.k = Math.min(1, c.userData.k + dt * 2.2); lerpV(c.position, c.userData.from, c.userData.to, ease(c.userData.k)); }
      const restL = V(POSE.rest.L), restR = V(POSE.rest.R);
      if (!job) {
        L.position.lerp(restL, Math.min(1, dt * 5)); R.position.lerp(restR, Math.min(1, dt * 5));
        if (L.position.distanceTo(restL) < 0.01 && R.position.distanceTo(restR) < 0.01) rig.visible = false;
        return;
      }
      const j = job; j.t += dt * pace;
      if (j.kind === 'eat') {
        lerpV(tmp, L.position, V(POSE.holdL), Math.min(1, dt * 6)); L.position.copy(tmp); L.rotation.set(-0.35, 0.1, 0.1);
        if (j.phase === 'reach') { lerpV(tmp, R.position, V(POSE.forkDown), Math.min(1, dt * 5)); R.position.copy(tmp); if (j.t > 0.7) { j.phase = 'loop'; j.t = 0; } return; }
        // one forkful: down to the plate (scoop), up to the mouth (bite), back
        const cyc = 2.2, p = (j.t % cyc) / cyc;
        const down = V(POSE.forkDown), mouth = V(POSE.mouth);
        if (p < 0.25) { R.position.copy(down); R.rotation.set(-0.5 + p * 1.2, -0.2, -0.2); fork.userData.bite.visible = p > 0.15; }
        else if (p < 0.55) { lerpV(R.position, down, mouth, ease((p - 0.25) / 0.3)); R.rotation.set(-0.2, -0.3, -0.3); fork.userData.bite.visible = true; }
        else if (p < 0.65) { R.position.copy(mouth); if (!j.bit) { j.bit = true; j.bites++; fork.userData.bite.visible = false; if (j.onBite) j.onBite(j.bites); } }
        else { lerpV(R.position, mouth, down, ease((p - 0.65) / 0.35)); fork.userData.bite.visible = false; }
        if (p < 0.6) j.bit = false;
        if (j.bites >= j.need) finish(false);
      } else {
        // sip / snack / drink: hold low, lift to the mouth (tilt), hold a moment, lower; repeat `need` times
        const cyc = j.kind === 'drink' ? 2.4 : 2.6, p = (j.t % cyc) / cyc, hold = V(POSE.holdR), mouth = V(POSE.mouth);
        if (j.phase === 'reach') { R.position.lerp(hold, Math.min(1, dt * 5)); if (j.t > 0.6) { j.phase = 'loop'; j.t = 0; } return; }
        const tilt = j.kind === 'snack' ? 0.2 : 0.9;
        if (p < 0.35) { lerpV(R.position, hold, mouth, ease(p / 0.35)); R.rotation.set(-0.15 + tilt * (p / 0.35), -0.25, -0.2); }
        else if (p < 0.6) { R.position.copy(mouth); R.rotation.set(-0.15 + tilt, -0.25, -0.2); if (!j.bit) { j.bit = true; j.bites++; if (j.onBite) j.onBite(j.bites); } }
        else { lerpV(R.position, mouth, hold, ease((p - 0.6) / 0.4)); R.rotation.set(-0.15 + tilt * (1 - (p - 0.6) / 0.4), -0.25, -0.2); }
        if (p < 0.3) j.bit = false;
        if (j.bites >= j.need && p > 0.95) finish(false);
      }
    }
    return { start, update, finish, get busy() { return !!job; }, get kind() { return job && job.kind; } };
  }
};
