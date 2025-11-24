import * as THREE from 'three';
import { Renderer } from './core/renderer.js';
import { GameScene } from './core/scene.js';
import { PhysicsWorld } from './physics/rapierSetup.js';
import { VehiclePhysics } from './cars/vehiclePhysics.js';
import { CarVisual } from './cars/carVisual.js';
import { CarLoader } from './cars/carLoader.js';
import { InputController } from './input/inputController.js';
import { GarageUI } from './ui/garage.js';
import { PauseMenu } from './ui/pauseMenu.js';
import { HUD } from './ui/hud.js';
import { Time } from './util/time.js';

// Future Multiplayer: CarState definition
class CarState {
    constructor() {
        this.position = new THREE.Vector3();
        this.rotation = new THREE.Quaternion();
        this.linearVelocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3();
        this.steering = 0;
        this.throttle = 0;
        this.brake = 0;
    }
    
    updateFromPhysics(vehicle) {
        if (!vehicle || !vehicle.chassisBody) return;
        
        const t = vehicle.chassisBody.translation();
        const r = vehicle.chassisBody.rotation();
        const lv = vehicle.chassisBody.linvel();
        const av = vehicle.chassisBody.angvel();
        
        this.position.set(t.x, t.y, t.z);
        this.rotation.set(r.x, r.y, r.z, r.w);
        this.linearVelocity.set(lv.x, lv.y, lv.z);
        this.angularVelocity.set(av.x, av.y, av.z);
    }
}

class Game {
    constructor() {
        this.renderer = new Renderer();
        this.time = new Time();
        this.input = new InputController((key) => this.handleInput(key));
        this.physics = new PhysicsWorld();
        this.loader = new CarLoader();
        
        this.scene = null;
        this.vehicle = null;
        this.visual = null;
        this.garage = null;
        this.pauseMenu = null;
        this.hud = null;
        this.paused = false;
        
        this.localCarState = new CarState();

        this.cameraOffset = new THREE.Vector3(0, 5, -10);
        this.cameraLookAtOffset = new THREE.Vector3(0, 0, 5); // Look ahead
    }

    async init() {
        // 1. Init Physics
        await this.physics.init();
        // document.getElementById('loading').style.display = 'none'; // Old loader

        // 2. Setup Scene
        this.scene = new GameScene(this.physics);
        this.visual = new CarVisual(this.scene.threeScene);

        // 3. Setup Garage & Car Loading
        this.garage = new GarageUI(this, this.loader, (carId) => this.onCarSelect(carId));
        await this.garage.init();

        // 4. Setup Pause Menu
        this.pauseMenu = new PauseMenu(this);

        // 5. Setup HUD
        this.hud = new HUD(this);

        // 6. Start Loop
        this.renderer.renderer.setAnimationLoop(() => this.update());
    }

    async onCarSelect(carId) {
        // Show Loading Overlay
        const overlay = document.getElementById('loading-overlay');
        const bar = document.getElementById('progress-bar');
        const text = document.getElementById('loading-text');
        
        if (overlay) {
            overlay.style.display = 'flex';
            bar.style.width = '0%';
            text.textContent = 'Loading Car Model...';
        }

        // Load Visual Model
        const model = await this.loader.loadCarModel(carId, (percent) => {
            if (bar) bar.style.width = `${percent}%`;
        });
        
        if (overlay) {
            // Small delay to show 100%
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 200);
        }

        if (!model) return;

        this.visual.setModel(model);

        // Reset Physics Vehicle if exists, or create new
        if (this.vehicle) {
            // Reset Position
            this.vehicle.chassisBody.setTranslation({ x: 0, y: 2.0, z: 0 }, true);
            this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            this.vehicle.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
            // Reset rotation to face +Z (Identity)
            this.vehicle.chassisBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        } else {
            // Create Physics Vehicle
            this.vehicle = new VehiclePhysics(this.physics, { x: 0, y: 2.0, z: 0 });
            // Reset rotation to face +Z (Identity)
            this.vehicle.chassisBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        }
    }

    handleInput(key) {
        if (key === 'p') this.resetCar(true);
        if (key === 'r') this.resetCar(false);
    }

    resetCar(toStart) {
        if (!this.vehicle) return;

        const body = this.vehicle.chassisBody;
        
        // 1. Kill all velocity immediately
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);

        if (toStart) {
            // Reset to Start Position (High enough to drop safely)
            body.setTranslation({ x: 0, y: 3.0, z: 0 }, true);
            // Reset rotation to face +Z (Identity)
            body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        } else {
            // Flip Upright at current position
            const t = body.translation();
            // Lift by 3 units to ensure we are clear of any geometry
            body.setTranslation({ x: t.x, y: t.y + 3.0, z: t.z }, true); 
            
            // Reset rotation to flat (keep Y heading)
            const currentRot = body.rotation();
            const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w));
            const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, euler.y, 0));
            
            body.setRotation({ x: targetQuat.x, y: targetQuat.y, z: targetQuat.z, w: targetQuat.w }, true);
        }
    }

    update() {
        // Always render scene (even when paused)
        if (this.scene) {
            this.renderer.render(this.scene.threeScene);
        }

        if (this.paused) return;

        this.time.update();
        const dt = this.time.delta;

        // 1. Input
        const controlState = this.input.getControlState();

        // 2. Physics Step
        if (this.vehicle) {
            this.vehicle.update(dt, controlState);
            this.physics.step(dt);
            
            // 3. Update State (Future Multiplayer Sync Point)
            this.localCarState.updateFromPhysics(this.vehicle);
        }

        // 4. Sync Visuals from State
        if (this.vehicle && this.visual) {
            // In a networked game, we might interpolate between states here.
            // For local, we just use the physics state directly.
            this.visual.update(
                this.localCarState.position, 
                this.localCarState.rotation, 
                this.vehicle.controller
            );

            // 5. Camera Follow
            this.updateCamera(this.localCarState.position, this.localCarState.rotation, dt);
        }

        // 6. Update HUD
        if (this.hud) {
            this.hud.update();
        }
    }

    updateCamera(carPos, carRot, dt) {
        // Simple Chase Camera
        // Calculate desired position based on car's backward vector
        const carQuat = carRot.clone();
        const offset = this.cameraOffset.clone().applyQuaternion(carQuat);
        const desiredPos = carPos.clone().add(offset);
        
        // Smoothly interpolate camera position
        this.renderer.camera.position.lerp(desiredPos, 5.0 * dt);
        
        // Look at car (plus a bit ahead)
        const lookTarget = carPos.clone().add(this.cameraLookAtOffset.clone().applyQuaternion(carQuat));
        this.renderer.camera.lookAt(lookTarget);
    }
}

const game = new Game();
game.init();