import * as THREE from 'three';

class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        
        // Create a shared geometry/material for performance
        // Using a simple square for now, or load texture if available
        // Better Smoke Texture (Procedural Soft Circle)
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(16,16,0,16,16,16);
        grad.addColorStop(0, 'rgba(200,200,200,1)'); // Light Grey center
        grad.addColorStop(1, 'rgba(200,200,200,0)'); // Transparent edge
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,32,32);
        this.texture = new THREE.CanvasTexture(canvas);

        this.material = new THREE.SpriteMaterial({
            map: this.texture,
            color: 0x888888, // Grey smoke
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            blending: THREE.NormalBlending // Normal blending for thick smoke
        });
    }

    emit(pos, color, size, life) {
        const sprite = new THREE.Sprite(this.material.clone());
        sprite.material.color.setHex(color);
        sprite.position.copy(pos);
        sprite.scale.set(size, size, 1);
        
        this.scene.add(sprite);
        
        this.particles.push({
            mesh: sprite,
            life: life,
            maxLife: life,
            velocity: new THREE.Vector3((Math.random()-0.5)*0.1, Math.random()*0.1 + 0.1, (Math.random()-0.5)*0.1) // Upward drift
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
                continue;
            }

            // Physics
            p.mesh.position.add(p.velocity);
            p.mesh.scale.multiplyScalar(1.01); // Grow slowly
            p.mesh.material.opacity = (p.life / p.maxLife) * 0.4;
        }
    }
}

export class CarVisual {
    constructor(scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        this.scene.add(this.mesh);
        this.currentModel = null;
        
        this.particleSystem = new ParticleSystem(scene);
        
        this.skidMarks = []; // Store skid mark meshes
        this.isSkidding = false;
        this.lastSkidPos = [null, null]; // Left, Right rear wheels
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

    update(pos, rot, vehicleController, dt, isDrifting, driftPower) {
        // Sync Chassis
        this.mesh.position.copy(pos);
        this.mesh.quaternion.copy(rot);
        
        // Update Particles
        this.particleSystem.update(dt);

        // Constant Motor Smoke (Exhaust) - REMOVED
        // Drift Visuals (Optional extra smoke) - REMOVED
    }
}