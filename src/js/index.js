import * as THREE from "three";
// TODO: OrbitControls import three.js on its own, so the webpack bundle includes three.js twice!
import OrbitControls from "orbit-controls-es6";
import * as Detector from "../js/vendor/Detector";
import * as terrain from "../textures/se.tif";
import * as GeoTIFF from "geotiff";
import * as bgImage from "../textures/1047.png";

require("../sass/home.sass");

class Application {
  constructor(opts = {}) {
    this.width = window.innerWidth;
    this.height = window.innerHeight

    if (opts.container) {
      this.container = opts.container;
    } else {
      const div = Application.createContainer();
      document.body.appendChild(div);
      this.container = div;
    }

    if (Detector.webgl) {
      this.init();
      this.render();
    } else {
      // TODO: style warning message
      console.log("WebGL NOT supported in your browser!");
      const warning = Detector.getWebGLErrorMessage();
      this.container.appendChild(warning);
    }
  }

  init() {
    this.scene = new THREE.Scene();
    this.setupRenderer();
    this.setupCamera();
    this.setupControls();
    this.setupLight();
    this.setupTerrainModel();
    //this.setupHelpers();

    window.addEventListener("resize", () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
  }

  render() {
    this.controls.update();
    //this.pl.position.set(this.pl.position.add(new THREE.Vector3(Math.random(), Math.random(),0.0)));
    this.renderer.render(this.scene, this.camera);
    // calculate and set position of moving light
    let t = (Math.sin((Date.now() / 4096))+1)/2;
    let p = new THREE.Vector2()
    this.lightLine.getPoint(t, p);
    this.pl.position.set(p.x, p.y, -20)
    // when render is invoked via requestAnimationFrame(this.render) there is
    // no 'this', so either we bind it explicitly or use an es6 arrow function.
    // requestAnimationFrame(this.render.bind(this));
    requestAnimationFrame(() => this.render());
  }

  static createContainer() {
    const div = document.createElement("div");
    div.setAttribute("id", "canvas-container");
    div.setAttribute("class", "container");
    return div;
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);
    const texture = new THREE.TextureLoader().load(bgImage);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set( 4, 4 );
    this.scene.background = texture;
  }

  setupCamera() {
    const fov = 75;
    const aspect = this.width / this.height;
    const near = 0.1;
    const far = 10000;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    //this.camera.position.set(1, 500, -500);
    this.camera.position.set(100, -400, -500);
    this.camera.lookAt(this.scene.position);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = true;
    this.controls.maxDistance = 1500;
    this.controls.minDistance = 0;
    this.controls.autoRotate = false;
  }

  setupLight() {
    this.ambientLight = new THREE.AmbientLight( 0x404040 ); // soft white light
    this.scene.add( this.ambientLight );
    this.light = new THREE.DirectionalLight(0xffffff);
    this.light.position.set(-5000, 1000, -1000);
    this.scene.add(this.light);
    // set up path for moving pointlight
    const points = [];
    points.push( new THREE.Vector2( 90, -370 ) );
    points.push( new THREE.Vector2( 110, -200 ) );
    points.push( new THREE.Vector2( 30, 90 ) );
    points.push( new THREE.Vector2( -80, 350, -10 ) );
    this.lightLine = new THREE.SplineCurve(points);
    this.pl = new THREE.PointLight( 0xff0000, 2, 0, 0.1 );
    this.scene.add(this.pl);
  }

  setupTerrainModel() {
    const readGeoTif = async () => {
      const rawTiff = await GeoTIFF.fromUrl(terrain);
      const tifImage = await rawTiff.getImage();
      const image = {
        width: tifImage.getWidth(),
        height: tifImage.getHeight()
      };
      

      const bgeometry = new THREE.PlaneBufferGeometry(
        image.width,
        image.height,
        image.width - 1,
        image.height -1
      );
      const geometry = new THREE.PlaneGeometry(
        image.width,
        image.height,
        image.width - 1,
        image.height -1
      );

      const positions = [];
      const data = await tifImage.readRasters({ interleave: true });

      console.time("parseGeom");
      const aMapInitial = new Uint8Array( data.length );
      const aMap = new Uint8Array( 3 * data.length );
      geometry.vertices.forEach((geom, index) => {
        geom.z = (data[index] ) * -0.01;
        if(geom.z > -0.025){
          geom.z = 0.0
          aMapInitial[index] = 0;
        }
        else {
          aMapInitial[index] = 1;
        }
          positions.push(geom.x, geom.y, geom.z)
      });
      geometry.dispose();
      console.timeEnd("parseGeom");

      // create alpha map for transparency 
      for ( let i = 0; i < image.width; i ++ ) {
        for ( let j = 0; j < image.height; j ++ ) {
          let aix = i+ j*image.width;
          let aix2 = (i + (image.height - 1 - j) * image.width)*3;
          if(aMapInitial[aix] == 0){
            aMap[aix2] = 0;
            aMap[aix2 + 1] = 0;
            aMap[aix2 + 2] = 0;
          }
          else {
            aMap[aix2] = 255;
            aMap[aix2 + 1] = 255;
            aMap[aix2 + 2] = 255;
          }
        }
      }

      const atexture = new THREE.DataTexture( aMap, image.width, image.height, THREE.RGBFormat );
      const material = new THREE.MeshPhongMaterial({
        wireframe: false,
        side: THREE.DoubleSide,
        color: new THREE.Color( 'royalblue' ),
        transparent: true,
        alphaMap: atexture,
        reflectivity: 1.0
      });

      bgeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
      bgeometry.computeBoundingSphere();
      bgeometry.computeVertexNormals();
      const map_mesh = new THREE.Mesh(bgeometry, material);
      map_mesh.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
      map_mesh.position.y = 0;

      this.scene.add(map_mesh);

      const loader = document.getElementById("loader");
      loader.style.opacity = "-1";

      // After a proper animation on opacity, hide element to make canvas clickable again
      setTimeout(
        (() => {
          loader.style.display = "none";
        }),
        1500
      );
    };

    readGeoTif();
  }

  setupHelpers() {
    const gridHelper = new THREE.GridHelper(1000, 40);
    this.scene.add(gridHelper);

    const dirLightHelper = new THREE.DirectionalLightHelper(this.light, 10);
    this.scene.add(dirLightHelper);

    //console.log("The X axis is red. The Y axis is green. The Z axis is blue.");
    const axesHelper = new THREE.AxesHelper(500);
    this.scene.add(axesHelper);

    const material = new THREE.LineBasicMaterial( { color: 0x0000ff } );
    const points = [];
    points.push( new THREE.Vector3( 90, -370, -10 ) );
    points.push( new THREE.Vector3( 110, -200, -10 ) );
    points.push( new THREE.Vector3( 30, 90, -10 ) );
    points.push( new THREE.Vector3( -80, 350, -10 ) );
    const geometry = new THREE.BufferGeometry().setFromPoints( points );
    const line = new THREE.Line( geometry, material );
    this.scene.add(line);
  }
}

// wrap everything inside a function scope and invoke it (IIFE, a.k.a. SEAF)
(() => {
  const app = new Application({
    container: document.getElementById("canvas-container")
  });
})();
