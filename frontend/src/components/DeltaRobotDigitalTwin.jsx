import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Kinematics parameters matching DeltaRobot_Mega.ino exactly (in mm)
const F = 80.0;     // Base triangle parameter
const E = 40.0;     // End-effector triangle parameter
const RF = 130.0;   // Upper arm (bicep) length
const RE = 300.0;   // Forearm (parallel rod) length
const TAN30 = 0.5773502692;
const SIN120 = 0.8660254038;
const COS120 = -0.5;

// Inverse Kinematics calculation from DeltaRobot_Mega.ino
function calcAngleYZ(x0, y0, z0) {
  const y1 = -0.5 * TAN30 * F;
  const y0_adj = y0 - 0.5 * TAN30 * E;
  const a = (x0 * x0 + y0_adj * y0_adj + z0 * z0 + RF * RF - RE * RE - y1 * y1) / (2.0 * z0);
  const b = (y1 - y0_adj) / z0;
  const d = -(a + b * y1) * (a + b * y1) + RF * (b * b * RF + RF);
  if (d < 0) return null; // Outside workspace
  const yj = (y1 - a * b - Math.sqrt(d)) / (b * b + 1);
  const zj = a + b * yj;
  const theta = Math.atan2(-zj, (y1 - yj)); // in radians
  return { theta, yj, zj, y1 };
}

function calculateDeltaIK(x, y, z) {
  // Motor 1: 0 deg (aligned with YZ plane)
  const arm1 = calcAngleYZ(x, y, z);
  if (!arm1) return null;

  // Motor 2: 120 deg rotated
  const x2 = x * COS120 + y * SIN120;
  const y2 = y * COS120 - x * SIN120;
  const arm2 = calcAngleYZ(x2, y2, z);
  if (!arm2) return null;

  // Motor 3: 240 deg rotated
  const x3 = x * COS120 - y * SIN120;
  const y3 = y * COS120 + x * SIN120;
  const arm3 = calcAngleYZ(x3, y3, z);
  if (!arm3) return null;

  return [arm1, arm2, arm3];
}

// Cylinder connecting two 3D points
function Rod({ start, end, radius = 2.5, color = "#00ff88", metalness = 0.8, roughness = 0.2 }) {
  const meshRef = useRef();

  useFrame(() => {
    if (!meshRef.current || !start || !end) return;
    const p1 = new THREE.Vector3(start[0], start[1], start[2]);
    const p2 = new THREE.Vector3(end[0], end[1], end[2]);
    const direction = new THREE.Vector3().subVectors(p2, p1);
    const length = direction.length();
    const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

    meshRef.current.position.copy(midPoint);
    meshRef.current.scale.set(1, length, 1);
    meshRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  });

  return (
    <mesh ref={meshRef}>
      <cylinderGeometry args={[radius, radius, 1, 12]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

// Full Articulated Delta Robot Digital Twin Component
export default function DeltaRobotDigitalTwin({ targetPos, gripAngle = 125, theme = 'dark' }) {
  const currentPos = useRef({ x: targetPos.x, y: targetPos.y, z: targetPos.z });
  const currentGrip = useRef(gripAngle);

  // Group reference for smooth animations
  const robotGroupRef = useRef();
  const endEffectorRef = useRef();
  const gripLeftRef = useRef();
  const gripRightRef = useRef();

  // Joint positions state
  const elbow1Pos = useRef([0, 0, 0]);
  const elbow2Pos = useRef([0, 0, 0]);
  const elbow3Pos = useRef([0, 0, 0]);

  const eeJoint1Pos = useRef([0, 0, 0]);
  const eeJoint2Pos = useRef([0, 0, 0]);
  const eeJoint3Pos = useRef([0, 0, 0]);

  const baseJoint1 = useMemo(() => [0, -0.5 * TAN30 * F, 0], []);
  const baseJoint2 = useMemo(() => {
    const y1 = -0.5 * TAN30 * F;
    return [-y1 * SIN120, -y1 * COS120, 0];
  }, []);
  const baseJoint3 = useMemo(() => {
    const y1 = -0.5 * TAN30 * F;
    return [y1 * SIN120, -y1 * COS120, 0];
  }, []);

  // Material colors based on theme
  const colors = useMemo(() => ({
    base: theme === 'light' ? '#334155' : '#1e293b',
    upperArm: theme === 'light' ? '#059669' : '#00ff88',
    carbonRod: '#111827',
    joints: theme === 'light' ? '#0284c7' : '#38bdf8',
    endEffector: theme === 'light' ? '#0f172a' : '#0f172a',
    gripper: theme === 'light' ? '#e11d48' : '#f43f5e'
  }), [theme]);

  // Frame animation loop for physics & kinematics sync
  useFrame((state, delta) => {
    // Lerp current position towards target position
    const lerpSpeed = Math.min(1.0, delta * 12.0);
    currentPos.current.x += (targetPos.x - currentPos.current.x) * lerpSpeed;
    currentPos.current.y += (targetPos.y - currentPos.current.y) * lerpSpeed;
    currentPos.current.z += (targetPos.z - currentPos.current.z) * lerpSpeed;
    currentGrip.current += (gripAngle - currentGrip.current) * lerpSpeed;

    const { x, y, z } = currentPos.current;

    // Three.js Coordinate mapping:
    // Delta Robot: X=horizontal, Y=depth, Z=vertical (down is negative)
    // Three.js: X=horizontal, Y=vertical (Z_delta -> -Y_three or direct mapping), Z=depth
    // We map: X_3d = x, Y_3d = z, Z_3d = -y
    const ik = calculateDeltaIK(x, y, z);
    if (!ik) return;

    const [arm1, arm2, arm3] = ik;

    // 1. Calculate Arm 1 Elbow in 3D (mapped to Three.js coordinates)
    const e1_x = 0;
    const e1_y = arm1.zj;
    const e1_z = -arm1.yj;
    elbow1Pos.current = [e1_x, e1_y, e1_z];

    // 2. Calculate Arm 2 Elbow in 3D
    // Local in 2D YZ:
    const e2_ylocal = arm2.yj;
    const e2_zlocal = arm2.zj;
    // Rotate by 120 degrees around vertical Z (which in Three.js is Y-axis):
    const e2_x = -e2_ylocal * SIN120;
    const e2_y = e2_zlocal;
    const e2_z = -(e2_ylocal * COS120);
    elbow2Pos.current = [e2_x, e2_y, e2_z];

    // 3. Calculate Arm 3 Elbow in 3D (Rotate by 240 degrees / -120 degrees)
    const e3_ylocal = arm3.yj;
    const e3_zlocal = arm3.zj;
    const e3_x = e3_ylocal * SIN120;
    const e3_y = e3_zlocal;
    const e3_z = -(e3_ylocal * COS120);
    elbow3Pos.current = [e3_x, e3_y, e3_z];

    // End-effector joint positions
    const eeOffset = 0.5 * TAN30 * E;
    eeJoint1Pos.current = [x, z, -(y - eeOffset)];
    eeJoint2Pos.current = [x - (-eeOffset * SIN120), z, -(y + (-eeOffset * COS120))];
    eeJoint3Pos.current = [x - (eeOffset * SIN120), z, -(y + (-eeOffset * COS120))];

    // Update End-Effector 3D Platform position
    if (endEffectorRef.current) {
      endEffectorRef.current.position.set(x, z, -y);
    }

    // Update Gripper Finger angles (Capit opening/closing)
    if (gripLeftRef.current && gripRightRef.current) {
      const openAmount = (currentGrip.current / 180.0) * 0.45; // in radians
      gripLeftRef.current.rotation.z = -openAmount;
      gripRightRef.current.rotation.z = openAmount;
    }
  });

  // Base motor shaft coordinates in Three.js (Y=vertical, Z=-Y_delta)
  const baseShaft1 = [0, 0, -baseJoint1[1]];
  const baseShaft2 = [baseJoint2[0], 0, -baseJoint2[1]];
  const baseShaft3 = [baseJoint3[0], 0, -baseJoint3[1]];

  return (
    <group ref={robotGroupRef}>
      {/* 1. TOP BASE HOUSING / PLATFORM */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 10, 0]}>
          <cylinderGeometry args={[F * 1.1, F * 1.25, 20, 6]} />
          <meshStandardMaterial color={colors.base} metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Motor Accents */}
        {[baseShaft1, baseShaft2, baseShaft3].map((pos, idx) => (
          <mesh key={idx} position={pos}>
            <cylinderGeometry args={[14, 14, 16, 16]} rotation={[Math.PI / 2, 0, 0]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
          </mesh>
        ))}
      </group>

      {/* 2. UPPER ARMS (BICEPS - 3 ARMS) */}
      <Rod start={baseShaft1} end={elbow1Pos.current} radius={6} color={colors.upperArm} />
      <Rod start={baseShaft2} end={elbow2Pos.current} radius={6} color={colors.upperArm} />
      <Rod start={baseShaft3} end={elbow3Pos.current} radius={6} color={colors.upperArm} />

      {/* Elbow Joint Spheres */}
      <mesh position={elbow1Pos.current}>
        <sphereGeometry args={[7, 16, 16]} />
        <meshStandardMaterial color={colors.joints} metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={elbow2Pos.current}>
        <sphereGeometry args={[7, 16, 16]} />
        <meshStandardMaterial color={colors.joints} metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={elbow3Pos.current}>
        <sphereGeometry args={[7, 16, 16]} />
        <meshStandardMaterial color={colors.joints} metalness={0.8} roughness={0.2} />
      </mesh>

      {/* 3. PARALLEL FOREARMS (6 CARBON RODS - 2 PER ARM) */}
      {/* Arm 1 Dual Rods */}
      <Rod 
        start={[elbow1Pos.current[0] - 12, elbow1Pos.current[1], elbow1Pos.current[2]]} 
        end={[eeJoint1Pos.current[0] - 12, eeJoint1Pos.current[1], eeJoint1Pos.current[2]]} 
        radius={2.5} 
        color={colors.carbonRod} 
      />
      <Rod 
        start={[elbow1Pos.current[0] + 12, elbow1Pos.current[1], elbow1Pos.current[2]]} 
        end={[eeJoint1Pos.current[0] + 12, eeJoint1Pos.current[1], eeJoint1Pos.current[2]]} 
        radius={2.5} 
        color={colors.carbonRod} 
      />

      {/* Arm 2 Dual Rods */}
      <Rod 
        start={[elbow2Pos.current[0] - 10, elbow2Pos.current[1], elbow2Pos.current[2] - 6]} 
        end={[eeJoint2Pos.current[0] - 10, eeJoint2Pos.current[1], eeJoint2Pos.current[2] - 6]} 
        radius={2.5} 
        color={colors.carbonRod} 
      />
      <Rod 
        start={[elbow2Pos.current[0] + 10, elbow2Pos.current[1], elbow2Pos.current[2] + 6]} 
        end={[eeJoint2Pos.current[0] + 10, eeJoint2Pos.current[1], eeJoint2Pos.current[2] + 6]} 
        radius={2.5} 
        color={colors.carbonRod} 
      />

      {/* Arm 3 Dual Rods */}
      <Rod 
        start={[elbow3Pos.current[0] - 10, elbow3Pos.current[1], elbow3Pos.current[2] + 6]} 
        end={[eeJoint3Pos.current[0] - 10, eeJoint3Pos.current[1], eeJoint3Pos.current[2] + 6]} 
        radius={2.5} 
        color={colors.carbonRod} 
      />
      <Rod 
        start={[elbow3Pos.current[0] + 10, elbow3Pos.current[1], elbow3Pos.current[2] - 6]} 
        end={[eeJoint3Pos.current[0] + 10, eeJoint3Pos.current[1], eeJoint3Pos.current[2] - 6]} 
        radius={2.5} 
        color={colors.carbonRod} 
      />

      {/* 4. MOVING END-EFFECTOR PLATFORM & GRIPPER */}
      <group ref={endEffectorRef} position={[targetPos.x, targetPos.z, -targetPos.y]}>
        {/* End-Effector Triangular Base */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[E * 0.9, E * 0.9, 8, 6]} />
          <meshStandardMaterial color={colors.endEffector} metalness={0.9} roughness={0.1} />
        </mesh>

        {/* Live glowing coordinate tip marker */}
        <mesh position={[0, -5, 0]}>
          <sphereGeometry args={[5, 16, 16]} />
          <meshStandardMaterial color={colors.upperArm} emissive={colors.upperArm} emissiveIntensity={0.9} />
        </mesh>

        {/* Articulated Gripper Fingers (Capit) */}
        <group position={[0, -8, 0]}>
          {/* Left Finger */}
          <group ref={gripLeftRef} position={[-8, 0, 0]}>
            <mesh position={[-4, -14, 0]}>
              <boxGeometry args={[4, 28, 6]} />
              <meshStandardMaterial color={colors.gripper} metalness={0.6} roughness={0.3} />
            </mesh>
          </group>

          {/* Right Finger */}
          <group ref={gripRightRef} position={[8, 0, 0]}>
            <mesh position={[4, -14, 0]}>
              <boxGeometry args={[4, 28, 6]} />
              <meshStandardMaterial color={colors.gripper} metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
