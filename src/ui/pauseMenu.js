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
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(5, 5, 5, 0.9);
            color: #ecf0f1;
            font-family: 'Courier New', Courier, monospace;
            z-index: 1000;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            user-select: none;
        `;

        // --- MAIN MENU VIEW ---
        this.mainMenu = document.createElement('div');
        this.mainMenu.style.cssText = `
            display: flex; flex-direction: column; align-items: center; width: 100%; height: 100%; justify-content: center; position: relative;
        `;

        // Title
        const title = document.createElement('h1');
        title.innerText = 'PAUSED';
        title.style.cssText = `
            font-size: 4rem; margin: 0 0 20px 0; letter-spacing: 10px; text-shadow: 4px 4px 0px #000; color: #fff;
        `;
        this.mainMenu.appendChild(title);

        // Keybindings
        const keysContainer = document.createElement('div');
        keysContainer.style.cssText = `
            background: rgba(0,0,0,0.5); padding: 20px; border: 1px solid #444; margin-bottom: 30px; text-align: center;
        `;
        keysContainer.innerHTML = `
            <div style="margin-bottom: 10px; color: #f1c40f; letter-spacing: 2px;">CONTROLS</div>
            <div style="display: grid; grid-template-columns: 100px 1fr; gap: 10px; text-align: left; font-size: 1.1rem;">
                <span style="color: #888;">WASD</span> <span>FORWARD / BACK / STEER</span>
                <span style="color: #888;">SPACE</span> <span>BRAKE</span>
                <span style="color: #888;">R</span> <span>RESET CAR</span>
                <span style="color: #888;">P</span> <span>RESET TO START</span>
            </div>
        `;
        this.mainMenu.appendChild(keysContainer);

        // Buttons
        const btnStyle = `
            padding: 15px 40px; font-size: 1.2rem; background: transparent; color: #f1c40f;
            border: 2px solid #f1c40f; font-family: inherit; cursor: pointer; text-transform: uppercase;
            letter-spacing: 2px; margin: 10px; transition: all 0.2s; width: 250px;
        `;

        const settingsBtn = document.createElement('button');
        settingsBtn.innerText = 'CAR SETTINGS';
        settingsBtn.style.cssText = btnStyle;
        settingsBtn.onmouseover = () => { settingsBtn.style.background = '#f1c40f'; settingsBtn.style.color = '#000'; };
        settingsBtn.onmouseout = () => { settingsBtn.style.background = 'transparent'; settingsBtn.style.color = '#f1c40f'; };
        settingsBtn.onclick = () => this.showSettings();
        this.mainMenu.appendChild(settingsBtn);

        const resumeBtn = document.createElement('button');
        resumeBtn.innerText = 'RESUME';
        resumeBtn.style.cssText = btnStyle;
        resumeBtn.onmouseover = () => { resumeBtn.style.background = '#f1c40f'; resumeBtn.style.color = '#000'; };
        resumeBtn.onmouseout = () => { resumeBtn.style.background = 'transparent'; resumeBtn.style.color = '#f1c40f'; };
        resumeBtn.onclick = () => this.toggle();
        this.mainMenu.appendChild(resumeBtn);

        // --- TUTORIAL OVERLAYS (Arrows) ---
        // Top Left Arrow (Garage)
        const tlArrow = document.createElement('div');
        tlArrow.style.cssText = `
            position: absolute; top: 180px; left: 60px; display: flex; align-items: flex-start;
        `;
        tlArrow.innerHTML = `
            <div style="font-size: 80px; color: #f1c40f; transform: rotate(-45deg); margin-right: 20px; line-height: 60px;">&uarr;</div>
            <div style="max-width: 300px; text-align: left;">
                <div style="color: #f1c40f; font-weight: bold; margin-bottom: 5px; font-size: 1.5rem;">GARAGE</div>
                <div style="font-size: 1.2rem; color: #ccc;">CHANGE CAR / VIEW MODEL</div>
            </div>
        `;
        this.mainMenu.appendChild(tlArrow);

        // Bottom Right Arrow (HUD)
        const brArrow = document.createElement('div');
        brArrow.style.cssText = `
            position: absolute; bottom: 150px; right: 60px; display: flex; align-items: flex-end; flex-direction: column;
        `;
        brArrow.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <div style="max-width: 300px; text-align: right; margin-right: 20px;">
                    <div style="color: #f1c40f; font-weight: bold; margin-bottom: 5px; font-size: 1.5rem;">DASHBOARD</div>
                    <div style="font-size: 1.2rem; color: #ccc;">SPEEDOMETER & COLOR PALETTE</div>
                </div>
                <div style="font-size: 80px; color: #f1c40f; transform: rotate(45deg); line-height: 60px;">&darr;</div>
            </div>
        `;
        this.mainMenu.appendChild(brArrow);

        this.uiContainer.appendChild(this.mainMenu);

        // --- SETTINGS MENU VIEW ---
        this.settingsMenu = document.createElement('div');
        this.settingsMenu.style.cssText = `
            display: none; flex-direction: column; align-items: center; width: 100%; height: 100%; justify-content: center;
        `;

        const settingsTitle = document.createElement('h2');
        settingsTitle.innerText = 'TUNING';
        settingsTitle.style.cssText = `
            font-size: 2.5rem; margin-bottom: 20px; letter-spacing: 5px; color: #f1c40f;
        `;
        this.settingsMenu.appendChild(settingsTitle);

        // Form Container (Scrollable)
        const form = document.createElement('div');
        form.style.cssText = `
            background: rgba(0,0,0,0.5); padding: 20px; border: 1px solid #444;
            max-height: 60vh; overflow-y: auto; width: 500px; margin-bottom: 20px;
        `;

        this.params.forEach(p => {
            const row = document.createElement('div');
            row.style.marginBottom = '15px';
            
            const labelRow = document.createElement('div');
            labelRow.style.display = 'flex';
            labelRow.style.justifyContent = 'space-between';
            labelRow.style.marginBottom = '5px';
            
            const label = document.createElement('label');
            label.innerText = p.label;
            label.style.color = '#ecf0f1';
            label.style.fontWeight = 'bold';
            
            const valDisplay = document.createElement('span');
            valDisplay.innerText = p.defaultValue;
            valDisplay.style.color = '#f1c40f';
            
            labelRow.appendChild(label);
            labelRow.appendChild(valDisplay);
            row.appendChild(labelRow);

            const input = document.createElement('input');
            input.type = 'range';
            input.id = `input-${p.key}`;
            input.min = p.min;
            input.max = p.max;
            input.step = (p.max - p.min) / 100;
            input.value = p.defaultValue;
            input.style.width = '100%';
            input.style.accentColor = '#f1c40f'; // Modern browser support
            
            input.oninput = (e) => {
                const val = parseFloat(e.target.value);
                valDisplay.innerText = val.toFixed(2);
                this.updatePhysics(p.key, val);
            };

            const desc = document.createElement('div');
            desc.innerText = p.desc;
            desc.style.fontSize = '0.8rem';
            desc.style.color = '#888';
            desc.style.marginTop = '2px';

            row.appendChild(input);
            row.appendChild(desc);
            form.appendChild(row);
        });
        this.settingsMenu.appendChild(form);

        const backBtn = document.createElement('button');
        backBtn.innerText = 'BACK';
        backBtn.style.cssText = btnStyle;
        backBtn.onmouseover = () => { backBtn.style.background = '#f1c40f'; backBtn.style.color = '#000'; };
        backBtn.onmouseout = () => { backBtn.style.background = 'transparent'; backBtn.style.color = '#f1c40f'; };
        backBtn.onclick = () => this.showMain();
        this.settingsMenu.appendChild(backBtn);

        this.uiContainer.appendChild(this.settingsMenu);
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

    updatePhysics(key, value) {
        if (this.game.vehicle) {
            this.game.vehicle.updateTuning({ [key]: value });
        }
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

    showSettings() {
        this.mainMenu.style.display = 'none';
        this.settingsMenu.style.display = 'flex';
    }

    showMain() {
        this.settingsMenu.style.display = 'none';
        this.mainMenu.style.display = 'flex';
    }
}