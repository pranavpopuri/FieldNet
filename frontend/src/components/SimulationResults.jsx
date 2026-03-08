import React from 'react'

const SimulationResults = ({
  results,        // Current/selected case results (for animation)
  case1Results,   // Case 1 simulation results
  case2Results,   // Case 2 simulation results
  loading,
  onSelectCase    // Callback when user selects a case to view animation
}) => {
  if (loading) {
    return (
      <div style={{
        background: 'white',
        padding: 16,
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        width: 320
      }}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 14, color: '#666' }}>Running Both Simulations...</div>
          <div style={{
            marginTop: 10,
            width: 30,
            height: 30,
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #4CAF50',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '10px auto'
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    )
  }

  if (!case1Results && !case2Results) {
    return null
  }

  const formatTime = (minutes) => {
    if (minutes === undefined || minutes === null) return '-'
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  const getEfficiencyColor = (score) => {
    if (score >= 95) return '#4CAF50'
    if (score >= 85) return '#FF9800'
    return '#f44336'
  }

  // Determine which case is better
  const getBetterCase = () => {
    if (!case1Results || !case2Results) return null

    // Primary metric: less total time is better
    const time1 = case1Results.total_time_minutes || 0
    const time2 = case2Results.total_time_minutes || 0

    // Secondary: less idle time is better
    const idle1 = case1Results.idle_time_minutes || 0
    const idle2 = case2Results.idle_time_minutes || 0

    // If one has significantly less total time, prefer it
    if (time1 < time2 - 1) return 1
    if (time2 < time1 - 1) return 2

    // If total times are close, prefer less idle time
    if (idle1 < idle2 - 0.5) return 1
    if (idle2 < idle1 - 0.5) return 2

    // If very close, prefer Case 1 (higher yield first)
    return time1 <= time2 ? 1 : 2
  }

  const betterCase = getBetterCase()
  const selectedCase = results?.case || betterCase || 1

  const renderCaseColumn = (caseResults, caseNum) => {
    if (!caseResults) return null

    const isBetter = betterCase === caseNum
    const isSelected = selectedCase === caseNum

    return (
      <div
        onClick={() => onSelectCase?.(caseNum)}
        style={{
          flex: 1,
          padding: 12,
          background: isSelected ? (caseNum === 1 ? '#e3f2fd' : '#f3e5f5') : '#fafafa',
          borderRadius: 6,
          cursor: 'pointer',
          border: isBetter ? `2px solid ${caseNum === 1 ? '#2196F3' : '#9C27B0'}` : '2px solid transparent',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8
        }}>
          <span style={{
            fontWeight: 600,
            fontSize: 12,
            color: caseNum === 1 ? '#1565C0' : '#7B1FA2'
          }}>
            Case {caseNum}
          </span>
          {isBetter && (
            <span style={{
              background: caseNum === 1 ? '#2196F3' : '#9C27B0',
              color: 'white',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 600
            }}>
              BETTER
            </span>
          )}
        </div>

        {/* Label */}
        <div style={{
          fontSize: 10,
          color: '#666',
          marginBottom: 10
        }}>
          {caseNum === 1 ? 'High→Low Yield' : 'Low→High Yield'}
        </div>

        {/* Metrics */}
        <div style={{ fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Time:</span>
            <span style={{ fontWeight: 600 }}>{formatTime(caseResults.total_time_minutes)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Efficiency:</span>
            <span style={{
              fontWeight: 600,
              color: getEfficiencyColor(caseResults.efficiency_score)
            }}>
              {caseResults.efficiency_score}%
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Idle Events:</span>
            <span style={{
              fontWeight: 600,
              color: caseResults.idle_events > 0 ? '#f44336' : '#4CAF50'
            }}>
              {caseResults.idle_events}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Idle Time:</span>
            <span style={{ fontWeight: 600 }}>{formatTime(caseResults.idle_time_minutes)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#888' }}>Queue Wait:</span>
            <span style={{ fontWeight: 600, color: caseResults.total_queue_wait_minutes > 0 ? '#FF9800' : '#4CAF50' }}>
              {formatTime(caseResults.total_queue_wait_minutes || 0)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888' }}>Switches:</span>
            <span style={{ fontWeight: 600 }}>
              {caseResults.switch_events?.length || 0}
            </span>
          </div>
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div style={{
            position: 'absolute',
            bottom: -8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: `8px solid ${caseNum === 1 ? '#e3f2fd' : '#f3e5f5'}`
          }} />
        )}
      </div>
    )
  }

  // Calculate time saved
  const getTimeSaved = () => {
    if (!case1Results || !case2Results) return null
    const diff = Math.abs(case1Results.idle_time_minutes - case2Results.idle_time_minutes)
    if (diff < 0.5) return null
    return {
      minutes: diff,
      betterCase: case1Results.idle_time_minutes < case2Results.idle_time_minutes ? 1 : 2
    }
  }

  const timeSaved = getTimeSaved()

  return (
    <div style={{
      background: 'white',
      padding: 14,
      borderRadius: 8,
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      width: 320
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: '1px solid #eee'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: '#333'
        }}>
          Simulation Comparison
        </h3>
        {betterCase && (
          <span style={{
            fontSize: 10,
            color: '#666'
          }}>
            Click to view animation
          </span>
        )}
      </div>

      {/* Side by side comparison */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 12
      }}>
        {renderCaseColumn(case1Results, 1)}
        {renderCaseColumn(case2Results, 2)}
      </div>

      {/* Recommendation */}
      {betterCase && (
        <div style={{
          background: betterCase === 1 ? '#e3f2fd' : '#f3e5f5',
          padding: '10px 12px',
          borderRadius: 6,
          borderLeft: `3px solid ${betterCase === 1 ? '#2196F3' : '#9C27B0'}`
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: betterCase === 1 ? '#1565C0' : '#7B1FA2',
            marginBottom: 4
          }}>
            Recommendation: Case {betterCase}
          </div>
          <div style={{ fontSize: 11, color: '#555' }}>
            {betterCase === 1
              ? 'Start with high-yield passes for optimal throughput.'
              : 'Start with low-yield passes to prevent hopper overflow during queue delays.'}
            {timeSaved && (
              <span style={{ fontWeight: 600 }}>
                {' '}Saves {formatTime(timeSaved.minutes)} of idle time.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Shared stats */}
      {case1Results && (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid #eee',
          fontSize: 11,
          color: '#666',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>Total Bushels: {case1Results.bushels_harvested?.toLocaleString()}</span>
          <span>Passes: {case1Results.passes_completed}</span>
        </div>
      )}
    </div>
  )
}

export default SimulationResults
