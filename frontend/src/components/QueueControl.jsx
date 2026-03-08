import React, { useState, useEffect, useCallback } from 'react'

const QUEUE_PATTERNS = [
  { value: 'static', label: 'Static' },
  { value: 'ramp_up', label: 'Ramp Up' },
  { value: 'ramp_down', label: 'Ramp Down' }
]

const PATTERN_DESCRIPTIONS = {
  static: 'Constant queue time throughout harvest',
  ramp_up: 'Increases from 0 to max during harvest',
  ramp_down: 'Decreases from max to 0 during harvest'
}

const QueueControl = ({ onQueueChange, onPatternChange, disabled = false }) => {
  const [queueTime, setQueueTime] = useState(0)
  const [queuePattern, setQueuePattern] = useState('static')
  const [loading, setLoading] = useState(false)

  // Fetch current queue time on mount
  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const response = await fetch('/api/queue')
        const data = await response.json()
        setQueueTime(data.queue_time || 0)
      } catch (err) {
        console.error('Error fetching queue:', err)
      }
    }
    fetchQueue()
  }, [])

  const handleSliderChange = useCallback(async (e) => {
    const newValue = parseFloat(e.target.value)
    setQueueTime(newValue)

    // Debounce API call
    setLoading(true)
    try {
      const response = await fetch('/api/queue/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_time: newValue })
      })
      const data = await response.json()
      onQueueChange?.(data.queue_time)
    } catch (err) {
      console.error('Error setting queue:', err)
    } finally {
      setLoading(false)
    }
  }, [onQueueChange])

  // Format display
  const formatTime = (minutes) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`
    }
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return `${hours}h ${mins}m`
  }

  // Queue severity color
  const getQueueColor = (minutes) => {
    if (minutes <= 10) return '#4CAF50'  // Green - short queue
    if (minutes <= 30) return '#FFC107'  // Yellow - moderate
    if (minutes <= 60) return '#FF9800'  // Orange - long
    return '#f44336'  // Red - very long
  }

  const handlePatternSelect = (pattern) => {
    setQueuePattern(pattern)
    onPatternChange?.(pattern)
  }

  return (
    <div style={{
      background: 'white',
      padding: 12,
      borderRadius: 8,
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      width: 320
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        borderBottom: '1px solid #eee',
        paddingBottom: 8
      }}>
        <h3 style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: '#333'
        }}>
          Silo Queue
        </h3>
        <span style={{
          color: getQueueColor(queueTime),
          fontWeight: 600,
          fontSize: 14
        }}>
          {formatTime(queueTime)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={120}
        step={5}
        value={queueTime}
        onChange={handleSliderChange}
        disabled={disabled || loading}
        style={{
          width: '100%',
          height: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          accentColor: getQueueColor(queueTime)
        }}
      />

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 10,
        color: '#999',
        marginTop: 4
      }}>
        <span>0 min</span>
        <span>1 hr</span>
        <span>2 hr</span>
      </div>

      {/* Queue Pattern Selector - Button Pills */}
      <div style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: '1px solid #eee'
      }}>
        <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 11, color: '#666' }}>
          Pattern (Simulation)
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6
        }}>
          {QUEUE_PATTERNS.map(p => (
            <button
              key={p.value}
              onClick={() => handlePatternSelect(p.value)}
              disabled={disabled}
              style={{
                padding: '5px 10px',
                fontSize: 10,
                fontWeight: queuePattern === p.value ? 600 : 400,
                background: queuePattern === p.value ? '#4CAF50' : '#f5f5f5',
                color: queuePattern === p.value ? 'white' : '#666',
                border: queuePattern === p.value ? '1px solid #4CAF50' : '1px solid #ddd',
                borderRadius: 12,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{
          fontSize: 10,
          color: '#888',
          marginTop: 8
        }}>
          {PATTERN_DESCRIPTIONS[queuePattern]}
        </div>
      </div>

      <div style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px solid #eee',
        fontSize: 11,
        color: '#666'
      }}>
        {queuePattern === 'static' && queueTime === 0 && 'No queue wait at silo'}
        {queuePattern === 'static' && queueTime > 0 && queueTime <= 15 && 'Short queue - Case 1 optimal'}
        {queuePattern === 'static' && queueTime > 15 && queueTime <= 45 && 'Moderate queue - monitor closely'}
        {queuePattern === 'static' && queueTime > 45 && 'Long queue - consider Case 2'}
        {queuePattern === 'ramp_up' && `Queue grows to ${formatTime(queueTime)} by harvest end`}
        {queuePattern === 'ramp_down' && `Queue starts at ${formatTime(queueTime)}, drops to 0`}
      </div>
    </div>
  )
}

export default QueueControl
