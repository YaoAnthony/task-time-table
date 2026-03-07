import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Companion3DProps {
  className?: string;
}

const Companion3D: React.FC<Companion3DProps> = ({ className = '' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(200, 200);
    // 增加输出色调映射，让色彩更鲜亮
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    currentMount.appendChild(renderer.domElement);

    // 2. Build the "Companion" (A floating Sci-Fi/Minecraft style core)
    const companionGroup = new THREE.Group();
    scene.add(companionGroup);

    // Core body (A glowing cube)
    const coreGeometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.2,
      transmission: 0.9, // glass-like
      thickness: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });
    const coreBox = new THREE.Mesh(coreGeometry, coreMaterial);
    companionGroup.add(coreBox);

    // Inner glowing energy sphere
    const energyGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const energyMaterial = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true });
    const energySphere = new THREE.Mesh(energyGeometry, energyMaterial);
    companionGroup.add(energySphere);

    // Orbiting rings
    const ringGeometry = new THREE.TorusGeometry(1.5, 0.05, 8, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffc72c, 
        metalness: 0.8, 
        roughness: 0.2,
        emissive: 0xffc72c,
        emissiveIntensity: 0.5
    });
    const ring1 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring1.rotation.x = Math.PI / 2;
    companionGroup.add(ring1);

    const ring2 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring2.rotation.y = Math.PI / 2;
    companionGroup.add(ring2);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffc72c, 5, 10);
    pointLight.position.set(2, 2, 2);
    scene.add(pointLight);
    
    const pointLight2 = new THREE.PointLight(0x00f3ff, 5, 10);
    pointLight2.position.set(-2, -2, -2);
    scene.add(pointLight2);

    // 4. Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const time = Date.now() * 0.001;

      // Base floating and rotation
      companionGroup.position.y = Math.sin(time * 2) * 0.2;
      
      coreBox.rotation.x += 0.005;
      coreBox.rotation.y += 0.01;

      energySphere.rotation.x -= 0.02;
      energySphere.rotation.y -= 0.02;
      // Pulse energy color
      const pulseColor = new THREE.Color().setHSL((Math.sin(time) + 1) * 0.5 * 0.1 + 0.5, 1, 0.5); // Cyans/Blues
      energyMaterial.color.copy(pulseColor);

      ring1.rotation.z += 0.01;
      ring1.rotation.y = Math.sin(time) * 0.3;
      
      ring2.rotation.z -= 0.015;
      ring2.rotation.x = Math.cos(time) * 0.3;

      // Mouse tracking (look at mouse)
      const targetX = mouseRef.current.x * 0.5;
      const targetY = mouseRef.current.y * 0.5;
      companionGroup.rotation.y += (targetX - companionGroup.rotation.y) * 0.05;
      companionGroup.rotation.x += (targetY - companionGroup.rotation.x) * 0.05;

      renderer.render(scene, camera);
    };

    animate();

    // 5. Mouse Interaction
    const handleMouseMove = (event: MouseEvent) => {
      // Normalize mouse to -1 to 1 based on screen width/height
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      if (currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      // Dispose resources
      coreGeometry.dispose();
      coreMaterial.dispose();
      energyGeometry.dispose();
      energyMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div 
        className={`w-[200px] h-[200px] pointer-events-none flex items-center justify-center ${className}`} 
        ref={mountRef} 
    />
  );
};

export default Companion3D;
