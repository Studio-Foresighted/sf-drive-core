export class HUD {
    constructor(game) {
        this.game = game;
        this.container = null;
        this.speedometer = null;
        this.colorPicker = null;
        this.currentColor = '#00ffcc'; // Default Neon Cyan
        
        this.topJumps = []; // Store { id, distance }

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
            font-size: 100px; /* Slightly bigger */
            font-weight: bold;
            color: ${this.currentColor};
            text-shadow: 0 0 10px ${this.currentColor}, 0 0 20px ${this.currentColor};
            margin-bottom: 5px;
        `;
        this.speedometer = document.createElement('span');
        this.speedometer.innerText = '0';
        
        const unit = document.createElement('span');
        unit.innerText = ' KM/H';
        unit.style.fontSize = '30px'; /* Slightly bigger */

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

        // Lap Counter (Top Center)
        this.lapCounter = document.createElement('div');
        this.lapCounter.id = 'lap-counter';
        this.lapCounter.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            font-family: 'Courier New', monospace;
            font-size: 40px;
            font-weight: bold;
            color: white;
            text-shadow: 0 0 10px #00ffcc;
            pointer-events: none;
            text-align: center;
        `;
        this.lapCounter.innerHTML = `LAP <span style="color:#00ffcc">0</span>/3`;
        document.body.appendChild(this.lapCounter);

        // Coin Counter (Below Lap Counter)
        this.coinCounter = document.createElement('div');
        this.coinCounter.id = 'coin-counter';
        this.coinCounter.style.cssText = `
            position: absolute;
            top: 70px;
            left: 50%;
            transform: translateX(-50%);
            font-family: 'Courier New', monospace;
            font-size: 48px; /* Reduced from 96px */
            font-weight: bold;
            color: #ffd700;
            text-shadow: 0 0 10px #ffd700;
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        this.coinsCollected = 0;
        this.coinCounter.innerHTML = `🪙 <span>0</span>`;
        document.body.appendChild(this.coinCounter);

        // Jump Meter Container (Top Right)
        this.jumpList = document.createElement('div');
        this.jumpList.id = 'jump-list';
        this.jumpList.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            pointer-events: none;
        `;
        document.body.appendChild(this.jumpList);

        // Inject CSS for Animation
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes slideIn {
                0% { transform: translateX(100%); opacity: 0; }
                100% { transform: translateX(0); opacity: 1; }
            }
            @keyframes newRecordPulse {
                0% { transform: scale(1); text-shadow: 0 0 10px gold; }
                20% { transform: scale(1.3); text-shadow: 0 0 30px gold, 0 0 50px white; }
                40% { transform: scale(1); text-shadow: 0 0 10px gold; }
                60% { transform: scale(1.1); text-shadow: 0 0 20px gold; }
                100% { transform: scale(1); text-shadow: 0 0 10px gold; }
            }
            .jump-entry {
                font-family: 'Courier New', monospace;
                font-size: 24px;
                font-weight: bold;
                color: white;
                text-shadow: 0 0 5px #000;
                margin-bottom: 5px;
                background: rgba(0, 0, 0, 0.6);
                padding: 5px 15px;
                border-right: 4px solid #555;
                width: 220px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: all 0.3s ease;
            }
            .jump-entry.gold {
                color: #ffd700;
                border-right-color: #ffd700;
                border-bottom: 2px solid rgba(255, 215, 0, 0.3);
            }
            .jump-entry.silver {
                color: #e0e0e0;
                border-right-color: #e0e0e0;
            }
            .jump-entry.bronze {
                color: #cd7f32;
                border-right-color: #cd7f32;
            }
            .jump-entry.record-anim {
                animation: newRecordPulse 1.5s ease-in-out;
                z-index: 10;
            }
        `;
        document.head.appendChild(style);
    }

    addJump(distance) {
        const id = Date.now() + Math.random();
        
        // 1. Add to list
        this.topJumps.push({ id, distance });
        
        // 2. Sort Descending
        this.topJumps.sort((a, b) => b.distance - a.distance);
        
        // 3. Keep Top 3
        if (this.topJumps.length > 3) {
            this.topJumps = this.topJumps.slice(0, 3);
        }

        // 4. Render
        this.renderJumpList(id);
    }

    renderJumpList(newId) {
        this.jumpList.innerHTML = '';
        
        this.topJumps.forEach((jump, index) => {
            const entry = document.createElement('div');
            entry.className = 'jump-entry';
            
            // Rank Styling
            let prefix = `#${index + 1}`;
            if (index === 0) { 
                entry.classList.add('gold');
                prefix = '👑'; 
            } else if (index === 1) {
                entry.classList.add('silver');
            } else if (index === 2) {
                entry.classList.add('bronze');
            }

            entry.innerHTML = `<span>${prefix}</span> <span>${jump.distance.toFixed(1)} M</span>`;
            
            // Animation Logic
            if (jump.id === newId) {
                // If this is the newly added jump
                if (index === 0) {
                    // It's a NEW RECORD!
                    entry.classList.add('record-anim');
                } else {
                    // Just a new entry
                    entry.style.animation = 'slideIn 0.5s ease-out forwards';
                }
            }

            this.jumpList.appendChild(entry);
        });
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

    updateLap(current, total) {
        if (this.lapCounter) {
            this.lapCounter.innerHTML = `LAP <span style="color:#00ffcc">${current}</span>/${total}`;
        }
    }

    collectCoin() {
        this.coinsCollected++;
        if (this.coinCounter) {
            this.coinCounter.innerHTML = `🪙 <span>${this.coinsCollected}</span>`;
            
            // Animation
            this.coinCounter.style.transform = 'translateX(-50%) scale(1.5)';
            setTimeout(() => {
                this.coinCounter.style.transform = 'translateX(-50%) scale(1)';
            }, 200);
        }
    }
}