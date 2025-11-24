import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export class TrackGenerator {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
    }

    createTrack() {
        // 1. Define the Path (Large Loop)
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(100, 0, -100),
            new THREE.Vector3(200, 0, 0),
            new THREE.Vector3(100, 0, 100),
            new THREE.Vector3(0, 0, 200),
            new THREE.Vector3(-100, 0, 100),
            new THREE.Vector3(-200, 0, 0),
            new THREE.Vector3(-100, 0, -100),
        ]);
        curve.closed = true;

        // 2. Define the Shape (Cross-section)
        // Wide lane (30 width) with Walls (2 height)
        const trackWidth = 40;
        const wallHeight = 3;
        const shape = new THREE.Shape();
        
        // Start left wall top
        shape.moveTo(-trackWidth/2 - 2, wallHeight);
        shape.lineTo(-trackWidth/2 - 2, 0);
        shape.lineTo(-trackWidth/2, 0); // Left gutter
        shape.lineTo(trackWidth/2, 0);  // Right gutter
        shape.lineTo(trackWidth/2 + 2, 0);
        shape.lineTo(trackWidth/2 + 2, wallHeight);

        // 3. Extrude
        const extrudeSettings = {
            steps: 200,
            depth: 0, // Not used for path extrusion
            bevelEnabled: false,
            extrudePath: curve
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // 4. Visual Mesh
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x222222,
            roughness: 0.8,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        // Lower slightly so y=0 is the driving surface
        mesh.position.y = -0.05; 
        this.scene.add(mesh);

        // 5. Physics Collider (Trimesh)
        this.createTrimeshCollider(geometry, mesh.position, mesh.quaternion);

        return curve;
    }

    createTrimeshCollider(geometry, pos, rot) {
        const vertices = geometry.attributes.position.array;
        let indices;

        if (geometry.index) {
            indices = geometry.index.array;
        } else {
            // Generate indices for non-indexed geometry (0, 1, 2, ...)
            const vertexCount = geometry.attributes.position.count;
            indices = new Uint32Array(vertexCount);
            for (let i = 0; i < vertexCount; i++) {
                indices[i] = i;
            }
        }

        // Create RigidBody (Fixed)
        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(pos.x, pos.y, pos.z)
            .setRotation(rot);
        const body = this.physicsWorld.createRigidBody(bodyDesc);

        // Create Collider (Trimesh)
        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
            .setFriction(1.0); // High friction for track
        
        this.physicsWorld.createCollider(colliderDesc, body);
    }
}