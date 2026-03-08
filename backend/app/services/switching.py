"""
X Threshold Calculation and Case Switching Logic

The X threshold determines when to switch between Case 1 (high-to-low yield)
and Case 2 (low-to-high yield) harvest sequences.

X = time until harvester idles - time for truck to return

If queue_wait > X: Switch to Case 2 (slow down grain accumulation)
If queue_wait < X: Stay in Case 1 (maximize throughput)
"""

from typing import Dict, List, Any, Tuple


def calculate_x_threshold(
    hopper_capacity_remaining: float,  # bushels remaining in active hopper
    current_fill_rate: float,  # bushels per minute
    truck_travel_time: float,  # one-way travel time in minutes
    silo_unload_time: float,  # minutes to unload at silo
    safety_margin: float = 0.1  # 10% safety buffer
) -> float:
    """
    Calculate the X threshold - the maximum queue wait time before idle risk.

    Args:
        hopper_capacity_remaining: How many bushels until active hopper is full
        current_fill_rate: Rate at which hopper is filling (bushels/min)
        truck_travel_time: One-way travel time to silo (minutes)
        silo_unload_time: Time to unload at silo (minutes)
        safety_margin: Buffer percentage (default 10%)

    Returns:
        X threshold in minutes - if queue exceeds this, switch to Case 2
    """
    if current_fill_rate <= 0:
        return float('inf')  # No fill rate means no urgency

    # Time until current hopper is full
    time_until_full = hopper_capacity_remaining / current_fill_rate

    # Time for truck round trip (excluding queue)
    truck_round_trip = (2 * truck_travel_time) + silo_unload_time

    # X = buffer time before idle, minus safety margin
    x_threshold = (time_until_full - truck_round_trip) * (1 - safety_margin)

    return max(0, x_threshold)


def calculate_fill_rate(
    yield_per_pass: float,  # bushels
    traversal_time: float  # minutes
) -> float:
    """Calculate hopper fill rate based on current pass yield."""
    if traversal_time <= 0:
        return 0
    return yield_per_pass / traversal_time


def should_switch_case(
    current_case: int,
    queue_wait_time: float,
    x_threshold: float,
    min_switch_benefit: float = 2.0  # Minimum minutes saved to justify switch
) -> Tuple[bool, int, str]:
    """
    Determine if we should switch cases based on queue vs X threshold.

    Args:
        current_case: Current case (1 or 2)
        queue_wait_time: Current/predicted queue wait at silo (minutes)
        x_threshold: Calculated X threshold (minutes)
        min_switch_benefit: Minimum benefit to justify switching overhead

    Returns:
        Tuple of (should_switch, recommended_case, reason)
    """
    if current_case == 1:
        # Currently in Case 1 (high-to-low yield)
        if queue_wait_time > x_threshold + min_switch_benefit:
            return (True, 2, f"Queue ({queue_wait_time:.1f}m) exceeds X threshold ({x_threshold:.1f}m)")
        else:
            return (False, 1, "Queue within acceptable range for Case 1")
    else:
        # Currently in Case 2 (low-to-high yield)
        if queue_wait_time < x_threshold - min_switch_benefit:
            return (True, 1, f"Queue ({queue_wait_time:.1f}m) below X threshold ({x_threshold:.1f}m)")
        else:
            return (False, 2, "Queue still elevated, staying in Case 2")


def reorder_remaining_sequence(
    remaining_passes: List[Dict[str, Any]],
    target_case: int
) -> List[Dict[str, Any]]:
    """
    Reorder remaining passes based on target case.

    Args:
        remaining_passes: List of passes not yet harvested
        target_case: 1 for high-to-low yield, 2 for low-to-high yield

    Returns:
        Reordered list of passes
    """
    if target_case == 1:
        # Case 1: Sort by yield descending (highest first)
        return sorted(remaining_passes, key=lambda p: p.get('yield_estimate', 0), reverse=True)
    else:
        # Case 2: Sort by yield ascending (lowest first)
        return sorted(remaining_passes, key=lambda p: p.get('yield_estimate', 0), reverse=False)


def get_switching_recommendation(
    hopper_fill_level: float,
    hopper_capacity: float,
    current_pass_yield: float,
    current_pass_time: float,
    truck_travel_time: float,
    silo_unload_time: float,
    current_queue_time: float,
    current_case: int
) -> Dict[str, Any]:
    """
    Get a full switching recommendation with all relevant data.

    Returns dict with:
        - x_threshold: Calculated X value
        - current_queue: Current queue wait time
        - should_switch: Boolean
        - recommended_case: 1 or 2
        - reason: Human-readable explanation
        - urgency: 'low', 'medium', 'high'
    """
    # Calculate fill rate from current pass
    fill_rate = calculate_fill_rate(current_pass_yield, current_pass_time)

    # Calculate remaining capacity
    capacity_remaining = hopper_capacity - hopper_fill_level

    # Calculate X threshold
    x_threshold = calculate_x_threshold(
        capacity_remaining,
        fill_rate,
        truck_travel_time,
        silo_unload_time
    )

    # Check if we should switch
    should_switch, recommended_case, reason = should_switch_case(
        current_case,
        current_queue_time,
        x_threshold
    )

    # Determine urgency
    if current_queue_time > x_threshold * 1.5:
        urgency = 'high'
    elif current_queue_time > x_threshold:
        urgency = 'medium'
    else:
        urgency = 'low'

    return {
        'x_threshold': round(x_threshold, 2),
        'current_queue': current_queue_time,
        'queue_vs_x': round(current_queue_time - x_threshold, 2),
        'should_switch': should_switch,
        'current_case': current_case,
        'recommended_case': recommended_case,
        'reason': reason,
        'urgency': urgency,
        'fill_rate': round(fill_rate, 2),
        'capacity_remaining': round(capacity_remaining, 2)
    }
