import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class CarLoader {
    constructor() {
        this.loader = new GLTFLoader();
        
        // Setup DRACO
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./assets/draco/gltf/'); // Path to decoder files
        this.loader.setDRACOLoader(dracoLoader);

        this.loader.setPath('./assets/cars/');
        this.manifest = [];
        this.cache = new Map();
    }

    async loadManifest() {
        try {
            const response = await fetch('./assets/cars/cars.json');
            this.manifest = await response.json();
            return this.manifest;
        } catch (e) {
            console.error("Failed to load car manifest", e);
            return [];
        }
    }

    async loadCarModel(id, onProgress) {
        if (this.cache.has(id)) {
            if (onProgress) onProgress(100);
            return this.cache.get(id).clone();
        }

        const entry = this.manifest.find(c => c.id === id);
        if (!entry) {
            console.error(`Car ID ${id} not found in manifest`);
            return null;
        }

        return new Promise((resolve, reject) => {
            this.loader.load(entry.file, (gltf) => {
                const model = gltf.scene;
                
                // Standardize Model
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                // AUTO-SIZE: Find the largest dimension and scale it to target length (4.5m)
                const maxDim = Math.max(size.x, size.y, size.z);
                const targetLength = 4.5;
                const scaleFactor = targetLength / maxDim;
                
                model.scale.setScalar(scaleFactor);

                // AUTO-ORIENT (Heuristic):
                // If Width (X) > Length (Z), the car is likely sideways. Rotate 90 deg.
                // Note: This assumes the car is longer than it is wide.
                // We re-measure after scale just to be sure of dimensions relative to axes
                box.setFromObject(model);
                box.getSize(size);
                if (size.x > size.z) {
                    model.rotation.y += Math.PI / 2;
                }

                // MANIFEST ROTATION OVERRIDE:
                // Apply manual rotation from cars.json if specified (fixes 180 flips)
                if (entry.rotation) {
                    model.rotation.y += entry.rotation;
                }
                
                // Re-center: Bottom of wheels at Y=0, Center X/Z at 0
                // We must update the box again after rotations
                const newBox = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                newBox.getCenter(center);
                
                // We want the model's origin to be at (0,0,0) relative to the wrapper
                // The wrapper will be attached to the physics body.
                // Physics body origin is Center of Mass.
                // Visual model origin should be centered in X/Z, and Bottom at Y=0 (relative to wrapper)
                // The wrapper itself is offset by carVisual.js later.
                
                model.position.x -= center.x;
                model.position.y -= newBox.min.y; // Align bottom to 0
                model.position.z -= center.z;

                // Bake transforms into mesh (optional, but safer for simple hierarchy)
                // For now, just wrapping in a parent or keeping as is. 
                // Since we clone, we can just return this adjusted group.
                const wrapper = new THREE.Group();
                wrapper.add(model);

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // Cache the GLTF scene (wrapper)
                this.cache.set(id, wrapper);
                
                // Ensure we report 100% completion
                if (onProgress) onProgress(100);
                
                resolve(wrapper.clone());
            }, 
            (xhr) => {
                if (onProgress) {
                    if (xhr.total > 0) {
                        const percent = (xhr.loaded / xhr.total) * 100;
                        onProgress(percent);
                    } else {
                        // Fallback for servers not sending Content-Length (e.g. Netlify gzip)
                        // Estimate based on typical car size (~5MB) to show some movement
                        const estimatedTotal = 5 * 1024 * 1024; 
                        const percent = Math.min(99, (xhr.loaded / estimatedTotal) * 100);
                        onProgress(percent);
                    }
                }
            }, 
            (err) => {
                console.error(`Error loading car ${entry.file}`, err);
                reject(err);
            });
        });
    }
}