import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import GUI from 'lil-gui';
import './App.css';

function App() {
  const canvasRef = useRef(null);
  const weaponRef = useRef(null);
  const backgroundMaterialRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => {
    // --- 1. 設定 & GUI ---
    const gui = new GUI({ title: 'VALO-STORE プロフェッショナル' });
    const settings = {
      // 武器の設定
      scale: 0.5,
      metalness: 0.9,
      roughness: 0.1,
      // 背景モヤの設定
      bgSpeed: 0.5,
      bgColor1: '#06090f',
      bgColor2: '#4c1d95',
      // ラインの設定（控えめに初期化）
      lineSpeed: 0.8,
      lineColor: '#3a3bc4',
      lineIntensity: 0.4, // ラインの光る強さ
      lineWidth: 0.05,    // ラインの太さ
      // ブルームの設定
      bloomStrength: 0.8,
      bloomRadius: 0.4,
      bloomThreshold: 0.9,
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;

    // --- 2. OrbitControls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;

    // --- 3. 背景シェーダー ---
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uLineColor;
      uniform float uLineSpeed;
      uniform float uLineIntensity;
      uniform float uLineWidth;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        // ベースのモヤモヤ
        float wave = sin(uv.x * 3.0 + uTime * 1.0) * cos(uv.y * 2.0 + uTime * 0.7);
        float intensity = wave * 0.5 + 0.5;
        vec3 baseColor = mix(uColor1, uColor2, intensity);

        // 斜めラインの計算
        float linePos = uv.y - uv.x * 0.5; 
        float lines = fract(linePos * 15.0 + uTime * uLineSpeed);
        
        // smoothstepで太さを調整（控えめにするためにエッジをぼかす）
        float lineMask = smoothstep(1.0 - uLineWidth, 1.0, lines);
        
        // 最終カラー：ラインの強度(uLineIntensity)を掛けて派手さを抑える
        vec3 finalColor = baseColor + (uLineColor * lineMask * uLineIntensity); 
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const bgGeometry = new THREE.PlaneGeometry(200, 200);
    const bgMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(settings.bgColor1) },
        uColor2: { value: new THREE.Color(settings.bgColor2) },
        uLineColor: { value: new THREE.Color(settings.lineColor) },
        uLineSpeed: { value: settings.lineSpeed },
        uLineIntensity: { value: settings.lineIntensity },
        uLineWidth: { value: settings.lineWidth },
      },
      depthWrite: false,
    });
    backgroundMaterialRef.current = bgMaterial;

    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.position.set(0, 0, -50);
    camera.add(bgMesh);

    // --- 4. ポストプロセッシング ---
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      settings.bloomStrength,
      settings.bloomRadius,
      settings.bloomThreshold
    );
    composerRef.current = new EffectComposer(renderer);
    composerRef.current.addPass(renderScene);
    composerRef.current.addPass(bloomPass);

    // --- 5. ライティング ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    // --- 6. モデル読み込み & GUI追加 ---
    const loader = new GLTFLoader();
    loader.load('/models/phantom.glb', (gltf) => {
      const weapon = gltf.scene;
      weapon.scale.set(settings.scale, settings.scale, settings.scale);
      weapon.rotation.y = Math.PI * -0.5;
      weapon.traverse(child => {
        if (child.isMesh) {
          child.material.metalness = settings.metalness;
          child.material.roughness = settings.roughness;
        }
      });
      scene.add(weapon);
      weaponRef.current = weapon;

      // --- GUIフォルダの構成 ---
      const bgFolder = gui.addFolder('背景（モヤ）');
      bgFolder.add(settings, 'bgSpeed', 0, 2).name('速度');
      bgFolder.addColor(settings, 'bgColor1').name('色1').onChange(v => bgMaterial.uniforms.uColor1.value.set(v));
      bgFolder.addColor(settings, 'bgColor2').name('色2').onChange(v => bgMaterial.uniforms.uColor2.value.set(v));

      const lineFolder = gui.addFolder('背景（ライン）');
      lineFolder.add(settings, 'lineSpeed', 0, 3).name('流れる速度').onChange(v => bgMaterial.uniforms.uLineSpeed.value = v);
      lineFolder.add(settings, 'lineIntensity', 0, 2).name('光の強さ').onChange(v => bgMaterial.uniforms.uLineIntensity.value = v);
      lineFolder.add(settings, 'lineWidth', 0.01, 0.2).name('ラインの太さ').onChange(v => bgMaterial.uniforms.uLineWidth.value = v);
      lineFolder.addColor(settings, 'lineColor').name('ラインの色').onChange(v => bgMaterial.uniforms.uLineColor.value.set(v));

      const bloomFolder = gui.addFolder('全体の光（Bloom）');
      bloomFolder.add(bloomPass, 'strength', 0, 3).name('光の強さ');
      bloomFolder.add(bloomPass, 'threshold', 0, 1).name('光る境界線');
    });

    // --- 7. アニメーション ---
    const clock = new THREE.Clock();
    const tick = () => {
      const elapsedTime = clock.getElapsedTime();
      controls.update();

      if (backgroundMaterialRef.current) {
        backgroundMaterialRef.current.uniforms.uTime.value = elapsedTime;
      }
      if (weaponRef.current) {
        weaponRef.current.position.y = Math.sin(elapsedTime * 0.5) * 0.08;
      }

      if (composerRef.current) composerRef.current.render();
      window.requestAnimationFrame(tick);
    };
    tick();

    // --- 8. リサイズ対応 ---
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composerRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      gui.destroy();
      renderer.dispose(); 
    };
  }, []);

  return (
    <div className="valo-container">
      <canvas ref={canvasRef} className="webgl" />
      <div className="ui-overlay">
        <header className="header"><div className="back-btn">← 戻る // ストア</div></header>
        <main className="weapon-content">
          <div className="weapon-info">
            <span className="skin-tag">スキン</span>
            <h1 className="weapon-name">ファントム</h1>
          </div>
          <div className="action-buttons">
            <div className="price-card"><span className="vp-icon">V</span><span className="price">2,375</span></div>
            <button className="buy-button">アイテム購入</button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;