import * as THREE from 'three';

export class GarageUI {
    constructor(game, carLoader, onSelect) {
        this.game = game;
        this.loader = carLoader;
        this.onSelect = onSelect;
        this.ui = document.getElementById('garage-ui');
        this.list = document.getElementById('car-list');
        this.previewContainer = null;
        this.previewRenderer = null;
        this.previewScene = null;
        this.previewCamera = null;
        this.previewModel = null;
        this.animId = null;
    }

    async init() {
        const manifest = await this.loader.loadManifest();
        this.ui.style.display = 'block';
        
        manifest.forEach(car => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.marginBottom = '5px';

            const btn = document.createElement('div');
            btn.className = 'car-btn';
            btn.textContent = car.displayName;
            btn.style.marginBottom = '0'; // Override default
            btn.style.flex = '1';
            btn.onclick = () => {
                // Highlight
                document.querySelectorAll('.car-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.onSelect(car.id);
            };

            const eyeBtn = document.createElement('button');
            eyeBtn.innerHTML = '👁️';
            eyeBtn.style.cssText = `
                background: #444; border: 1px solid #555; color: white;
                cursor: pointer; width: 40px; margin-left: 5px;
                font-size: 18px; display: flex; align-items: center; justify-content: center;
            `;
            eyeBtn.onclick = (e) => {
                e.stopPropagation();
                this.openFullscreenPreview(car.id);
            };

            row.appendChild(btn);
            row.appendChild(eyeBtn);
            this.list.appendChild(row);
        });

        // Select first by default
        if (manifest.length > 0) {
            // Find the first car button in the first row
            const firstBtn = this.list.children[0].querySelector('.car-btn');
            if (firstBtn) firstBtn.click();
        }
    }

    isPreviewOpen() {
        return !!this.previewContainer;
    }

    async openFullscreenPreview(carId) {
        this.game.paused = true;

        // Create Container
        this.previewContainer = document.createElement('div');
        this.previewContainer.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #111; z-index: 2000; display: flex; flex-direction: column;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 10px; background: #222; display: flex; justify-content: flex-end;';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'CLOSE (ESC)';
        closeBtn.style.cssText = 'padding: 8px 20px; background: #d00; color: white; border: none; cursor: pointer; font-weight: bold;';
        closeBtn.onclick = () => this.closeFullscreenPreview();
        
        header.appendChild(closeBtn);
        this.previewContainer.appendChild(header);
        document.body.appendChild(this.previewContainer);

        // Setup Three.js
        this.previewScene = new THREE.Scene();
        this.previewScene.background = new THREE.Color(0x222222);
        
        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.previewScene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(5, 10, 7);
        this.previewScene.add(dirLight);

        // Camera
        const aspect = window.innerWidth / (window.innerHeight - 50); // Minus header
        this.previewCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this.previewCamera.position.set(0, 1.5, 4.5);
        this.previewCamera.lookAt(0, 0.5, 0);

        // Renderer
        this.previewRenderer = new THREE.WebGLRenderer({ antialias: true });
        this.previewRenderer.setSize(window.innerWidth, window.innerHeight - 50);
        this.previewContainer.appendChild(this.previewRenderer.domElement);

        // Load Model
        const model = await this.loader.loadCarModel(carId);
        if (model) {
            this.previewModel = model;
            // Center it visually
            this.previewModel.position.set(0, 0, 0);
            this.previewScene.add(this.previewModel);
        }

        // Interaction State
        let isDragging = false;
        let prevX = 0;
        let prevY = 0;
        let autoSpin = true;

        // Mouse Events
        const canvas = this.previewRenderer.domElement;
        
        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            autoSpin = false;
            prevX = e.clientX;
            prevY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging && this.previewModel) {
                const deltaX = e.clientX - prevX;
                const deltaY = e.clientY - prevY;
                
                this.previewModel.rotation.y += deltaX * 0.01;
                this.previewModel.rotation.x += deltaY * 0.01;
                
                prevX = e.clientX;
                prevY = e.clientY;
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                autoSpin = true;
            }
        });

        // Zoom (Wheel)
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            // Zoom in/out by moving camera Z
            this.previewCamera.position.z += e.deltaY * 0.005;
            // Clamp zoom
            this.previewCamera.position.z = Math.max(2.0, Math.min(10.0, this.previewCamera.position.z));
        });

        // Animation Loop
        const animate = () => {
            if (!this.previewContainer) return; // Stopped
            
            if (this.previewModel && autoSpin) {
                this.previewModel.rotation.y += 0.01;
            }
            
            this.previewRenderer.render(this.previewScene, this.previewCamera);
            this.animId = requestAnimationFrame(animate);
        };
        animate();

        // ESC to close
        this.escHandler = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation(); // Stop bubbling to PauseMenu
                this.closeFullscreenPreview();
            }
        };
        window.addEventListener('keydown', this.escHandler, true); // Capture phase to ensure we get it first
    }

    closeFullscreenPreview() {
        if (!this.previewContainer) return;

        // Cleanup
        // Remove the capturing keydown handler (was added with capture=true)
        window.removeEventListener('keydown', this.escHandler, true);
        cancelAnimationFrame(this.animId);
        
        if (this.previewRenderer) {
            this.previewRenderer.dispose();
        }
        
        document.body.removeChild(this.previewContainer);
        this.previewContainer = null;
        this.previewScene = null;
        this.previewRenderer = null;
        this.previewModel = null;

        // Resume Game
        this.game.paused = false;
    }
}