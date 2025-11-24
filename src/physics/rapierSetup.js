import RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
    constructor() {
        this.world = null;
        this.eventQueue = null;
        this.initialized = false;
    }

    async init() {
        await RAPIER.init();
        
        // Gravity -9.81 on Y axis
        const gravity = { x: 0.0, y: -9.81, z: 0.0 };
        this.world = new RAPIER.World(gravity);
        this.eventQueue = new RAPIER.EventQueue();
        
        this.initialized = true;
        console.log("Rapier Physics Initialized");
    }

    step(dt) {
        if (!this.initialized) return;
        
        // Rapier usually expects fixed timestep, but for prototype we can step with dt
        // Ideally, use a fixed accumulator. For now, simple step.
        this.world.timestep = dt;
        this.world.step(this.eventQueue);
    }
}