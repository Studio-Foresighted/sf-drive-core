export class Time {
    constructor() {
        this.lastTime = performance.now();
        this.delta = 0;
        this.elapsed = 0;
    }

    update() {
        const now = performance.now();
        this.delta = (now - this.lastTime) / 1000; // Seconds
        this.lastTime = now;
        this.elapsed += this.delta;
        
        // Cap delta to prevent huge jumps (e.g. tab switch)
        if (this.delta > 0.1) this.delta = 0.1;
    }
}