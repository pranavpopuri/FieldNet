# FieldNet MVP Implementation Plan

## Overview
Build a web-based harvest optimization system that minimizes combine idle time by dynamically switching between high-to-low (Case 1) and low-to-high (Case 2) yield row sequences based on fleet cycle time and silo queue conditions.

**MVP Scope:**
- Heatmap-only yield data (no hardware integration)
- Mock silo queue API
- Web app (Python + React)
- Full system: pre-harvest simulation + live recommendations
- Single field support
- **Draw rectangle on satellite map** for field boundary
- **Road-snapped pickup point** selection via Overpass API
- **Silo address autocomplete** with route visualization
- Primary user: Farm manager (office)
- Always-online (internet assumed)

---

## Existing Codebase (`connecting-satellite/`)

**Already Implemented:**
| Component | File | Notes |
|-----------|------|-------|
| Earth Engine + NDVI/WDRVI | `vegetation_indices.py` | Sentinel-2, cloud masking, 10m grid |
| Yield estimation | `backend_app.py:49` | `est_yield = wdrvi_data * 290 - 30` (Bu/Ac) — **region-calibrated** |
| Flask API | `backend_app.py` | `/api/visualize`, `/api/yield`, `/api/vigor` |
| Satellite map + rectangle draw | `AreaSelectorMap.jsx` | ESRI tiles, Leaflet.draw |
| Overpass road detection | `AreaSelectorMap.jsx:99-153` | Fetches roads near field boundary |
| Pickup point selection | `AreaSelectorMap.jsx:22-30` | Red marker on road click |
| OSRM routing | `AreaSelectorMap.jsx:47-61` | Yellow line to silo |
| Interactive heatmap | `InteractiveHeatmap.jsx` | Canvas with hover values |

**Needs Enhancement:**
- Silo input: add **autocomplete dropdown** (currently just text + search)
- Migrate Flask → FastAPI (for WebSocket support)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11+, **FastAPI** (migrate from Flask), SimPy |
| Database | SQLite (MVP) with SQLAlchemy |
| Earth Engine | `geemap`, `earthengine-api` (existing `vegetation_indices.py`) |
| Frontend | React + Vite (existing), Leaflet (existing) |
| Maps/Routing | ESRI tiles, Overpass, Nominatim, OSRM (all existing) |
| Real-time | WebSockets (FastAPI native) |

---

## Project Structure

```
fieldnet/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── config.py               # Settings (GEE project, defaults)
│   │   ├── models/
│   │   │   ├── field.py            # Field, Row, HeatmapCell
│   │   │   ├── fleet.py            # Truck, Hopper, HopperPool
│   │   │   └── simulation.py       # SimState, SimOutput, Snapshot
│   │   ├── services/
│   │   │   ├── earth_engine.py     # GEE heatmap fetch, NDVI → yield
│   │   │   ├── yield_calculator.py # Cell → row aggregation
│   │   │   ├── sequence.py         # Case 1/2 sequence generation
│   │   │   ├── switching.py        # X threshold, switch cost gate
│   │   │   ├── feasibility.py      # Fleet sizing check
│   │   │   ├── overpass.py         # Query roads near field boundary
│   │   │   ├── nominatim.py        # Address autocomplete/geocoding
│   │   │   └── routing.py          # OSRM route calculation
│   │   ├── simulation/
│   │   │   ├── engine.py           # SimPy orchestrator
│   │   │   ├── combine.py          # Combine process
│   │   │   ├── hopper.py           # Hopper fill process
│   │   │   └── truck.py            # Truck dispatch/return cycle
│   │   ├── api/
│   │   │   ├── fields.py           # Field CRUD, heatmap fetch
│   │   │   ├── simulation.py       # Run/pause/resume simulation
│   │   │   ├── harvest.py          # Live harvest + WebSocket
│   │   │   └── mock_queue.py       # Mock silo queue API
│   │   └── db.py                   # SQLite setup
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FieldMap.tsx        # Leaflet satellite map + heatmap overlay
│   │   │   ├── DrawRectangle.tsx   # Rectangle drawing tool for field boundary
│   │   │   ├── RoadSelector.tsx    # Highlight roads, select pickup point
│   │   │   ├── AddressInput.tsx    # Autocomplete silo address input
│   │   │   ├── RouteDisplay.tsx    # Yellow route line to silo
│   │   │   ├── HopperGauge.tsx     # Real-time fill visualization
│   │   │   ├── TruckStatus.tsx     # Truck cards with ETA
│   │   │   ├── SequenceView.tsx    # Row sequence visualization
│   │   │   ├── Recommendation.tsx  # Current case + next row
│   │   │   ├── HarvesterIcon.tsx   # Animated harvester on field
│   │   │   ├── TruckIcon.tsx       # Animated truck on route
│   │   │   ├── HopperPool.tsx      # Hopper icons with hover tooltips
│   │   │   └── SimulationPlayer.tsx # Timeline controls + animation sync
│   │   ├── pages/
│   │   │   ├── Setup.tsx           # Field + fleet config
│   │   │   ├── Simulation.tsx      # Pre-harvest simulation
│   │   │   └── Harvest.tsx         # Live harvest dashboard
│   │   ├── stores/                 # Zustand state
│   │   └── api.ts                  # REST + WebSocket client
│   └── package.json
└── docker-compose.yml
```

---

## Implementation Phases

### Phase 1: Migrate Backend to FastAPI ✦ NEW
**Files:** `backend/app/main.py`, `models/*.py`

- Port existing Flask endpoints to FastAPI
- Reuse `vegetation_indices.py` (already works)
- Add Pydantic models:
  - `Row(row_id, cells, total_yield, traversal_time, status)`
  - `Field(field_id, bounds, rows, pickup_point, silo)`
  - `Hopper(hopper_id, capacity, current_fill, status)`
  - `Truck(truck_id, capacity, current_load, status, eta)`
  - `HopperPool(hoppers, active_hopper_id, swap_time=2)`
- Add SQLite persistence

### Phase 2: Row & Path Calculation ✦ NEW
**Files:** `services/yield_calculator.py`, `services/path_planner.py`

**Row Model:**
- **Physical rows**: 30 inches (0.76m) apart, parallel to longest side
- **Harvester**: Processes **8 rows at once** (~6.1m swath width)
- **Z-pattern**: Harvester goes across, turns, comes back, turns, repeats

**Row Orientation:**
- Rows run **parallel to the longest side** of the rectangle
- If field is wider than tall → rows run E-W, harvester moves N-S in Z
- If field is taller than wide → rows run N-S, harvester moves E-W in Z

**Yield Mapping:**
- Heatmap = 10m pixels (~13 physical rows per pixel)
- Each 8-row swath: interpolate yield from nearest 10m pixel
- Swath yield = (pixel_yield × 8 rows × swath_length)

**Path Generation:**
```
swath_width = 8 rows × 0.76m = 6.1m
num_swaths = field_width / swath_width
path = generate_z_pattern(num_swaths, field_length)
```

**Output:**
- List of swaths with: `{ swath_id, start_coord, end_coord, yield_estimate, traversal_time }`
- Z-pattern path coordinates for animation

### Phase 3: Sequence & Switching Logic
**Files:** `services/sequence.py`, `services/switching.py`, `services/feasibility.py`

**Sequences:**
- `generate_case1_sequence(rows)` → sorted by yield DESC (baseline)
- `generate_case2_sequence(rows)` → sorted by yield ASC (queue pressure)

**Core Formulas (from PRD):**
```
Time to silo = travel_time + queue_wait_time
Fleet cycle time = time_to_silo + queue_wait + unload_time + return_time
Hopper buffer time remaining = (total_pool_capacity - current_fill) / current_yield_rate
X threshold = fleet_cycle_time - hopper_buffer_time_remaining
```

**Switching Rules:**
- While `queue_wait > X` → operate in Case 2
- When `queue_wait < X` → switch to Case 1
- Switch cost gate: only switch if `idle_time_prevented > travel_cost + efficiency_loss`
- Efficiency loss = `(best_row_yield_rate - target_row_yield_rate) × time_on_low_yield_row`
- **Case 2 termination**: if in Case 2 longer than one fleet cycle time with no queue improvement → return to Case 1

**Fleet Feasibility:**
- Pre-harvest check: `if fleet_cycle_time > hopper_buffer_time → flag "undersized"`
- Recommend minimum truck count to satisfy constraint
- Re-run feasibility during harvest when queue crosses threshold

### Phase 4: Simulation Engine
**Files:** `simulation/engine.py`, `simulation/combine.py`, `simulation/hopper.py`, `simulation/truck.py`

SimPy discrete-event simulation:
```python
class HarvestSimulation:
    def __init__(self, field, fleet, hopper_pool, silo, sequence, config)
    def run(self) -> SimulationOutput
    def snapshot(self) -> SimulationSnapshot  # State serialization for mid-harvest
    def resume(self, snapshot)                # Resume from saved state
```

**State Serialization (§9):** Snapshot captures hopper fill levels, truck positions in cycle, rows completed, current queue wait, and pending sequence. Enables mid-harvest re-evaluation.

Processes:
- **Combine**:
  - Iterate rows in sequence order
  - Fill active hopper based on yield rate
  - **Finish current row before stopping** (even if hopper full)
  - Idle condition: `(available_hoppers == 0) AND (no truck returns within T minutes)`

- **Hopper**:
  - Continuous fill based on yield rate from heatmap
  - Signal when full → trigger hopper swap
  - Track individual fill states in pool

- **Truck**:
  - **Can service multiple hoppers** per trip (top up until trailer ~full)
  - Dispatch triggers: trailer ≥80% full OR any hopper exceeds fill threshold
  - Cycle: load from hoppers → travel to silo → wait in queue → unload → return

**Synthetic Yield Injection:**
- Support injecting custom yield scenarios for testing edge cases
- Validate X threshold behavior before field deployment

Outputs: idle events (with duration + cause), overflow risks, actual vs predicted cycle time, efficiency score

**Animation Data Export:**
- Simulation generates timestamped position/state data for visualization:
  - Harvester: `{ time, row_id, progress_pct }`
  - Trucks: `{ time, truck_id, lat, lon, status }`
  - Hoppers: `{ time, hopper_id, fill_pct, status }`
- Frontend interpolates positions between keyframes for smooth animation
- Timeline scrubber controls playback speed (1x, 2x, 5x, 10x)

### Phase 5: REST API
**Files:** `api/fields.py`, `api/simulation.py`, `api/harvest.py`, `api/mock_queue.py`

| Endpoint | Purpose |
|----------|---------|
| `POST /fields` | Create field from drawn rectangle bounds |
| `POST /fields/{id}/nearby-roads` | Query Overpass API for roads near field boundary |
| `POST /fields/{id}/pickup-point` | Set pickup point coordinates |
| `GET /geocode/autocomplete` | Address autocomplete via Nominatim |
| `POST /route` | Get road route from pickup point to silo via OSRM |
| `POST /fields/{id}/fetch-heatmap` | Trigger GEE fetch |
| `GET /fields/{id}/rows` | Get row-level yields |
| `POST /fleet` | Configure trucks + hoppers |
| `POST /fleet/feasibility` | Run feasibility check |
| `POST /simulations` | Start simulation |
| `GET /simulations/{id}` | Get results |
| `POST /simulations/{id}/snapshot` | Pause + snapshot |
| `POST /harvests` | Start live harvest |
| `WS /harvests/{id}/ws` | Real-time updates |
| `POST /queue/mock` | Set mock queue value |
| `GET /silos` | List available silos |
| `POST /silos/select-optimal` | Pre-harvest silo selection (harvest-level commitment) |

### Phase 6: Frontend Enhancements
**Files:** `connecting-satellite/frontend/src/**`

**Already Done (`AreaSelectorMap.jsx`):**
- ✓ Satellite map (ESRI tiles)
- ✓ Rectangle drawing (Leaflet.draw)
- ✓ Overpass road detection + highlight
- ✓ Pickup point selection (red marker, tooltip)
- ✓ OSRM routing (yellow line)
- ✓ Silo address geocoding (Nominatim)
- ✓ Interactive heatmap canvas (`InteractiveHeatmap.jsx`)

**Enhancements Needed:**

**1. Address Autocomplete** ✦ NEW
- Replace text input with dropdown that shows suggestions as user types
- Debounced Nominatim query (300ms)
- Click suggestion to select

**2. Fleet Configuration Panel** ✦ NEW
- Inputs: truck count, truck capacity, hopper count, hopper capacity
- Show feasibility check result
- "Start Simulation" button

**3. Row Overlay** ✦ NEW
- Visualize rows on heatmap with sequence numbers
- Color-code by Case 1/Case 2 priority

**Simulation Page** ✦ NEW
- Run pre-harvest simulation
- Timeline scrubber for playback
- Metrics display: idle events, efficiency score
- Compare Case 1 vs Case 2 sequences

**Animated Visualization:**

**Field Display:**
- **Green lines (light)**: Individual corn rows (every 30 inches)
- **Yellow line (light)**: Path taken by harvester (trails behind)
- **Harvester icon**: Moves in **Z-pattern**, processes 8 rows at once
  - Goes across → turns → comes back → turns → repeat

**Fleet Display:**
- **Truck icons**: Move along route to silo at **50 mph**
  - Show traveling, waiting in queue, returning
- **Hopper icons**: Displayed on side of field
  - Active hopper next to harvester (being filled)
  - Free hoppers in "pool" area
  - Full hoppers waiting for truck
  - **Hover tooltip**: Shows "X% full"
- **Silo icon**: Destination marker with queue status

**Harvest Page** ✦ NEW
- Real-time heatmap with row progress
- Hopper fill gauges (animated)
- Truck status cards with ETAs
- Queue monitor with X threshold line
- Recommendation panel: current case, next row, switch alerts

### Phase 7: Integration & Polish
- Connect frontend ↔ backend
- WebSocket integration for live updates
- Error handling, loading states
- Docker containerization

---

## Key Behaviors (from PRD)

### Silo Selection (§6)
- **Harvest-level commitment**: select optimal silo before harvest begins
- Use time-to-silo formula for selection
- No mid-harvest re-routing (queue time dominates travel time)

### Truck Dispatch (§2.3)
- Dispatch when: trailer ≥80% full **OR** any hopper exceeds fill threshold
- Single truck can load from multiple hoppers before departing
- Both thresholds are configurable

### Hopper Pool (§4)
- Pool exhaustion triggers idle, not individual hopper full
- Combine finishes current row before stopping
- T buffer (2-3 min) accounts for hopper swap time

### Queue API (§10)
- Returns: `{ wait_time_minutes, timestamp }`
- If data not refreshed within one row-traversal time → flag as stale
- Stale data: widen X by 10% margin (bias toward earlier switching)

### Map & Routing APIs

**Leaflet Satellite Tiles:**
```javascript
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}')
```

**Overpass API (nearby roads):**
```
[out:json];
way["highway"](around:100, {field_bbox});
out geom;
```
Returns road geometries within ~100m of field boundary for pickup point selection.

**Nominatim Autocomplete:**
```javascript
// Debounced query as user types (300ms)
const response = await fetch(
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`,
  { headers: { 'User-Agent': 'FieldNet/1.0' } }
);
// Returns array: [{ display_name, lat, lon }, ...]
```
Show results in dropdown below input. On select → geocode + route.

**OSRM Routing:**
```
GET https://router.project-osrm.org/route/v1/driving/{pickup_lon},{pickup_lat};{silo_lon},{silo_lat}?geometries=geojson
```
Returns road route geometry + distance/duration for yellow line display.

---

## Key Constants (Configurable)

| Parameter | Default | Source |
|-----------|---------|--------|
| Grid resolution | 10m | PRD §1 |
| Truck capacity | 950 bushels | PRD §1 |
| Hopper capacity | 500 bushels | User specified |
| Truck dispatch threshold | 80% trailer fill | PRD §2.3 |
| Hopper dispatch threshold | 90% hopper fill | PRD §2.3 (configurable) |
| Swap time (T) | 2 min | PRD §4 |
| Unload time | 17 min | User specified (15-20 range) |
| Stale data margin | 10% | PRD §10 |
| Combine speed | 5 mph | User specified |
| Truck speed | 50 mph | User specified (animation speed) |
| Rows per pass | 8 rows | User specified (8-row head = 6.1m swath) |
| Row spacing | 30 inches (0.76m) | Standard corn row spacing |

---

## Verification Plan

1. **Unit tests** for switching logic (X threshold, switch cost gate)
2. **Simulation tests**:
   - Inject known yield pattern → verify idle events match expected
   - Test Case 2 termination condition
3. **Integration test**: Full flow from field creation → simulation → results
4. **Manual testing**:
   - Draw rectangle on satellite map → field boundary created
   - Nearby roads appear → click to select pickup point (red marker)
   - Type silo address → autocomplete suggestions appear → select → yellow route drawn
   - Fetch heatmap → verify yield grid overlay on field
   - Run simulation, scrub timeline, verify events
   - Start live harvest, adjust mock queue, verify switching
5. **Edge cases**:
   - Fleet undersized → feasibility alert
   - All hoppers full → idle event logged
   - Queue spike → switch to Case 2

---

## MVP Exclusions (Deferred)

- **Multi-silo mid-harvest switching** — single silo selected pre-harvest (§6)
- **Correlated row yield updates** — updating unvisited row estimates based on actual vs predicted divergence (§2.1)
- **Advanced spatial optimization** — nearest-neighbor row ordering within yield tiers
- Post-harvest analysis page
- User authentication
- Mobile responsiveness
- Historical data storage across sessions
