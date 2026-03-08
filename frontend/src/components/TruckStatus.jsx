import React from 'react'

const TruckStatus = ({ trucks, siloDistance }) => {
  if (!trucks || trucks.length === 0) return null

  // Filter to only show active trucks (not idle)
  const activeTrucks = trucks.filter(t => t.status !== 'idle')

  const getStatusColor = (status) => {
    switch (status) {
      case 'traveling_to_silo': return '#2196F3'  // Blue - en route to silo
      case 'in_queue': return '#FF9800'  // Orange - waiting at silo
      case 'unloading': return '#9C27B0'  // Purple - unloading
      case 'returning': return '#4CAF50'  // Green - coming back
      case 'idle': return '#607D8B'  // Gray - waiting
      default: return '#607D8B'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'traveling_to_silo': return 'To Silo'
      case 'in_queue': return 'In Queue'
      case 'unloading': return 'Unloading'
      case 'returning': return 'Returning'
      case 'idle': return 'Waiting'
      default: return status?.replace(/_/g, ' ') || 'Idle'
    }
  }

  const getDistanceToDestination = (truck) => {
    const progress = truck.progress || 0
    const totalDist = siloDistance || 5  // miles

    if (truck.status === 'traveling_to_silo') {
      // Distance remaining to silo
      return ((1 - progress) * totalDist).toFixed(1)
    } else if (truck.status === 'returning') {
      // Distance remaining to pickup
      return (progress * totalDist).toFixed(1)
    } else if (truck.status === 'in_queue' || truck.status === 'unloading') {
      return '0.0'  // At silo
    }
    return '-'
  }

  const getDestinationLabel = (status) => {
    if (status === 'traveling_to_silo') return 'to silo'
    if (status === 'returning') return 'to field'
    if (status === 'in_queue' || status === 'unloading') return 'at silo'
    return ''
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
        paddingBottom: 6,
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Truck Status</span>
        <span style={{ color: '#aaa', fontWeight: 400 }}>
          {activeTrucks.length}/{trucks.length} active
        </span>
      </div>

      {trucks.map((truck) => {
        const statusColor = getStatusColor(truck.status)
        const distance = getDistanceToDestination(truck)
        const destLabel = getDestinationLabel(truck.status)

        return (
          <div
            key={truck.id}
            style={{
              marginBottom: 6,
              padding: '6px 8px',
              background: truck.status !== 'idle' ? 'rgba(33,150,243,0.15)' : 'rgba(255,255,255,0.05)',
              borderRadius: 6,
              opacity: truck.status === 'idle' ? 0.6 : 1
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontWeight: 500 }}>
                Truck {truck.id + 1}
              </span>
              <span style={{
                fontSize: 10,
                color: statusColor,
                fontWeight: 500
              }}>
                {getStatusLabel(truck.status)}
              </span>
            </div>

            {truck.status !== 'idle' && (
              <div style={{
                marginTop: 4,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: 'rgba(255,255,255,0.7)'
              }}>
                <span>
                  {truck.load > 0 ? `${Math.round(truck.load)} bu` : 'Empty'}
                </span>
                <span>
                  {distance !== '-' && `${distance} mi ${destLabel}`}
                </span>
              </div>
            )}

            {/* Queue wait time for trucks in queue */}
            {truck.status === 'in_queue' && truck.in_queue_since > 0 && (
              <div style={{
                marginTop: 4,
                fontSize: 10,
                color: '#FF9800',
                fontWeight: 500
              }}>
                Waiting: {Math.round(truck.in_queue_since)} min
              </div>
            )}

            {/* Show last queue wait for trucks that just finished queue */}
            {truck.status === 'unloading' && truck.queue_wait > 0 && (
              <div style={{
                marginTop: 4,
                fontSize: 10,
                color: '#aaa'
              }}>
                Queue wait: {Math.round(truck.queue_wait)} min
              </div>
            )}

            {/* Progress bar for traveling trucks */}
            {(truck.status === 'traveling_to_silo' || truck.status === 'returning') && (
              <div style={{
                marginTop: 4,
                height: 4,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 2,
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${(truck.status === 'traveling_to_silo' ? truck.progress : 1 - truck.progress) * 100}%`,
                  background: statusColor,
                  borderRadius: 2,
                  transition: 'width 0.3s ease'
                }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TruckStatus
