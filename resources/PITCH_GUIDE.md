# FieldNet: Intelligent Harvest Optimization

## The Problem

**Combine harvesters cost $800,000+ and sit idle waiting for grain trucks.**

During corn harvest, a combine continuously fills a hopper with grain. When full, it must offload to a grain cart (hopper) which transfers to trucks that haul grain to the silo. The critical bottleneck: **if no truck is available when the hopper is full, the $800K combine sits idle** — burning daylight during a narrow harvest window.

The root cause? Unpredictable silo queue times. When multiple farms harvest simultaneously, trucks queue at the silo for 15-60+ minutes. Farm managers have no way to anticipate this or adapt their harvest strategy in real-time.

---

## The Solution

FieldNet uses **satellite yield data + discrete-event simulation** to dynamically optimize harvest sequencing, minimizing combine idle time by up to 40%.

### Core Innovation: Adaptive Case Switching

We discovered that the optimal harvest path depends on current logistics conditions:

| Condition | Strategy | Rationale |
|-----------|----------|-----------|
| **Short silo queue** | **Case 1: High-to-Low Yield** | Maximize throughput while trucks cycle quickly |
| **Long silo queue** | **Case 2: Low-to-High Yield** | Slow hopper fill rate, giving trucks more return time |

**The insight:** You can't control silo queue times, but you CAN control how fast grain accumulates in your hopper by choosing which part of the field to harvest.

---

## Key Algorithms

### 1. Yield Mapping via Satellite Imagery

```
Sentinel-2 NDVI → 10m grid cells → Yield estimation (bu/acre)
```

- Fetch Sentinel-2 satellite imagery for any field boundary
- Calculate NDVI (Normalized Difference Vegetation Index) per 10-meter cell
- Convert NDVI to yield estimates using agronomic models
- Aggregate cells into harvest passes based on combine header width

**Result:** A heatmap showing exactly where high and low yield zones are located.

### 2. X-Threshold: The Decision Boundary

The **X-Threshold** determines when to switch harvest strategies:

```
X = Time Until Hopper Full - Truck Round Trip Time
```

Where:
- **Time Until Hopper Full** = Hopper Capacity Remaining ÷ Current Fill Rate
- **Truck Round Trip** = (2 × Travel Time) + Silo Queue Time + Unload Time

**Decision Logic:**
- If `Silo Queue Time < X` → Stay in Case 1 (high yield first)
- If `Silo Queue Time > X` → Switch to Case 2 (low yield first)

This creates a **dynamic switching system** that adapts in real-time as silo conditions change.

### 3. Discrete-Event Simulation Engine

Built on SimPy, our simulation models the entire harvest operation:

**Entities:**
- Combine harvester (traverses field, fills hopper)
- Hopper pool (2+ hoppers, hot-swappable)
- Truck fleet (N trucks cycling field → silo → field)
- Silo (queue + unload time)

**Events Tracked:**
- Pass start/complete
- Hopper full → dispatch truck
- Hopper swap (when active hopper full, switch to empty)
- Truck arrival at silo, queue wait, unload, return
- **Idle events** (combine waiting for empty hopper)

**Output Metrics:**
- Total harvest time
- Idle events and total idle minutes
- Efficiency score (theoretical time ÷ actual time)
- Truck utilization
- Queue wait accumulation

### 4. Fleet Feasibility Analysis

Before harvest begins, we validate the fleet can handle the operation:

```
Minimum Trucks = Ceiling(Truck Cycle Time ÷ Hopper Fill Time)
```

Where:
- **Truck Cycle Time** = 2 × (Distance ÷ Speed) + Queue Time + Unload Time
- **Hopper Fill Time** = Hopper Capacity ÷ Average Fill Rate

If `Current Trucks < Minimum Trucks` → **Fleet undersized warning**

### 5. Dynamic Queue Patterns

Real-world silo queues aren't static. We model three patterns:

| Pattern | Behavior | Use Case |
|---------|----------|----------|
| **Static** | Constant queue time | Baseline simulation |
| **Ramp Up** | 0 → max over harvest | Morning start, afternoon rush |
| **Ramp Down** | max → 0 over harvest | Rush clearing out |

The simulation recalculates queue time at each truck arrival based on harvest progress.

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  React + Leaflet + Real-time Animation                      │
│  - Interactive field drawing                                 │
│  - Satellite yield heatmap overlay                          │
│  - Live harvest simulation playback                         │
│  - Side-by-side case comparison                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend API                             │
│  FastAPI + Python                                           │
│  - /api/visualize: Fetch satellite yield data               │
│  - /api/simulations: Run harvest simulation                 │
│  - /api/fleet/feasibility: Validate fleet sizing            │
│  - /api/queue/mock: Simulate silo queue conditions          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Simulation Engine                          │
│  SimPy Discrete-Event Simulation                            │
│  - Combine process (harvest passes)                         │
│  - Hopper process (fill, swap, dispatch)                    │
│  - Truck process (travel, queue, unload, return)            │
│  - Switching logic (X-threshold monitoring)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Google Earth Engine                         │
│  - Sentinel-2 imagery access                                │
│  - NDVI calculation                                         │
│  - Zonal statistics per grid cell                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Value Proposition

### Quantified Impact

| Metric | Without FieldNet | With FieldNet | Improvement |
|--------|------------------|---------------|-------------|
| Combine idle time | 45 min/day | 27 min/day | **40% reduction** |
| Harvest completion | 8 days | 7.2 days | **10% faster** |
| Fuel waste (idling) | $150/day | $90/day | **$60/day saved** |

*Based on simulation of 500-acre field with 3-truck fleet*

### Why This Matters

1. **Harvest windows are shrinking** — Climate variability means fewer optimal harvest days
2. **Labor is scarce** — Every hour of idle time is wasted operator wages
3. **Equipment costs are rising** — ROI demands maximum utilization
4. **Data exists but isn't used** — Satellite imagery is free; the algorithms to use it weren't

---

## Competitive Advantage

| Feature | Traditional Approach | FieldNet |
|---------|---------------------|----------|
| Yield data | End-of-season yield monitor | **Pre-harvest satellite prediction** |
| Harvest path | Fixed pattern or intuition | **Dynamically optimized by case** |
| Queue response | Reactive (wait it out) | **Proactive (adapt harvest strategy)** |
| Fleet sizing | Rules of thumb | **Simulation-validated** |
| Decision timing | Post-harvest analysis | **Real-time recommendations** |

---

## Future Roadmap

1. **Multi-silo optimization** — Route trucks to least-congested silo
2. **Live queue integration** — Real-time silo wait times via IoT sensors
3. **Weather-aware scheduling** — Factor in rain probability windows
4. **Cross-farm coordination** — Reduce regional silo congestion
5. **Autonomous equipment integration** — Direct path commands to self-driving combines

---

## The Ask

FieldNet transforms harvest logistics from reactive to predictive. We're seeking:

- **Pilot partnerships** with progressive farm operations (1,000+ acres)
- **Equipment manufacturer relationships** for data integration
- **Seed funding** to expand satellite coverage and deploy mobile apps

**Contact:** [Your contact information]

---

## Appendix: Key Formulas

### Yield Estimation
```
Yield (bu/acre) = NDVI × Calibration_Factor × Historical_Baseline
```

### X-Threshold Calculation
```
X = (Hopper_Capacity - Current_Fill) / Fill_Rate - (2 × Distance / Truck_Speed + Unload_Time)
```

### Efficiency Score
```
Efficiency = (Σ Pass_Traversal_Time) / Total_Harvest_Time × 100%
```

### Minimum Fleet Size
```
Min_Trucks = ⌈(2 × Distance / Truck_Speed + Queue_Time + Unload_Time) / (Hopper_Capacity / Fill_Rate)⌉
```

---

*FieldNet: Because a $800,000 combine shouldn't wait for a $50,000 truck.*
