import React, { useMemo } from 'react'
import { Polyline, Tooltip } from 'react-leaflet'

const ROWS_PER_PASS = 8 // Harvester does 8 rows at once

const RowOverlay = ({ bounds, showRows = true, showHarvesterPaths = true }) => {
  const { rows, harvesterPaths } = useMemo(() => {
    if (!bounds) return { rows: [], harvesterPaths: [] }

    const { sw_lat, sw_lon, ne_lat, ne_lon } = bounds

    // Calculate field dimensions in meters
    // At ~40° latitude (Illinois), 1 degree lat ≈ 111km, 1 degree lon ≈ 85km
    const latMetersPerDeg = 111000
    const lonMetersPerDeg = 85000 * Math.cos((sw_lat + ne_lat) / 2 * Math.PI / 180)

    const heightMeters = (ne_lat - sw_lat) * latMetersPerDeg
    const widthMeters = (ne_lon - sw_lon) * lonMetersPerDeg

    // Row spacing: 30 inches = 0.762 meters
    const rowSpacingMeters = 0.762

    // Determine orientation - rows run parallel to the longest side
    const isVertical = heightMeters > widthMeters

    const rowLines = []
    const pathLines = []

    if (isVertical) {
      // Rows run north-south, spaced east-west
      const rowSpacingDeg = rowSpacingMeters / lonMetersPerDeg
      const numRows = Math.floor(widthMeters / rowSpacingMeters)

      for (let i = 0; i <= numRows; i++) {
        const lon = sw_lon + (i * rowSpacingDeg)
        if (lon <= ne_lon) {
          rowLines.push({
            id: i,
            positions: [[sw_lat, lon], [ne_lat, lon]]
          })
        }
      }

      // Harvester paths - centered on each 13-row pass
      const numPasses = Math.ceil(numRows / ROWS_PER_PASS)
      for (let p = 0; p < numPasses; p++) {
        // Center of pass: start at row (p * 13) + 6 (middle of 13 rows)
        const centerRow = (p * ROWS_PER_PASS) + Math.floor(ROWS_PER_PASS / 2)
        const lon = sw_lon + (centerRow * rowSpacingDeg)
        if (lon <= ne_lon) {
          pathLines.push({
            id: `pass-${p}`,
            passNumber: p + 1,
            positions: [[sw_lat, lon], [ne_lat, lon]]
          })
        }
      }
    } else {
      // Rows run east-west, spaced north-south
      const rowSpacingDeg = rowSpacingMeters / latMetersPerDeg
      const numRows = Math.floor(heightMeters / rowSpacingMeters)

      for (let i = 0; i <= numRows; i++) {
        const lat = sw_lat + (i * rowSpacingDeg)
        if (lat <= ne_lat) {
          rowLines.push({
            id: i,
            positions: [[lat, sw_lon], [lat, ne_lon]]
          })
        }
      }

      // Harvester paths - centered on each 13-row pass
      const numPasses = Math.ceil(numRows / ROWS_PER_PASS)
      for (let p = 0; p < numPasses; p++) {
        const centerRow = (p * ROWS_PER_PASS) + Math.floor(ROWS_PER_PASS / 2)
        const lat = sw_lat + (centerRow * rowSpacingDeg)
        if (lat <= ne_lat) {
          pathLines.push({
            id: `pass-${p}`,
            passNumber: p + 1,
            positions: [[lat, sw_lon], [lat, ne_lon]]
          })
        }
      }
    }

    return { rows: rowLines, harvesterPaths: pathLines }
  }, [bounds])

  if ((!showRows && !showHarvesterPaths) || rows.length === 0) return null

  // Show every 13th row (representing individual rows within passes)
  const skipFactor = 13
  const visibleRows = rows.filter((_, i) => i % skipFactor === 0)

  return (
    <>
      {/* Individual row lines (red) */}
      {showRows && visibleRows.map((row) => (
        <Polyline
          key={row.id}
          positions={row.positions}
          pathOptions={{
            color: '#FF0000',
            weight: 1.5,
            opacity: 0.75
          }}
        />
      ))}

      {/* Harvester path lines (yellow) */}
      {showHarvesterPaths && harvesterPaths.map((path) => (
        <Polyline
          key={path.id}
          positions={path.positions}
          pathOptions={{
            color: '#FFFF00',
            weight: 1.5,
            opacity: 0.75
          }}
        >
          <Tooltip sticky>
            Pass {path.passNumber}
          </Tooltip>
        </Polyline>
      ))}
    </>
  )
}

// Export helper to get row count and pass count
export const getRowCount = (bounds) => {
  if (!bounds) return 0

  const { sw_lat, sw_lon, ne_lat, ne_lon } = bounds

  const latMetersPerDeg = 111000
  const lonMetersPerDeg = 85000 * Math.cos((sw_lat + ne_lat) / 2 * Math.PI / 180)

  const heightMeters = (ne_lat - sw_lat) * latMetersPerDeg
  const widthMeters = (ne_lon - sw_lon) * lonMetersPerDeg

  const rowSpacingMeters = 0.762
  const isVertical = heightMeters > widthMeters

  if (isVertical) {
    return Math.floor(widthMeters / rowSpacingMeters)
  } else {
    return Math.floor(heightMeters / rowSpacingMeters)
  }
}

export const getPassCount = (bounds) => {
  const rowCount = getRowCount(bounds)
  return Math.ceil(rowCount / ROWS_PER_PASS)
}

export default RowOverlay
