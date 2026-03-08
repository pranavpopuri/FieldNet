# FieldNet Step-by-Step Implementation Plan

Each step produces a working app. Verify before moving to the next step.

---

## Step 1: Minimal Satellite Map
**Goal:** Display a satellite map that the user can pan/zoom.

**Files to create:**
- `frontend/index.html`
- `frontend/src/App.jsx`
- `frontend/src/components/SatelliteMap.jsx`
- `frontend/package.json`
- `frontend/vite.config.js`

**What it does:**
- Shows a full-screen Leaflet map with ESRI satellite tiles
- Centered on Illinois (or user's location)

**Verify:**
- [ ] Run `npm run dev` in frontend
- [ ] Map displays with satellite imagery
- [ ] Can pan and zoom

---

## Step 2: Draw Rectangle
**Goal:** User can draw a rectangle on the map.

**Files to modify:**
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- Add Leaflet.draw rectangle tool
- When rectangle drawn, log bounds to console
- Show rectangle on map

**Verify:**
- [ ] Rectangle draw tool appears
- [ ] Can draw rectangle
- [ ] Console shows bounds (sw_lat, sw_lon, ne_lat, ne_lon)

---

## Step 3: Fetch and Display Heatmap
**Goal:** After drawing rectangle, fetch yield heatmap from backend.

**Files to create:**
- `backend/app/main.py` (FastAPI)
- `backend/app/vegetation_indices.py` (copy from connecting-satellite)
- `backend/requirements.txt`

**Files to modify:**
- `frontend/src/App.jsx`
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- Backend: `/api/visualize` endpoint (port from Flask)
- Frontend: "Fetch Heatmap" button appears after drawing
- Clicking button calls backend, displays heatmap image

**Verify:**
- [ ] Run backend: `uvicorn app.main:app --reload --port 5001`
- [ ] Draw rectangle, click "Fetch Heatmap"
- [ ] Heatmap image appears below map

---

## Step 4: Show Interactive Yield Grid
**Goal:** Display hoverable yield grid overlay.

**Files to create:**
- `frontend/src/components/InteractiveHeatmap.jsx` (copy from connecting-satellite)

**Files to modify:**
- `frontend/src/App.jsx`

**What it does:**
- Show 2D canvas grid of yield values
- Hover shows Bu/Ac value in tooltip

**Verify:**
- [ ] Grid displays after heatmap fetch
- [ ] Hover shows yield values
- [ ] Values look reasonable (0-250 Bu/Ac range)

---

## Step 5: Show Nearby Roads
**Goal:** After drawing rectangle, show nearby roads highlighted.

**Files to modify:**
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- Query Overpass API for roads near rectangle
- Display roads as yellow lines on map
- Show road name on hover

**Verify:**
- [ ] Draw rectangle
- [ ] Yellow road lines appear around field
- [ ] Hovering road shows "Click to set pickup point"

---

## Step 6: Select Pickup Point
**Goal:** Click road to place pickup point marker.

**Files to modify:**
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- Click on road → red marker appears
- Other road highlights disappear
- Hover marker shows "Semi-truck corn pickup point"

**Verify:**
- [ ] Click road → red marker placed
- [ ] Yellow highlights disappear
- [ ] Tooltip shows on hover

---

## Step 7: Silo Address Input with Autocomplete
**Goal:** Type silo address, see suggestions dropdown.

**Files to create:**
- `frontend/src/components/AddressAutocomplete.jsx`

**Files to modify:**
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- Input field appears after pickup point set
- As user types, query Nominatim for suggestions
- Show dropdown with suggestions
- Click suggestion to select

**Verify:**
- [ ] Set pickup point → address input appears
- [ ] Type address → suggestions appear in dropdown
- [ ] Click suggestion → address is selected

---

## Step 8: Route to Silo
**Goal:** Show yellow route line from pickup point to silo.

**Files to modify:**
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- After selecting silo address, query OSRM for route
- Draw yellow line following roads
- Show distance in tooltip

**Verify:**
- [ ] Select silo from autocomplete
- [ ] Yellow route line appears
- [ ] Hover shows distance (miles)

---

## Step 9: Row Lines Overlay
**Goal:** Show green row lines on field (every 30 inches).

**Files to create:**
- `frontend/src/components/RowOverlay.jsx`

**Files to modify:**
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- Calculate row positions (parallel to longest side, 30" apart)
- Draw light green lines for each row
- Show row count

**Verify:**
- [ ] After heatmap fetch, green lines appear on field
- [ ] Lines run parallel to longest side
- [ ] Spacing looks correct (~30 inches)

---

## Step 10: Fleet Configuration Panel
**Goal:** Input fleet parameters.

**Files to create:**
- `frontend/src/components/FleetConfig.jsx`

**Files to modify:**
- `frontend/src/App.jsx`

**What it does:**
- Panel with inputs: truck count, hopper count, capacities
- Store values in state
- Show "Run Simulation" button (disabled for now)

**Verify:**
- [ ] Fleet config panel visible
- [ ] Can enter truck count, hopper count, capacities
- [ ] Values persist in state

---

## Step 11: Row Aggregation Backend
**Goal:** Backend calculates per-row yield from heatmap.

**Files to create:**
- `backend/app/services/row_calculator.py`

**Files to modify:**
- `backend/app/main.py`

**What it does:**
- New endpoint: `POST /api/fields/{id}/rows`
- Takes rectangle bounds, returns list of rows with:
  - `row_id`, `yield_estimate`, `traversal_time`
- Uses 8-row swath width, Z-pattern

**Verify:**
- [ ] Call `/api/fields/test/rows` with bounds
- [ ] Returns JSON array of rows
- [ ] Each row has yield and time

---

## Step 12: Sequence Generation
**Goal:** Backend generates Case 1 and Case 2 sequences.

**Files to create:**
- `backend/app/services/sequence.py`

**Files to modify:**
- `backend/app/main.py`

**What it does:**
- New endpoint: `GET /api/sequences/{field_id}`
- Returns:
  - `case1_sequence`: rows sorted by yield DESC
  - `case2_sequence`: rows sorted by yield ASC

**Verify:**
- [ ] Call `/api/sequences/test`
- [ ] Returns two sequences
- [ ] Case 1 has highest yield first
- [ ] Case 2 has lowest yield first

---

## Step 13: Basic Simulation Engine
**Goal:** Run simulation, return idle events count.

**Files to create:**
- `backend/app/simulation/engine.py`
- `backend/app/simulation/combine.py`
- `backend/app/simulation/hopper.py`
- `backend/app/simulation/truck.py`

**Files to modify:**
- `backend/app/main.py`

**What it does:**
- New endpoint: `POST /api/simulations`
- Takes: field_id, fleet config, sequence
- Returns: total_time, idle_events count, efficiency_score
- Uses SimPy for discrete-event simulation

**Verify:**
- [ ] POST simulation with test field
- [ ] Returns simulation results
- [ ] Different sequences give different results

---

## Step 14: Simulation Results Display
**Goal:** Frontend shows simulation metrics.

**Files to create:**
- `frontend/src/components/SimulationResults.jsx`

**Files to modify:**
- `frontend/src/App.jsx`

**What it does:**
- "Run Simulation" button triggers API call
- Display results: total time, idle events, efficiency
- Show Case 1 vs Case 2 comparison

**Verify:**
- [ ] Click "Run Simulation"
- [ ] Results appear
- [ ] Can compare Case 1 vs Case 2

---

## Step 15: Animation Data Export
**Goal:** Simulation returns timestamped positions for animation.

**Files to modify:**
- `backend/app/simulation/engine.py`

**What it does:**
- Simulation logs positions at each time step:
  - Harvester: `{ time, x, y, row_id }`
  - Trucks: `{ time, truck_id, x, y, status }`
  - Hoppers: `{ time, hopper_id, fill_pct }`
- Return animation_data array in response

**Verify:**
- [ ] Simulation response includes animation_data
- [ ] Data has timestamped positions
- [ ] Can see harvester moving through rows in data

---

## Step 16: Animated Harvester
**Goal:** Show harvester icon moving through field.

**Files to create:**
- `frontend/src/components/HarvesterIcon.jsx`
- `frontend/src/components/SimulationPlayer.jsx`

**Files to modify:**
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- Play button starts animation
- Harvester icon moves in Z-pattern
- Yellow trail follows harvester path
- Timeline scrubber controls playback

**Verify:**
- [ ] Run simulation, click Play
- [ ] Harvester icon moves across field
- [ ] Z-pattern is correct
- [ ] Yellow trail appears behind

---

## Step 17: Animated Trucks
**Goal:** Show truck icons moving to silo.

**Files to create:**
- `frontend/src/components/TruckIcon.jsx`

**Files to modify:**
- `frontend/src/components/SatelliteMap.jsx`

**What it does:**
- Truck icons move along route at 50 mph
- Show truck status (traveling, in queue, returning)
- Multiple trucks animated simultaneously

**Verify:**
- [ ] Trucks appear and move along route
- [ ] Trucks wait at silo (queue)
- [ ] Trucks return to field

---

## Step 18: Hopper Status Display
**Goal:** Show hopper fill levels.

**Files to create:**
- `frontend/src/components/HopperPool.jsx`

**Files to modify:**
- `frontend/src/App.jsx`

**What it does:**
- Hopper icons on side panel
- Fill level shown as progress bar
- Hover shows "X% full"
- Active hopper highlighted

**Verify:**
- [ ] Hopper icons visible during simulation
- [ ] Fill levels animate
- [ ] Hover shows percentage

---

## Step 19: Mock Queue API
**Goal:** Adjustable silo queue for testing.

**Files to create:**
- `backend/app/api/mock_queue.py`

**Files to modify:**
- `backend/app/main.py`

**What it does:**
- Endpoint: `POST /api/queue/mock` - set queue time
- Endpoint: `GET /api/queue` - get current queue time
- Frontend slider to adjust queue during simulation

**Verify:**
- [ ] Set queue to 30 min via API
- [ ] Simulation uses new queue value
- [ ] Higher queue = more idle time

---

## Step 20: X Threshold & Switching
**Goal:** Implement dynamic Case switching.

**Files to create:**
- `backend/app/services/switching.py`

**Files to modify:**
- `backend/app/simulation/engine.py`

**What it does:**
- Calculate X threshold dynamically
- When queue_wait > X → switch to Case 2
- When queue_wait < X → switch to Case 1
- Log switch events

**Verify:**
- [ ] Set high queue → simulation switches to Case 2
- [ ] Set low queue → stays in Case 1
- [ ] Switch events logged in results

---

## Step 21: Live Recommendations
**Goal:** Show current recommendation panel.

**Files to create:**
- `frontend/src/components/RecommendationPanel.jsx`

**Files to modify:**
- `frontend/src/App.jsx`

**What it does:**
- Panel shows: current case, next row, X threshold
- Updates during playback
- Shows switch alerts when case changes

**Verify:**
- [ ] Panel visible during simulation playback
- [ ] Shows current case (1 or 2)
- [ ] Updates when switch occurs

---

## Step 22: Fleet Feasibility Check
**Goal:** Warn if fleet is undersized.

**Files to create:**
- `backend/app/services/feasibility.py`

**Files to modify:**
- `backend/app/main.py`
- `frontend/src/components/FleetConfig.jsx`

**What it does:**
- Before simulation, check: cycle_time > buffer_time?
- If undersized, show warning with recommended truck count
- User can proceed anyway or adjust fleet

**Verify:**
- [ ] Set 1 truck, large field → warning appears
- [ ] Warning shows recommended truck count
- [ ] Can still run simulation with warning

---

## Step 23: State Snapshot & Resume
**Goal:** Save and resume simulation state.

**Files to modify:**
- `backend/app/simulation/engine.py`
- `backend/app/main.py`

**What it does:**
- `POST /api/simulations/{id}/snapshot` - save current state
- `POST /api/simulations/{id}/resume` - resume from snapshot
- Snapshot includes: hopper fills, truck positions, completed rows

**Verify:**
- [ ] Pause simulation, save snapshot
- [ ] Close and reopen
- [ ] Resume from snapshot, continues correctly

---

## Step 24: Polish & Error Handling
**Goal:** Production-ready app.

**What it does:**
- Loading spinners during API calls
- Error messages for failures
- Input validation
- Responsive layout adjustments
- Docker containerization

**Verify:**
- [ ] All error states handled gracefully
- [ ] Loading states shown
- [ ] App works in Docker

---

## Quick Reference: Verification Checkpoints

| Step | Feature | Key Test |
|------|---------|----------|
| 1 | Satellite map | Map loads, can zoom |
| 2 | Draw rectangle | Bounds logged to console |
| 3 | Fetch heatmap | Image appears |
| 4 | Yield grid | Hover shows Bu/Ac |
| 5 | Nearby roads | Yellow lines appear |
| 6 | Pickup point | Red marker on click |
| 7 | Address autocomplete | Dropdown shows suggestions |
| 8 | Route to silo | Yellow route line |
| 9 | Row lines | Green lines on field |
| 10 | Fleet config | Can enter values |
| 11 | Row aggregation | API returns rows |
| 12 | Sequences | Case 1/2 sorted |
| 13 | Simulation | Returns results |
| 14 | Results display | Metrics shown |
| 15 | Animation data | Positions in response |
| 16 | Harvester animation | Icon moves in Z |
| 17 | Truck animation | Trucks move on route |
| 18 | Hopper display | Fill levels animate |
| 19 | Mock queue | Queue affects simulation |
| 20 | Switching | Case changes with queue |
| 21 | Recommendations | Panel shows current case |
| 22 | Feasibility | Warning for undersized fleet |
| 23 | Snapshot/resume | Can pause and continue |
| 24 | Polish | Error handling, Docker |
