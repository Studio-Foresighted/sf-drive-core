export class HUD {
    constructor(game) {
        this.game = game;
        this.container = null;
        this.speedometer = null;
        this.colorPicker = null;
        this.currentColor = '#00ffcc'; // Default Neon Cyan

        this.initUI();
    }

    initUI() {
        this.container = document.createElement('div');
        this.container.id = 'hud';
        this.container.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            font-family: 'Courier New', monospace;
            pointer-events: none; /* Let clicks pass through mostly */
        `;

        // Speedometer Container
        const speedBox = document.createElement('div');
        speedBox.style.cssText = `
            font-size: 80px;
            font-weight: bold;
            color: ${this.currentColor};
            text-shadow: 0 0 10px ${this.currentColor}, 0 0 20px ${this.currentColor};
            margin-bottom: 5px;
        `;
        this.speedometer = document.createElement('span');
        this.speedometer.innerText = '0';
        
        const unit = document.createElement('span');
        unit.innerText = ' KM/H';
        unit.style.fontSize = '24px';

        speedBox.appendChild(this.speedometer);
        speedBox.appendChild(unit);

        // Color Picker (Small Icon)
        const pickerContainer = document.createElement('div');
        pickerContainer.style.pointerEvents = 'auto'; // Enable clicking
        
        const pickerLabel = document.createElement('label');
        pickerLabel.innerText = '🎨';
        pickerLabel.style.cssText = `
            cursor: pointer;
            font-size: 20px;
            background: rgba(0,0,0,0.5);
            padding: 5px;
            border-radius: 5px;
        `;
        
        this.colorPicker = document.createElement('input');
        this.colorPicker.type = 'color';
        this.colorPicker.value = this.currentColor;
        this.colorPicker.style.cssText = `
            visibility: hidden; 
            width: 0; height: 0;
        `;
        this.colorPicker.onchange = (e) => this.updateColor(e.target.value);

        pickerLabel.appendChild(this.colorPicker);
        pickerContainer.appendChild(pickerLabel);

        this.container.appendChild(speedBox);
        this.container.appendChild(pickerContainer);
        document.body.appendChild(this.container);
    }

    updateColor(color) {
        this.currentColor = color;
        const speedBox = this.speedometer.parentElement;
        speedBox.style.color = color;
        speedBox.style.textShadow = `0 0 10px ${color}, 0 0 20px ${color}`;
    }

    update() {
        if (!this.game.vehicle || !this.game.vehicle.controller) return;

        const speed = this.game.vehicle.controller.currentVehicleSpeed(); // m/s
        // Real speed might be too high for arcade feel, let's scale it down visually
        // or just use raw kmh. 
        // If it feels "too fast", it means the physics units (meters) are large relative to car.
        // Let's dampen the display value slightly to feel more "weighty".
        const kmh = Math.abs(Math.round(speed * 2.5)); // Reduced multiplier from 3.6
        
        this.speedometer.innerText = kmh;
    }
}