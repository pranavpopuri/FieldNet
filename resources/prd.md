# Precision Agriculture Harvest Optimization System — Specification

---

## 1. Input Data

1. **Field data** — a square patch with a heatmap overlay showing variable yield, estimated using Google Earth Engine (10m × 10m spatial resolution).
2. **Silo location data** — fixed for the duration of the harvest.
3. **Count of semi-trucks** (each with a grain trailer, capacity ~900–1,000 bushels).
4. **Count of grain hoppers** — modeled as a pool (see Section 4).

---

## 2. Key Metrics

### 2.1 Field Heatmap with Variable Yield
As the combine harvester moves through cornrows, yield is integrated from our digital map of the yield in the area that the combine covered. (output: bushels/minute) to track total yield collected so far. The Earth Engine heatmap provides pre-harvest estimates only and is used for sequencing decisions before the combine starts. Live hopper fill level is driven by real-time yield monitor integration, not heatmap estimates.

Row orientation is inferred from field geometry. The field is assumed to be perfectly square. The default number of cornrows processed per pass of the combine harvester.

**Row-level yield aggregation:** total bushels per row, calculated by summing yield values across all 10m heatmap cells the row passes through. If the heatmap is in yield density units (bushels/acre), cell values are multiplied by cell area before summing to produce absolute bushels.

Heatmap estimates and live yield monitor data will diverge in practice. When a row yields significantly more or less than predicted, estimates for spatially correlated unvisited rows should be updated accordingly.

### 2.2 Time to Silo
```
Time to silo = travel time to silo + silo queue wait time
```
Silo queue wait time is provided by a real-time API from the silo, returning current estimated wait time in minutes.

### 2.3 Fleet Cycle Time
```
Fleet cycle time = time to silo + queue wait time + unload time + return time
```
- Unload time is a fixed constant.
- A single semi-truck (grain trailer) can service multiple hoppers per trip as long as the trailer is not full. Truck dispatch logic must account for this: a truck may pull alongside multiple hoppers to top up its load before departing for the silo.

**Truck dispatch rule:** dispatch when trailer is ≥80% full OR when any hopper in the pool exceeds a defined fill threshold. Both thresholds are configurable parameters.

---

## 3. Objective

Minimize combine harvester idle time — defined as the condition where all hoppers in the pool are full and no truck is available to empty one.

---

## 4. Hopper Pool Model

Hoppers are modeled as a pool, not individually. The combine goes idle only when the pool is exhausted:

```
Idle event triggered when: (hoppers available == 0) AND (no truck due to return within T minutes)
```

Where T is a small buffer (configurable, default 2–3 minutes) to account for hopper swap time. Each hopper's fill state is tracked independently. Fill level for each hopper updates continuously from yield monitor integration.

When a hopper is full, the combine finishes the current row before stopping. An idle event is only triggered if no replacement hopper is available from the pool.

---

## 5. Harvesting Sequence

### Case 1 — High to Low Yield (Baseline)
Process cornrows in descending order of total bushels. This is the optimal sequence under no-queue conditions and serves as the baseline against which all other sequences are measured.

### Case 2 — Low to High Yield (Queue Pressure)
Process cornrows in ascending order of total bushels. Used when queue conditions mean trucks cannot return in time and the hopper pool is at risk of exhaustion. Low-yield rows fill hoppers more slowly, buying time for trucks to return.

---

## 6. Silo Selection

Silo selection is a **harvest-level commitment**. The most time-optimal silo is selected before harvest begins using the time-to-silo formula. Mid-harvest re-routing is not supported, as queue time (30–60 min) dominates travel time (5–10 min) and switching adds complexity without proportional benefit.

---

## 7. Dynamic Switching Logic

### X Threshold (Switch Trigger)
```
X = fleet cycle time − hopper buffer time remaining
```
Where hopper buffer time remaining = (total hopper pool capacity − current fill level) ÷ current yield rate.

- X is recalculated dynamically using continuous yield monitor data and the latest queue API reading.
- While queue wait > X: operate in Case 2.
- When queue wait drops below X: switch back to Case 1.

### Switch Cost Gate
A switch is only executed if:
```
idle time prevented by switching > travel time to low-yield rows + efficiency loss from suboptimal sequencing
```
Where:
```
Efficiency loss = (yield rate of best available row − yield rate of target low-yield row) × time spent on low-yield row
```

### Spatial Switching Constraint
The field will not have a clean high/low yield split. Before switching to Case 2 rows, the system evaluates whether travel time to reach those rows consumes the buffer the switch is intended to create. If the combine is already adjacent to low-yield rows, the travel cost is near zero and switching is more likely to be beneficial.

### Case 2 Termination Condition
If the system has been in Case 2 for longer than one full fleet cycle time with no improvement in queue wait, abandon Case 2, accept idle risk, and return to Case 1 sequence.

---

## 8. Fleet Feasibility Check

Run before any sequence is recommended, assuming no queue:
```
If fleet cycle time > total hopper pool buffer time → flag "fleet undersized"
```
Recommend minimum truck count to satisfy the constraint.

Re-run the feasibility check whenever queue wait crosses a defined threshold during harvest, since queue conditions can create an effective undersized fleet even if the pre-harvest check passed.

---

## 9. Simulation Layer

The simulation runs a discrete-event model of one full harvest cycle: combine moves, hopper fills (via yield rate), truck dispatched, truck returns, hopper swapped.

**Scope:** the simulation runs both pre-harvest (using Earth Engine heatmap as initial conditions) and mid-harvest (snapshotting current state and re-evaluating the remaining sequence from that point). It can be triggered at any point during harvest.

**Synthetic yield injection:** the simulation supports injecting synthetic yield scenarios in place of the Earth Engine heatmap, for testing edge cases and validating the X formula before field deployment.

**Outputs:**
- Number of combine idle events (duration + cause per event)
- Number of hopper overflow risk moments
- Actual vs. predicted fleet cycle time
- Sequence efficiency score vs. Case 1 baseline

**State serialization:** for mid-harvest re-evaluation, the simulation snapshots current state (hopper fill levels, truck positions in cycle, rows completed, current queue wait) and resumes from that point with a revised sequence.

---

## 10. Queue API

The silo queue API returns:
- Current estimated wait time in minutes
- A timestamp (used to detect stale data)

If queue data has not been refreshed within one row-traversal time, X calculations are flagged as operating on stale data and a conservative buffer is applied (widen X by a configurable margin, default 10%) to bias toward switching earlier rather than later.
