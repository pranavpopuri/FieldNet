# FieldNet

**Precision Agriculture Harvest Optimization System**

FieldNet minimizes combine harvester idle time by using satellite yield data and discrete-event simulation to dynamically optimize harvest sequencing.

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Google Earth Engine account (for satellite data)

### 1. Clone and Setup

```bash
git clone https://github.com/your-repo/FieldNet.git
cd FieldNet
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Authenticate with Google Earth Engine (first time only)
earthengine authenticate

# Start the server
uvicorn app.main:app --reload --port 5001
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Open the App

Navigate to **http://localhost:3000**

---

## Features

### Field Setup

| Feature | Description |
|---------|-------------|
| **Draw Field** | Draw a rectangle on the satellite map to define your field boundaries |
| **Yield Heatmap** | Fetches Sentinel-2 NDVI data and displays estimated yield (Bu/Ac) as a color overlay |
| **Pickup Point** | Click on a nearby road to set where trucks will load grain |
| **Silo Address** | Type an address with autocomplete to set the destination |
| **Route Display** | Shows the driving route from field to silo with distance |

### Fleet Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| Trucks | Number of grain trucks | 3 |
| Truck Capacity | Bushels per truck | 950 |
| Hoppers | Number of grain carts | 2 |
| Hopper Capacity | Bushels per hopper | 500 |

### Simulation

- **Run Both Cases** - Automatically simulates Case 1 (high-to-low yield) and Case 2 (low-to-high yield)
- **Side-by-Side Comparison** - View metrics for both strategies
- **Recommendation** - Shows which case results in less total harvest time
- **Animated Playback** - Watch the harvest unfold with moving harvester, trucks, and hopper fill levels

### Queue Patterns

Simulate different silo queue conditions:

| Pattern | Behavior |
|---------|----------|
| **Static** | Constant queue time throughout harvest |
| **Ramp Up** | Queue increases from 0 to max over harvest duration |
| **Ramp Down** | Queue decreases from max to 0 over harvest duration |

### Metrics Displayed

- Total harvest time
- Efficiency score (%)
- Idle events (times combine waited for truck)
- Idle time (minutes)
- Total queue wait (minutes trucks spent in queue)
- Number of case switches

---

## How It Works

### The Problem

When a combine's hopper is full and no truck is available, the combine sits idle. This wastes time during a narrow harvest window.

### The Solution

**Case 1 (High-to-Low Yield):** Start harvesting from the high-yield end of the field. Best when silo queues are short and trucks cycle quickly.

**Case 2 (Low-to-High Yield):** Start from the low-yield end. Slows hopper fill rate, giving trucks more time to return. Best when silo queues are long.

FieldNet simulates both strategies and recommends the one with less total harvest time.

---

## Project Structure

```
FieldNet/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI endpoints
│   │   ├── simulation/
│   │   │   └── engine.py        # SimPy discrete-event simulation
│   │   └── services/
│   │       ├── sequence.py      # Case 1/2 sequence generation
│   │       ├── switching.py     # X-threshold calculation
│   │       └── feasibility.py   # Fleet sizing validation
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SatelliteMap.jsx      # Main map interface
│   │   │   ├── FleetConfig.jsx       # Fleet parameter inputs
│   │   │   ├── SimulationResults.jsx # Case comparison display
│   │   │   ├── AnimationPlayer.jsx   # Playback controls
│   │   │   ├── HopperStatus.jsx      # Hopper fill gauges
│   │   │   ├── TruckStatus.jsx       # Truck status cards
│   │   │   └── QueueControl.jsx      # Queue time slider
│   │   └── App.jsx
│   └── package.json
├── PITCH_GUIDE.md               # Detailed pitch documentation
└── README.md
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/visualize` | POST | Fetch yield heatmap for field bounds |
| `/api/simulations` | POST | Run harvest simulation |
| `/api/fleet/feasibility` | POST | Check if fleet is adequately sized |
| `/api/queue` | GET | Get current mock queue time |
| `/api/queue/mock` | POST | Set mock queue time |

---

## Usage Workflow

1. **Draw a field** on the map
2. **Click "Fetch Heatmap"** to load satellite yield data
3. **Click a road** near the field to set the pickup point
4. **Enter silo address** in the search box
5. **Adjust fleet config** if needed (trucks, hoppers, capacities)
6. **Set queue time and pattern** to simulate silo conditions
7. **Click "Run Simulation"** to compare both harvest strategies
8. **Click a case** to view its animation
9. **Use playback controls** to watch the simulation

---

## Tech Stack

- **Frontend:** React 18, Vite, Leaflet, React-Leaflet
- **Backend:** Python, FastAPI, SimPy
- **Satellite Data:** Google Earth Engine, Sentinel-2
- **Routing:** OSRM, Overpass API (OpenStreetMap)

---

## Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
GEE_PROJECT=your-earth-engine-project-id
```

### Earth Engine Authentication

If you haven't authenticated with Earth Engine:

```bash
earthengine authenticate
```

Follow the prompts to authorize access.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Heatmap not loading | Check Earth Engine authentication: `earthengine authenticate` |
| No roads appearing | Ensure field is near mapped roads (rural areas may have limited data) |
| Simulation fails | Check backend console for errors; ensure all fields are set |
| Animation not playing | Click "Reset" then "Play" on the animation controls |

---

## License

MIT

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

*Built for precision agriculture optimization.*
