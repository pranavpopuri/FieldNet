import React from 'react'

const HopperStatus = ({ hoppers }) => {
  if (!hoppers || hoppers.length === 0) return null

  const getStatusColor = (status) => {
    switch (status) {
      case 'with_harvester': return '#4CAF50'  // Green - actively filling
      case 'traveling_to_harvester': return '#2196F3'  // Blue - en route
      case 'waiting_for_swap': return '#FF9800'  // Orange - waiting nearby
      case 'returning_to_pickup': return '#9C27B0'  // Purple - heading back
      case 'waiting_unload': return '#F44336'  // Red - waiting for truck
      case 'at_pickup': return '#607D8B'  // Gray - idle at pickup
      default: return '#607D8B'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'with_harvester': return 'Filling'
      case 'traveling_to_harvester': return 'En Route'
      case 'waiting_for_swap': return 'Standing By'
      case 'returning_to_pickup': return 'Returning'
      case 'waiting_unload': return 'Waiting Unload'
      case 'at_pickup': return 'At Pickup'
      default: return status?.replace(/_/g, ' ') || 'Idle'
    }
  }

  return (
    <div style={{
      background: 'rgba(0,0,0,0.85)',
      color: 'white',
      padding: '10px 14px',
      borderRadius: 8,
      fontSize: 12,
      minWidth: 180
    }}>
      <div style={{
        fontWeight: 600,
        marginBottom: 8,
        fontSize: 13,
        borderBottom: '1px solid rgba(255,255,255,0.2)',
        paddingBottom: 6
      }}>
        Hopper Status
      </div>

      {hoppers.map((hopper) => {
        const fillPercent = hopper.fill_percent || 0
        const statusColor = getStatusColor(hopper.status)

        return (
          <div
            key={hopper.id}
            style={{
              marginBottom: 8,
              padding: '6px 8px',
              background: hopper.is_active ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.05)',
              borderRadius: 6,
              border: hopper.is_active ? '1px solid rgba(76,175,80,0.5)' : '1px solid transparent'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4
            }}>
              <span style={{ fontWeight: 500 }}>
                Hopper {hopper.id + 1}
                {hopper.is_active && (
                  <span style={{
                    marginLeft: 6,
                    fontSize: 10,
                    color: '#4CAF50',
                    fontWeight: 600
                  }}>
                    ACTIVE
                  </span>
                )}
              </span>
              <span style={{
                fontSize: 10,
                color: statusColor,
                fontWeight: 500
              }}>
                {getStatusLabel(hopper.status)}
              </span>
            </div>

            {/* Fill bar */}
            <div style={{
              height: 12,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 6,
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${fillPercent}%`,
                background: fillPercent > 90 ? '#F44336' :
                           fillPercent > 70 ? '#FF9800' :
                           '#4CAF50',
                borderRadius: 6,
                transition: 'width 0.3s ease'
              }} />
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: 9,
                fontWeight: 600,
                textShadow: '0 0 3px rgba(0,0,0,0.8)'
              }}>
                {fillPercent.toFixed(0)}%
              </div>
            </div>

            {/* Bushels */}
            <div style={{
              marginTop: 3,
              fontSize: 10,
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'right'
            }}>
              {Math.round(hopper.fill_level || 0)} / {hopper.capacity} bu
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default HopperStatus
