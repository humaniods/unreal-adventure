'use strict';
/* Sky, sun and haze for the Triund walk test.
   Physical sky (Preetham model, three.js examples Sky), ACES tone mapping, sRGB output.
   World axes: x = east, y = up, z = south. Sun azimuth is clockwise from north. */
window.TriundSky = {
  init({ THREE, scene, renderer, sunAz, sunEl }) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.outputEncoding = THREE.sRGBEncoding;

    const az = THREE.MathUtils.degToRad(sunAz), el = THREE.MathUtils.degToRad(sunEl);
    const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();

    let sky = null;
    if (THREE.Sky) {
      sky = new THREE.Sky();
      sky.scale.setScalar(52000);          // inside the 60 km far plane, outside the 22 km terrain
      sky.renderOrder = -1;
      sky.frustumCulled = false;
      const u = sky.material.uniforms;
      u.turbidity.value = 3.4;              // clear Himalayan morning, a little valley haze
      u.rayleigh.value = 1.15;
      u.mieCoefficient.value = 0.0045;
      u.mieDirectionalG.value = 0.82;
      u.sunPosition.value.copy(sunDir);
      scene.add(sky);
    } else {
      // fallback: plain gradient (Sky.js failed to load)
      const c = document.createElement('canvas'); c.width = 2; c.height = 512; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, '#3f78bd'); gr.addColorStop(0.55, '#9dbcdc'); gr.addColorStop(1, '#dfe7ea');
      g.fillStyle = gr; g.fillRect(0, 0, 2, 512);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; scene.background = t;
    }

    // haze: colour close to the sky at the horizon, a little warmer toward the sun
    const hazeBase = new THREE.Color(0x9fb4c9).convertSRGBToLinear();
    const hazeSun = new THREE.Color(0xd8cdbb).convertSRGBToLinear();
    scene.fog = new THREE.FogExp2(hazeBase.clone(), 0.000042);
    const v = new THREE.Vector3();

    // light: sun + sky fill; intensities tuned for ACES at the exposure above
    const hemi = new THREE.HemisphereLight(new THREE.Color(0xbcd3ff).convertSRGBToLinear(), new THREE.Color(0x5a5238).convertSRGBToLinear(), 1.45);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(new THREE.Color(0xffe0b8).convertSRGBToLinear(), 3.1);
    sun.position.copy(sunDir).multiplyScalar(400);
    scene.add(sun); scene.add(sun.target);

    return {
      sunDir, sun, hemi, sky,
      // season.js: overcast sky and grey haze for the monsoon
      // camp.js: move the sun (degrees; azimuth clockwise from north) for sunset, night and dawn. dayK 0..1 is
      // returned: how much daylight there is. Light, haze and exposure follow it; the shadow-casting light keeps
      // its morning direction (shadows are faded out at night anyway).
      setSun(azDeg, elDeg) {
        const W = this._w || { sun: 3.1, hemi: 1.45, exposure: 0.8 };
        const a = THREE.MathUtils.degToRad(azDeg), e = THREE.MathUtils.degToRad(elDeg);
        const d = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).normalize();
        if (sky) sky.material.uniforms.sunPosition.value.copy(d);
        const ss = t => Math.max(0, Math.min(1, t)), day = ss((elDeg + 6) / 16), lit = ss((elDeg + 1) / 9);
        sun.intensity = W.sun * lit; sun.color.setRGB(1, 0.62 + 0.26 * lit, 0.42 + 0.3 * lit).convertSRGBToLinear();
        hemi.intensity = W.hemi * (0.05 + 0.95 * day);
        this._dark = 1 - day;
        renderer.toneMappingExposure = W.exposure * (1 + 1.6 * (1 - day));
        return day;
      },
      setWeather(w) {
        this._w = w;
        if (sky) { const u = sky.material.uniforms; u.turbidity.value = w.turbidity; u.rayleigh.value = w.rayleigh; u.mieCoefficient.value = w.mie; }
        hazeBase.set(w.haze).convertSRGBToLinear(); hazeSun.set(w.hazeSun).convertSRGBToLinear(); scene.fog.density = w.fog;
        sun.intensity = w.sun; hemi.intensity = w.hemi; hemi.color.set(w.sky).convertSRGBToLinear(); renderer.toneMappingExposure = w.exposure;
      },
      update(camera) {
        if (sky) sky.position.copy(camera.position);
        camera.getWorldDirection(v);
        const k = Math.max(0, v.x * sunDir.x + v.z * sunDir.z) ** 2 * 0.6;
        scene.fog.color.copy(hazeBase).lerp(hazeSun, k).multiplyScalar(1 - 0.93 * (this._dark || 0));
      }
    };
  }
};
