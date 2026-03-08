"""
Fleet Feasibility Check

Determines if the configured fleet is adequate for the field size
and silo distance. Warns if idle events are inevitable.
"""

import math
from typing import Dict, Any


def calculate_truck_cycle_time(
    silo_distance_miles: float,
    truck_speed_mph: float,
    silo_unload_time: float,
    queue_time: float = 0
) -> float:
    """
    Calculate full truck cycle time in minutes.

    Cycle = travel to silo + queue + unload + travel back
    """
    travel_time = (silo_distance_miles / truck_speed_mph) * 60  # one way in minutes
    return (2 * travel_time) + queue_time + silo_unload_time


def calculate_hopper_buffer_time(
    hopper_capacity: float,
    hopper_count: int,
    average_fill_rate: float
) -> float:
    """
    Calculate how long before all hoppers are full (buffer time).

    Assumes hoppers are filled sequentially.
    """
    if average_fill_rate <= 0:
        return float('inf')

    total_capacity = hopper_capacity * hopper_count
    return total_capacity / average_fill_rate


def calculate_minimum_trucks(
    cycle_time: float,
    buffer_time: float,
    safety_factor: float = 1.2
) -> int:
    """
    Calculate minimum trucks needed to avoid idle events.

    min_trucks = ceil(cycle_time / buffer_time * safety_factor)
    """
    if buffer_time <= 0 or buffer_time == float('inf'):
        return 1

    raw_trucks = (cycle_time / buffer_time) * safety_factor
    return max(1, math.ceil(raw_trucks))


def check_fleet_feasibility(
    truck_count: int,
    truck_capacity: float,
    hopper_count: int,
    hopper_capacity: float,
    silo_distance_miles: float,
    truck_speed_mph: float = 35,
    silo_unload_time: float = 17,
    queue_time: float = 0,
    average_yield_per_pass: float = 500,  # bushels
    average_pass_time: float = 10,  # minutes
    combine_speed_mph: float = 5
) -> Dict[str, Any]:
    """
    Check if fleet configuration is feasible.

    Returns:
        Dict with feasibility analysis:
        - is_feasible: bool
        - truck_cycle_time: minutes for full truck cycle
        - hopper_buffer_time: minutes before hoppers full
        - minimum_trucks_needed: recommended truck count
        - truck_deficit: how many more trucks needed (0 if adequate)
        - warning_message: human-readable warning (if any)
        - recommendations: list of suggestions
    """
    # Calculate average fill rate (bushels per minute)
    if average_pass_time > 0:
        average_fill_rate = average_yield_per_pass / average_pass_time
    else:
        average_fill_rate = 50  # Default estimate

    # Calculate cycle times
    truck_cycle_time = calculate_truck_cycle_time(
        silo_distance_miles,
        truck_speed_mph,
        silo_unload_time,
        queue_time
    )

    hopper_buffer_time = calculate_hopper_buffer_time(
        hopper_capacity,
        hopper_count,
        average_fill_rate
    )

    # Calculate minimum trucks needed
    min_trucks = calculate_minimum_trucks(truck_cycle_time, hopper_buffer_time)

    # Determine feasibility
    truck_deficit = max(0, min_trucks - truck_count)
    is_feasible = truck_deficit == 0

    # Generate warning and recommendations
    warning_message = None
    recommendations = []

    if not is_feasible:
        warning_message = (
            f"Fleet may be undersized. With {truck_count} truck(s), "
            f"idle events are likely. Recommended: {min_trucks} trucks."
        )
        recommendations.append(f"Add {truck_deficit} more truck(s)")
        recommendations.append("Reduce silo distance if possible")
        recommendations.append("Consider larger hopper capacity")

    if queue_time > 20:
        recommendations.append(f"Queue time ({queue_time} min) is high - consider Case 2 strategy")

    if hopper_count < 2:
        recommendations.append("Consider adding a second hopper for continuous operation")

    # Calculate efficiency estimates
    if is_feasible:
        expected_idle_rate = 0
    else:
        # Rough estimate of idle percentage
        shortfall_ratio = truck_deficit / max(1, min_trucks)
        expected_idle_rate = min(50, shortfall_ratio * 30)  # Cap at 50%

    return {
        'is_feasible': is_feasible,
        'truck_cycle_time': round(truck_cycle_time, 2),
        'hopper_buffer_time': round(hopper_buffer_time, 2),
        'minimum_trucks_needed': min_trucks,
        'current_trucks': truck_count,
        'truck_deficit': truck_deficit,
        'warning_message': warning_message,
        'recommendations': recommendations,
        'expected_idle_rate': round(expected_idle_rate, 1),
        'fill_rate': round(average_fill_rate, 2)
    }
