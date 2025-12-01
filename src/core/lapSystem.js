import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export class LapSystem {
    constructor(game) {
        this.game = game;
        this.physicsWorld = game.physics.world;
        
        this.totalLaps = 3;
        this.currentLap = 0;
        this.nextCheckpoint = 0; // 0 = Start/Finish, 1 = CP1, 2 = CP2
        this.hasStartedRace = false;
        this.lastValidatedCheckpoint = -1; // Track last valid hit to prevent spam
        this.collectedCoins = new Set(); // Track collected coins per race
        this.lastLapTime = 0; // Debounce for start line

        
        // Checkpoint Definitions (Position, Size)
        // Updated with User Logs:
        // Start: { x: -0.00, y: -1.01, z: 0.03 }
        // CP1:   { x: 7.08, y: -0.01, z: 47.69 }
        // CP2:   { x: 7.07, y: -1.00, z: 102.75 }
        this.checkpoints = [
            // Gate 0: Start/Finish
            { pos: { x: 0, y: 1, z: 0 }, size: { x: 40, y: 15, z: 5 } },
            
            // Gate 1: Approx 1/3 track
            { pos: { x: 7, y: 1, z: 47 }, size: { x: 40, y: 15, z: 5 } },
            
            // Gate 2: Approx 2/3 track
            { pos: { x: 7, y: 1, z: 102 }, size: { x: 40, y: 15, z: 5 } }
        ];
        
        this.sensors = [];
        this.visuals = []; // Initialize visuals array
        this.particles = []; // For coin explosions
        this.setupSensors();

        // Initial HUD Sync & Debug
        console.log(`[DEBUG] LapSystem Init: Lap ${this.currentLap}/${this.totalLaps}`);
        if (this.game.hud) {
            this.game.hud.updateLap(this.currentLap, this.totalLaps);
        }
    }

    updateCheckpoints(newCheckpoints, coinModel = null) {
        // Clear existing sensors
        this.sensors = [];
        
        // Clear existing visuals
        if (this.visuals) {
            this.visuals.forEach(m => this.game.scene.threeScene.remove(m));
        }
        this.visuals = [];

        this.checkpoints = newCheckpoints;
        this.nextCheckpoint = 0;
        this.hasStartedRace = false;
        this.currentLap = 0;
        this.collectedCoins.clear();
        
        this.setupSensors(coinModel);
        console.log("LapSystem: Checkpoints updated.", this.checkpoints);

        // Sync HUD
        if (this.game.hud) {
            this.game.hud.updateLap(this.currentLap, this.totalLaps);
        }
    }

    setupSensors(coinModel) {
        this.checkpoints.forEach((cp, index) => {
            // Convert to THREE.Box3 for JS-based detection
            const min = new THREE.Vector3(
                cp.pos.x - cp.size.x / 2,
                cp.pos.y - cp.size.y / 2,
                cp.pos.z - cp.size.z / 2
            );
            const max = new THREE.Vector3(
                cp.pos.x + cp.size.x / 2,
                cp.pos.y + cp.size.y / 2,
                cp.pos.z + cp.size.z / 2
            );
            
            this.sensors.push({
                box: new THREE.Box3(min, max),
                index: index,
                cooldown: 0 // Prevent double triggering
            });

            // Create Visuals
            if (index > 0 && coinModel) { // Skip Start Line (Index 0)
                const coin = coinModel.clone();
                // Lower the coin visual slightly (approx 0.5 units) to be closer to floor but not touching
                coin.position.set(cp.pos.x, cp.pos.y - 0.5, cp.pos.z);
                // Ensure it's visible
                coin.visible = true;
                this.game.scene.threeScene.add(coin);
                this.visuals.push(coin);
            } else {
                // Placeholder for Start Line or if no model
                this.visuals.push(null); 
            }
        });
    }

    // createStartLineVisual removed as requested

    update() {
        // Rotate Coins
        if (this.visuals) {
            this.visuals.forEach(v => {
                if (v) v.rotation.y += 0.05;
            });
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= 0.016; // Approx dt
            if (p.life <= 0) {
                this.game.scene.threeScene.remove(p.mesh);
                this.particles.splice(i, 1);
            } else {
                p.mesh.position.add(p.velocity);
                p.mesh.rotation.x += p.rotSpeed.x;
                p.mesh.rotation.y += p.rotSpeed.y;
                p.mesh.scale.multiplyScalar(0.98); // Shrink slowly instead of growing
                p.mesh.material.opacity = p.life / 2.0; // Fade out based on max life
            }
        }

        if (!this.game.vehicle) return;

        const carPos = this.game.vehicle.getPosition();
        
        this.sensors.forEach(sensor => {
            // Cooldown check
            if (sensor.cooldown > 0) {
                sensor.cooldown--;
                return;
            }

            if (sensor.box.containsPoint(carPos)) {
                this.onCheckpointHit(sensor.index);
                sensor.cooldown = 60; // 1 second cooldown (at 60fps)
            }
        });
    }

    onCheckpointHit(index) {
        const now = performance.now();

        // 1. Handle Start/Finish Line (Index 0)
        if (index === 0) {
            // Debounce Start Line (e.g., 5 seconds) to prevent spamming laps
            if (now - this.lastLapTime < 5000) return;

            if (this.hasStartedRace) {
                this.completeLap();
            } else {
                this.hasStartedRace = true;
                console.log("Race Started!");
            }
            this.lastLapTime = now;
            return;
        }

        // 2. Handle Coins (Index > 0) - Unordered Collection
        if (index > 0) {
            if (this.collectedCoins.has(index)) return; // Already collected

            console.log(`[COIN COLLECTED] Index ${index}`);
            this.collectedCoins.add(index);

            // Update HUD
            if (this.game.hud) {
                this.game.hud.collectCoin();
            }

            // Visuals & Explosion
            if (this.visuals && this.visuals[index]) {
                const v = this.visuals[index];
                if (v.visible) {
                    v.visible = false;
                    this.spawnExplosion(v.position);
                }
            }
        }
    }

    spawnExplosion(pos) {
        // Bigger, slower particle explosion
        const color = 0xffd700; // Gold
        for (let i = 0; i < 40; i++) { // More particles
            const size = 0.3 + Math.random() * 0.3; // Random size 0.3 - 0.6
            const geo = new THREE.BoxGeometry(size, size, size);
            const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            
            // Random rotation
            mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
            
            this.game.scene.threeScene.add(mesh);
            
            this.particles.push({
                mesh: mesh,
                life: 2.0, // Longer life
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.2, // Slower spread
                    (Math.random() - 0.5) * 0.2 + 0.2, // Slight upward bias
                    (Math.random() - 0.5) * 0.2
                ),
                rotSpeed: {
                    x: (Math.random() - 0.5) * 0.1,
                    y: (Math.random() - 0.5) * 0.1
                }
            });
        }
    }

    completeLap() {
        if (this.currentLap <= this.totalLaps) {
            console.log(`LAP ${this.currentLap} COMPLETE!`);
            this.currentLap++;
            
            if (this.currentLap > this.totalLaps) {
                console.log("RACE FINISHED!");
                // Trigger Win State / UI
            }
            
            // Update HUD
            if (this.game.hud) {
                this.game.hud.updateLap(Math.min(this.currentLap, this.totalLaps), this.totalLaps);
            }
        }
    }
}
