import React from 'react'

const RecommendationPanel = ({
  currentFrame,
  switchEvents = [],
  initialCase = 1
}) => {
  if (!currentFrame) return null

  const switching = currentFrame.switching || {}
  const currentCase = switching.current_case || initialCase
  const xThreshold = switching.x_threshold || 0
  const queueTime = switching.queue_time || 0
  const fillRate = switching.fill_rate || 0

  // Determine status
  const queueVsX = queueTime - xThreshold
  const isAtRisk = queueVsX > 0
  const urgency = queueVsX > xThreshold * 0.5 ? 'high' : queueVsX > 0 ? 'medium' : 'low'

  // Colors based on urgency
  const getStatusColor = () => {
    if (urgency === 'high') return '#f44336'
    if (urgency === 'medium') return '#FF9800'
    return '#4CAF50'
  }

  const getCaseDescription = (caseNum) => {
    return caseNum === 1
      ? 'High-to-Low Yield'
      : 'Low-to-High Yield'
  }

  const getCaseRationale = (caseNum) => {
    return caseNum === 1
      ? 'Maximizing throughput - trucks returning quickly'
      : 'Slowing grain accumulation - giving trucks more time'
  }

  // Get recent switch events (last 3)
  const recentSwitches = switchEvents.slice(-3).reverse()

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.85)',
      padding: '12px 16px',
      borderRadius: 8,
      color: 'white',
      fontSize: 13,
      width: 260
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,0.2)'
      }}>
        <span style={{ fontWeight: 600 }}>Recommendation</span>
        <span style={{
          background: currentCase === 1 ? '#2196F3' : '#9C27B0',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600
        }}>
          Case {currentCase}
        </span>
      </div>

      {/* Current Case Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: currentCase === 1 ? '#2196F3' : '#9C27B0',
          marginBottom: 4
        }}>
          {getCaseDescription(currentCase)}
        </div>
        <div style={{ fontSize: 11, color: '#aaa' }}>
          {getCaseRationale(currentCase)}
        </div>
      </div>

      {/* X Threshold vs Queue */}
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        padding: 10,
        borderRadius: 6,
        marginBottom: 12
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 6
        }}>
          <span>X Threshold:</span>
          <span style={{ fontWeight: 600 }}>{xThreshold.toFixed(1)} min</span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 6
        }}>
          <span>Queue Time:</span>
          <span style={{ fontWeight: 600, color: getStatusColor() }}>
            {queueTime.toFixed(1)} min
          </span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          <span>Status:</span>
          <span style={{
            fontWeight: 600,
            color: getStatusColor()
          }}>
            {isAtRisk ? `+${queueVsX.toFixed(1)} min over` : 'On Track'}
          </span>
        </div>
      </div>

      {/* Fill Rate */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 12,
        fontSize: 12,
        color: '#ccc'
      }}>
        <span>Fill Rate:</span>
        <span>{fillRate.toFixed(1)} bu/min</span>
      </div>

      {/* Switch Events */}
      {recentSwitches.length > 0 && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.2)',
          paddingTop: 10
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 6,
            color: '#FF9800'
          }}>
            Switch History
          </div>
          {recentSwitches.map((event, idx) => (
            <div key={idx} style={{
              fontSize: 10,
              color: '#aaa',
              marginBottom: 4,
              padding: '4px 6px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 4
            }}>
              <span style={{ color: '#fff' }}>
                {Math.floor(event.time / 60)}h {Math.round(event.time % 60)}m
              </span>
              {' '}Case {event.from_case} → {event.to_case}
            </div>
          ))}
        </div>
      )}

      {/* Recommendation */}
      <div style={{
        marginTop: 10,
        padding: '8px 10px',
        background: isAtRisk
          ? 'rgba(244, 67, 54, 0.2)'
          : 'rgba(76, 175, 80, 0.2)',
        borderRadius: 6,
        fontSize: 11,
        borderLeft: `3px solid ${getStatusColor()}`
      }}>
        {isAtRisk ? (
          currentCase === 1
            ? 'Consider switching to Case 2 to reduce idle risk'
            : 'Staying in Case 2 - queue still elevated'
        ) : (
          currentCase === 1
            ? 'Optimal - continue high-yield harvesting'
            : 'Queue improving - may switch back to Case 1 soon'
        )}
      </div>
    </div>
  )
}

export default RecommendationPanel
