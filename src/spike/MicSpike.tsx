import { Canvas, useFrame } from '@react-three/fiber'
import { createXRStore, XR } from '@react-three/xr'
import { useCallback, useRef, useState } from 'react'
import type { Mesh } from 'three'
import { CanvasText } from '../lib/CanvasText'

const store = createXRStore()

function LevelBar({ analyser }: { analyser: AnalyserNode | null }) {
  const bar = useRef<Mesh>(null)
  const buffer = useRef(new Uint8Array(0))

  useFrame(() => {
    if (!analyser || !bar.current) return
    if (buffer.current.length !== analyser.frequencyBinCount) {
      buffer.current = new Uint8Array(analyser.frequencyBinCount)
    }
    analyser.getByteTimeDomainData(buffer.current)

    let peak = 0
    for (const sample of buffer.current) peak = Math.max(peak, Math.abs(sample - 128))
    bar.current.scale.y = 0.05 + (peak / 128) * 3
  })

  return (
    <mesh ref={bar} position={[0, 1.2, -2]}>
      <boxGeometry args={[0.1, 1, 0.1]} />
      <meshBasicMaterial color="#00ff88" />
    </mesh>
  )
}

export function MicSpike() {
  const [status, setStatus] = useState('idle — press Request mic')
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const requestMic = useCallback(async () => {
    setStatus('requesting…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      await context.resume()
      const node = context.createAnalyser()
      node.fftSize = 2048
      context.createMediaStreamSource(stream).connect(node)
      setAnalyser(node)
      setStatus(`granted — audioContext.state=${context.state}`)
    } catch (error) {
      setStatus(`denied/failed: ${String(error)}`)
    }
  }, [])

  return (
    <>
      <div style={{ position: 'absolute', zIndex: 1, padding: 16 }}>
        <button style={{ fontSize: 22, padding: 12 }} onClick={() => store.enterVR()}>
          Enter VR
        </button>
        <button style={{ fontSize: 22, padding: 12, marginLeft: 12 }} onClick={() => void requestMic()}>
          Request mic
        </button>
      </div>
      {/* R3F points a fresh camera at the world origin, so the default
          [0, 1.6, 0] would look straight *down* and show none of this. Aim it
          at the content explicitly. In a session the headset owns the camera
          and this is ignored. */}
      <Canvas
        camera={{ position: [0, 1.3, 0.6], fov: 60 }}
        onCreated={({ camera }) => camera.lookAt(0, 1.35, -2)}
      >
        <XR store={store}>
          <color attach="background" args={['#101014']} />
          <ambientLight intensity={1} />
          <CanvasText
            position={[0, 1.7, -2]}
            fontSize={0.09}
            maxWidth={3}
            textAlign="center"
          >
            {status}
          </CanvasText>
          <LevelBar analyser={analyser} />
          {/* Selectable from inside the session with a controller — the case
              that might behave differently from a DOM button press. */}
          <mesh position={[0.8, 1.2, -2]} onClick={() => void requestMic()}>
            <boxGeometry args={[0.4, 0.2, 0.05]} />
            <meshBasicMaterial color="#ff5577" />
          </mesh>
          <CanvasText position={[0.8, 1.2, -1.94]} fontSize={0.05}>
            mic
          </CanvasText>
        </XR>
      </Canvas>
    </>
  )
}
