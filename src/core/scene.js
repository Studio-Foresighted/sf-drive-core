import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
// import { TrackGenerator } from './trackGenerator.js';

export class GameScene {
    constructor(physicsWorld) {
        this.threeScene = new THREE.Scene();
        this.threeScene.background = new THREE.Color(0xa0a0a0);
        this.threeScene.fog = new THREE.Fog(0xa0a0a0, 10, 500);
        
        this.physicsWorld = physicsWorld.world;

        this.setupLights();
        this.setupTrack();
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
    }

    setupTrack() {
        // SIMPLE MASSIVE GROUND PLANE
        
        // 1. Visual Ground
        // 5000x5000 plane
        const groundGeo = new THREE.PlaneGeometry(5000, 5000);
        const groundMat = new THREE.MeshStandardMaterial({ 
            color: 0x333333, // Road Grey
            roughness: 0.8, 
            metalness: 0.2 
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.threeScene.add(ground);

        // Grid Helper for scale reference
        const grid = new THREE.GridHelper(5000, 500, 0x555555, 0x444444);
        grid.position.y = 0.01; // Just above ground to avoid z-fighting
        this.threeScene.add(grid);

        // 2. Physics Ground
        // Static rigid body at 0,0,0
        const groundBodyDesc = RAPIER.RigidBodyDesc.fixed();
        const groundBody = this.physicsWorld.createRigidBody(groundBodyDesc);
        
        // Half-extents for cuboid are (width/2, height/2, depth/2)
        // We make a thin box for the floor: 5000x1x5000
        // Positioned so top face is at y=0. So center y should be -0.5
        const groundColliderDesc = RAPIER.ColliderDesc.cuboid(2500, 0.5, 2500)
            .setTranslation(0, -0.5, 0)
            .setFriction(3.0); // High friction for road
            
        this.physicsWorld.createCollider(groundColliderDesc, groundBody);

        // 3. Ramp
        // Further away (100)
        this.createRamp(new THREE.Vector3(0, 0, 100));
    }


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

    createRamp(pos) {
        // Visual
        const geo = new THREE.BoxGeometry(10, 2, 20);
        const mat = new THREE.MeshStandardMaterial({ color: 0xcc5500 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        
        // Modified: Less steep (-0.4) and rotated 180 (Math.PI)
        const slope = -0.4; 
        const yaw = Math.PI;
        mesh.rotation.set(slope, yaw, 0);

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.threeScene.add(mesh);

        // Physics
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(slope, yaw, 0));
        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(pos.x, pos.y, pos.z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
            
        const body = this.physicsWorld.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(5, 1, 10);
        this.physicsWorld.createCollider(colliderDesc, body);
    }
}