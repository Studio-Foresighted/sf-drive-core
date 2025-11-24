import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export class VehiclePhysics {
    constructor(physicsWorld, startPos) {
        this.world = physicsWorld.world;
        this.controller = null;
        this.chassisBody = null;
        
        // ==================================================
        // TUNING PARAMETERS
        // ==================================================
        this.tuning = {
            // Chassis
            chassisMass: 1500,
            // COM Offset: Lowering this keeps the car from rolling over.
            // (0, -0.5, 0) effectively puts the weight below the axles.
            chassisCOM: { x: 0, y: -0.5, z: 0 }, 
            
            // Suspension
            // Stiff enough to hold up, soft enough to not jitter.
            suspensionStiffness: 40.0,
            suspensionCompression: 2.5,
            suspensionDamping: 2.5,
            suspensionRestLength: 0.4,
            maxSuspensionTravel: 0.3,
            
            // Grip / Friction
            // FrictionSlip: Forward traction.
            // SideFriction: Lateral grip. Lower = drift, Higher = rail.
            frictionSlip: 3.0, 
            sideFriction: 4.0, // Moderate-High for arcade grip

            // Steering
            maxSteerAngle: 0.6, // ~35 degrees (base max)
            // Speed-dependent steering reduction. We'll use two values:
            // - speedSteerFactorAccel: when the player is holding throttle (gentle steering at speed)
            // - speedSteerFactorCoast: when off-throttle (more responsive)
            speedSteerFactorAccel: 0.04, // stronger reduction when accelerating
            speedSteerFactorCoast: 0.01, // less reduction when coasting/braking
            // High-speed cap: smoothly reduce max steer angle between two speeds (m/s)
            highSpeedSteerStart: 20.0, // start reducing at ~72 km/h
            highSpeedSteerEnd: 33.33,  // fully reduced by ~120 km/h
            highSpeedSteerMinAngle: 0.25, // radians, minimum allowed steer at high speed

            // Engine / Brakes
            maxEngineForce: 18000, // Reverted to stable value (slightly boosted from 15k)
            maxBrakeForce: 3000,
            topSpeed: 150, // km/h - Increased default limit
            // Coasting: Brake force applied when throttle is 0
            coastingBrakeFactor: 0.03, // 3% of max brake (almost zero)
            
            // Damping (Air resistance / Rolling resistance)
            linearDamping: 0.15, // Low damping allows high speed without massive force
            angularDamping: 0.5,
        };

        this.createChassis(startPos);
        this.createVehicleController();
        
        this.wasGrounded = true;
        this.landingGraceTimer = 0;
        this.preLandingSpeed = 0;
    }

    createChassis(pos) {
        // 1. Create RigidBody
        const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(pos.x, pos.y, pos.z)
            .setLinearDamping(this.tuning.linearDamping)
            .setAngularDamping(this.tuning.angularDamping)
            .setCanSleep(false);
        
        this.chassisBody = this.world.createRigidBody(rigidBodyDesc);

        // 2. Create Collider
        // Box shape approx car size (2m wide, 0.6m high, 4.5m long)
        // Reduced height (0.4 -> 0.3 half-extent) to prevent ground scraping on suspension compression
        const colliderDesc = RAPIER.ColliderDesc.cuboid(1.0, 0.3, 2.2)
            .setTranslation(this.tuning.chassisCOM.x, this.tuning.chassisCOM.y + 0.5, this.tuning.chassisCOM.z) 
            .setMass(this.tuning.chassisMass)
            .setFriction(0.0); // Zero friction on chassis to prevent "grabbing" the ground if it bottoms out
        
        this.world.createCollider(colliderDesc, this.chassisBody);
    }

    createVehicleController() {
        this.controller = this.world.createVehicleController(this.chassisBody);

        // Wheel Configuration
        const wheelRadius = 0.35;
        const wheelDir = new RAPIER.Vector3(0, -1, 0);
        const wheelAxle = new RAPIER.Vector3(1, 0, 0);
        
        // Wheel Offsets (Wider track = more stability)
        const xOff = 1.0; 
        const yOff = 0.1; // Mount point relative to chassis center
        const zOff = 1.4;

        // Add 4 Wheels
        // FL, FR, RL, RR
        this.addWheel({ x: xOff, y: yOff, z: -zOff }, wheelRadius, wheelDir, wheelAxle);
        this.addWheel({ x: -xOff, y: yOff, z: -zOff }, wheelRadius, wheelDir, wheelAxle);
        this.addWheel({ x: xOff, y: yOff, z: zOff }, wheelRadius, wheelDir, wheelAxle);
        this.addWheel({ x: -xOff, y: yOff, z: zOff }, wheelRadius, wheelDir, wheelAxle);
    }

    addWheel(pos, radius, dir, axle) {
        this.controller.addWheel(pos, dir, axle, this.tuning.suspensionRestLength, radius);
        const i = this.controller.numWheels() - 1;
        
        // Apply Initial Tuning
        this.controller.setWheelSuspensionStiffness(i, this.tuning.suspensionStiffness);
        this.controller.setWheelMaxSuspensionTravel(i, this.tuning.maxSuspensionTravel);
        this.controller.setWheelSuspensionCompression(i, this.tuning.suspensionCompression);
        this.controller.setWheelSuspensionRelaxation(i, this.tuning.suspensionDamping);
        this.controller.setWheelFrictionSlip(i, this.tuning.frictionSlip);
        // Note: Side friction might need custom handling if Rapier JS doesn't expose it directly on the controller yet,
        // but we assume standard friction covers it for now or use the frictionSlip.
    }

    update(dt, input) {
        if (!this.controller) return;

        // 1. Update Timers
        if (this.landingGraceTimer > 0) {
            this.landingGraceTimer -= dt;
        }

        const speed = this.controller.currentVehicleSpeed(); // m/s
        const speedKmh = speed * 3.6;
        const fwdSpeed = Math.abs(speed);

        // ==================================================
        // 1. STEERING (Speed Dependent)
        // ==================================================
        // Reduce steering based on speed AND throttle state.
        // Choose speedSteerFactor depending on whether the user is holding throttle.
        const isAccelerating = (input.throttle > 0.05);
        const speedSteerFactor = isAccelerating ? this.tuning.speedSteerFactorAccel : this.tuning.speedSteerFactorCoast;

        // steerFactor scales 0..1 (1 at zero speed). Higher factor => more reduction with speed.
        const steerFactor = 1.0 / (1.0 + fwdSpeed * speedSteerFactor);

        // High-speed smooth cap: lerp maxSteerAngle -> highSpeedSteerMinAngle between start/end speeds
        let maxSteer = this.tuning.maxSteerAngle;
        const sStart = this.tuning.highSpeedSteerStart;
        const sEnd = Math.max(this.tuning.highSpeedSteerEnd, sStart + 0.001);
        if (fwdSpeed > sStart) {
            const t = Math.min(1.0, (fwdSpeed - sStart) / (sEnd - sStart));
            // Smoothstep for nicer interpolation
            const smooth = t * t * (3 - 2 * t);
            maxSteer = (1 - smooth) * this.tuning.maxSteerAngle + smooth * this.tuning.highSpeedSteerMinAngle;
        }

        const steerAngle = -input.steering * maxSteer * steerFactor;

        this.controller.setWheelSteering(0, steerAngle);
        this.controller.setWheelSteering(1, steerAngle);

        // ==================================================
        // 2. ENGINE & BRAKES (Coasting Logic)
        // ==================================================
        let engineForce = 0;
        let brakeForce = 0;

        // Check if grounded (any wheel touching)
        let isGrounded = false;
        const numWheels = this.controller.numWheels();
        for (let i = 0; i < numWheels; i++) {
            if (this.controller.wheelIsInContact(i)) {
                isGrounded = true;
                break;
            }
        }

        // AIRBORNE LOGIC: Cache Speed
        if (!isGrounded) {
             // Cache signed forward speed while in air
             this.preLandingSpeed = this.controller.currentVehicleSpeed();
        }

        // LANDING LOGIC: Detect transition from Air -> Ground
        if (!this.wasGrounded && isGrounded) {
            this.landingGraceTimer = 0.35; // 350ms grace window
            const preSpeedKmh = this.preLandingSpeed * 3.6;
            console.log(`[LANDING] Impact. Pre-speed: ${preSpeedKmh.toFixed(1)} km/h`);
            
            // Optional: Keep small kick for initial contact
            // Use absolute speed for kick magnitude calculation
            const absSpeed = Math.abs(this.preLandingSpeed);
            if (absSpeed > 5.0) {
                const rot = this.chassisBody.rotation();
                const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
                const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
                
                // Kick in the direction of travel (sign of preLandingSpeed)
                const sign = Math.sign(this.preLandingSpeed);
                const kickFactor = 0.2; 
                const impulseMag = absSpeed * this.tuning.chassisMass * kickFactor * sign;
                
                this.chassisBody.applyImpulse({ x: fwd.x * impulseMag, y: 0, z: fwd.z * impulseMag }, true);
            }
        } else if (this.wasGrounded && !isGrounded) {
            console.log(`[AIRBORNE] Speed: ${speedKmh.toFixed(1)} km/h`);
        }
        this.wasGrounded = isGrounded;

        const isGracePeriod = (this.landingGraceTimer > 0 && isGrounded && input.throttle > 0.05);

        if (input.throttle !== 0) {
            // Accelerating / Reversing
            // Invert throttle because Rapier vehicle forward might be -Z
            engineForce = -input.throttle * this.tuning.maxEngineForce;
            
            // Top Speed Limiter (Soft Cut)
            // SKIP if in grace period to prevent power cut on landing
            if (!isGracePeriod && speedKmh > this.tuning.topSpeed) {
                // If going faster than top speed, cut engine force smoothly
                const excess = speedKmh - this.tuning.topSpeed;
                // Reduce force by 10% per km/h over limit
                const reduction = Math.min(1.0, excess * 0.1); 
                engineForce *= (1.0 - reduction);
            }

            brakeForce = 0;
        } else {
            // Coasting
            engineForce = 0;
            
            if (isGrounded) {
                // Normal coasting on ground
                brakeForce = this.tuning.maxBrakeForce * this.tuning.coastingBrakeFactor;
            } else {
                // In Air: No braking! Let wheels spin to preserve momentum on landing
                brakeForce = 0;
            }
        }

        // Manual Brake Override
        if (input.brake) {
            brakeForce = this.tuning.maxBrakeForce;
            engineForce = 0;
        }

        // GRACE PERIOD OVERRIDES
        if (isGracePeriod) {
            // Force brake to 0 to prevent landing friction slowdown
            brakeForce = 0;
            
            // Velocity Clamp / Restoration
            // If we are significantly slower than pre-landing speed, boost us.
            // Threshold: 10 km/h (~2.7 m/s) to avoid boosting when stopped
            const preSpeedMag = Math.abs(this.preLandingSpeed);
            const curSpeedMag = Math.abs(speed); // speed is signed m/s from controller

            if (preSpeedMag > 2.7) {
                const minMag = preSpeedMag * 0.8;
                if (curSpeedMag < minMag) {
                    // We lost too much speed! Apply correction.
                    const linvel = this.chassisBody.linvel();
                    const rot = this.chassisBody.rotation();
                    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
                    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
                    
                    // Restore speed in the original direction
                    const sign = Math.sign(this.preLandingSpeed);
                    const targetSpeed = sign * minMag;

                    // New Velocity
                    const newVel = fwd.clone().multiplyScalar(targetSpeed);
                    newVel.y = linvel.y; // Keep vertical velocity (gravity/bounce)
                    
                    this.chassisBody.setLinvel({ x: newVel.x, y: newVel.y, z: newVel.z }, true);
                    
                    console.log(`[LANDING CLAMP] Boosted ${speedKmh.toFixed(1)} -> ${(targetSpeed*3.6).toFixed(1)} km/h`);
                }
            }
        }

        // Apply to Rear Wheels (RWD)
        this.controller.setWheelEngineForce(2, engineForce);
        this.controller.setWheelEngineForce(3, engineForce);

        // Apply Brakes to All Wheels
        for (let i = 0; i < 4; i++) {
            this.controller.setWheelBrake(i, brakeForce);
        }

        // ==================================================
        // 3. STABILITY (Anti-Spin / Yaw Clamp)
        // ==================================================
        // Optional: Clamp angular velocity to prevent uncontrollable spins
        const angVel = this.chassisBody.angvel();
        const maxYawRate = 2.5; // rad/s
        if (Math.abs(angVel.y) > maxYawRate) {
            this.chassisBody.setAngvel({
                x: angVel.x,
                y: Math.sign(angVel.y) * maxYawRate,
                z: angVel.z
            }, true);
        }
        
        // Step the vehicle controller
        this.controller.updateVehicle(dt);
    }

    getPosition() {
        const t = this.chassisBody.translation();
        return new THREE.Vector3(t.x, t.y, t.z);
    }

    getRotation() {
        const r = this.chassisBody.rotation();
        return new THREE.Quaternion(r.x, r.y, r.z, r.w);
    }
    
    // Helper for UI Tuning
    updateTuning(newValues) {
        this.tuning = { ...this.tuning, ...newValues };
        // Re-apply wheel params
        for (let i = 0; i < this.controller.numWheels(); i++) {
            this.controller.setWheelSuspensionStiffness(i, this.tuning.suspensionStiffness);
            this.controller.setWheelSuspensionRelaxation(i, this.tuning.suspensionDamping);
            this.controller.setWheelFrictionSlip(i, this.tuning.frictionSlip);
        }
        // Re-apply body params
        this.chassisBody.setLinearDamping(this.tuning.linearDamping);
        this.chassisBody.setAngularDamping(this.tuning.angularDamping);
    }
    
    resetTuning() {
        // Reset logic would go here
    }
}