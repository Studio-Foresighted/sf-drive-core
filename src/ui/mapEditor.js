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
        
        // Map Management
        this.maps = []; // Array of { id, name, data, isDefault }
        this.activeMapId = 'default';
        
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
        this.defaultY = -1.5; // Hardcoded default as requested
        this.overrideY = true; // Always override Y

        this.initCamera();
        this.setupInput();
        this.createCursors();
        this.createNotificationUI();
        
        // Initialize Maps
        this.initMaps();
    }

    isLocalhost() {
        return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }

    async initMaps() {
        // 1. Load Default Map
        try {
            const response = await fetch('map_data.json');
            const defaultData = await response.json();
            this.maps.push({
                id: 'default',
                name: 'Default Map',
                data: defaultData,
                isDefault: true
            });
        } catch (e) {
            console.error("Failed to load default map:", e);
            // Create empty default if fetch fails
            this.maps.push({
                id: 'default',
                name: 'Default Map',
                data: { checkpoints: [], ramps: [] },
                isDefault: true
            });
        }

        // 2. Load Custom Maps from LocalStorage
        const savedMaps = JSON.parse(localStorage.getItem('race_custom_maps') || '[]');
        this.maps = [...this.maps, ...savedMaps];

        // 3. Restore Last Active Map or Default
        const lastMapId = localStorage.getItem('race_last_map_id');
        if (lastMapId && this.maps.find(m => m.id === lastMapId)) {
            this.selectMap(lastMapId);
        } else {
            this.updateMapListUI();
        }
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
            this.coinModel.scale.set(2, 2, 2);
            this.tuneCoinMaterials(this.coinModel);
            
            // Refresh Editor Visuals
            if (this.visuals.length > 0) this.refreshVisuals();

            // If game is running (Editor Closed), update Game World with new assets
            if (!this.active) {
                this.applyChanges();
            }
        }, undefined, (error) => {
            console.error("Error loading Coin Model:", error);
            const geo = new THREE.CylinderGeometry(1, 1, 0.2, 32);
            geo.rotateX(Math.PI / 2);
            const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.3 });
            this.coinModel = new THREE.Mesh(geo, mat);
            this.coinModel.name = "CoinFallback";
            
            // Update Game World with fallback
            if (!this.active) {
                this.applyChanges();
            }
        });
    }

    tuneCoinMaterials(root) {
        root.traverse((child) => {
            if (child.isMesh) {
                if (!(child.material instanceof THREE.MeshStandardMaterial)) {
                    const oldColor = child.material.color || new THREE.Color(0xffd700);
                    child.material = new THREE.MeshStandardMaterial({ color: oldColor });
                }
                child.material.metalness = 0.6;
                child.material.roughness = 0.3; 
                child.material.emissive = new THREE.Color(0x443300);
                child.material.emissiveIntensity = 0.5;
                child.material.envMapIntensity = 1.0;
            }
        });
    }

    refreshVisuals() {
        this.visuals.forEach(m => this.game.scene.threeScene.remove(m));
        this.visuals = [];
        this.checkpoints.forEach((pos, i) => this.addCheckpointVisual(pos, i));
    }

    createCursors() {
        const geo = new THREE.RingGeometry(1, 1.5, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        this.cursor = new THREE.Mesh(geo, mat);
        this.cursor.rotation.x = -Math.PI / 2;
        this.cursor.visible = false;

        const rampGeo = new THREE.BoxGeometry(10, 2, 15);
        const rampMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
        this.rampPreview = new THREE.Mesh(rampGeo, rampMat);
        this.rampPreview.visible = false;

        const dir = new THREE.Vector3(0, 0, 1);
        const origin = new THREE.Vector3(0, 3, 0);
        const length = 8;
        const hex = 0xff0000;
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

        // Create New Map Button (Prominent)
        this.createMapBtn = this.createButton('NEW MAP', () => this.addNewMap());
        this.createMapBtn.style.background = '#00aa00';
        controls.appendChild(this.createMapBtn);

        // Save/Delete/Reset
        this.saveBtn = this.createButton('SAVE', () => this.saveMap());
        controls.appendChild(this.saveBtn);
        
        this.deleteBtn = this.createButton('DELETE', () => this.deleteMap());
        this.deleteBtn.style.display = 'none'; // Hidden by default (for Default map)
        controls.appendChild(this.deleteBtn);
        
        this.resetBtn = this.createButton('RESET', () => this.resetMap());
        controls.appendChild(this.resetBtn);

        // Info Text for Default Map
        this.infoText = document.createElement('div');
        this.infoText.style.cssText = 'margin-top: 10px; color: #ccc; font-size: 0.9rem; font-style: italic;';
        this.infoText.innerText = "Default Map is Read-Only. Create a New Map to Edit.";
        this.uiOverlay.appendChild(this.infoText);

        // Map List Container (Top Right)
        this.mapListContainer = document.createElement('div');
        this.mapListContainer.style.cssText = `
            display: none; position: fixed; top: 20px; right: 20px; width: 200px;
            background: rgba(0,0,0,0.9); padding: 10px; border-radius: 10px;
            border: 1px solid #444; z-index: 1000; font-family: monospace;
        `;
        
        const listHeader = document.createElement('div');
        listHeader.style.cssText = 'color: #fff; font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;';
        listHeader.innerHTML = '<span>MAPS</span>';
        
        const addBtn = document.createElement('button');
        addBtn.innerText = '+';
        addBtn.style.cssText = 'background: #00aa00; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-weight: bold;';
        addBtn.onclick = () => this.addNewMap();
        listHeader.appendChild(addBtn);
        
        this.mapListContainer.appendChild(listHeader);
        
        this.mapListEl = document.createElement('div');
        this.mapListContainer.appendChild(this.mapListEl);

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
        document.body.appendChild(this.mapListContainer);
        document.body.appendChild(this.closeBtn);
    }

    updateMapListUI() {
        this.mapListEl.innerHTML = '';
        
        this.maps.forEach(map => {
            const item = document.createElement('div');
            const isActive = map.id === this.activeMapId;
            item.style.cssText = `
                padding: 8px; margin-bottom: 5px; cursor: pointer;
                background: ${isActive ? '#f1c40f' : '#333'};
                color: ${isActive ? '#000' : '#ccc'};
                border-radius: 4px; font-size: 0.9rem;
            `;
            item.innerText = map.name + (map.isDefault ? ' (Def)' : '');
            item.onclick = () => this.selectMap(map.id);
            this.mapListEl.appendChild(item);
        });

        // Update UI State based on selection
        const currentMap = this.maps.find(m => m.id === this.activeMapId);
        const isLocal = this.isLocalhost();

        if (currentMap && (!currentMap.isDefault || isLocal)) {
            this.saveBtn.style.display = 'block';
            this.resetBtn.style.display = 'block';
            
            // Only show delete for custom maps
            if (!currentMap.isDefault) {
                this.deleteBtn.style.display = 'block';
                this.infoText.style.display = 'none';
            } else {
                this.deleteBtn.style.display = 'none';
                this.infoText.style.display = 'block';
                this.infoText.innerText = "Editing Default Map (Localhost Mode)";
            }
        } else {
            this.deleteBtn.style.display = 'none';
            this.saveBtn.style.display = 'none';
            this.resetBtn.style.display = 'none';
            this.infoText.style.display = 'block';
            this.infoText.innerText = "Default Map is Read-Only. Create a New Map to Edit.";
        }
    }

    addNewMap() {
        const name = prompt("Enter new map name:", "My Custom Map");
        if (!name) return;
        
        const newId = 'map_' + Date.now();
        const newMap = {
            id: newId,
            name: name,
            data: { checkpoints: [], ramps: [] }, // Start empty
            isDefault: false
        };
        
        this.maps.push(newMap);
        this.saveMapsToStorage();
        this.selectMap(newId);
    }

    selectMap(id) {
        const map = this.maps.find(m => m.id === id);
        if (!map) return;
        
        this.activeMapId = id;
        localStorage.setItem('race_last_map_id', id);
        this.loadMapData(map.data);
        this.updateMapListUI();
        this.showNotification(`Loaded: ${map.name}`);
        
        // Ensure game world is updated immediately (fixes reload bug)
        this.applyChanges();
    }

    deleteMap() {
        const map = this.maps.find(m => m.id === this.activeMapId);
        if (!map || map.isDefault) return;
        
        if (!confirm(`Delete map "${map.name}"?`)) return;
        
        this.maps = this.maps.filter(m => m.id !== this.activeMapId);
        this.saveMapsToStorage();
        
        // Select Default
        this.selectMap('default');
    }

    saveMapsToStorage() {
        const customMaps = this.maps.filter(m => !m.isDefault);
        localStorage.setItem('race_custom_maps', JSON.stringify(customMaps));
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
        this.rampRotation = this.rampRotation % (Math.PI * 2);
        
        if (this.rampPreview) {
            this.rampPreview.rotation.y = this.rampRotation;
        }
        this.showNotification(`Rotation: ${(this.rampRotation * 180 / Math.PI).toFixed(0)}°`);
    }

    toggle() {
        this.active = !this.active;
        const garageUI = document.getElementById('garage-ui');
        
        if (this.active) {
            console.log("MAP EDITOR: ACTIVE.");
            this.game.paused = true;
            if (this.game.pauseMenu) this.game.pauseMenu.uiContainer.style.display = 'none';
            if (garageUI) garageUI.style.display = 'none'; // Hide Car Select
            
            this.uiOverlay.style.display = 'block';
            this.mapListContainer.style.display = 'block';
            this.closeBtn.style.display = 'block';
            
            this.game.scene.threeScene.add(this.cursor);
            this.game.scene.threeScene.add(this.rampPreview);
            
            this.visuals.forEach(m => m.visible = true);
            this.rampVisuals.forEach(m => m.visible = true);
            if (this.lines) this.lines.visible = true;

            // If we have no data loaded yet, try loading active map
            if (this.checkpoints.length === 0 && this.ramps.length === 0) {
                this.selectMap(this.activeMapId);
            }

        } else {
            console.log("MAP EDITOR: CLOSED.");
            this.game.paused = false;
            if (garageUI) garageUI.style.display = 'block'; // Show Car Select
            
            this.uiOverlay.style.display = 'none';
            this.mapListContainer.style.display = 'none';
            this.closeBtn.style.display = 'none';
            
            this.game.scene.threeScene.remove(this.cursor);
            this.game.scene.threeScene.remove(this.rampPreview);

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
            let hit = null;
            for (let i = 0; i < intersects.length; i++) {
                const h = intersects[i];
                if (h.point.y > 50) continue;
                if (h.object.visible === false) continue;
                if (h.object.type === 'GridHelper' || h.object.type === 'AxesHelper') continue;
                hit = h;
                break;
            }
            if (hit) {
                pos.copy(hit.point);
                hitFound = true;
            }
        }

        if (!hitFound && this.overrideY) {
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.defaultY);
            const target = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(plane, target);
            if (target) {
                pos.copy(target);
                hitFound = true;
            }
        }

        if (!hitFound) return;

        if (this.overrideY) {
            pos.y = this.defaultY;
        }

        if (this.mode === 'CHECKPOINT') {
            this.checkpoints.push(pos.clone());
            this.addCheckpointVisual(pos, this.checkpoints.length - 1);
            this.updateLines();
        } else if (this.mode === 'RAMP') {
            const rampData = { pos: pos.clone(), rotation: this.rampRotation };
            this.ramps.push(rampData);
            this.addRampVisual(rampData);
        }
    }

    addCheckpointVisual(pos, index) {
        const isStart = (index === 0);
        if (isStart || !this.coinModel) {
            const color = isStart ? 0x00ff00 : 0xffff00;
            const geo = new THREE.SphereGeometry(2, 16, 16);
            const mat = new THREE.MeshBasicMaterial({ color: color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            mesh.visible = this.active; // Only visible if editor is active
            this.game.scene.threeScene.add(mesh);
            this.visuals.push(mesh);
        } else {
            const coin = this.coinModel.clone();
            coin.position.copy(pos);
            coin.position.y += 1.5;
            coin.visible = this.active; // Only visible if editor is active
            this.game.scene.threeScene.add(coin);
            this.visuals.push(coin);
        }
    }

    addRampVisual(data) {
        const geo = new THREE.BoxGeometry(10, 2, 15);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(data.pos);
        const slope = -0.4;
        mesh.rotation.set(slope, data.rotation, 0, 'YXZ');
        
        const dir = new THREE.Vector3(0, 0, 1);
        const origin = new THREE.Vector3(0, 3, 0);
        const length = 8;
        const hex = 0xffff00;
        const arrowHelper = new THREE.ArrowHelper(dir, origin, length, hex);
        mesh.add(arrowHelper);

        mesh.visible = this.active; // Only visible if editor is active
        this.game.scene.threeScene.add(mesh);
        this.rampVisuals.push(mesh);
    }

    updateLines() {
        if (this.lines) this.game.scene.threeScene.remove(this.lines);
        if (this.checkpoints.length < 2) return;

        const points = [...this.checkpoints, this.checkpoints[0]];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.lines = new THREE.Line(geometry, material);
        this.lines.visible = this.active; // Only visible if editor is active
        this.game.scene.threeScene.add(this.lines);
    }

    resetMap() {
        if (!confirm("Clear all checkpoints and ramps?")) return;
        this.checkpoints = [];
        this.ramps = [];
        this.refreshVisuals();
        this.rampVisuals.forEach(m => this.game.scene.threeScene.remove(m));
        this.rampVisuals = [];
        if (this.lines) {
            this.game.scene.threeScene.remove(this.lines);
            this.lines = null;
        }
        this.applyChanges();
    }

    saveMap() {
        const currentMap = this.maps.find(m => m.id === this.activeMapId);
        if (!currentMap) return;

        if (currentMap.isDefault) {
            if (this.isLocalhost()) {
                // Localhost: Save to Server File
                const data = {
                    checkpoints: this.checkpoints,
                    ramps: this.ramps
                };
                const json = JSON.stringify(data, null, 2);

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
                        this.showNotification("Default Map Saved to Server!");
                        // Also update local memory
                        currentMap.data = data;
                    } else {
                        throw new Error(result.message || 'Unknown server error');
                    }
                })
                .catch(error => {
                    console.error("Server save failed:", error);
                    this.showNotification("Error: Server Save Failed.");
                });
            } else {
                // Cannot overwrite default, prompt to create new
                const name = prompt("Cannot overwrite Default Map. Save as new map?", "My Custom Map");
                if (name) {
                    const newId = 'map_' + Date.now();
                    const newMap = {
                        id: newId,
                        name: name,
                        data: {
                            checkpoints: this.checkpoints,
                            ramps: this.ramps
                        },
                        isDefault: false
                    };
                    this.maps.push(newMap);
                    this.saveMapsToStorage();
                    this.selectMap(newId);
                    this.showNotification("Saved as New Map!");
                }
            }
        } else {
            // Update Custom Map
            currentMap.data = {
                checkpoints: this.checkpoints,
                ramps: this.ramps
            };
            this.saveMapsToStorage();
            this.showNotification("Map Saved!");
        }
    }

    loadMapData(data) {
        // Clear current
        this.checkpoints = [];
        this.ramps = [];
        this.refreshVisuals();
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
    }

    applyChanges() {
        if (this.game.lapSystem) {
            const newCPs = this.checkpoints.map((p) => ({
                pos: { x: p.x, y: p.y + 2, z: p.z },
                size: { x: 10, y: 10, z: 10 }
            }));
            this.game.lapSystem.updateCheckpoints(newCPs, this.coinModel);
        }

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
