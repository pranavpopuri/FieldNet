import React, { useState, useEffect } from 'react'

const FleetConfig = ({
  config,
  onChange,
  onRunSimulation,
  canRunSimulation = false,
  siloDistance = 0
}) => {
  const [feasibility, setFeasibility] = useState(null)
  const [checkingFeasibility, setCheckingFeasibility] = useState(false)

  const handleChange = (field, value) => {
    onChange({ ...config, [field]: value })
  }

  const defaultConfig = {
    truckCount: 3,
    truckCapacity: 950,
    hopperCount: 2,
    hopperCapacity: 500
  }

  // Check feasibility when config or silo distance changes
  useEffect(() => {
    if (!siloDistance || siloDistance <= 0) {
      setFeasibility(null)
      return
    }

    const checkFeasibility = async () => {
      setCheckingFeasibility(true)
      try {
        const response = await fetch('/api/fleet/feasibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            truck_count: config.truckCount,
            truck_capacity: config.truckCapacity,
            hopper_count: config.hopperCount,
            hopper_capacity: config.hopperCapacity,
            silo_distance_miles: siloDistance
          })
        })
        const data = await response.json()
        setFeasibility(data)
      } catch (err) {
        console.error('Feasibility check failed:', err)
        setFeasibility(null)
      } finally {
        setCheckingFeasibility(false)
      }
    }

    // Debounce the check
    const timer = setTimeout(checkFeasibility, 500)
    return () => clearTimeout(timer)
  }, [config.truckCount, config.hopperCount, config.truckCapacity, config.hopperCapacity, siloDistance])

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
          Fleet Config
        </h3>
        <button
          onClick={() => onChange(defaultConfig)}
          style={{
            padding: '2px 8px',
            fontSize: 10,
            background: '#f0f0f0',
            color: '#666',
            border: '1px solid #ccc',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ fontSize: 11, color: '#333' }}>
          <span style={{ fontWeight: 500, display: 'block', marginBottom: 2 }}>Trucks</span>
          <input
            type="number"
            min="1"
            max="20"
            value={config.truckCount}
            onChange={(e) => handleChange('truckCount', parseInt(e.target.value) || 1)}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 13,
              border: feasibility && !feasibility.is_feasible ? '2px solid #f44336' : '1px solid #ccc',
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </label>

        <label style={{ fontSize: 11, color: '#333' }}>
          <span style={{ fontWeight: 500, display: 'block', marginBottom: 2 }}>Hoppers</span>
          <input
            type="number"
            min="1"
            max="10"
            value={config.hopperCount}
            onChange={(e) => handleChange('hopperCount', parseInt(e.target.value) || 1)}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 13,
              border: '1px solid #ccc',
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </label>

        <label style={{ fontSize: 11, color: '#333' }}>
          <span style={{ fontWeight: 500, display: 'block', marginBottom: 2 }}>Truck Cap.</span>
          <input
            type="number"
            min="100"
            max="2000"
            step="50"
            value={config.truckCapacity}
            onChange={(e) => handleChange('truckCapacity', parseInt(e.target.value) || 950)}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 13,
              border: '1px solid #ccc',
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </label>

        <label style={{ fontSize: 11, color: '#333' }}>
          <span style={{ fontWeight: 500, display: 'block', marginBottom: 2 }}>Hopper Cap.</span>
          <input
            type="number"
            min="100"
            max="1500"
            step="50"
            value={config.hopperCapacity}
            onChange={(e) => handleChange('hopperCapacity', parseInt(e.target.value) || 500)}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 13,
              border: '1px solid #ccc',
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </label>
      </div>

      {/* Feasibility Warning */}
      {feasibility && !feasibility.is_feasible && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          background: '#fff3e0',
          border: '1px solid #ff9800',
          borderRadius: 6,
          fontSize: 11
        }}>
          <div style={{
            fontWeight: 600,
            color: '#e65100',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <span>Warning: Fleet Undersized</span>
          </div>
          <div style={{ color: '#bf360c', marginBottom: 4 }}>
            Need {feasibility.minimum_trucks_needed} trucks (have {feasibility.current_trucks})
          </div>
          <div style={{ color: '#666', fontSize: 10 }}>
            Expected idle rate: ~{feasibility.expected_idle_rate}%
          </div>
        </div>
      )}

      {/* Feasibility OK indicator */}
      {feasibility && feasibility.is_feasible && (
        <div style={{
          marginTop: 10,
          padding: '6px 10px',
          background: '#e8f5e9',
          border: '1px solid #4caf50',
          borderRadius: 6,
          fontSize: 11,
          color: '#2e7d32',
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          <span>Fleet adequate for distance</span>
        </div>
      )}

      <button
        onClick={onRunSimulation}
        disabled={!canRunSimulation}
        style={{
          width: '100%',
          padding: '10px 12px',
          fontSize: 13,
          fontWeight: 600,
          background: canRunSimulation ? '#4CAF50' : '#ccc',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: canRunSimulation ? 'pointer' : 'not-allowed',
          marginTop: 10
        }}
      >
        Run Simulation
      </button>

      {!canRunSimulation && (
        <div style={{
          fontSize: 10,
          color: '#999',
          marginTop: 6,
          textAlign: 'center'
        }}>
          Set field, pickup & silo first
        </div>
      )}
    </div>
  )
}

export default FleetConfig
