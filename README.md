# FieldNet

**Precision Agriculture Harvest Optimization System**

---

## Problem Statement

During corn harvest, combines must continuously offload grain to hopper carts, which then transfer to trucks that haul grain to silos. When a combine's hopper fills and no truck is available, the combine sits idle—wasting precious time during a narrow harvest window.

The challenge is compounded by variable silo queue times. When queues are long, trucks take longer to cycle back, increasing the risk of combine idle time. Farmers currently have no way to predict or adapt to these conditions in real-time.

**Key pain points:**
- Combine idle time reduces harvest efficiency by 10-25%
- Variable silo queues make logistics unpredictable
- No visibility into how field yield variation affects equipment timing
- Fleet sizing decisions are made without simulation data

---

## Solution Overview

FieldNet uses satellite-derived yield maps and discrete-event simulation to optimize harvest sequencing and minimize combine idle time.

**Two harvest strategies are compared:**

| Strategy | Description | Best When |
|----------|-------------|-----------|
| **Case 1: High-to-Low Yield** | Start harvesting from the high-yield end of the field | Silo queues are short, trucks cycle quickly |
| **Case 2: Low-to-High Yield** | Start from the low-yield end to slow hopper fill rate | Silo queues are long, trucks need more return time |

FieldNet simulates both strategies with your actual field data and fleet configuration, then recommends the approach that minimizes total harvest time.

---

## Technical Approach

### Data Pipeline
1. **Satellite Imagery**: Sentinel-2 NDVI data via Google Earth Engine
2. **Yield Estimation**: WDRVI-based yield model calibrated for corn (Bu/Ac)
3. **Road Network**: OpenStreetMap via Overpass API for pickup points
4. **Routing**: OSRM for accurate field-to-silo distances

### Simulation Engine
- **SimPy** discrete-event simulation models:
  - Combine harvesting passes sequentially
  - Hoppers filling with grain at variable rates (based on yield)
  - Truck dispatch when hoppers reach capacity
  - Truck travel, queue wait, unload, and return cycles
  - Dynamic case switching based on X-threshold algorithm

### X-Threshold Algorithm
```
X = (time until hopper full) - (truck round trip time)

If queue_wait > X → Switch to Case 2 (slow down grain accumulation)
If queue_wait < X → Stay in Case 1 (maximize throughput)
```

### Architecture
```
┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│     Backend     │
│  React + Leaflet│     │ FastAPI + SimPy │
└─────────────────┘     └─────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │  Google Earth Engine │
                   │    (Sentinel-2)      │
                   └─────────────────────┘
```

---

## Results

### Simulation Outputs
- **Total harvest time** (minutes)
- **Efficiency score** (theoretical time / actual time)
- **Idle events** (number of times combine waited)
- **Idle time** (total minutes combine was idle)
- **Queue wait** (total minutes trucks spent in silo queue)
- **Case switches** (dynamic strategy changes during harvest)

### Visualization
- Animated harvest playback showing combine, trucks, and hoppers
- Real-time hopper fill gauges
- Truck status indicators (traveling, queued, unloading, returning)
- Side-by-side Case 1 vs Case 2 comparison

### Expected Impact
- **10-20% reduction** in combine idle time with optimized sequencing
- **Data-driven fleet sizing** recommendations
- **Adaptive strategy** based on real-time queue conditions

---

## Run Instructions

### Prerequisites
- Python 3.11+
- Node.js 18+
- Google Earth Engine account

### 1. Clone Repository
```bash
git clone https://github.com/your-repo/FieldNet.git
cd FieldNet
```

### 2. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure Earth Engine project
echo "GEE_PROJECT=your-project-id" > .env

# Authenticate (first time only)
earthengine authenticate

# Start server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Open Application
Navigate to **http://localhost:3000**

### Usage
1. Draw a rectangle on the map to define field boundaries
2. Click **Fetch Yield Map** to load satellite data
3. Click a nearby road to set the truck pickup point
4. Enter silo address in the search box
5. Configure fleet (trucks, hoppers, capacities)
6. Set queue time and pattern
7. Click **Run Simulation** to compare strategies
8. View animated playback of recommended approach

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React 18, Vite, Leaflet, React-Leaflet |
| Backend | Python, FastAPI, SimPy, NumPy |
| Satellite | Google Earth Engine, Sentinel-2 |
| Routing | OSRM, Overpass API |

---

*Built for precision agriculture optimization.*
