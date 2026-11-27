// 写实画面的统一光影：游戏战斗场景和模型检查页（viewer.html）共用，保证建模时看到的就是游戏里的样子。
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** 夕阳侧光：暖色主光从左上后方打来，冷色天光补暗部 */
export const SUN_DIR = new THREE.Vector3(-6, 9, 5);

export function setupRenderer(renderer: THREE.WebGLRenderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // 不改变背景图本来的颜色，只压住过亮的高光
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

/** 给场景加环境反射和灯光，返回主光（阴影范围按场景调） */
export function setupLights(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x4a3a2a, 0.55));
  const sun = new THREE.DirectionalLight(0xffd6a0, 2.6);
  sun.position.copy(SUN_DIR);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const c = sun.shadow.camera;
  c.left = -9; c.right = 9; c.top = 7; c.bottom = -3; c.near = 0.5; c.far = 40;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xffe2b8, 1.2); // 背后轮廓光，把人物从背景里提出来
  rim.position.set(4, 5, -8);
  scene.add(rim);
  return sun;
}

/** 模型里的网格都投影、受影 */
export function castShadows(root: THREE.Object3D) {
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}
