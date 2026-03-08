import React, { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, FeatureGroup, Polyline, Tooltip, CircleMarker, Marker, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import AddressAutocomplete from './AddressAutocomplete'
import RowOverlay, { getRowCount, getPassCount } from './RowOverlay'
import FleetConfig from './FleetConfig'
import SimulationResults from './SimulationResults'
import AnimationPlayer from './AnimationPlayer'
import HopperStatus from './HopperStatus'
import TruckStatus from './TruckStatus'
import QueueControl from './QueueControl'

// Custom silo marker icon
const siloIcon = L.divIcon({
  className: 'silo-marker',
  html: `<div style="
    width: 28px;
    height: 28px;
    background: #2196F3;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 14px;
  ">S</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
})

// Harvester marker icon (tractor emoji)
const harvesterIcon = L.divIcon({
  className: 'harvester-marker',
  html: `<div style="
    font-size: 32px;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.5));
  ">🚜</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
})

// Truck marker icon
const truckIcon = L.divIcon({
  className: 'truck-marker',
  html: `<div style="
    font-size: 28px;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.5));
  ">🚛</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
})

// Hopper (grain cart) marker icon - custom SVG
const hopperIcon = L.divIcon({
  className: 'hopper-marker',
  html: `<div style="
    width: 28px;
    height: 28px;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.5));
  ">
    <svg viewBox="0 0 64 64" width="28" height="28">
      <path d="M8 18 L56 18 L50 42 L14 42 Z" fill="#E53935" stroke="#B71C1C" stroke-width="2"/>
      <path d="M14 22 L50 22 L47 36 L17 36 Z" fill="#FDD835"/>
      <circle cx="20" cy="50" r="7" fill="#424242" stroke="#212121" stroke-width="2"/>
      <circle cx="44" cy="50" r="7" fill="#424242" stroke="#212121" stroke-width="2"/>
      <rect x="12" y="42" width="40" height="4" fill="#616161"/>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
})

// Active hopper icon (green tint to show it's filling)
const activeHopperIcon = L.divIcon({
  className: 'hopper-marker-active',
  html: `<div style="
    width: 32px;
    height: 32px;
    filter: drop-shadow(2px 2px 3px rgba(0,0,0,0.6));
  ">
    <svg viewBox="0 0 64 64" width="32" height="32">
      <path d="M8 18 L56 18 L50 42 L14 42 Z" fill="#4CAF50" stroke="#2E7D32" stroke-width="2"/>
      <path d="M14 22 L50 22 L47 36 L17 36 Z" fill="#FDD835"/>
      <circle cx="20" cy="50" r="7" fill="#424242" stroke="#212121" stroke-width="2"/>
      <circle cx="44" cy="50" r="7" fill="#424242" stroke="#212121" stroke-width="2"/>
      <rect x="12" y="42" width="40" height="4" fill="#616161"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
})

const DrawControl = ({ featureGroup, onRectangleDrawn, onRectangleDeleted }) => {
  const map = useMap()

  useEffect(() => {
    if (!map || !featureGroup) return

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        rectangle: {
          showArea: false,
          shapeOptions: { color: '#00ff00', weight: 2, fillOpacity: 0.05 }
        },
        polygon: false,
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false
      },
      edit: { featureGroup: featureGroup, remove: true }
    })

    map.addControl(drawControl)

    const extractBounds = (layer) => ({
      sw_lat: layer.getBounds().getSouthWest().lat,
      sw_lon: layer.getBounds().getSouthWest().lng,
      ne_lat: layer.getBounds().getNorthEast().lat,
      ne_lon: layer.getBounds().getNorthEast().lng
    })

    const handleCreated = (e) => {
      featureGroup.clearLayers()
      featureGroup.addLayer(e.layer)
      onRectangleDrawn?.(extractBounds(e.layer))
    }

    const handleEdited = (e) => {
      e.layers.eachLayer((layer) => onRectangleDrawn?.(extractBounds(layer)))
    }

    const handleDeleted = () => onRectangleDeleted?.()

    map.on(L.Draw.Event.CREATED, handleCreated)
    map.on(L.Draw.Event.EDITED, handleEdited)
    map.on(L.Draw.Event.DELETED, handleDeleted)

    return () => {
      map.removeControl(drawControl)
      map.off(L.Draw.Event.CREATED, handleCreated)
      map.off(L.Draw.Event.EDITED, handleEdited)
      map.off(L.Draw.Event.DELETED, handleDeleted)
    }
  }, [map, featureGroup, onRectangleDrawn, onRectangleDeleted])

  return null
}

const MapRefCapture = ({ onMapReady }) => {
  const map = useMap()
  useEffect(() => {
    onMapReady(map)
  }, [map, onMapReady])
  return null
}

const SatelliteMap = () => {
  const [bounds, setBounds] = useState(null)
  const [featureGroup, setFeatureGroup] = useState(null)
  const [loading, setLoading] = useState(false)
  const [overlayImage, setOverlayImage] = useState(null)
  const [stats, setStats] = useState(null)
  const [yieldRange, setYieldRange] = useState(null)
  const [yieldMatrix, setYieldMatrix] = useState(null)
  const [hoverYield, setHoverYield] = useState(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [error, setError] = useState(null)
  const [overlayStyle, setOverlayStyle] = useState(null)
  const [nearbyRoads, setNearbyRoads] = useState([])
  const [loadingRoads, setLoadingRoads] = useState(false)
  const [pickupPoint, setPickupPoint] = useState(null)
  const [showRoads, setShowRoads] = useState(true)
  const [siloAddress, setSiloAddress] = useState(null)
  const [route, setRoute] = useState(null)
  const [routeDistance, setRouteDistance] = useState(null)
  const [showRows, setShowRows] = useState(true)
  const [showHarvesterPaths, setShowHarvesterPaths] = useState(true)
  const [fleetConfig, setFleetConfig] = useState({
    truckCount: 3,
    truckCapacity: 950,
    hopperCount: 2,
    hopperCapacity: 500
  })
  const [simulationResults, setSimulationResults] = useState(null)
  const [case1Results, setCase1Results] = useState(null)
  const [case2Results, setCase2Results] = useState(null)
  const [simulationLoading, setSimulationLoading] = useState(false)
  const [animationFrames, setAnimationFrames] = useState([])
  const [currentAnimationFrame, setCurrentAnimationFrame] = useState(null)
  const [siloLocation, setSiloLocation] = useState(null)
  const [siloQueueTime, setSiloQueueTime] = useState(0)
  const [queuePattern, setQueuePattern] = useState('static')
  // Single entry point: {road: {lat, lon}, field: {lat, lon}}
  const [entryPoint, setEntryPoint] = useState(null)
  const mapRef = useRef(null)

  const defaultCenter = [40.1164, -88.2434]
  const defaultZoom = 14

  const updateOverlayPosition = useCallback(() => {
    const map = mapRef.current
    if (!map || !bounds || !overlayImage || !showOverlay) {
      setOverlayStyle(null)
      return
    }

    const sw = map.latLngToContainerPoint([bounds.sw_lat, bounds.sw_lon])
    const ne = map.latLngToContainerPoint([bounds.ne_lat, bounds.ne_lon])

    setOverlayStyle({
      position: 'absolute',
      left: sw.x,
      top: ne.y,
      width: ne.x - sw.x,
      height: sw.y - ne.y,
      pointerEvents: 'none',
      zIndex: 500,
      opacity: 0.85,
      imageRendering: 'pixelated'
    })
  }, [bounds, overlayImage, showOverlay])

  const handleMapReady = useCallback((map) => {
    mapRef.current = map
    map.on('move', updateOverlayPosition)
    map.on('zoom', updateOverlayPosition)
    map.on('resize', updateOverlayPosition)
  }, [updateOverlayPosition])

  useEffect(() => {
    updateOverlayPosition()
  }, [updateOverlayPosition])

  const handleRectangleDrawn = useCallback((boundsData) => {
    setBounds(boundsData)
    setOverlayImage(null)
    setStats(null)
    setYieldRange(null)
    setYieldMatrix(null)
    setHoverYield(null)
    setError(null)
    setOverlayStyle(null)
    setPickupPoint(null)
    setShowRoads(true)
    setSiloAddress(null)
    setRoute(null)
    setRouteDistance(null)
    fetchNearbyRoads(boundsData)
  }, [])

  const handleRectangleDeleted = useCallback(() => {
    setBounds(null)
    setOverlayImage(null)
    setStats(null)
    setYieldRange(null)
    setYieldMatrix(null)
    setHoverYield(null)
    setError(null)
    setOverlayStyle(null)
    setNearbyRoads([])
    setPickupPoint(null)
    setShowRoads(true)
    setSiloAddress(null)
    setRoute(null)
    setRouteDistance(null)
  }, [])

  const fetchNearbyRoads = async (boundsData) => {
    setLoadingRoads(true)
    setNearbyRoads([])

    const { sw_lat, sw_lon, ne_lat, ne_lon } = boundsData

    // Search area slightly beyond the field (just enough to find bordering roads)
    const padding = 0.0003 // ~33m padding
    const bbox = `${sw_lat - padding},${sw_lon - padding},${ne_lat + padding},${ne_lon + padding}`

    const query = `
      [out:json][timeout:25];
      (
        way["highway"~"^(primary|secondary|tertiary|residential|unclassified|service|track)$"](${bbox});
      );
      out body;
      >;
      out skel qt;
    `

    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      const data = await response.json()

      // Parse nodes into a lookup table
      const nodes = {}
      data.elements.filter(el => el.type === 'node').forEach(node => {
        nodes[node.id] = [node.lat, node.lon]
      })

      // Rectangle dimensions with 16.8% extension
      const latSpan = ne_lat - sw_lat
      const lonSpan = ne_lon - sw_lon
      const latExtension = latSpan * 0.168
      const lonExtension = lonSpan * 0.168

      // Clipping bounds (12% beyond rectangle)
      const clipMinLat = sw_lat - latExtension
      const clipMaxLat = ne_lat + latExtension
      const clipMinLon = sw_lon - lonExtension
      const clipMaxLon = ne_lon + lonExtension

      // Helper to check if a point is near the rectangle border
      const borderMargin = 0.0008 // ~80m from rectangle edge
      const isNearBorder = (lat, lon) => {
        const nearSouth = Math.abs(lat - sw_lat) < borderMargin
        const nearNorth = Math.abs(lat - ne_lat) < borderMargin
        const nearWest = Math.abs(lon - sw_lon) < borderMargin
        const nearEast = Math.abs(lon - ne_lon) < borderMargin
        const withinLatRange = lat >= sw_lat - borderMargin && lat <= ne_lat + borderMargin
        const withinLonRange = lon >= sw_lon - borderMargin && lon <= ne_lon + borderMargin

        return (nearSouth && withinLonRange) ||
               (nearNorth && withinLonRange) ||
               (nearWest && withinLatRange) ||
               (nearEast && withinLatRange)
      }

      // Clip a road's coordinates to the extended bounds
      const clipRoadCoords = (coords) => {
        if (coords.length < 2) return coords

        // Clip each coordinate to bounds
        const clipped = coords.map(([lat, lon]) => [
          Math.max(clipMinLat, Math.min(clipMaxLat, lat)),
          Math.max(clipMinLon, Math.min(clipMaxLon, lon))
        ])

        // Filter to only include segments that are within or crossing the bounds
        const result = []
        for (let i = 0; i < coords.length; i++) {
          const [lat, lon] = coords[i]
          const inBounds = lat >= clipMinLat && lat <= clipMaxLat &&
                          lon >= clipMinLon && lon <= clipMaxLon
          if (inBounds) {
            result.push([lat, lon])
          } else if (result.length > 0) {
            // Add clipped endpoint and stop
            result.push(clipped[i])
            break
          }
        }

        // If we started outside bounds, find where we enter
        if (result.length === 0) {
          for (let i = 0; i < coords.length; i++) {
            const [lat, lon] = coords[i]
            const inBounds = lat >= clipMinLat && lat <= clipMaxLat &&
                            lon >= clipMinLon && lon <= clipMaxLon
            if (inBounds) {
              if (i > 0) result.push(clipped[i - 1])
              result.push([lat, lon])
            } else if (result.length > 0) {
              result.push(clipped[i])
              break
            }
          }
        }

        return result.length >= 2 ? result : []
      }

      // Convert ways to polyline coordinates, filter to border roads, and clip
      const roads = data.elements
        .filter(el => el.type === 'way' && el.nodes)
        .map(way => ({
          id: way.id,
          name: way.tags?.name || 'Unnamed Road',
          type: way.tags?.highway || 'road',
          coords: way.nodes.map(nodeId => nodes[nodeId]).filter(Boolean)
        }))
        .filter(road => road.coords.length > 1)
        // Only keep roads where at least one point is near the rectangle border
        .filter(road => road.coords.some(([lat, lon]) => isNearBorder(lat, lon)))
        // Clip roads to 10% beyond rectangle bounds
        .map(road => ({ ...road, coords: clipRoadCoords(road.coords) }))
        .filter(road => road.coords.length >= 2)

      setNearbyRoads(roads)
      console.log(`Found ${roads.length} bordering roads`)
    } catch (error) {
      console.error('Error fetching roads:', error)
    } finally {
      setLoadingRoads(false)
    }
  }

  // Calculate nearest point on field edge from a given point
  const getNearestFieldEdgePoint = useCallback((point, fieldBounds) => {
    if (!fieldBounds) return null
    const [lat, lon] = point
    const { sw_lat, sw_lon, ne_lat, ne_lon } = fieldBounds

    // Calculate distances to each edge and find nearest point on that edge
    const edges = [
      // South edge
      { lat: sw_lat, lon: Math.max(sw_lon, Math.min(ne_lon, lon)), edge: 'south' },
      // North edge
      { lat: ne_lat, lon: Math.max(sw_lon, Math.min(ne_lon, lon)), edge: 'north' },
      // West edge
      { lat: Math.max(sw_lat, Math.min(ne_lat, lat)), lon: sw_lon, edge: 'west' },
      // East edge
      { lat: Math.max(sw_lat, Math.min(ne_lat, lat)), lon: ne_lon, edge: 'east' }
    ]

    let nearest = edges[0]
    let minDist = Math.sqrt(Math.pow(lat - edges[0].lat, 2) + Math.pow(lon - edges[0].lon, 2))

    for (const edge of edges) {
      const dist = Math.sqrt(Math.pow(lat - edge.lat, 2) + Math.pow(lon - edge.lon, 2))
      if (dist < minDist) {
        minDist = dist
        nearest = edge
      }
    }

    return { lat: nearest.lat, lon: nearest.lon }
  }, [])

  const handleRoadClick = (e) => {
    const { lat, lng } = e.latlng

    // Set pickup point
    setPickupPoint([lat, lng])
    setShowRoads(false)
    setRoute(null)
    setRouteDistance(null)

    // Auto-create entry point from pickup to nearest field edge
    if (bounds) {
      const fieldEdgePoint = getNearestFieldEdgePoint([lat, lng], bounds)
      if (fieldEdgePoint) {
        const autoEntryPoint = {
          road: { lat, lon: lng },
          field: fieldEdgePoint
        }
        setEntryPoint(autoEntryPoint)
        console.log('Entry point created:', autoEntryPoint)
      }
    }

    console.log('Pickup point set at:', lat, lng)
  }

  const fetchRoute = async (pickup, silo) => {
    if (!pickup || !silo) return

    try {
      // OSRM expects coordinates as lon,lat
      const start = `${pickup[1]},${pickup[0]}`
      const end = `${silo.lon},${silo.lat}`

      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`
      )

      const data = await response.json()

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const routeData = data.routes[0]
        // Convert GeoJSON coordinates [lon, lat] to Leaflet [lat, lon]
        const coords = routeData.geometry.coordinates.map(([lon, lat]) => [lat, lon])
        setRoute(coords)
        // Convert meters to miles
        const distanceMiles = (routeData.distance / 1609.34).toFixed(1)
        setRouteDistance(distanceMiles)
        console.log(`Route found: ${distanceMiles} miles`)
      } else {
        console.error('No route found:', data)
        setRoute(null)
        setRouteDistance(null)
      }
    } catch (error) {
      console.error('Error fetching route:', error)
      setRoute(null)
      setRouteDistance(null)
    }
  }

  const fetchYield = async () => {
    if (!bounds) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bounds: bounds,
          date: '2025-07-30',
          resolution: 10,
          days_back: 30
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to fetch data')
      }

      const data = await response.json()

      setOverlayImage(`data:image/png;base64,${data.overlay}`)
      setStats({ avgYield: data.average_yield, avgVigor: data.average_vigor })
      setYieldRange({ min: data.min_yield, max: data.max_yield })
      setYieldMatrix(data.yield_matrix)
      setShowOverlay(true)

      setTimeout(() => {
        const map = mapRef.current
        if (map && bounds) {
          const sw = map.latLngToContainerPoint([bounds.sw_lat, bounds.sw_lon])
          const ne = map.latLngToContainerPoint([bounds.ne_lat, bounds.ne_lon])
          setOverlayStyle({
            position: 'absolute',
            left: sw.x,
            top: ne.y,
            width: ne.x - sw.x,
            height: sw.y - ne.y,
            pointerEvents: 'none',
            zIndex: 500,
            opacity: 0.85,
            imageRendering: 'pixelated'
          })
        }
      }, 0)
    } catch (err) {
      console.error('Error fetching yield data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Helper to run a single simulation case
  const runSingleSimulation = async (caseNum) => {
    const routeCoords = route ? route.map(([lat, lon]) => ({ lat, lon })) : null

    const response = await fetch('/api/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bounds: bounds,
        fleet_config: {
          truck_count: fleetConfig.truckCount,
          truck_capacity: fleetConfig.truckCapacity,
          hopper_count: fleetConfig.hopperCount,
          hopper_capacity: fleetConfig.hopperCapacity,
          combine_speed_mph: 5,
          truck_speed_mph: 35
        },
        silo_distance_miles: parseFloat(routeDistance),
        silo_queue_time: siloQueueTime,
        silo_location: {
          lat: siloAddress.lat,
          lon: siloAddress.lon
        },
        pickup_point: pickupPoint ? {
          lat: pickupPoint[0],
          lon: pickupPoint[1]
        } : null,
        route_coords: routeCoords,
        entry_point: entryPoint ? {
          road: { lat: entryPoint.road.lat, lon: entryPoint.road.lon },
          field: { lat: entryPoint.field.lat, lon: entryPoint.field.lon }
        } : null,
        case: caseNum,
        queue_pattern: queuePattern
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Simulation failed')
    }

    return response.json()
  }

  // Run both simulations and compare
  const runSimulation = async () => {
    if (!bounds || !siloAddress || !routeDistance) return

    setSimulationLoading(true)
    setSimulationResults(null)
    setCase1Results(null)
    setCase2Results(null)
    setAnimationFrames([])
    setCurrentAnimationFrame(null)

    try {
      // Run both cases in parallel
      const [result1, result2] = await Promise.all([
        runSingleSimulation(1),
        runSingleSimulation(2)
      ])

      setCase1Results(result1)
      setCase2Results(result2)

      // Determine better case and set as default view
      const idle1 = result1.idle_time_minutes || 0
      const idle2 = result2.idle_time_minutes || 0
      const betterCase = idle1 <= idle2 ? 1 : 2
      const betterResult = betterCase === 1 ? result1 : result2

      setSimulationResults(betterResult)

      // Set animation for better case
      if (betterResult.animation_frames && betterResult.animation_frames.length > 0) {
        setAnimationFrames(betterResult.animation_frames)
        setCurrentAnimationFrame(betterResult.animation_frames[0])
      }
      if (betterResult.silo_location) {
        setSiloLocation(betterResult.silo_location)
      }
    } catch (err) {
      console.error('Error running simulation:', err)
      setError(err.message)
    } finally {
      setSimulationLoading(false)
    }
  }

  // Select a specific case to view animation
  const selectCase = (caseNum) => {
    const result = caseNum === 1 ? case1Results : case2Results
    if (!result) return

    setSimulationResults(result)
    if (result.animation_frames && result.animation_frames.length > 0) {
      setAnimationFrames(result.animation_frames)
      setCurrentAnimationFrame(result.animation_frames[0])
    }
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <ZoomControl position="topright" />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
          maxZoom={19}
        />
        <FeatureGroup ref={setFeatureGroup} />
        {featureGroup && (
          <DrawControl
            featureGroup={featureGroup}
            onRectangleDrawn={handleRectangleDrawn}
            onRectangleDeleted={handleRectangleDeleted}
          />
        )}
        <MapRefCapture onMapReady={handleMapReady} />

        {/* Nearby roads as yellow polylines */}
        {showRoads && nearbyRoads.map((road) => (
          <Polyline
            key={road.id}
            positions={road.coords}
            pathOptions={{
              color: '#FFD700',
              weight: 6,
              opacity: 0.9,
              dashArray: road.type === 'track' ? '5, 10' : null
            }}
            eventHandlers={{
              click: handleRoadClick
            }}
          >
            <Tooltip sticky>
              <strong>Click to set pickup point</strong><br />
              {road.name} ({road.type.replace('_', ' ')})
            </Tooltip>
          </Polyline>
        ))}

        {/* Pickup point marker (red) */}
        {pickupPoint && (
          <CircleMarker
            center={pickupPoint}
            radius={12}
            pathOptions={{
              color: '#fff',
              weight: 3,
              fillColor: '#dc3545',
              fillOpacity: 1
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <strong>Semi-truck corn pickup point</strong>
            </Tooltip>
          </CircleMarker>
        )}

        {/* Silo marker (blue) */}
        {siloAddress && (
          <Marker
            position={[siloAddress.lat, siloAddress.lon]}
            icon={siloIcon}
          >
            <Tooltip permanent direction="top" offset={[0, -14]}>
              <strong>Silo: {siloAddress.shortName}</strong>
            </Tooltip>
          </Marker>
        )}

        {/* Route polyline (yellow) */}
        {route && route.length > 1 && (
          <Polyline
            positions={route}
            pathOptions={{
              color: '#FFA500',
              weight: 5,
              opacity: 0.9
            }}
          >
            <Tooltip sticky>
              <strong>Route to Silo</strong><br />
              Distance: {routeDistance} miles
            </Tooltip>
          </Polyline>
        )}

        {/* Row lines overlay (green) */}
        {overlayImage && <RowOverlay bounds={bounds} showRows={showRows} showHarvesterPaths={showHarvesterPaths} />}

        {/* Entry point line (yellow dashed) */}
        {entryPoint && (
          <Polyline
            positions={[
              [entryPoint.road.lat, entryPoint.road.lon],
              [entryPoint.field.lat, entryPoint.field.lon]
            ]}
            pathOptions={{
              color: '#FFD700',
              weight: 4,
              opacity: 0.9,
              dashArray: '10, 5'
            }}
          >
            <Tooltip sticky>
              <strong>Field Entry Point</strong>
            </Tooltip>
          </Polyline>
        )}

        {/* Animated harvester marker */}
        {currentAnimationFrame?.harvester && (
          <Marker
            position={[
              currentAnimationFrame.harvester.lat,
              currentAnimationFrame.harvester.lon
            ]}
            icon={harvesterIcon}
          >
            <Tooltip permanent direction="top" offset={[0, -16]}>
              <strong>Pass {currentAnimationFrame.harvester.current_pass}</strong>
              <br />
              {currentAnimationFrame.harvester.status}
            </Tooltip>
          </Marker>
        )}

        {/* Animated truck markers */}
        {currentAnimationFrame?.trucks?.map((truck) => (
          truck.status !== 'idle' && (
            <Marker
              key={`truck-${truck.id}`}
              position={[truck.lat, truck.lon]}
              icon={truckIcon}
            >
              <Tooltip permanent direction="top" offset={[0, -14]}>
                <strong>Truck {truck.id + 1}</strong>
                <br />
                {truck.status.replace(/_/g, ' ')}
                {truck.load > 0 && ` (${Math.round(truck.load)} bu)`}
              </Tooltip>
            </Marker>
          )
        ))}

        {/* Animated hopper markers (no tooltip - status shown in HopperStatus panel) */}
        {currentAnimationFrame?.hoppers?.map((hopper) => (
          <Marker
            key={`hopper-${hopper.id}`}
            position={[hopper.lat, hopper.lon]}
            icon={hopper.is_active ? activeHopperIcon : hopperIcon}
          />
        ))}
      </MapContainer>

      {/* Overlay image with hover detection */}
      {overlayImage && showOverlay && overlayStyle && yieldMatrix && (
        <img
          key={overlayImage}
          src={overlayImage}
          alt="Yield overlay"
          style={{ ...overlayStyle, pointerEvents: 'auto', cursor: 'crosshair' }}
          onMouseMove={(e) => {
            const rect = e.target.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const rows = yieldMatrix.length
            const cols = yieldMatrix[0]?.length || 0
            const col = Math.floor((x / rect.width) * cols)
            const row = Math.floor((y / rect.height) * rows)
            if (row >= 0 && row < rows && col >= 0 && col < cols) {
              const val = yieldMatrix[row][col]
              setHoverYield(val !== null ? val : null)
            }
          }}
          onMouseLeave={() => setHoverYield(null)}
        />
      )}

      {/* Bottom left info panel */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px 15px',
        borderRadius: 8,
        fontSize: 12,
        zIndex: 1000,
        minWidth: 200
      }}>
        {bounds ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Field Bounds:</div>
            <div>SW: {bounds.sw_lat.toFixed(6)}, {bounds.sw_lon.toFixed(6)}</div>
            <div>NE: {bounds.ne_lat.toFixed(6)}, {bounds.ne_lon.toFixed(6)}</div>
            {stats && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: 8, paddingTop: 8 }}>
                <div><strong>Avg Yield:</strong> {stats.avgYield.toFixed(1)} Bu/Ac</div>
                <div><strong>Avg Vigor:</strong> {stats.avgVigor.toFixed(1)}%</div>
                <div style={{ marginTop: 4, color: '#FF6B6B' }}>
                  <strong>Total Rows:</strong> {getRowCount(bounds).toLocaleString()} (30" spacing)
                </div>
                <div style={{ color: '#00FF00' }}>
                  <strong>Harvester Passes:</strong> {getPassCount(bounds)} (8-row head)
                </div>
              </div>
            )}
            {yieldRange && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: 8, paddingTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Yield Scale (Bu/Ac):</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{yieldRange.min.toFixed(0)}</span>
                  <div style={{
                    flex: 1,
                    height: 14,
                    background: 'linear-gradient(to right, #ffffb2, #fecc5c, #fd8d3c, #f03b20, #bd0026)',
                    borderRadius: 3,
                    border: '1px solid rgba(255,255,255,0.3)'
                  }} />
                  <span>{yieldRange.max.toFixed(0)}</span>
                </div>
                {hoverYield !== null && (
                  <div style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: 4,
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 600
                  }}>
                    Hover: {hoverYield.toFixed(1)} Bu/Ac
                  </div>
                )}
              </div>
            )}
            {pickupPoint && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: 8, paddingTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#dc3545' }}>Pickup Point Set</div>
                <div style={{ fontSize: 11 }}>
                  {pickupPoint[0].toFixed(6)}, {pickupPoint[1].toFixed(6)}
                </div>
                <button
                  onClick={() => { setPickupPoint(null); setShowRoads(true); setEntryPoint(null); }}
                  style={{
                    marginTop: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    background: 'rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    color: 'white',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
                {entryPoint && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#FFD700' }}>
                    Entry point auto-created
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#aaa' }}>Draw a rectangle to begin</div>
        )}
      </div>

      {/* Top left controls */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 1000,
        display: 'flex',
        gap: 10
      }}>
        {bounds && (
          <button
            onClick={fetchYield}
            disabled={loading}
            style={{
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 600,
              background: loading ? '#666' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            {loading ? 'Fetching...' : 'Fetch Yield Map'}
          </button>
        )}
        {overlayImage && (
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            style={{
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 600,
              background: showOverlay ? '#2196F3' : '#757575',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            {showOverlay ? 'Hide Overlay' : 'Show Overlay'}
          </button>
        )}
        {overlayImage && (
          <button
            onClick={() => setShowRows(!showRows)}
            style={{
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 600,
              background: showRows ? '#FF6B6B' : '#757575',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            {showRows ? 'Hide Rows' : 'Show Rows'}
          </button>
        )}
        {overlayImage && (
          <button
            onClick={() => setShowHarvesterPaths(!showHarvesterPaths)}
            style={{
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 600,
              background: showHarvesterPaths ? '#FFD700' : '#757575',
              color: showHarvesterPaths ? '#333' : 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            {showHarvesterPaths ? 'Hide Passes' : 'Show Passes'}
          </button>
        )}
      </div>

      {/* Silo address input - appears after pickup point is set */}
      {pickupPoint && (
        <div style={{
          position: 'absolute',
          top: 70,
          left: 20,
          zIndex: 1000,
          width: 350,
          background: 'white',
          padding: 12,
          borderRadius: 8,
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)'
        }}>
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: '#333' }}>
            Enter Silo Address:
          </div>
          <AddressAutocomplete
            onSelect={(address) => {
              setSiloAddress(address)
              if (address) {
                fetchRoute(pickupPoint, address)
                if (mapRef.current) {
                  // Fit bounds to show both pickup and silo
                  const bounds = L.latLngBounds([pickupPoint, [address.lat, address.lon]])
                  mapRef.current.fitBounds(bounds, { padding: [50, 50] })
                }
              } else {
                setRoute(null)
                setRouteDistance(null)
              }
            }}
            placeholder="Search for grain elevator or silo..."
          />
          {siloAddress && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#4CAF50', fontWeight: 500 }}>
              Selected: {siloAddress.shortName}
              {routeDistance && (
                <span style={{ marginLeft: 8, color: '#2196F3' }}>
                  ({routeDistance} mi)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={{
          position: 'absolute',
          top: pickupPoint ? 170 : 70,
          left: 20,
          background: 'rgba(220,53,69,0.9)',
          color: 'white',
          padding: '10px 15px',
          borderRadius: 8,
          fontSize: 12,
          zIndex: 1000,
          maxWidth: 300
        }}>
          Error: {error}
        </div>
      )}

      {/* Loading indicator for roads */}
      {loadingRoads && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: 4,
          zIndex: 1000,
          fontSize: 13
        }}>
          Finding nearby roads...
        </div>
      )}

      {/* Right side panel - Fleet Config & Simulation Results */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 60,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        width: 320,
        alignItems: 'flex-end'
      }}>
        <FleetConfig
          config={fleetConfig}
          onChange={setFleetConfig}
          canRunSimulation={!!(bounds && overlayImage && pickupPoint && siloAddress && routeDistance)}
          onRunSimulation={runSimulation}
          siloDistance={routeDistance ? parseFloat(routeDistance) : 0}
        />
        <QueueControl
          onQueueChange={setSiloQueueTime}
          onPatternChange={setQueuePattern}
          disabled={simulationLoading}
        />
        <SimulationResults
          results={simulationResults}
          case1Results={case1Results}
          case2Results={case2Results}
          loading={simulationLoading}
          onSelectCase={selectCase}
        />
      </div>

      {/* Bottom panel - Animation Player & Status displays */}
      {animationFrames.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 240,
          right: 20,
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: 12,
          pointerEvents: 'none'
        }}>
          {/* Hopper Status - left of animation player */}
          {currentAnimationFrame?.hoppers && currentAnimationFrame.hoppers.length > 0 && (
            <div style={{ pointerEvents: 'auto' }}>
              <HopperStatus hoppers={currentAnimationFrame.hoppers} />
            </div>
          )}

          {/* Animation Player - center */}
          <div style={{ pointerEvents: 'auto' }}>
            <AnimationPlayer
              frames={animationFrames}
              onFrameChange={(frame) => setCurrentAnimationFrame(frame)}
              totalTimeMinutes={simulationResults?.total_time_minutes || 0}
              isVisible={true}
            />
          </div>

          {/* Truck Status - right of animation player */}
          {currentAnimationFrame?.trucks && currentAnimationFrame.trucks.length > 0 && (
            <div style={{ pointerEvents: 'auto' }}>
              <TruckStatus
                trucks={currentAnimationFrame.trucks}
                siloDistance={routeDistance ? parseFloat(routeDistance) : 5}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SatelliteMap
