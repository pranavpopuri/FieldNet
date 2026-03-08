import React, { useRef, useEffect, useState } from 'react'

const InteractiveHeatmap = ({ matrix, title = 'Estimated Yield', unit = 'Bu/Ac', min = 0, max = 250 }) => {
  const canvasRef = useRef(null)
  const [hoverInfo, setHoverInfo] = useState(null)

  useEffect(() => {
    if (!matrix || matrix.length === 0 || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const rows = matrix.length
    const cols = matrix[0].length

    const containerWidth = canvas.parentElement.clientWidth || 400
    const cellWidth = Math.max(2, Math.floor(containerWidth / cols))
    const cellHeight = cellWidth

    canvas.width = cols * cellWidth
    canvas.height = rows * cellHeight

    const getColor = (val) => {
      if (val === null || val === undefined) return '#333333'

      let pct = (val - min) / (max - min)
      pct = Math.max(0, Math.min(1, pct))

      // YlOrRd colorscale: Yellow (60) -> Orange (30) -> Red (0)
      const hue = 60 - (pct * 60)
      return `hsl(${hue}, 100%, 50%)`
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = matrix[r][c]
        ctx.fillStyle = getColor(val)
        ctx.fillRect(c * cellWidth, r * cellHeight, cellWidth, cellHeight)
      }
    }
  }, [matrix, min, max])

  const handleMouseMove = (e) => {
    if (!matrix || matrix.length === 0 || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    const rows = matrix.length
    const cols = matrix[0].length

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const cellWidth = canvas.clientWidth / cols
    const cellHeight = canvas.clientHeight / rows

    const c = Math.floor(x / cellWidth)
    const r = Math.floor(y / cellHeight)

    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      // Calculate 5x5 window average
      const radius = 2
      let sum = 0
      let count = 0
      for (let i = Math.max(0, r - radius); i <= Math.min(rows - 1, r + radius); i++) {
        for (let j = Math.max(0, c - radius); j <= Math.min(cols - 1, c + radius); j++) {
          const v = matrix[i][j]
          if (v !== null && v !== undefined) {
            sum += v
            count += 1
          }
        }
      }
      const val = count > 0 ? sum / count : null

      setHoverInfo({
        x: e.clientX,
        y: e.clientY,
        val: val,
        row: r,
        col: c
      })
    } else {
      setHoverInfo(null)
    }
  }

  const handleMouseLeave = () => {
    setHoverInfo(null)
  }

  if (!matrix || matrix.length === 0) return null

  return (
    <div style={{
      backgroundColor: 'white',
      padding: 15,
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <h3 style={{
        marginBottom: 15,
        marginTop: 0,
        fontSize: 16,
        fontWeight: 600,
        color: '#333'
      }}>
        {title}
      </h3>
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            cursor: 'crosshair',
            maxWidth: '100%',
            height: 'auto',
            border: '1px solid #ddd',
            borderRadius: 4
          }}
        />
      </div>

      {/* Color scale legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginTop: 12,
        fontSize: 12,
        color: '#666'
      }}>
        <span>{min.toFixed(1)}</span>
        <div style={{
          width: 150,
          height: 12,
          margin: '0 8px',
          background: 'linear-gradient(to right, hsl(60, 100%, 50%), hsl(30, 100%, 50%), hsl(0, 100%, 50%))',
          borderRadius: 2
        }} />
        <span>{max.toFixed(1)} {unit}</span>
      </div>

      {/* Floating tooltip */}
      {hoverInfo && hoverInfo.val !== null && (
        <div style={{
          position: 'fixed',
          top: hoverInfo.y + 15,
          left: hoverInfo.x + 15,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: 6,
          pointerEvents: 'none',
          zIndex: 9999,
          fontWeight: 600,
          fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>
          <div>{hoverInfo.val.toFixed(1)} {unit}</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 2, fontWeight: 'normal' }}>
            5x5 avg at [{hoverInfo.col}, {hoverInfo.row}]
          </div>
        </div>
      )}
    </div>
  )
}

export default InteractiveHeatmap
