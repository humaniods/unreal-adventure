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
      setWeather(w) {
        if (sky) { const u = sky.material.uniforms; u.turbidity.value = w.turbidity; u.rayleigh.value = w.rayleigh; u.mieCoefficient.value = w.mie; }
        hazeBase.set(w.haze).convertSRGBToLinear(); hazeSun.set(w.hazeSun).convertSRGBToLinear(); scene.fog.density = w.fog;
        sun.intensity = w.sun; hemi.intensity = w.hemi; hemi.color.set(w.sky).convertSRGBToLinear(); renderer.toneMappingExposure = w.exposure;
      },
      update(camera) {
        if (sky) sky.position.copy(camera.position);
        camera.getWorldDirection(v);
        const k = Math.max(0, v.x * sunDir.x + v.z * sunDir.z) ** 2 * 0.6;
        scene.fog.color.copy(hazeBase).lerp(hazeSun, k);
      }
    };
  }
};
