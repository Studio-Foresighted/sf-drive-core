export class PauseMenu {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.uiContainer = null;
        
        // User-friendly parameter mapping
        this.params = [
            { 
                key: 'suspensionStiffness', 
                label: 'Suspension Hardness', 
                desc: 'How hard the springs are. Higher = stiffer ride, less body roll.',
                min: 10, max: 200, defaultValue: 40.0
            },
            { 
                key: 'suspensionDamping', 
                label: 'Bounce Control', 
                desc: 'How quickly the car stops bouncing after a bump. Higher = less bounce.',
                min: 0.1, max: 10, defaultValue: 2.5
            },
            { 
                key: 'suspensionRestLength', 
                label: 'Ride Height', 
                desc: 'Distance from wheel to body. Higher = taller car (monster truck).',
                min: 0.1, max: 1.0, defaultValue: 0.3
            },
            { 
                key: 'friction', 
                label: 'Tire Grip', 
                desc: 'Forward traction. Higher = faster acceleration, less wheel spin.',
                min: 0.5, max: 5.0, defaultValue: 2.5
            },
            { 
                key: 'sideFriction', 
                label: 'Drift Control', 
                desc: 'Sideways grip. Lower = more drifting. Higher = stuck to road (can flip).',
                min: 0.5, max: 5.0, defaultValue: 2.0
            },
            { 
                key: 'antiRollStiffness', 
                label: 'Corner Stability', 
                desc: 'Force that keeps car level in turns. Higher = flat cornering, less flipping.',
                min: 0, max: 50000, defaultValue: 10000.0
            },
            { 
                key: 'maxSteerAngle', 
                label: 'Turning Sharpness', 
                desc: 'How far the wheels turn. Higher = tighter circles.',
                min: 0.1, max: 1.0, defaultValue: 0.7
            },
            { 
                key: 'maxEngineForce', 
                label: 'Engine Power', 
                desc: 'Force applied to wheels. Higher = faster accel.',
                min: 1000, max: 30000, defaultValue: 15000
            },
            { 
                key: 'topSpeed', 
                label: 'Top Speed (km/h)', 
                desc: 'Maximum speed limiter.',
                min: 50, max: 300, defaultValue: 120
            },
            { 
                key: 'coastingBrakeFactor', 
                label: 'Coasting Drag', 
                desc: 'Braking when throttle released (0-1).',
                min: 0.0, max: 0.5, defaultValue: 0.03
            }
        ];

        this.initUI();
        this.setupEvents();
    }

    initUI() {
        // Create Overlay
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'pause-menu';
        this.uiContainer.style.cssText = `
            display: none;
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            font-family: sans-serif;
            z-index: 1000;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        `;

        // Title
        const title = document.createElement('h1');
        title.innerText = 'PAUSED - Car Tuning';
        title.style.marginBottom = '20px';
        this.uiContainer.appendChild(title);

        // Form Container
        const form = document.createElement('div');
        form.style.cssText = `
            background: #222;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #444;
            max-height: 80vh;
            overflow-y: auto;
            width: 500px;
        `;

        // Generate Inputs
        this.params.forEach(p => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;';

            // Label + Info
            const labelGroup = document.createElement('div');
            labelGroup.style.display = 'flex';
            labelGroup.style.alignItems = 'center';
            
            const label = document.createElement('label');
            label.innerText = p.label;
            label.style.fontWeight = 'bold';
            label.style.marginRight = '10px';

            // Info Icon with Tooltip
            const info = document.createElement('span');
            info.innerText = 'ⓘ';
            info.style.cssText = 'cursor: help; color: #00aaff; font-size: 14px; position: relative;';
            info.title = p.desc; // Native tooltip for simplicity

            labelGroup.appendChild(label);
            labelGroup.appendChild(info);

            // Input
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.1';
            input.id = `input-${p.key}`;
            input.value = p.defaultValue; // Set default initially
            input.style.cssText = 'width: 80px; padding: 5px; background: #333; color: white; border: 1px solid #555;';
            
            row.appendChild(labelGroup);
            row.appendChild(input);
            form.appendChild(row);
        });

        // Buttons
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top: 20px; display: flex; justify-content: space-between;';

        const applyBtn = document.createElement('button');
        applyBtn.innerText = 'Apply Changes';
        applyBtn.style.cssText = 'padding: 10px 20px; background: #28a745; color: white; border: none; cursor: pointer; font-weight: bold;';
        applyBtn.onclick = () => this.applySettings();

        const defaultBtn = document.createElement('button');
        defaultBtn.innerText = 'Reset Defaults';
        defaultBtn.style.cssText = 'padding: 10px 20px; background: #dc3545; color: white; border: none; cursor: pointer;';
        defaultBtn.onclick = () => this.resetDefaults();

        const closeBtn = document.createElement('button');
        closeBtn.innerText = 'Resume (ESC)';
        closeBtn.style.cssText = 'padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer;';
        closeBtn.onclick = () => this.toggle();

        btnRow.appendChild(defaultBtn);
        btnRow.appendChild(applyBtn);
        btnRow.appendChild(closeBtn);
        form.appendChild(btnRow);

        this.uiContainer.appendChild(form);
        document.body.appendChild(this.uiContainer);
    }

    setupEvents() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Don't toggle if garage preview is open
                if (this.game.garage && this.game.garage.isPreviewOpen()) return;
                this.toggle();
            }
        });
    }

    toggle() {
        // Prevent toggling if game hasn't started or vehicle isn't ready
        if (!this.game.vehicle) return;

        this.visible = !this.visible;
        this.uiContainer.style.display = this.visible ? 'flex' : 'none';
        this.game.paused = this.visible;

        if (this.visible) {
            this.loadCurrentValues();
        }
    }

    loadCurrentValues() {
        const tuning = this.game.vehicle ? this.game.vehicle.tuning : {};
        
        this.params.forEach(p => {
            const input = document.getElementById(`input-${p.key}`);
            if (input) {
                // Use vehicle tuning if available, otherwise fallback to default
                const val = (tuning[p.key] !== undefined) ? tuning[p.key] : p.defaultValue;
                input.value = val;
            }
        });
    }

    applySettings() {
        if (!this.game.vehicle) return;
        
        const newTuning = {};
        this.params.forEach(p => {
            const input = document.getElementById(`input-${p.key}`);
            if (input) {
                newTuning[p.key] = parseFloat(input.value);
            }
        });

        this.game.vehicle.updateTuning(newTuning);
        
        // Visual feedback
        const btn = document.querySelector('button'); // Hacky, but works for now
        // alert("Settings Applied!"); // Too intrusive
    }

    resetDefaults() {
        if (this.game.vehicle) {
            this.game.vehicle.resetTuning();
        }
        // Reload values (will pick up defaults if vehicle reset worked, or static defaults if no vehicle)
        this.loadCurrentValues();
    }
}