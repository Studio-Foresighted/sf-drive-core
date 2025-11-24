import * as THREE from 'three';

export class CarVisual {
    constructor(scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        this.scene.add(this.mesh);
        this.currentModel = null;
        
        // Wheel Meshes - Removed debug wheels as we have models now
        this.wheels = [];
    }

    setModel(glbScene) {
        if (this.currentModel) {
            this.mesh.remove(this.currentModel);
        }
        this.currentModel = glbScene;
        
        // Adjust GLB scale/rotation if needed
        // Assuming GLB is Z-forward, Y-up, 1 unit = 1 meter
        // Rotation is now handled by the Loader/Manifest, so we don't hardcode Math.PI here.
        // this.currentModel.rotation.y = Math.PI; 
        
        // Visual Offset to ensure wheels touch ground
        // Physics body is at center of mass, but visual model origin is at bottom of wheels.
        // If physics body is at Y=0.3, visual model is at Y=0.3 (floating).
        // We need to push the visual model down by the ride height.
        // A safe bet is roughly -0.1 to -0.2 depending on suspension.
        this.currentModel.position.y = -0.55;

        this.mesh.add(this.currentModel);
    }

    update(pos, rot, vehicleController) {
        // Sync Chassis
        this.mesh.position.copy(pos);
        this.mesh.quaternion.copy(rot);
    }
}