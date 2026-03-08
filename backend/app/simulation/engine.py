import simpy
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

from ..services.switching import (
    calculate_x_threshold,
    calculate_fill_rate,
    should_switch_case,
    reorder_remaining_sequence
)


@dataclass
class FleetConfig:
    truck_count: int = 3
    truck_capacity: float = 950  # bushels
    hopper_count: int = 2
    hopper_capacity: float = 500  # bushels
    combine_speed_mph: float = 5
    truck_speed_mph: float = 35
    tractor_speed_road: float = 35  # mph - hopper tractor speed on roads
    tractor_speed_field: float = 5  # mph - hopper tractor speed on field
    silo_distance_miles: float = 5
    silo_unload_time: float = 17  # minutes
    hopper_swap_time: float = 0.5  # minutes (30 seconds)
    dispatch_threshold: float = 0.8  # dispatch truck when hopper is 80% full
    hopper_dispatch_threshold: float = 0.7  # send replacement hopper at 70% full


@dataclass
class AnimationFrame:
    """A snapshot of simulation state at a point in time."""
    time: float  # minutes
    harvester: Dict[str, Any]  # {lat, lon, status, current_pass}
    trucks: List[Dict[str, Any]]  # [{id, lat, lon, status, load}]
    hoppers: List[Dict[str, Any]]  # [{id, fill_level, capacity, is_active}]


@dataclass
class SimulationResult:
    total_time: float = 0  # minutes
    idle_events: int = 0
    idle_time: float = 0  # minutes
    bushels_harvested: float = 0
    passes_completed: int = 0
    truck_trips: int = 0
    efficiency_score: float = 0
    total_queue_wait: float = 0  # total minutes trucks spent in queue
    events: List[Dict[str, Any]] = field(default_factory=list)
    animation_frames: List[Dict[str, Any]] = field(default_factory=list)
    switch_events: List[Dict[str, Any]] = field(default_factory=list)
    final_case: int = 1


class HarvestSimulation:
    """
    Discrete-event simulation of corn harvest operation.

    Models:
    - Combine harvesting passes (rows)
    - Hoppers filling with grain
    - Trucks dispatching when hoppers are full
    - Truck travel to silo, queue wait, unload, return
    """

    def __init__(
        self,
        sequence: List[Dict[str, Any]],
        fleet_config: FleetConfig,
        silo_queue_time: float = 0,  # minutes of queue wait at silo (base/max value)
        silo_location: Optional[Dict[str, float]] = None,  # {lat, lon}
        field_center: Optional[Dict[str, float]] = None,  # {lat, lon}
        pickup_point: Optional[Dict[str, float]] = None,  # {lat, lon} - where trucks load
        route_coords: Optional[List[Dict[str, float]]] = None,  # Route from pickup to silo
        entry_point: Optional[Dict[str, Any]] = None,  # {road: {lat,lon}, field: {lat,lon}}
        field_bounds: Optional[Dict[str, float]] = None,  # {sw_lat, sw_lon, ne_lat, ne_lon}
        initial_case: int = 1,  # Starting case (1 = high-to-low, 2 = low-to-high)
        enable_switching: bool = True,  # Whether to dynamically switch cases
        queue_pattern: str = 'static'  # 'static', 'bell_curve', 'ramp_up', 'ramp_down'
    ):
        self.sequence = sequence
        self.original_sequence = list(sequence)  # Keep original for reference
        self.config = fleet_config
        self.base_queue_time = silo_queue_time  # Store base value for patterns
        self.silo_queue_time = silo_queue_time
        self.queue_pattern = queue_pattern

        # Calculate total expected harvest time for queue patterns
        self.total_harvest_time = sum(p.get('traversal_time', 5) for p in sequence)

        # Locations for animation
        self.silo_location = silo_location or {'lat': 0, 'lon': 0}
        self.field_center = field_center or {'lat': 0, 'lon': 0}
        self.pickup_point = pickup_point or field_center or {'lat': 0, 'lon': 0}

        # Route for truck animation (list of {lat, lon} points)
        self.route_coords = route_coords or [self.pickup_point, self.silo_location]

        # Single entry point for hopper routing
        self.entry_point = entry_point or {'road': self.pickup_point, 'field': self.field_center}

        # Field bounds for perimeter routing
        self.field_bounds = field_bounds or {
            'sw_lat': self.field_center.get('lat', 0) - 0.005,
            'sw_lon': self.field_center.get('lon', 0) - 0.005,
            'ne_lat': self.field_center.get('lat', 0) + 0.005,
            'ne_lon': self.field_center.get('lon', 0) + 0.005
        }

        # SimPy environment
        self.env = simpy.Environment()

        # Resources
        self.hoppers = []
        self.trucks = []
        self.active_hopper_idx = 0

        # State tracking
        self.current_pass_idx = 0
        self.bushels_harvested = 0
        self.idle_events = 0
        self.idle_time = 0
        self.truck_trips = 0
        self.events = []
        self.animation_frames = []

        # Hopper state
        self.hopper_fills = [0.0] * fleet_config.hopper_count
        # Hopper status: 'at_pickup', 'traveling_to_harvester', 'with_harvester', 'returning_to_pickup', 'waiting_unload'
        self.hopper_states = ['at_pickup'] * fleet_config.hopper_count
        self.hopper_positions = [self.pickup_point.copy() for _ in range(fleet_config.hopper_count)]
        # First hopper starts with harvester
        if fleet_config.hopper_count > 0:
            self.hopper_states[0] = 'with_harvester'
        self.replacement_hopper_dispatched = False  # Track if we've sent a replacement

        # Truck state: 'idle', 'traveling_to_silo', 'in_queue', 'unloading', 'returning'
        self.truck_states = ['idle'] * fleet_config.truck_count
        self.truck_loads = [0.0] * fleet_config.truck_count
        self.truck_positions = [self.pickup_point.copy() for _ in range(fleet_config.truck_count)]
        self.truck_progress = [0.0] * fleet_config.truck_count  # 0-1 progress along route
        self.truck_queue_wait = [0.0] * fleet_config.truck_count  # Time spent waiting in queue
        self.truck_queue_start = [0.0] * fleet_config.truck_count  # When truck entered queue
        self.total_queue_wait = 0.0  # Cumulative queue wait across all truck trips

        # Harvester state
        self.harvester_status = 'idle'
        self.harvester_position = {'lat': 0, 'lon': 0}
        self.harvester_pass_progress = 0.0  # 0-1 progress through current pass

        # Available trucks queue
        self.available_trucks = simpy.Store(self.env)

        # Frame recording interval (every 0.25 minutes = 15 seconds for smoother animation)
        self.frame_interval = 0.25

        # Case switching state
        self.current_case = initial_case
        self.enable_switching = enable_switching
        self.switch_events = []
        self.x_threshold = 0.0
        self.current_fill_rate = 0.0

    def _get_dynamic_queue_time(self) -> float:
        """Calculate queue time based on pattern and current simulation progress."""
        import math

        if self.queue_pattern == 'static':
            return self.base_queue_time

        # Calculate progress through harvest (0 to 1)
        progress = self.env.now / max(1, self.total_harvest_time)
        progress = min(1.0, max(0.0, progress))

        if self.queue_pattern == 'bell_curve':
            # Bell curve: starts at 0, peaks at middle, returns to 0
            # Using sine curve for smooth bell shape
            queue = self.base_queue_time * math.sin(progress * math.pi)
            return max(0, queue)

        elif self.queue_pattern == 'ramp_up':
            # Linearly increases from 0 to max
            return self.base_queue_time * progress

        elif self.queue_pattern == 'ramp_down':
            # Linearly decreases from max to 0
            return self.base_queue_time * (1 - progress)

        elif self.queue_pattern == 'spike_middle':
            # Low at start/end, spike in middle
            if 0.4 <= progress <= 0.6:
                return self.base_queue_time
            return self.base_queue_time * 0.1

        return self.base_queue_time

    def run(self) -> SimulationResult:
        """Run the full simulation and return results."""
        # Initialize available trucks
        for i in range(self.config.truck_count):
            self.available_trucks.put(i)

        # Initialize harvester position at first pass start
        if self.sequence and 'start_coords' in self.sequence[0]:
            self.harvester_position = self.sequence[0]['start_coords'].copy()

        # Start the combine process and frame recording
        self.env.process(self._combine_process())
        self.env.process(self._record_frames())

        # Run simulation
        self.env.run()

        # Calculate efficiency
        total_time = self.env.now
        theoretical_time = sum(p['traversal_time'] for p in self.sequence)
        efficiency = (theoretical_time / total_time * 100) if total_time > 0 else 0

        return SimulationResult(
            total_time=round(total_time, 2),
            idle_events=self.idle_events,
            idle_time=round(self.idle_time, 2),
            bushels_harvested=round(self.bushels_harvested, 2),
            passes_completed=self.current_pass_idx,
            truck_trips=self.truck_trips,
            efficiency_score=round(efficiency, 2),
            total_queue_wait=round(self.total_queue_wait, 2),
            events=self.events,
            animation_frames=self.animation_frames,
            switch_events=self.switch_events,
            final_case=self.current_case
        )

    def _log_event(self, event_type: str, details: Dict[str, Any]):
        """Log a simulation event."""
        self.events.append({
            'time': round(self.env.now, 2),
            'type': event_type,
            **details
        })

    def _record_frames(self):
        """Record animation frames at regular intervals."""
        while self.harvester_status != 'finished':
            # Create frame snapshot
            frame = {
                'time': round(self.env.now, 2),
                'harvester': {
                    'lat': round(self.harvester_position.get('lat', 0), 6),
                    'lon': round(self.harvester_position.get('lon', 0), 6),
                    'status': self.harvester_status,
                    'current_pass': self.current_pass_idx + 1
                },
                'trucks': [
                    {
                        'id': i,
                        'lat': round(self.truck_positions[i].get('lat', 0), 6),
                        'lon': round(self.truck_positions[i].get('lon', 0), 6),
                        'status': self.truck_states[i],
                        'load': round(self.truck_loads[i], 2),
                        'progress': round(self.truck_progress[i], 2),
                        'queue_wait': round(self.truck_queue_wait[i], 2),
                        'in_queue_since': round(self.env.now - self.truck_queue_start[i], 2) if self.truck_states[i] == 'in_queue' else 0
                    }
                    for i in range(self.config.truck_count)
                ],
                'hoppers': [
                    {
                        'id': i,
                        'fill_level': round(self.hopper_fills[i], 2),
                        'capacity': self.config.hopper_capacity,
                        'fill_percent': round(self.hopper_fills[i] / self.config.hopper_capacity * 100, 1),
                        'is_active': i == self.active_hopper_idx,
                        'status': self.hopper_states[i],
                        'lat': round(self.hopper_positions[i].get('lat', 0), 6),
                        'lon': round(self.hopper_positions[i].get('lon', 0), 6)
                    }
                    for i in range(self.config.hopper_count)
                ],
                'switching': {
                    'current_case': self.current_case,
                    'x_threshold': round(self.x_threshold, 2),
                    'queue_time': self.silo_queue_time,
                    'fill_rate': round(self.current_fill_rate, 2)
                }
            }
            self.animation_frames.append(frame)

            # Wait for next frame interval
            yield self.env.timeout(self.frame_interval)

        # Record final frame
        frame = {
            'time': round(self.env.now, 2),
            'harvester': {
                'lat': round(self.harvester_position.get('lat', 0), 6),
                'lon': round(self.harvester_position.get('lon', 0), 6),
                'status': 'finished',
                'current_pass': len(self.sequence)
            },
            'trucks': [
                {
                    'id': i,
                    'lat': round(self.truck_positions[i].get('lat', 0), 6),
                    'lon': round(self.truck_positions[i].get('lon', 0), 6),
                    'status': self.truck_states[i],
                    'load': round(self.truck_loads[i], 2),
                    'progress': round(self.truck_progress[i], 2),
                    'queue_wait': round(self.truck_queue_wait[i], 2),
                    'in_queue_since': round(self.env.now - self.truck_queue_start[i], 2) if self.truck_states[i] == 'in_queue' else 0
                }
                for i in range(self.config.truck_count)
            ],
            'hoppers': [
                {
                    'id': i,
                    'fill_level': round(self.hopper_fills[i], 2),
                    'capacity': self.config.hopper_capacity,
                    'fill_percent': round(self.hopper_fills[i] / self.config.hopper_capacity * 100, 1),
                    'is_active': i == self.active_hopper_idx,
                    'status': self.hopper_states[i],
                    'lat': round(self.hopper_positions[i].get('lat', 0), 6),
                    'lon': round(self.hopper_positions[i].get('lon', 0), 6)
                }
                for i in range(self.config.hopper_count)
            ],
            'switching': {
                'current_case': self.current_case,
                'x_threshold': round(self.x_threshold, 2),
                'queue_time': self.silo_queue_time,
                'fill_rate': round(self.current_fill_rate, 2)
            }
        }
        self.animation_frames.append(frame)

    def _interpolate_position(self, start: Dict, end: Dict, progress: float) -> Dict:
        """Interpolate position between start and end based on progress (0-1)."""
        return {
            'lat': start.get('lat', 0) + (end.get('lat', 0) - start.get('lat', 0)) * progress,
            'lon': start.get('lon', 0) + (end.get('lon', 0) - start.get('lon', 0)) * progress
        }

    def _interpolate_along_route(self, route: List[Dict], progress: float, reverse: bool = False) -> Dict:
        """Interpolate position along a multi-point route based on progress (0-1)."""
        if not route or len(route) == 0:
            return {'lat': 0, 'lon': 0}

        if len(route) == 1:
            return route[0].copy()

        # Reverse route if returning
        if reverse:
            route = list(reversed(route))

        # Calculate total route length (approximation using segment count)
        num_segments = len(route) - 1

        # Find which segment we're on based on progress
        segment_progress = progress * num_segments
        segment_idx = min(int(segment_progress), num_segments - 1)
        within_segment_progress = segment_progress - segment_idx

        start_point = route[segment_idx]
        end_point = route[segment_idx + 1]

        return self._interpolate_position(start_point, end_point, within_segment_progress)

    def _distance(self, pos1: Dict, pos2: Dict) -> float:
        """Calculate approximate distance between two positions in miles."""
        lat1, lon1 = pos1.get('lat', 0), pos1.get('lon', 0)
        lat2, lon2 = pos2.get('lat', 0), pos2.get('lon', 0)
        # Approximate: 1 degree lat ≈ 69 miles, 1 degree lon ≈ 69 * cos(lat) miles
        import math
        lat_diff = (lat2 - lat1) * 69
        lon_diff = (lon2 - lon1) * 69 * math.cos(math.radians((lat1 + lat2) / 2))
        return math.sqrt(lat_diff**2 + lon_diff**2)

    def _get_field_perimeter_path(self, from_pos: Dict, to_pos: Dict) -> List[Dict]:
        """Get path along field perimeter from one position to another.

        Uses field bounds to create path along edges.
        """
        b = self.field_bounds
        sw = {'lat': b['sw_lat'], 'lon': b['sw_lon']}
        se = {'lat': b['sw_lat'], 'lon': b['ne_lon']}
        ne = {'lat': b['ne_lat'], 'lon': b['ne_lon']}
        nw = {'lat': b['ne_lat'], 'lon': b['sw_lon']}

        # Find nearest corner to from_pos
        corners = [sw, se, ne, nw]
        from_corner_idx = min(range(4), key=lambda i: self._distance(from_pos, corners[i]))

        # Find nearest corner to to_pos
        to_corner_idx = min(range(4), key=lambda i: self._distance(to_pos, corners[i]))

        # Build path around perimeter (clockwise: sw -> se -> ne -> nw -> sw)
        path = []

        # Go clockwise from from_corner to to_corner
        idx = from_corner_idx
        while True:
            path.append(corners[idx].copy())
            if idx == to_corner_idx:
                break
            idx = (idx + 1) % 4
            if len(path) > 4:  # Safety check
                break

        return path

    def _build_hopper_route_to_harvester(self) -> List[Dict]:
        """Build route: pickup -> entry road -> entry field -> perimeter -> harvester row -> harvester."""
        entry_road = self.entry_point.get('road', self.pickup_point)
        entry_field = self.entry_point.get('field', self.field_center)

        route = [self.pickup_point.copy()]

        # Add entry point
        route.append(entry_road.copy())
        route.append(entry_field.copy())

        # Get perimeter path from entry field to near harvester
        # First, find the point on field edge closest to harvester (same row)
        harvester_lat = self.harvester_position.get('lat', 0)
        harvester_lon = self.harvester_position.get('lon', 0)
        b = self.field_bounds

        # Determine which edge to go to based on harvester position
        # If harvester is on the left half, target west edge; if right half, target east edge
        field_mid_lon = (b['sw_lon'] + b['ne_lon']) / 2
        if harvester_lon < field_mid_lon:
            # Go to west edge at harvester's latitude
            target_edge = {'lat': harvester_lat, 'lon': b['sw_lon']}
        else:
            # Go to east edge at harvester's latitude
            target_edge = {'lat': harvester_lat, 'lon': b['ne_lon']}

        # Get perimeter path from entry field to target edge
        perimeter = self._get_field_perimeter_path(entry_field, target_edge)
        for p in perimeter[1:]:  # Skip first point (it's entry_field)
            route.append(p)

        # Go along the row to harvester
        route.append(target_edge.copy())
        route.append(self.harvester_position.copy())

        return route

    def _build_hopper_route_to_pickup(self, start_pos: Dict) -> List[Dict]:
        """Build route: start -> row edge -> perimeter -> entry field -> entry road -> pickup."""
        entry_road = self.entry_point.get('road', self.pickup_point)
        entry_field = self.entry_point.get('field', self.field_center)

        route = [start_pos.copy()]

        # Go to nearest field edge along the current row
        b = self.field_bounds
        start_lat = start_pos.get('lat', 0)
        start_lon = start_pos.get('lon', 0)

        # Go to nearest edge (east or west) at current latitude
        field_mid_lon = (b['sw_lon'] + b['ne_lon']) / 2
        if start_lon < field_mid_lon:
            edge_point = {'lat': start_lat, 'lon': b['sw_lon']}
        else:
            edge_point = {'lat': start_lat, 'lon': b['ne_lon']}

        route.append(edge_point.copy())

        # Get perimeter path from edge to entry field
        perimeter = self._get_field_perimeter_path(edge_point, entry_field)
        for p in perimeter[1:]:  # Skip first point
            route.append(p)

        # Exit through entry point
        route.append(entry_field.copy())
        route.append(entry_road.copy())
        route.append(self.pickup_point.copy())

        return route

    def _calculate_route_time(self, route: List[Dict], road_speed: float, field_speed: float) -> float:
        """Calculate total travel time for a route in minutes."""
        if len(route) < 2:
            return 0.0

        total_time = 0.0
        for i in range(len(route) - 1):
            dist = self._distance(route[i], route[i + 1])
            # First 2 segments are road (pickup -> entry road -> entry field)
            # Last 2 segments are road (entry field -> entry road -> pickup)
            # Everything else is field
            is_road = i < 2 or i >= len(route) - 3
            speed = road_speed if is_road else field_speed
            if speed > 0:
                total_time += (dist / speed) * 60  # Convert hours to minutes

        return max(total_time, 1.0)  # Minimum 1 minute

    def _check_and_update_switching(self, pass_data: Dict[str, Any]):
        """Check X threshold and update switching state."""
        if not self.enable_switching:
            return

        # Update queue time based on pattern
        self.silo_queue_time = self._get_dynamic_queue_time()

        # Calculate current fill rate from pass data
        traversal_time = pass_data.get('traversal_time', 1)
        yield_bushels = pass_data.get('total_yield', pass_data.get('yield_estimate', 100) * 10)
        self.current_fill_rate = calculate_fill_rate(yield_bushels, traversal_time)

        # Get active hopper capacity remaining
        active_hopper = self.active_hopper_idx
        if active_hopper >= 0:
            capacity_remaining = self.config.hopper_capacity - self.hopper_fills[active_hopper]
        else:
            capacity_remaining = self.config.hopper_capacity

        # Calculate truck travel time (one-way)
        truck_travel_time = (self.config.silo_distance_miles / self.config.truck_speed_mph) * 60

        # Calculate X threshold
        self.x_threshold = calculate_x_threshold(
            capacity_remaining,
            self.current_fill_rate,
            truck_travel_time,
            self.config.silo_unload_time
        )

        # Check if we should switch
        should_switch, recommended_case, reason = should_switch_case(
            self.current_case,
            self.silo_queue_time,
            self.x_threshold
        )

        if should_switch and recommended_case != self.current_case:
            old_case = self.current_case
            self.current_case = recommended_case

            switch_event = {
                'time': round(self.env.now, 2),
                'from_case': old_case,
                'to_case': recommended_case,
                'x_threshold': round(self.x_threshold, 2),
                'queue_time': self.silo_queue_time,
                'reason': reason
            }
            self.switch_events.append(switch_event)

            self._log_event('case_switch', switch_event)

    def _combine_process(self):
        """Main combine harvesting process."""
        self.harvester_status = 'harvesting'

        for pass_idx, pass_data in enumerate(self.sequence):
            self.current_pass_idx = pass_idx

            # Check switching logic at start of each pass
            self._check_and_update_switching(pass_data)

            # Get pass start/end coordinates
            start_coords = pass_data.get('start_coords', self.field_center)
            end_coords = pass_data.get('end_coords', self.field_center)

            # Set harvester at start of pass
            self.harvester_position = start_coords.copy()
            self.harvester_pass_progress = 0.0

            self._log_event('pass_start', {
                'pass_number': pass_data['pass_number'],
                'yield_estimate': pass_data['yield_estimate'],
                'start_coords': start_coords,
                'end_coords': end_coords
            })

            # Simulate harvesting this pass
            traversal_time = pass_data['traversal_time']
            yield_bushels = pass_data.get('total_yield', pass_data['yield_estimate'] * 10)

            # Harvest in small increments, filling hopper
            harvest_steps = 20  # More steps for smoother animation
            step_time = traversal_time / harvest_steps
            step_bushels = yield_bushels / harvest_steps

            for step in range(harvest_steps):
                # Check if we have an active hopper before harvesting
                active_hopper = self.active_hopper_idx
                if active_hopper < 0 or self.hopper_states[active_hopper] != 'with_harvester':
                    # No hopper available - harvester is IDLE
                    self.harvester_status = 'waiting_for_hopper'
                    idle_start = self.env.now
                    self.idle_events += 1

                    self._log_event('idle_start', {
                        'reason': 'no_hopper_with_harvester'
                    })

                    # Wait until a hopper arrives
                    while True:
                        # Look for any hopper that's ready
                        ready_hopper = None
                        for i in range(self.config.hopper_count):
                            if self.hopper_states[i] == 'waiting_for_swap':
                                ready_hopper = i
                                break
                            elif self.hopper_states[i] == 'at_pickup' and self.hopper_fills[i] == 0:
                                ready_hopper = i
                                break

                        if ready_hopper is not None:
                            # If at pickup, dispatch and wait
                            if self.hopper_states[ready_hopper] == 'at_pickup':
                                self.hopper_states[ready_hopper] = 'traveling_to_harvester'
                                self._log_event('hopper_dispatched', {
                                    'hopper_id': ready_hopper,
                                    'destination': 'harvester'
                                })
                                yield self.env.process(self._hopper_travel_to_harvester_sync(ready_hopper))

                            # Hopper is now with harvester
                            self.hopper_states[ready_hopper] = 'with_harvester'
                            self.hopper_positions[ready_hopper] = self.harvester_position.copy()
                            self.active_hopper_idx = ready_hopper
                            active_hopper = ready_hopper
                            break

                        yield self.env.timeout(self.frame_interval)

                    idle_duration = self.env.now - idle_start
                    self.idle_time += idle_duration

                    self._log_event('idle_end', {
                        'duration': round(idle_duration, 2)
                    })

                    self.harvester_status = 'harvesting'

                # Now we have an active hopper - harvest this step
                yield self.env.timeout(step_time)

                # Update harvester position (progress through pass)
                self.harvester_pass_progress = (step + 1) / harvest_steps
                self.harvester_position = self._interpolate_position(
                    start_coords, end_coords, self.harvester_pass_progress
                )

                # Update active hopper position to follow harvester
                active_hopper = self.active_hopper_idx
                if active_hopper >= 0 and self.hopper_states[active_hopper] == 'with_harvester':
                    self.hopper_positions[active_hopper] = self.harvester_position.copy()

                    # Add grain to active hopper
                    self.hopper_fills[active_hopper] += step_bushels
                    self.bushels_harvested += step_bushels

                    # At 70% fill, dispatch replacement hopper if available
                    fill_percent = self.hopper_fills[active_hopper] / self.config.hopper_capacity
                    if fill_percent >= self.config.hopper_dispatch_threshold and not self.replacement_hopper_dispatched:
                        self._dispatch_replacement_hopper()

                    # Check if hopper is full
                    if self.hopper_fills[active_hopper] >= self.config.hopper_capacity:
                        # Need to swap hoppers
                        self.harvester_status = 'waiting_hopper_swap'
                        yield self.env.process(self._handle_full_hopper(active_hopper))
                        self.harvester_status = 'harvesting'
                        self.replacement_hopper_dispatched = False  # Reset for next hopper

            self._log_event('pass_complete', {
                'pass_number': pass_data['pass_number'],
                'bushels': round(yield_bushels, 2)
            })

        self.harvester_status = 'finished'
        self._log_event('harvest_complete', {
            'total_bushels': round(self.bushels_harvested, 2),
            'total_passes': len(self.sequence)
        })

    def _dispatch_replacement_hopper(self):
        """Dispatch an empty hopper from pickup to the harvester."""
        # Find an available hopper at pickup
        for i in range(self.config.hopper_count):
            if self.hopper_states[i] == 'at_pickup' and self.hopper_fills[i] == 0:
                self.hopper_states[i] = 'traveling_to_harvester'
                self.replacement_hopper_dispatched = True
                self._log_event('hopper_dispatched', {
                    'hopper_id': i,
                    'destination': 'harvester'
                })
                # Start hopper movement process
                self.env.process(self._hopper_travel_to_harvester(i))
                break

    def _hopper_travel_to_harvester(self, hopper_idx: int):
        """Hopper travels from pickup to harvester location via entry points (background process)."""
        # Build route using entry points
        route = self._build_hopper_route_to_harvester()

        # Calculate travel time based on route
        total_travel_time = self._calculate_route_time(
            route,
            self.config.tractor_speed_road,
            self.config.tractor_speed_field
        )

        travel_steps = max(1, int(total_travel_time / self.frame_interval))
        step_time = total_travel_time / travel_steps

        for step in range(travel_steps):
            progress = (step + 1) / travel_steps
            # Move along the route
            self.hopper_positions[hopper_idx] = self._interpolate_along_route(route, progress)
            yield self.env.timeout(step_time)

        # Arrived near harvester, start following mode
        self.hopper_states[hopper_idx] = 'waiting_for_swap'
        self.hopper_positions[hopper_idx] = self.harvester_position.copy()
        self._log_event('hopper_arrived', {
            'hopper_id': hopper_idx,
            'location': 'near_harvester'
        })

        # Keep following the harvester while waiting for swap
        while self.hopper_states[hopper_idx] == 'waiting_for_swap':
            # Break if harvester is finished
            if self.harvester_status == 'finished':
                self.hopper_states[hopper_idx] = 'at_pickup'
                break
            # Update position to stay near harvester
            self.hopper_positions[hopper_idx] = self.harvester_position.copy()
            yield self.env.timeout(self.frame_interval)

    def _hopper_travel_to_harvester_sync(self, hopper_idx: int):
        """Hopper travels from pickup to harvester - synchronous version that completes when arrived."""
        # Build route using entry points
        route = self._build_hopper_route_to_harvester()

        # Calculate travel time based on route
        total_travel_time = self._calculate_route_time(
            route,
            self.config.tractor_speed_road,
            self.config.tractor_speed_field
        )

        travel_steps = max(1, int(total_travel_time / self.frame_interval))
        step_time = total_travel_time / travel_steps

        for step in range(travel_steps):
            progress = (step + 1) / travel_steps
            # Move along the route
            self.hopper_positions[hopper_idx] = self._interpolate_along_route(route, progress)
            yield self.env.timeout(step_time)

        # Arrived near harvester
        self.hopper_positions[hopper_idx] = self.harvester_position.copy()
        self._log_event('hopper_arrived', {
            'hopper_id': hopper_idx,
            'location': 'near_harvester'
        })

    def _hopper_return_to_pickup(self, hopper_idx: int, load: float):
        """Full hopper returns to pickup point via entry points."""
        start_pos = self.hopper_positions[hopper_idx].copy()

        # Build route back to pickup using entry points
        route = self._build_hopper_route_to_pickup(start_pos)

        # Calculate travel time based on route (field first, then road)
        total_travel_time = self._calculate_route_time(
            route,
            self.config.tractor_speed_road,
            self.config.tractor_speed_field
        )

        travel_steps = max(1, int(total_travel_time / self.frame_interval))
        step_time = total_travel_time / travel_steps

        for step in range(travel_steps):
            progress = (step + 1) / travel_steps
            self.hopper_positions[hopper_idx] = self._interpolate_along_route(route, progress)
            yield self.env.timeout(step_time)

        # Arrived at pickup, wait for truck
        self.hopper_states[hopper_idx] = 'waiting_unload'
        self.hopper_positions[hopper_idx] = self.pickup_point.copy()

        self._log_event('hopper_arrived', {
            'hopper_id': hopper_idx,
            'location': 'pickup',
            'load': round(load, 2)
        })

        # Get a truck and unload
        truck_idx = yield self.available_trucks.get()
        self.env.process(self._truck_cycle(truck_idx, load))

        # Hopper is now empty and available
        self.hopper_fills[hopper_idx] = 0
        self.hopper_states[hopper_idx] = 'at_pickup'

        self._log_event('hopper_unloaded', {
            'hopper_id': hopper_idx
        })

    def _handle_full_hopper(self, hopper_idx: int):
        """Handle a full hopper - dispatch truck and swap to next hopper."""
        hopper_load = self.hopper_fills[hopper_idx]

        self._log_event('hopper_full', {
            'hopper_id': hopper_idx,
            'load': round(hopper_load, 2)
        })

        # Find replacement hopper (one that's waiting_for_swap or at_pickup with empty load)
        replacement_idx = None
        for i in range(self.config.hopper_count):
            if i != hopper_idx and self.hopper_states[i] == 'waiting_for_swap':
                replacement_idx = i
                break
        if replacement_idx is None:
            for i in range(self.config.hopper_count):
                if i != hopper_idx and self.hopper_states[i] == 'at_pickup' and self.hopper_fills[i] == 0:
                    replacement_idx = i
                    break

        # Update full hopper state - it's leaving
        self.hopper_states[hopper_idx] = 'returning_to_pickup'

        # Start full hopper return to pickup (runs in background)
        self.env.process(self._hopper_return_to_pickup(hopper_idx, hopper_load))

        if replacement_idx is not None:
            # We have a replacement ready - swap immediately
            self.hopper_states[replacement_idx] = 'with_harvester'
            self.hopper_positions[replacement_idx] = self.harvester_position.copy()
            self.active_hopper_idx = replacement_idx

            # Hopper swap time
            yield self.env.timeout(self.config.hopper_swap_time)

            self._log_event('hopper_swap', {
                'old_hopper': hopper_idx,
                'new_active_hopper': self.active_hopper_idx
            })
        else:
            # No replacement available - HARVESTER MUST WAIT (IDLE)
            self.active_hopper_idx = -1  # No active hopper
            idle_start = self.env.now
            self.idle_events += 1

            self._log_event('idle_start', {
                'reason': 'no_hopper_available'
            })

            # Wait until a hopper arrives (becomes 'waiting_for_swap' or returns to 'at_pickup' empty)
            while True:
                # Check for any hopper that's ready
                ready_hopper = None
                for i in range(self.config.hopper_count):
                    if self.hopper_states[i] == 'waiting_for_swap':
                        ready_hopper = i
                        break
                    elif self.hopper_states[i] == 'at_pickup' and self.hopper_fills[i] == 0:
                        ready_hopper = i
                        break

                if ready_hopper is not None:
                    # Hopper is ready - if at_pickup, it needs to travel to harvester first
                    if self.hopper_states[ready_hopper] == 'at_pickup':
                        # Dispatch it and wait for arrival
                        self.hopper_states[ready_hopper] = 'traveling_to_harvester'
                        self._log_event('hopper_dispatched', {
                            'hopper_id': ready_hopper,
                            'destination': 'harvester'
                        })
                        # Start travel process and wait for it
                        yield self.env.process(self._hopper_travel_to_harvester_sync(ready_hopper))

                    # Now the hopper should be ready
                    self.hopper_states[ready_hopper] = 'with_harvester'
                    self.hopper_positions[ready_hopper] = self.harvester_position.copy()
                    self.active_hopper_idx = ready_hopper
                    break

                # No hopper ready yet, wait a bit
                yield self.env.timeout(self.frame_interval)

            idle_duration = self.env.now - idle_start
            self.idle_time += idle_duration

            self._log_event('idle_end', {
                'duration': round(idle_duration, 2)
            })

            self._log_event('hopper_swap', {
                'old_hopper': hopper_idx,
                'new_active_hopper': self.active_hopper_idx
            })

    def _truck_cycle(self, truck_idx: int, load: float):
        """Truck cycle: travel to silo, queue, unload, return."""
        self.truck_trips += 1
        self.truck_loads[truck_idx] = load

        # Travel time calculation
        travel_time = (self.config.silo_distance_miles / self.config.truck_speed_mph) * 60

        # Travel to silo (animate along route)
        self.truck_states[truck_idx] = 'traveling_to_silo'
        self.truck_positions[truck_idx] = self.pickup_point.copy()
        travel_steps = max(1, int(travel_time / self.frame_interval))
        step_time = travel_time / travel_steps

        for step in range(travel_steps):
            self.truck_progress[truck_idx] = (step + 1) / travel_steps
            self.truck_positions[truck_idx] = self._interpolate_along_route(
                self.route_coords, self.truck_progress[truck_idx], reverse=False
            )
            yield self.env.timeout(step_time)

        self._log_event('truck_arrived_silo', {
            'truck_id': truck_idx,
            'load': round(load, 2)
        })

        # Wait in queue at silo - use dynamic queue time
        self.truck_states[truck_idx] = 'in_queue'
        self.truck_positions[truck_idx] = self.silo_location.copy()
        self.truck_progress[truck_idx] = 1.0

        # Calculate queue time based on current simulation progress
        current_queue_time = self._get_dynamic_queue_time()
        self.truck_queue_start[truck_idx] = self.env.now

        if current_queue_time > 0:
            yield self.env.timeout(current_queue_time)

        self.truck_queue_wait[truck_idx] = self.env.now - self.truck_queue_start[truck_idx]
        self.total_queue_wait += self.truck_queue_wait[truck_idx]

        self._log_event('truck_queue_complete', {
            'truck_id': truck_idx,
            'queue_wait': round(self.truck_queue_wait[truck_idx], 2),
            'queue_time_used': round(current_queue_time, 2)
        })

        # Unload at silo
        self.truck_states[truck_idx] = 'unloading'
        yield self.env.timeout(self.config.silo_unload_time)

        self._log_event('truck_unloaded', {
            'truck_id': truck_idx,
            'load': round(load, 2)
        })

        # Return to field (animate along route in reverse)
        self.truck_states[truck_idx] = 'returning'
        self.truck_loads[truck_idx] = 0

        for step in range(travel_steps):
            self.truck_progress[truck_idx] = 1.0 - ((step + 1) / travel_steps)
            self.truck_positions[truck_idx] = self._interpolate_along_route(
                self.route_coords, (step + 1) / travel_steps, reverse=True
            )
            yield self.env.timeout(step_time)

        # Truck available again
        self.truck_states[truck_idx] = 'idle'
        self.truck_positions[truck_idx] = self.pickup_point.copy()
        self.truck_progress[truck_idx] = 0.0
        self.available_trucks.put(truck_idx)

        self._log_event('truck_returned', {
            'truck_id': truck_idx
        })
