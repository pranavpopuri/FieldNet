import React, { useState, useEffect, useRef, useCallback } from 'react'

// Interpolate between two values
const lerp = (a, b, t) => a + (b - a) * t

// Interpolate position objects
const lerpPosition = (pos1, pos2, t) => {
  if (!pos1 || !pos2) return pos1 || pos2 || { lat: 0, lon: 0 }
  return {
    lat: lerp(pos1.lat || 0, pos2.lat || 0, t),
    lon: lerp(pos1.lon || 0, pos2.lon || 0, t)
  }
}

// Interpolate a full frame between two frames
const interpolateFrame = (frame1, frame2, t) => {
  if (!frame1) return frame2
  if (!frame2) return frame1

  return {
    time: lerp(frame1.time, frame2.time, t),
    harvester: {
      ...frame1.harvester,
      lat: lerp(frame1.harvester?.lat || 0, frame2.harvester?.lat || 0, t),
      lon: lerp(frame1.harvester?.lon || 0, frame2.harvester?.lon || 0, t),
      status: t < 0.5 ? frame1.harvester?.status : frame2.harvester?.status,
      current_pass: t < 0.5 ? frame1.harvester?.current_pass : frame2.harvester?.current_pass
    },
    trucks: (frame1.trucks || []).map((truck, i) => {
      const truck2 = frame2.trucks?.[i] || truck
      // Don't interpolate truck positions - the backend already handles route interpolation
      // Interpolating here would cause "cutting corners" on curved routes
      const useTruck = t < 0.5 ? truck : truck2
      return {
        ...useTruck,
        // Only interpolate load smoothly
        load: lerp(truck.load || 0, truck2.load || 0, t)
      }
    }),
    hoppers: (frame1.hoppers || []).map((hopper, i) => {
      const hopper2 = frame2.hoppers?.[i] || hopper
      // Interpolate hopper positions for smooth movement
      return {
        ...hopper,
        lat: lerp(hopper.lat || 0, hopper2.lat || 0, t),
        lon: lerp(hopper.lon || 0, hopper2.lon || 0, t),
        fill_level: lerp(hopper.fill_level || 0, hopper2.fill_level || 0, t),
        fill_percent: lerp(hopper.fill_percent || 0, hopper2.fill_percent || 0, t),
        // Use later status for transition display
        status: t < 0.5 ? hopper.status : hopper2.status,
        is_active: t < 0.5 ? hopper.is_active : hopper2.is_active
      }
    })
  }
}

const AnimationPlayer = ({
  frames,
  onFrameChange,
  totalTimeMinutes,
  isVisible = true
}) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [interpolationT, setInterpolationT] = useState(0) // 0-1 between frames
  const [playbackSpeed, setPlaybackSpeed] = useState(50) // 50x speed by default for faster playback
  const animationRef = useRef(null)
  const lastTimeRef = useRef(0)

  const frameInterval = frames.length > 1
    ? (frames[1]?.time - frames[0]?.time) || 0.5
    : 0.5

  // Reset animation state when frames array reference changes (e.g., switching cases)
  const framesRef = useRef(frames)
  useEffect(() => {
    if (framesRef.current !== frames) {
      framesRef.current = frames
      setCurrentFrameIndex(0)
      setInterpolationT(0)
      setIsPlaying(false)
      lastTimeRef.current = 0
    }
  }, [frames])

  // Smooth animation loop with interpolation
  useEffect(() => {
    if (!isPlaying || !frames || frames.length === 0) return

    const animate = (timestamp) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp
      }

      const deltaMs = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      // Calculate how much simulation time passes per real millisecond
      // frameInterval is in minutes, playbackSpeed is multiplier
      const simMinutesPerMs = playbackSpeed / (60 * 1000)
      const simMinutesDelta = deltaMs * simMinutesPerMs

      // Update interpolation progress
      setInterpolationT(prev => {
        const newT = prev + (simMinutesDelta / frameInterval)

        if (newT >= 1) {
          // Move to next frame
          setCurrentFrameIndex(prevIdx => {
            const nextIdx = prevIdx + 1
            if (nextIdx >= frames.length) {
              setIsPlaying(false)
              return frames.length - 1  // Stay at last frame
            }
            return nextIdx
          })
          return newT - 1 // Carry over excess
        }
        return newT
      })

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, frames, frameInterval, playbackSpeed])

  // Notify parent with interpolated frame
  useEffect(() => {
    if (!frames || frames.length === 0) return

    const frame1 = frames[currentFrameIndex]
    const frame2 = frames[currentFrameIndex + 1]

    if (frame1) {
      const interpolatedFrame = frame2
        ? interpolateFrame(frame1, frame2, interpolationT)
        : frame1
      onFrameChange?.(interpolatedFrame, currentFrameIndex)
    }
  }, [currentFrameIndex, interpolationT, frames, onFrameChange])

  const handlePlayPause = useCallback(() => {
    if (currentFrameIndex >= frames.length - 2) {
      setCurrentFrameIndex(0)
      setInterpolationT(0)
      lastTimeRef.current = 0
    }
    setIsPlaying(prev => !prev)
  }, [currentFrameIndex, frames.length])

  const handleSliderChange = useCallback((e) => {
    const newIndex = parseInt(e.target.value, 10)
    setCurrentFrameIndex(newIndex)
    setInterpolationT(0)
    setIsPlaying(false)
    lastTimeRef.current = 0
  }, [])

  const handleSpeedChange = useCallback((speed) => {
    setPlaybackSpeed(speed)
  }, [])

  const handleReset = useCallback(() => {
    setCurrentFrameIndex(0)
    setInterpolationT(0)
    setIsPlaying(false)
    lastTimeRef.current = 0
  }, [])

  if (!isVisible || !frames || frames.length === 0) {
    return null
  }

  const currentFrame = frames[currentFrameIndex]
  const currentTime = currentFrame?.time || 0
  const hours = Math.floor(currentTime / 60)
  const minutes = Math.round(currentTime % 60)
  const timeDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

  const totalHours = Math.floor(totalTimeMinutes / 60)
  const totalMins = Math.round(totalTimeMinutes % 60)
  const totalDisplay = totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.85)',
      padding: '12px 16px',
      borderRadius: 8,
      color: 'white',
      fontSize: 13,
      minWidth: 320
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10
      }}>
        <span style={{ fontWeight: 600 }}>Harvest Animation</span>
        <span style={{ color: '#aaa', fontSize: 12 }}>
          {timeDisplay} / {totalDisplay}
        </span>
      </div>

      {/* Timeline scrubber */}
      <input
        type="range"
        min={0}
        max={frames.length - 1}
        value={currentFrameIndex}
        onChange={handleSliderChange}
        style={{
          width: '100%',
          height: 6,
          marginBottom: 12,
          cursor: 'pointer',
          accentColor: '#4CAF50'
        }}
      />

      {/* Controls row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}>
        {/* Play/Pause button */}
        <button
          onClick={handlePlayPause}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: '#4CAF50',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Reset button */}
        <button
          onClick={handleReset}
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            border: 'none',
            background: '#555',
            color: 'white',
            cursor: 'pointer',
            fontSize: 12
          }}
        >
          Reset
        </button>

        {/* Speed selector */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[10, 50, 100, 200, 500].map(speed => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: 'none',
                background: playbackSpeed === speed ? '#4CAF50' : '#444',
                color: 'white',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: playbackSpeed === speed ? 600 : 400
              }}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* Current status display */}
      {currentFrame && (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid rgba(255,255,255,0.2)',
          fontSize: 12,
          color: '#ccc'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Pass: {currentFrame.harvester?.current_pass || '-'}</span>
            <span>Status: {currentFrame.harvester?.status || '-'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnimationPlayer
