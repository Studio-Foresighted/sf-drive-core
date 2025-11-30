import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';

export class GameScene {
    constructor(physicsWorld) {
        this.threeScene = new THREE.Scene();
        this.threeScene.background = new THREE.Color(0x87CEEB); // Sky Blue
        this.threeScene.fog = new THREE.Fog(0x87CEEB, 50, 500);
        
        this.physicsWorld = physicsWorld.world;
        this.dynamicRamps = []; // Track dynamic objects

        this.setupLights();
        this.setupEnvironment(); // Add Environment Map
        // Track is now loaded async via loadTrack()
    }

    setupEnvironment() {
        // Create a PMREM Generator to pre-filter the environment
        const pmremGenerator = new PMREMGenerator(new THREE.WebGLRenderer()); // We don't have renderer ref here yet...
        // Actually, we need the renderer to use PMREMGenerator.
        // But we can use a simple CubeTexture or just wait until we have renderer?
        // Or better, just use a neutral environment map if possible without renderer?
        // No, PMREM requires renderer.
        // Let's use a trick: We can't easily get the renderer here in constructor.
        // But we can create a temporary one or just skip PMREM and use a basic setup if we had an HDR.
        // Since we don't have an HDR file handy, let's try to use RoomEnvironment when we can.
        // Actually, the Renderer class creates the WebGLRenderer.
        // Let's just add a simple ambient light boost for now, OR
        // We can create a PMREMGenerator later if we pass renderer.
        
        // Alternative: Just use a high ambient light for now to ensure visibility, 
        // but the user specifically asked for envMap.
        // Let's try to load a basic CubeMap if we had one.
        // Since we don't, let's rely on the fact that Three.js standard materials reflect the scene background if envMap is null? No, they reflect black.
        
        // Let's add a simple CubeCamera or just a static color env map?
        // Actually, let's just create a PMREMGenerator in a static way or use a helper.
        // Wait, I can't create WebGLRenderer here easily.
        
        // Let's just add a method `setEnvironment(renderer)` that main.js calls.
    }

    setEnvironment(renderer) {
        const pmremGenerator = new PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        const roomEnvironment = new RoomEnvironment();
        this.threeScene.environment = pmremGenerator.fromScene(roomEnvironment).texture;
        // roomEnvironment.dispose(); // Keep it?
        console.log("Environment Map Set (RoomEnvironment)");
    }

    async loadTrack() {
        const loader = new GLTFLoader();
        
        // Setup DRACO
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./assets/draco/gltf/');
        loader.setDRACOLoader(dracoLoader);

        return new Promise((resolve, reject) => {
            loader.load('./assets/models/track.glb', (gltf) => {
                const model = gltf.scene;
                
                // Scale Adjustment (Mario track might be huge or tiny)
                // The original code had scale={0.08} in React
                model.scale.setScalar(0.08);
                model.position.set(155, -28, 15); // From React props
                
                // Update Matrix World to bake transforms for physics
                model.updateMatrixWorld(true);

                // Analyze Track Bounds
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                console.log("TRACK BOUNDS:", box);
                console.log("TRACK SIZE:", size);

                this.threeScene.add(model);

                // Create Physics Body (Static)
                const bodyDesc = RAPIER.RigidBodyDesc.fixed();
                const rigidBody = this.physicsWorld.createRigidBody(bodyDesc);

                model.traverse((child) => {
                    // Debug: Log all object names to help find Start Line
                    // console.log("Node:", child.name, child.type);

                    if (child.isMesh) {
                        // Check for Start Line / Flag to disable collision
                        const name = child.name.toLowerCase();
                        if (name.includes('flag') || name.includes('start') || name.includes('banner')) {
                            console.log("Found Start/Flag object (Collision Disabled):", child.name);
                            child.castShadow = true;
                            child.receiveShadow = true;
                            return; // Skip collider creation
                        }

                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        // Create Trimesh Collider
                        // We must bake the world transform into the vertices
                        // because we are adding multiple colliders to one fixed body at (0,0,0)
                        const geometry = child.geometry.clone();
                        geometry.applyMatrix4(child.matrixWorld);
                        
                        const vertices = geometry.attributes.position.array;
                        const indices = geometry.index ? geometry.index.array : undefined;
                        
                        // Rapier requires indices
                        let finalIndices;
                        if (indices) {
                            finalIndices = indices;
                        } else {
                            const count = geometry.attributes.position.count;
                            finalIndices = new Uint32Array(count);
                            for(let i=0; i<count; i++) finalIndices[i] = i;
                        }

                        // Create Collider
                        // Note: Trimesh can be heavy. For optimization, we might want to simplify collision meshes later.
                        try {
                            const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, finalIndices)
                                .setFriction(1.0); // Good grip
                            this.physicsWorld.createCollider(colliderDesc, rigidBody);
                        } catch (e) {
                            console.warn("Failed to create collider for mesh:", child.name, e);
                        }
                    }
                });

                console.log("Track Loaded");
                
                // Add Ramps on Straights (Approximate positions)
                // Assuming car starts at 0,0,0 and drives along Z
                // Ramps removed as per request
                // this.createRamp(new THREE.Vector3(0, 0, 60));
                // this.createRamp(new THREE.Vector3(0, 0, 120));

                resolve();
            }, undefined, reject);
        });
    }

    setupLights() {
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
        hemiLight.position.set(0, 20, 0);
        this.threeScene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(50, 100, 50); // Higher up
        dirLight.castShadow = true;
        dirLight.shadow.camera.top = 100;
        dirLight.shadow.camera.bottom = -100;
        dirLight.shadow.camera.left = -100;
        dirLight.shadow.camera.right = 100;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 500;
        dirLight.shadow.mapSize.width = 4096; // Better shadows
        dirLight.shadow.mapSize.height = 4096;
        this.threeScene.add(dirLight);

        // Fill Light (Opposite side)
        const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
        fillLight.position.set(-50, 50, -50);
        this.threeScene.add(fillLight);
    }

    // setupTrack() removed in favor of loadTrack()
    
    createBox(w, h, d, pos) {
        // Visual
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.threeScene.add(mesh);

        // Physics
        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
        const body = this.physicsWorld.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(w/2, h/2, d/2);
        this.physicsWorld.createCollider(colliderDesc, body);
    }

    clearRamps() {
        this.dynamicRamps.forEach(item => {
            this.threeScene.remove(item.mesh);
            // Remove from physics world
            if (this.physicsWorld.removeRigidBody) {
                this.physicsWorld.removeRigidBody(item.body);
            }
        });
        this.dynamicRamps = [];
    }

    createRamp(pos, rotationY = 0) {
        console.log("Creating Ramp at:", pos, "Rotation:", rotationY);
        // Visual
        const geo = new THREE.BoxGeometry(10, 2, 15);
        const mat = new THREE.MeshStandardMaterial({ color: 0xcc5500 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        // Removed +1 offset to lower it further as requested
        // mesh.position.y += 1; 
        
        // Slope is fixed for a ramp, but Y rotation (yaw) is variable
        const slope = -0.4; 
        // Use YXZ order to rotate around Y (Yaw) first, then X (Slope)
        mesh.rotation.set(slope, rotationY, 0, 'YXZ');

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.threeScene.add(mesh);

        // Physics
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(slope, rotationY, 0, 'YXZ'));
        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(pos.x, pos.y, pos.z) // Removed +1 offset here too
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
            
        const body = this.physicsWorld.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(5, 1, 7.5);
        this.physicsWorld.createCollider(colliderDesc, body);

        this.dynamicRamps.push({ mesh, body });
    }
}