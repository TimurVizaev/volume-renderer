
import * as THREE from '/three.module.js';

class VolumeView
{
    constructor(renderer, window, canvas, fullWidth, fullHeight, viewX, viewY, viewWidth, viewHeight)
    {
        canvas.width = viewWidth * window.devicePixelRatio;
        canvas.height = viewHeight * window.devicePixelRatio;

        this.Renderer = renderer;
        this.Context = canvas.getContext('2d');

        // Create camera (The volume renderer does not work very well with perspective yet)
        var h = 512; // frustum height
        var aspect = window.innerWidth / window.innerHeight;
        this.Camera = new THREE.OrthographicCamera(- h * aspect / 2, h * aspect / 2, h / 2, - h / 2,  -10000, 10000);
        this.Camera.position.set(0, 0, 0);
        this.Camera.up.set(0, 0, 1); // In our data, z is up

        this.Controls = new OrbitControls(this.Camera, Renderer.domElement);
        this.Controls.addEventListener('change', render);
        this.Controls.minZoom = 0.1;
        this.Controls.maxZoom = 40;
        this.Controls.update();
    }

    Render(renderer)
    {
        camera.lookAt(scene.position);

        renderer.render(scene, camera);

        this.Context.drawImage(renderer.domElement, 0, 0);
    }

}

export { VolumeView }
