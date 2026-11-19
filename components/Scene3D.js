import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, Stars, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

// Objek Silo Semen (Tabung Tinggi)
const CementSilo = ({ position, color, scale = 1 }) => {
  return (
    <group position={position} scale={scale}>
      {/* Badan Silo */}
      <mesh position={[0, 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 4, 32]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.2} />
      </mesh>
      {/* Atap Silo */}
      <mesh position={[0, 4.5, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.2, 1, 32]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Pipa penyangga */}
      <mesh position={[1.2, 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 4, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.1} />
      </mesh>
    </group>
  );
};

// Objek Aset Barang (Box/Peti)
const AssetBox = ({ position, rotation, color, scale = 1 }) => {
  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      {/* Menggunakan MeshPhysicalMaterial untuk efek kaca / plastik metalik */}
      <meshPhysicalMaterial 
        color={color} 
        metalness={0.5} 
        roughness={0.1}
        clearcoat={1}
        clearcoatRoughness={0.1}
      />
      {/* Garis pinggir neon */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
        <lineBasicMaterial color="#ffffff" transparent opacity={0.3} />
      </lineSegments>
    </mesh>
  );
};

// Koleksi Aset Mengambang
const FloatingAssets = () => {
  const groupRef = useRef();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.y = Math.sin(t / 4) / 4;
    groupRef.current.rotation.z = Math.sin(t / 4) / 4;
    groupRef.current.position.y = Math.sin(t / 2) / 2;
  });

  return (
    <group ref={groupRef}>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <AssetBox position={[-3, 1, 0]} rotation={[Math.PI / 4, Math.PI / 4, 0]} color="#3b82f6" scale={1.5} />
      </Float>
      <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
        <AssetBox position={[3, 2, -2]} rotation={[Math.PI / 6, Math.PI / 3, 0]} color="#10b981" scale={1.2} />
      </Float>
      <Float speed={2.5} rotationIntensity={0.8} floatIntensity={1.5}>
        <AssetBox position={[0, -2, 2]} rotation={[Math.PI / 3, Math.PI / 6, 0]} color="#f59e0b" scale={1} />
      </Float>
    </group>
  );
};

// Kamera dinamis bereaksi terhadap pergerakan mouse
const CameraRig = ({ children }) => {
  const group = useRef();
  useFrame((state) => {
    // Menghitung pergerakan mouse (nilai dari -1 ke 1)
    const { pointer } = state;
    // Menggerakkan kamera (atau grup ini) secara perlahan (parallax)
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, (pointer.x * Math.PI) / 10, 0.05);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, (pointer.y * Math.PI) / 10, 0.05);
  });
  return <group ref={group}>{children}</group>;
};

export default function Scene3D() {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3, background: 'transparent' }}>
      <Canvas camera={{ position: [0, 0, 15], fov: 45 }} dpr={[1, 2]} gl={{ alpha: true }}>
        {/* Pencahayaan */}
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[10, 20, 10]} 
          intensity={1.5} 
          color="#e2e8f0" 
          castShadow 
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-10, -10, -10]} intensity={1} color="#3b82f6" />
        <pointLight position={[10, 10, 10]} intensity={0.5} color="#10b981" />

        {/* Latar Belakang Bintang */}
        <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />

        <CameraRig>
          <group position={[0, -2, 0]}>
            {/* Silo Utama */}
            <CementSilo position={[-4, 0, -5]} color="#94a3b8" scale={1.5} />
            <CementSilo position={[-1, 0, -6]} color="#64748b" scale={1.8} />
            <CementSilo position={[3, 0, -4]} color="#cbd5e1" scale={1.2} />

            {/* Aset Melayang di Depan */}
            <FloatingAssets />

            {/* Bayangan di Lantai */}
            <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={50} blur={2} far={10} />
          </group>
        </CameraRig>

        {/* Pantulan / Refleksi Lingkungan */}
        <Environment preset="city" />
      </Canvas>
      
      {/* Overlay tipis agar efek nyala 3D tidak terlalu tajam, dibiarkan transparan */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'transparent',
        pointerEvents: 'none'
      }}></div>
    </div>
  );
}
