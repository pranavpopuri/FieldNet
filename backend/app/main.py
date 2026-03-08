import io
import os
import base64
import ee
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Any
from dotenv import load_dotenv
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image

# Load environment variables from .env file
load_dotenv()

from .vegetation_indices import get_vi_arrays_for_region
from .services.row_calculator import calculate_rows_from_yield_matrix, get_row_summary
from .services.sequence import generate_case1_sequence, generate_case2_sequence, get_sequence_summary
from .simulation.engine import HarvestSimulation, FleetConfig
from .services.feasibility import check_fleet_feasibility

app = FastAPI(title="FieldNet API")

# Mock silo queue state (in-memory for MVP)
mock_queue_state = {
    "queue_time": 0.0,  # minutes
    "last_updated": None
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Starting server... initializing Earth Engine...")
try:
    gee_project = os.getenv('GEE_PROJECT')
    if not gee_project:
        raise ValueError("GEE_PROJECT environment variable not set. Add it to backend/.env")
    ee.Initialize(project=gee_project)
    print(f"Earth Engine initialized successfully with project: {gee_project}")
except Exception as e:
    print("Failed to initialize Earth Engine:", e)
    print("You may need to run `earthengine authenticate` or set GEE_PROJECT in .env")


class Bounds(BaseModel):
    sw_lat: float
    sw_lon: float
    ne_lat: float
    ne_lon: float


class VisualizeRequest(BaseModel):
    bounds: Bounds
    date: Optional[str] = '2025-07-30'
    resolution: Optional[int] = 10
    days_back: Optional[int] = 30


class RowsRequest(BaseModel):
    bounds: Bounds
    date: Optional[str] = '2025-07-30'
    resolution: Optional[int] = 10
    days_back: Optional[int] = 30
    combine_speed_mph: Optional[float] = 5.0


class FleetConfigRequest(BaseModel):
    truck_count: Optional[int] = 3
    truck_capacity: Optional[float] = 950
    hopper_count: Optional[int] = 2
    hopper_capacity: Optional[float] = 500
    combine_speed_mph: Optional[float] = 5
    truck_speed_mph: Optional[float] = 35


class SiloLocation(BaseModel):
    lat: float
    lon: float


class RouteCoord(BaseModel):
    lat: float
    lon: float


class EntryPoint(BaseModel):
    road: SiloLocation  # Point on the road
    field: SiloLocation  # Point on the field edge


class SimulationRequest(BaseModel):
    bounds: Bounds
    fleet_config: FleetConfigRequest
    silo_distance_miles: Optional[float] = 5.0
    silo_queue_time: Optional[float] = 0  # minutes (base/max value for patterns)
    silo_location: Optional[SiloLocation] = None  # Optional silo coords for animation
    route_coords: Optional[List[RouteCoord]] = None  # Route from pickup to silo for truck animation
    pickup_point: Optional[SiloLocation] = None  # Pickup point on field edge
    entry_point: Optional[EntryPoint] = None  # Single entry point connecting road to field
    case: Optional[int] = 1  # 1 for high-to-low, 2 for low-to-high
    queue_pattern: Optional[str] = 'static'  # 'static', 'bell_curve', 'ramp_up', 'ramp_down'
    date: Optional[str] = '2025-07-30'
    resolution: Optional[int] = 10
    days_back: Optional[int] = 30


def to_json_list(arr: np.ndarray) -> List[List[Any]]:
    """Convert numpy array to JSON-serializable 2D list (NaNs -> None)."""
    result = []
    for row in arr:
        result.append([None if np.isnan(v) else float(v) for v in row])
    return result


def create_yield_overlay(est_yield: np.ndarray, min_val: float, max_val: float) -> str:
    """Create a PNG overlay image from yield data with transparency."""
    # YlOrRd colormap: Yellow (low) -> Orange -> Red (high)
    cmap = plt.cm.YlOrRd

    # Normalize to 0-1 based on min/max
    if max_val > min_val:
        normalized = np.clip((est_yield - min_val) / (max_val - min_val), 0, 1)
    else:
        normalized = np.zeros_like(est_yield)

    rgba = cmap(normalized)

    # Only make NaN pixels transparent, fill everything else
    alpha = 0.85
    rgba[:, :, 3] = np.where(np.isnan(est_yield), 0, alpha)

    rgba_uint8 = (rgba * 255).astype(np.uint8)

    # Flip vertically - numpy arrays are top-to-bottom, but geo coords are bottom-to-top
    rgba_uint8 = np.flipud(rgba_uint8)

    img = Image.fromarray(rgba_uint8, mode='RGBA')

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)

    return base64.b64encode(buf.read()).decode('utf-8')


@app.get("/")
async def root():
    return {"message": "FieldNet API is running"}


@app.post("/api/visualize")
async def visualize(request: VisualizeRequest):
    try:
        roi = ee.Geometry.Rectangle([
            request.bounds.sw_lon,
            request.bounds.sw_lat,
            request.bounds.ne_lon,
            request.bounds.ne_lat
        ])

        vi_data = get_vi_arrays_for_region(
            roi,
            request.date,
            request.resolution,
            request.days_back
        )

        if vi_data is None:
            raise ValueError('Could not retrieve data (possibly no clear imagery).')

        wdrvi_data = vi_data[:, :, 3]
        est_yield = np.clip(wdrvi_data * 290 - 30, 0, 300)

        wdrvi_max = np.nanmax(wdrvi_data)
        if np.isnan(wdrvi_max) or wdrvi_max <= 0:
            relative_vigor = np.zeros_like(wdrvi_data)
        else:
            relative_vigor = np.where(wdrvi_max > 0, (wdrvi_data / wdrvi_max) * 100, 0)
        relative_vigor = np.clip(relative_vigor, 0, 100)

        avg_yield = float(np.nanmean(est_yield)) if not np.all(np.isnan(est_yield)) else 0.0
        avg_vigor = float(np.nanmean(relative_vigor)) if not np.all(np.isnan(relative_vigor)) else 0.0

        # Calculate actual min/max for yield (excluding only NaN)
        valid_yields = est_yield[~np.isnan(est_yield)]
        if len(valid_yields) > 0:
            min_yield = float(np.min(valid_yields))
            max_yield = float(np.max(valid_yields))
        else:
            min_yield = 0.0
            max_yield = 250.0

        overlay_image = create_yield_overlay(est_yield, min_yield, max_yield)

        # Flip yield matrix to match overlay orientation
        est_yield_flipped = np.flipud(est_yield)

        return {
            'overlay': overlay_image,
            'average_yield': avg_yield,
            'average_vigor': avg_vigor,
            'min_yield': min_yield,
            'max_yield': max_yield,
            'yield_matrix': to_json_list(est_yield_flipped)
        }

    except Exception as e:
        print(f"Error processing visualization: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fields/{field_id}/rows")
async def get_field_rows(field_id: str, request: RowsRequest):
    """
    Calculate per-row (per-pass) yield data for a field.
    Returns list of passes with yield estimates and traversal times.
    """
    try:
        roi = ee.Geometry.Rectangle([
            request.bounds.sw_lon,
            request.bounds.sw_lat,
            request.bounds.ne_lon,
            request.bounds.ne_lat
        ])

        vi_data = get_vi_arrays_for_region(
            roi,
            request.date,
            request.resolution,
            request.days_back
        )

        if vi_data is None:
            raise ValueError('Could not retrieve data (possibly no clear imagery).')

        # Calculate yield from WDRVI
        wdrvi_data = vi_data[:, :, 3]
        est_yield = np.clip(wdrvi_data * 290 - 30, 0, 300)

        # Calculate rows/passes
        bounds_dict = {
            'sw_lat': request.bounds.sw_lat,
            'sw_lon': request.bounds.sw_lon,
            'ne_lat': request.bounds.ne_lat,
            'ne_lon': request.bounds.ne_lon
        }

        rows = calculate_rows_from_yield_matrix(
            est_yield,
            bounds_dict,
            request.combine_speed_mph
        )

        summary = get_row_summary(rows)

        return {
            'field_id': field_id,
            'rows': rows,
            'summary': summary
        }

    except Exception as e:
        print(f"Error calculating rows: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sequences/{field_id}")
async def get_sequences(field_id: str, request: RowsRequest):
    """
    Generate Case 1 and Case 2 harvest sequences for a field.

    Case 1: High-to-low yield (for short silo queues)
    Case 2: Low-to-high yield (for long silo queues)
    """
    try:
        roi = ee.Geometry.Rectangle([
            request.bounds.sw_lon,
            request.bounds.sw_lat,
            request.bounds.ne_lon,
            request.bounds.ne_lat
        ])

        vi_data = get_vi_arrays_for_region(
            roi,
            request.date,
            request.resolution,
            request.days_back
        )

        if vi_data is None:
            raise ValueError('Could not retrieve data (possibly no clear imagery).')

        # Calculate yield from WDRVI
        wdrvi_data = vi_data[:, :, 3]
        est_yield = np.clip(wdrvi_data * 290 - 30, 0, 300)

        # Calculate rows/passes
        bounds_dict = {
            'sw_lat': request.bounds.sw_lat,
            'sw_lon': request.bounds.sw_lon,
            'ne_lat': request.bounds.ne_lat,
            'ne_lon': request.bounds.ne_lon
        }

        rows = calculate_rows_from_yield_matrix(
            est_yield,
            bounds_dict,
            request.combine_speed_mph
        )

        # Generate both sequences
        case1_sequence = generate_case1_sequence(rows)
        case2_sequence = generate_case2_sequence(rows)

        return {
            'field_id': field_id,
            'case1_sequence': case1_sequence,
            'case1_summary': get_sequence_summary(case1_sequence, 1),
            'case2_sequence': case2_sequence,
            'case2_summary': get_sequence_summary(case2_sequence, 2)
        }

    except Exception as e:
        print(f"Error generating sequences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/simulations")
async def run_simulation(request: SimulationRequest):
    """
    Run a harvest simulation with the given configuration.

    Returns simulation results including total time, idle events, and efficiency.
    """
    try:
        roi = ee.Geometry.Rectangle([
            request.bounds.sw_lon,
            request.bounds.sw_lat,
            request.bounds.ne_lon,
            request.bounds.ne_lat
        ])

        vi_data = get_vi_arrays_for_region(
            roi,
            request.date,
            request.resolution,
            request.days_back
        )

        if vi_data is None:
            raise ValueError('Could not retrieve data (possibly no clear imagery).')

        # Calculate yield from WDRVI
        wdrvi_data = vi_data[:, :, 3]
        est_yield = np.clip(wdrvi_data * 290 - 30, 0, 300)

        # Calculate rows/passes
        bounds_dict = {
            'sw_lat': request.bounds.sw_lat,
            'sw_lon': request.bounds.sw_lon,
            'ne_lat': request.bounds.ne_lat,
            'ne_lon': request.bounds.ne_lon
        }

        rows = calculate_rows_from_yield_matrix(
            est_yield,
            bounds_dict,
            request.fleet_config.combine_speed_mph
        )

        # Generate sequence based on case
        if request.case == 2:
            sequence = generate_case2_sequence(rows)
        else:
            sequence = generate_case1_sequence(rows)

        # Calculate field center
        field_center = {
            'lat': (request.bounds.sw_lat + request.bounds.ne_lat) / 2,
            'lon': (request.bounds.sw_lon + request.bounds.ne_lon) / 2
        }

        # Use pickup point if provided, otherwise use field center
        pickup_point = None
        if request.pickup_point:
            pickup_point = {
                'lat': request.pickup_point.lat,
                'lon': request.pickup_point.lon
            }
        else:
            pickup_point = field_center

        # Calculate silo location (default: offset north of field by silo_distance)
        if request.silo_location:
            silo_location = {
                'lat': request.silo_location.lat,
                'lon': request.silo_location.lon
            }
        else:
            # Default silo position: north of field center
            # Approximate: 1 degree lat ≈ 69 miles
            lat_offset = request.silo_distance_miles / 69.0
            silo_location = {
                'lat': request.bounds.ne_lat + lat_offset,
                'lon': field_center['lon']
            }

        # Convert route coords to list of dicts
        route_coords = None
        if request.route_coords:
            route_coords = [{'lat': c.lat, 'lon': c.lon} for c in request.route_coords]

        # Convert entry point to dict
        entry_point = None
        if request.entry_point:
            entry_point = {
                'road': {'lat': request.entry_point.road.lat, 'lon': request.entry_point.road.lon},
                'field': {'lat': request.entry_point.field.lat, 'lon': request.entry_point.field.lon}
            }

        # Field bounds for perimeter routing
        field_bounds = {
            'sw_lat': request.bounds.sw_lat,
            'sw_lon': request.bounds.sw_lon,
            'ne_lat': request.bounds.ne_lat,
            'ne_lon': request.bounds.ne_lon
        }

        # Create fleet config
        fleet_config = FleetConfig(
            truck_count=request.fleet_config.truck_count,
            truck_capacity=request.fleet_config.truck_capacity,
            hopper_count=request.fleet_config.hopper_count,
            hopper_capacity=request.fleet_config.hopper_capacity,
            combine_speed_mph=request.fleet_config.combine_speed_mph,
            truck_speed_mph=request.fleet_config.truck_speed_mph,
            silo_distance_miles=request.silo_distance_miles
        )

        # Run simulation
        sim = HarvestSimulation(
            sequence=sequence,
            fleet_config=fleet_config,
            silo_queue_time=request.silo_queue_time,
            silo_location=silo_location,
            field_center=field_center,
            pickup_point=pickup_point,
            route_coords=route_coords,
            entry_point=entry_point,
            field_bounds=field_bounds,
            initial_case=request.case,
            enable_switching=True,  # Enable dynamic case switching
            queue_pattern=request.queue_pattern  # Dynamic queue pattern
        )

        result = sim.run()

        return {
            'case': request.case,
            'final_case': result.final_case,
            'total_time_minutes': result.total_time,
            'idle_events': result.idle_events,
            'idle_time_minutes': result.idle_time,
            'bushels_harvested': result.bushels_harvested,
            'passes_completed': result.passes_completed,
            'truck_trips': result.truck_trips,
            'efficiency_score': result.efficiency_score,
            'total_queue_wait_minutes': result.total_queue_wait,
            'events': result.events[:100],  # Limit events to first 100
            'animation_frames': result.animation_frames,
            'switch_events': result.switch_events,
            'silo_location': silo_location,
            'field_center': field_center
        }

    except Exception as e:
        print(f"Error running simulation: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class MockQueueRequest(BaseModel):
    queue_time: float  # minutes


@app.get("/api/queue")
async def get_queue():
    """Get current mock silo queue time."""
    return {
        'queue_time': mock_queue_state['queue_time'],
        'last_updated': mock_queue_state['last_updated']
    }


@app.post("/api/queue/mock")
async def set_mock_queue(request: MockQueueRequest):
    """Set mock silo queue time for testing."""
    from datetime import datetime

    mock_queue_state['queue_time'] = max(0, request.queue_time)  # No negative queue
    mock_queue_state['last_updated'] = datetime.now().isoformat()

    return {
        'queue_time': mock_queue_state['queue_time'],
        'last_updated': mock_queue_state['last_updated'],
        'message': f'Queue time set to {mock_queue_state["queue_time"]} minutes'
    }


class FeasibilityRequest(BaseModel):
    truck_count: int
    truck_capacity: float
    hopper_count: int
    hopper_capacity: float
    silo_distance_miles: float
    queue_time: Optional[float] = 0
    average_yield_per_pass: Optional[float] = 500
    average_pass_time: Optional[float] = 10


@app.post("/api/fleet/feasibility")
async def check_feasibility(request: FeasibilityRequest):
    """
    Check if fleet configuration is adequate for the harvest.

    Returns feasibility analysis with warnings and recommendations.
    """
    result = check_fleet_feasibility(
        truck_count=request.truck_count,
        truck_capacity=request.truck_capacity,
        hopper_count=request.hopper_count,
        hopper_capacity=request.hopper_capacity,
        silo_distance_miles=request.silo_distance_miles,
        queue_time=request.queue_time,
        average_yield_per_pass=request.average_yield_per_pass,
        average_pass_time=request.average_pass_time
    )

    return result
