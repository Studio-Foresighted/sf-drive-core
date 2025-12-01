import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class MapEditor {
    constructor(game) {
        this.game = game;
        this.active = false;
        this.camera = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Data
        this.checkpoints = []; // Array of Vector3
        this.ramps = []; // Array of { pos: Vector3, rotation: number }
        
        // Visuals
        this.visuals = []; // Array of Meshes (Checkpoints)
        this.rampVisuals = []; // Array of Meshes (Ramps)
        this.lines = null; // Line object connecting points

        // Assets
        this.coinModel = null;
        this.loadAssets();

        // Editor State
        this.mode = 'CHECKPOINT'; // 'CHECKPOINT' | 'RAMP'
        this.rampRotation = 0; // Current rotation in radians
        this.cursor = null; // Visual cursor for checkpoints
        this.rampPreview = null; // Visual cursor for ramps
        this.defaultY = -2.0; // Default Y for track (Updated based on user request)
        this.overrideY = true; // Force Y by default to prevent floating ramps

        this.initCamera();
        this.setupInput();
        this.createCursors();
        this.createNotificationUI();
    }

    createNotificationUI() {
        this.notification = document.createElement('div');
        this.notification.style.cssText = `
            position: fixed; top: 150px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); color: #00ffcc; padding: 10px 20px;
            border-radius: 5px; font-family: monospace; font-size: 1rem;
            pointer-events: none; opacity: 0; transition: opacity 0.5s; z-index: 2000;
        `;
        document.body.appendChild(this.notification);
    }

    showNotification(msg) {
        this.notification.innerText = msg;
        this.notification.style.opacity = 1;
        setTimeout(() => {
            this.notification.style.opacity = 0;
        }, 3000);
    }

    loadAssets() {
        const loader = new GLTFLoader();
        loader.load('./assets/models/kr-coin.glb', (gltf) => {
            this.coinModel = gltf.scene;
            // Scale it appropriately
            this.coinModel.scale.set(2, 2, 2);
            
            // Tune Materials
            this.tuneCoinMaterials(this.coinModel);

            console.log("Coin Model Loaded Successfully");
            
            // Refresh visuals if any exist
            if (this.visuals.length > 0) {
                this.refreshVisuals();
            }
        }, undefined, (error) => {
            console.error("Error loading Coin Model:", error);
            // Create a fallback placeholder (Gold Cylinder)
            const geo = new THREE.CylinderGeometry(1, 1, 0.2, 32);
            geo.rotateX(Math.PI / 2); // Face camera
            const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.3 });
            this.coinModel = new THREE.Mesh(geo, mat);
            this.coinModel.name = "CoinFallback";
            console.log("Created Fallback Coin Model");
        });
    }

    tuneCoinMaterials(root) {
        root.traverse((child) => {
            if (child.isMesh) {
                // Ensure we use Standard Material for PBR
                if (!(child.material instanceof THREE.MeshStandardMaterial)) {
                    // Convert to Standard if possible, or just create new
                    const oldColor = child.material.color || new THREE.Color(0xffd700);
                    child.material = new THREE.MeshStandardMaterial({
                        color: oldColor
                    });
                }
                
                // Lower metalness and adjust roughness as requested
                child.material.metalness = 0.6; // Reduced to allow more diffuse color
                child.material.roughness = 0.3; 
                
                // Add Emissive to make it glow/pop
                child.material.emissive = new THREE.Color(0x443300); // Subtle gold glow
                child.material.emissiveIntensity = 0.5;

                // Ensure envMap intensity is sufficient if scene has one
                child.material.envMapIntensity = 1.0;
                
                console.log(`Tuned Coin Material: Metalness=${child.material.metalness}, Emissive=${child.material.emissive.getHexString()}`);
            }
        });
    }

    refreshVisuals() {
        // Clear existing visuals
        this.visuals.forEach(m => this.game.scene.threeScene.remove(m));
        this.visuals = [];
        
        // Re-add them
        this.checkpoints.forEach((pos, i) => {
            this.addCheckpointVisual(pos, i);
        });
    }

    createCursors() {
        // Checkpoint Cursor
        const geo = new THREE.RingGeometry(1, 1.5, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        this.cursor = new THREE.Mesh(geo, mat);
        this.cursor.rotation.x = -Math.PI / 2;
        this.cursor.visible = false;

        // Ramp Preview Cursor
        const rampGeo = new THREE.BoxGeometry(10, 2, 15); // Approximate ramp size
        const rampMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
        this.rampPreview = new THREE.Mesh(rampGeo, rampMat);
        this.rampPreview.visible = false;

        // Add Direction Arrow to Ramp Preview
        // Points along +Z (Forward for the ramp)
        const dir = new THREE.Vector3(0, 0, 1);
        const origin = new THREE.Vector3(0, 3, 0); // Above the box
        const length = 8;
        const hex = 0xff0000; // Red Arrow
        const arrowHelper = new THREE.ArrowHelper(dir, origin, length, hex);
        this.rampPreview.add(arrowHelper);
    }

    initCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        const d = 300;
        this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
        this.camera.position.set(0, 200, 0);
        this.camera.lookAt(0, 0, 0);
        this.camera.rotation.z = Math.PI; 
    }

    setupInput() {
        window.addEventListener('mousemove', (e) => {
            if (!this.active) return;
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        window.addEventListener('mousedown', (e) => {
            if (!this.active) return;
            // Shift + Click to place
            if (e.shiftKey && e.button === 0) {
                this.placeObject();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (!this.active) return;
            if (e.key.toLowerCase() === 'r') {
                this.rotateRamp();
            }
        });
        
        this.createUI();
    }

    createUI() {
        this.uiOverlay = document.createElement('div');
        this.uiOverlay.style.cssText = `
            display: none; position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); padding: 15px 30px; border-radius: 15px;
            color: #f1c40f; font-family: monospace; font-size: 1rem; pointer-events: auto;
            text-align: center; border: 2px solid #f1c40f; z-index: 1000;
        `;
        
        // Header
        const header = document.createElement('div');
        header.innerHTML = '<strong>MAP EDITOR</strong><br><span style="font-size:0.8em; color:#ccc">SHIFT+CLICK to Place | R to Rotate</span>';
        this.uiOverlay.appendChild(header);

        // Controls Container
        const controls = document.createElement('div');
        controls.style.marginTop = '10px';
        controls.style.display = 'flex';
        controls.style.gap = '10px';
        controls.style.justifyContent = 'center';
        this.uiOverlay.appendChild(controls);

        // Mode Toggle
        this.modeBtn = this.createButton('Mode: CHECKPOINT', () => this.toggleMode());
        controls.appendChild(this.modeBtn);

        // Y-Axis Control
        const yContainer = document.createElement('div');
        yContainer.style.display = 'flex';
        yContainer.style.alignItems = 'center';
        yContainer.style.gap = '5px';
        yContainer.style.color = '#fff';
        
        const yLabel = document.createElement('span');
        yLabel.innerText = 'Y:';
        
        this.yInput = document.createElement('input');
        this.yInput.type = 'number';
        this.yInput.value = this.defaultY;
        this.yInput.step = '0.1';
        this.yInput.style.width = '60px';
        this.yInput.style.background = '#333';
        this.yInput.style.color = '#fff';
        this.yInput.style.border = '1px solid #666';
        
        // Use oninput for immediate update
        this.yInput.oninput = (e) => {
            this.defaultY = parseFloat(e.target.value);
            this.overrideY = true;
            this.yCheckbox.checked = true;
            this.yInput.style.color = '#fff';
        };

        // Checkbox to toggle override
        this.yCheckbox = document.createElement('input');
        this.yCheckbox.type = 'checkbox';
        this.yCheckbox.checked = this.overrideY;
        this.yCheckbox.title = "Force Y Height";
        this.yCheckbox.onchange = (e) => {
            this.overrideY = e.target.checked;
            if (this.overrideY) {
                this.yInput.style.color = '#fff';
                this.showNotification(`Y-Axis Forced: ${this.defaultY}`);
            } else {
                this.yInput.style.color = '#888';
                this.showNotification("Y-Axis: Auto (Raycast)");
            }
        };

        yContainer.appendChild(yLabel);
        yContainer.appendChild(this.yInput);
        yContainer.appendChild(this.yCheckbox);
        controls.appendChild(yContainer);

        // Save/Load/Reset
        controls.appendChild(this.createButton('SAVE', () => this.saveMap()));
        controls.appendChild(this.createButton('LOAD', () => this.loadMap()));
        controls.appendChild(this.createButton('RESET', () => this.resetMap()));

        // Exit Button
        this.closeBtn = document.createElement('button');
        this.closeBtn.innerText = "EXIT EDITOR";
        this.closeBtn.style.cssText = `
            display: none; position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            padding: 15px 40px; background: #e74c3c; color: white; border: none; font-weight: bold;
            cursor: pointer; font-family: monospace; font-size: 1.2rem; border-radius: 5px; z-index: 1000;
        `;
        this.closeBtn.onclick = () => this.toggle();

        document.body.appendChild(this.uiOverlay);
        // Hidden file input for uploads
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.json,application/json';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = (e) => this.handleFileUpload(e);
        document.body.appendChild(this.fileInput);
        document.body.appendChild(this.closeBtn);
    }

    createButton(text, onClick) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.cssText = `
            background: #333; color: white; border: 1px solid #666; padding: 5px 10px;
            cursor: pointer; font-family: monospace; font-size: 0.9rem;
        `;
        btn.onclick = onClick;
        return btn;
    }

    toggleMode() {
        this.mode = this.mode === 'CHECKPOINT' ? 'RAMP' : 'CHECKPOINT';
        this.modeBtn.innerText = `Mode: ${this.mode}`;
    }

    rotateRamp() {
        const deg = 20;
        const rad = deg * (Math.PI / 180);
        this.rampRotation += rad; 
        // Normalize to 0..2PI
        this.rampRotation = this.rampRotation % (Math.PI * 2);
        
        if (this.rampPreview) {
            this.rampPreview.rotation.y = this.rampRotation;
        }
        this.showNotification(`Rotation: ${(this.rampRotation * 180 / Math.PI).toFixed(0)}°`);
    }

    toggle() {
        this.active = !this.active;
        
        if (this.active) {
            console.log("MAP EDITOR: ACTIVE.");
            this.game.paused = true;
            if (this.game.pauseMenu) this.game.pauseMenu.uiContainer.style.display = 'none';
            
            this.uiOverlay.style.display = 'block';
            this.closeBtn.style.display = 'block';
            
            this.game.scene.threeScene.add(this.cursor);
            this.game.scene.threeScene.add(this.rampPreview);
            
            // Show Editor Visuals
            this.visuals.forEach(m => m.visible = true);
            this.rampVisuals.forEach(m => m.visible = true);
            if (this.lines) this.lines.visible = true;

            // Try to load existing map if empty
            if (this.checkpoints.length === 0 && this.ramps.length === 0) {
                this.loadMap(true); // Silent load
            }

        } else {
            console.log("MAP EDITOR: CLOSED.");
            this.game.paused = false;
            
            this.uiOverlay.style.display = 'none';
            this.closeBtn.style.display = 'none';
            
            this.game.scene.threeScene.remove(this.cursor);
            this.game.scene.threeScene.remove(this.rampPreview);

            // Remove Editor Visuals so we don't have duplicates
            // The real physics objects will be created by applyChanges()
            this.visuals.forEach(m => this.game.scene.threeScene.remove(m));
            this.rampVisuals.forEach(m => this.game.scene.threeScene.remove(m));
            // Note: We keep the data in this.visuals/rampVisuals so we can restore them when opening editor again
            // But wait, if we remove them from scene, we need to add them back when opening.
            // Actually, let's just clear the arrays and rebuild them on open? 
            // Or just hide them?
            // Hiding is safer.
            this.visuals.forEach(m => m.visible = false);
            this.rampVisuals.forEach(m => m.visible = false);
            if (this.lines) this.lines.visible = false;

            this.applyChanges();
        }
    }

    placeObject() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.game.scene.threeScene.children, true);
        
        let pos = new THREE.Vector3();
        let hitFound = false;

        if (intersects.length > 0) {
            // Filter intersects to find ground/track
            let hit = null;
            for (let i = 0; i < intersects.length; i++) {
                const h = intersects[i];
                
                // Ignore high objects (like skybox or weird artifacts)
                if (h.point.y > 50) continue;
                
                // Ignore objects that are likely sensors (invisible)
                if (h.object.visible === false) continue;

                // Ignore Helper objects
                if (h.object.type === 'GridHelper' || h.object.type === 'AxesHelper') continue;

                hit = h;
                break;
            }

            if (hit) {
                pos.copy(hit.point);
                hitFound = true;
            }
        }

        // If no hit, but we have manual Y, we can project mouse to that plane
        if (!hitFound && this.overrideY) {
            // Raycast against a mathematical plane at Y = defaultY
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.defaultY);
            const target = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(plane, target);
            if (target) {
                pos.copy(target);
                hitFound = true;
            }
        }

        if (!hitFound) {
            console.log("No valid ground hit found.");
            return;
        }

        // Apply Manual Y Override if enabled
        if (this.overrideY) {
            console.log(`Overriding Y: Was ${pos.y.toFixed(2)}, Now ${this.defaultY}`);
            pos.y = this.defaultY;
        }

        console.log("Placing at:", pos);

        if (this.mode === 'CHECKPOINT') {
            this.checkpoints.push(pos.clone());
            this.addCheckpointVisual(pos, this.checkpoints.length - 1);
            this.updateLines();
            console.log(`Added Checkpoint ${this.checkpoints.length}`);
        } else if (this.mode === 'RAMP') {
            const rampData = { pos: pos.clone(), rotation: this.rampRotation };
            this.ramps.push(rampData);
            this.addRampVisual(rampData);
            console.log(`Added Ramp at ${pos.y.toFixed(2)}`);
        }
    }

    addCheckpointVisual(pos, index) {
        const isStart = (index === 0);
        
        if (isStart || !this.coinModel) {
            // Start Line or Fallback: Sphere
            const color = isStart ? 0x00ff00 : 0xffff00;
            const geo = new THREE.SphereGeometry(2, 16, 16);
            const mat = new THREE.MeshBasicMaterial({ color: color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            this.game.scene.threeScene.add(mesh);
            this.visuals.push(mesh);
        } else {
            // Coin Model
            const coin = this.coinModel.clone();
            coin.position.copy(pos);
            coin.position.y += 1.5; // Lowered from 2.0 to 1.5 for easier collection
            
            // Ensure it's visible
            coin.visible = true;
            
            this.game.scene.threeScene.add(coin);
            this.visuals.push(coin);
        }
    }

    addRampVisual(data) {
        // Visual representation of placed ramp
        const geo = new THREE.BoxGeometry(10, 2, 15);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(data.pos);
        
        // Apply Slope and Rotation (YXZ order)
        const slope = -0.4;
        mesh.rotation.set(slope, data.rotation, 0, 'YXZ');
        
        // Lift slightly to sit on ground
        // Removed +1 offset to lower it further as requested
        // mesh.position.y += 1; 
        
        // Add Arrow Helper to visualize direction
        const dir = new THREE.Vector3(0, 0, 1);
        const origin = new THREE.Vector3(0, 3, 0);
        const length = 8;
        const hex = 0xffff00; // Yellow Arrow
        const arrowHelper = new THREE.ArrowHelper(dir, origin, length, hex);
        mesh.add(arrowHelper);

        this.game.scene.threeScene.add(mesh);
        this.rampVisuals.push(mesh);
    }

    updateLines() {
        if (this.lines) {
            this.game.scene.threeScene.remove(this.lines);
        }
        if (this.checkpoints.length < 2) return;

        const points = [...this.checkpoints, this.checkpoints[0]];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.lines = new THREE.Line(geometry, material);
        this.game.scene.threeScene.add(this.lines);
    }

    resetMap() {
        if (!confirm("Clear all checkpoints and ramps?")) return;
        
        // Clear Data
        this.checkpoints = [];
        this.ramps = [];
        
        // Clear Visuals
        this.visuals.forEach(m => this.game.scene.threeScene.remove(m));
        this.visuals = [];
        
        this.rampVisuals.forEach(m => this.game.scene.threeScene.remove(m));
        this.rampVisuals = [];

        if (this.lines) {
            this.game.scene.threeScene.remove(this.lines);
            this.lines = null;
        }
        
        console.log("Map Reset.");
    }

    saveMap() {
        const data = {
            checkpoints: this.checkpoints,
            ramps: this.ramps
        };
        const json = JSON.stringify(data, null, 2);
        
        // Always save to LocalStorage as backup
        localStorage.setItem('race_game_map', json);
        
        // 1. Try Saving to Server (Local Python Server)
        fetch('/save_map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: json
        })
        .then(response => {
            if (response.ok) return response.json();
            throw new Error('Server response not ok');
        })
        .then(result => {
            if (result.status === 'success') {
                this.showNotification("Map Saved to Server!");
                console.log("Map saved to server successfully.");
            } else {
                throw new Error(result.message || 'Unknown server error');
            }
        })
        .catch(error => {
            console.warn("Server save failed (likely offline or static host). Falling back to download.", error);
            
            // 2. Fallback: Download File (Netlify / No Server)
            this.downloadMapFile(json);
            this.showNotification("Server Offline. Downloading File...");
        });
    }

    downloadMapFile(jsonString) {
        try {
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'race_map.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("File download failed:", e);
            this.showNotification("Error: Could not download file.");
        }
    }

    loadMap(silent = false) {
        const json = localStorage.getItem('race_game_map');
        if (!json) {
            if (!silent) this.showNotification("No saved map found.");
            return;
        }

        try {
            this.loadFromJSON(json, silent);
        } catch (e) {
            console.error("Failed to load map:", e);
            if (!silent) this.showNotification("Error loading map.");
        }
    }

    // Load map from a JSON string (used by localStorage or file upload)
    loadFromJSON(jsonString, silent = false) {
        const data = JSON.parse(jsonString);

        // Clear current
        this.checkpoints = [];
        this.ramps = [];
        this.visuals.forEach(m => this.game.scene.threeScene.remove(m));
        this.visuals = [];
        this.rampVisuals.forEach(m => this.game.scene.threeScene.remove(m));
        this.rampVisuals = [];
        if (this.lines) this.game.scene.threeScene.remove(this.lines);

        // Load Checkpoints
        if (data.checkpoints) {
            data.checkpoints.forEach((p, i) => {
                const v = new THREE.Vector3(p.x, p.y, p.z);
                this.checkpoints.push(v);
                this.addCheckpointVisual(v, i);
            });
            this.updateLines();
        }

        // Load Ramps
        if (data.ramps) {
            data.ramps.forEach(r => {
                const v = new THREE.Vector3(r.pos.x, r.pos.y, r.pos.z);
                const rampData = { pos: v, rotation: r.rotation };
                this.ramps.push(rampData);
                this.addRampVisual(rampData);
            });
        }

        if (!silent) this.showNotification("Map Loaded Successfully.");
    }

    // Trigger a file download of the current map JSON (works on Netlify/static hosts)
    downloadMap() {
        const data = {
            checkpoints: this.checkpoints,
            ramps: this.ramps
        };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const ts = now.toISOString().replace(/[:.]/g, '-');
        a.download = `race_map_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showNotification('Map downloaded to your machine.');
    }

    // Handle a user-selected JSON file and load it into the editor
    handleFileUpload(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const content = evt.target.result;
                this.loadFromJSON(content, false);
            } catch (err) {
                console.error('Failed to parse uploaded map:', err);
                this.showNotification('Invalid map file.');
            } finally {
                // reset input so the same file can be re-selected if needed
                this.fileInput.value = '';
            }
        };
        reader.readAsText(file);
    }

    applyChanges() {
        // 1. Apply Checkpoints to LapSystem
        if (this.checkpoints.length >= 2 && this.game.lapSystem) {
            const newCPs = this.checkpoints.map((p) => ({
                pos: { x: p.x, y: p.y + 2, z: p.z },
                size: { x: 10, y: 10, z: 10 } // Reduced size for tighter collection
            }));
            // Pass the coin model so LapSystem can create gameplay visuals
            this.game.lapSystem.updateCheckpoints(newCPs, this.coinModel);
        }

        // 2. Apply Ramps to Scene (Physics)
        if (this.game.scene && this.game.scene.createRamp) {
            if (this.game.scene.clearRamps) {
                this.game.scene.clearRamps();
            }
            this.ramps.forEach(r => {
                this.game.scene.createRamp(r.pos, r.rotation);
            });
        }
    }

    update() {
        if (!this.active) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.game.scene.threeScene.children, true);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            const pos = hit.point;

            if (this.mode === 'CHECKPOINT') {
                this.cursor.visible = true;
                this.rampPreview.visible = false;
                this.cursor.position.copy(pos);
                this.cursor.position.y += 0.5;
            } else {
                this.cursor.visible = false;
                this.rampPreview.visible = true;
                this.rampPreview.position.copy(pos);
                this.rampPreview.position.y += 1;
                this.rampPreview.rotation.y = this.rampRotation;
            }
        }
    }
}
