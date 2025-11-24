export class InputController {
    constructor(onKeyDown) {
        this.keys = {
            w: false, a: false, s: false, d: false,
            arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
            space: false, shift: false
        };
        this.onKeyDownCallback = onKeyDown;

        window.addEventListener('keydown', (e) => this.onKey(e, true));
        window.addEventListener('keyup', (e) => this.onKey(e, false));
    }

    onKey(e, isDown) {
        const key = e.key.toLowerCase();
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = isDown;
        }
        if (key === ' ') this.keys.space = isDown;
        if (e.key === 'Shift') this.keys.shift = isDown;

        if (isDown && this.onKeyDownCallback) {
            this.onKeyDownCallback(key);
        }
    }

    getControlState() {
        // Combine WASD and Arrows
        const forward = this.keys.w || this.keys.arrowup;
        const backward = this.keys.s || this.keys.arrowdown;
        const left = this.keys.a || this.keys.arrowleft;
        const right = this.keys.d || this.keys.arrowright;
        const brake = this.keys.space;

        let throttle = 0;
        if (forward) throttle += 1;
        if (backward) throttle -= 1;

        let steering = 0;
        if (left) steering += 1;
        if (right) steering -= 1;

        return {
            throttle, // -1 to 1
            steering, // -1 (right) to 1 (left) - Note: standard is usually left=+1, right=-1 or vice versa. Let's say Left=+1
            brake: brake ? 1 : 0
        };
    }
}