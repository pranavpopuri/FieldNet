from typing import List, Dict, Any


def generate_case1_sequence(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate Case 1 sequence: physically adjacent passes, starting from high-yield end.

    Case 1 is optimal when silo queue is short - start from the side of the field
    with higher yield to maximize early throughput while trucks can cycle quickly.

    The combine harvests in physical order (adjacent passes) for realistic movement.
    """
    if not rows:
        return []

    # Keep rows in physical order
    physical_rows = sorted(rows, key=lambda r: r['row_id'])

    # Check which end has higher yield - compare first half vs second half
    mid = len(physical_rows) // 2
    first_half_yield = sum(r['yield_estimate'] for r in physical_rows[:mid]) if mid > 0 else 0
    second_half_yield = sum(r['yield_estimate'] for r in physical_rows[mid:]) if mid < len(physical_rows) else 0

    # For Case 1 (high-to-low): start from the end with higher yield
    if second_half_yield > first_half_yield:
        # Start from the end (high yield at end)
        ordered_rows = list(reversed(physical_rows))
    else:
        # Start from the beginning (high yield at start)
        ordered_rows = physical_rows

    # Add sequence position to each row
    result = []
    for i, row in enumerate(ordered_rows):
        row_copy = row.copy()
        row_copy['sequence_position'] = i + 1
        row_copy['case'] = 1
        result.append(row_copy)

    return result


def generate_case2_sequence(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate Case 2 sequence: physically adjacent passes, starting from low-yield end.

    Case 2 is optimal when silo queue is long - start from the side of the field
    with lower yield to slow down hopper fill rate while trucks are delayed.

    The combine harvests in physical order (adjacent passes) for realistic movement.
    """
    if not rows:
        return []

    # Keep rows in physical order
    physical_rows = sorted(rows, key=lambda r: r['row_id'])

    # Check which end has lower yield - compare first half vs second half
    mid = len(physical_rows) // 2
    first_half_yield = sum(r['yield_estimate'] for r in physical_rows[:mid]) if mid > 0 else 0
    second_half_yield = sum(r['yield_estimate'] for r in physical_rows[mid:]) if mid < len(physical_rows) else 0

    # For Case 2 (low-to-high): start from the end with lower yield
    if second_half_yield < first_half_yield:
        # Start from the end (low yield at end)
        ordered_rows = list(reversed(physical_rows))
    else:
        # Start from the beginning (low yield at start)
        ordered_rows = physical_rows

    # Add sequence position to each row
    result = []
    for i, row in enumerate(ordered_rows):
        row_copy = row.copy()
        row_copy['sequence_position'] = i + 1
        row_copy['case'] = 2
        result.append(row_copy)

    return result


def get_sequence_summary(sequence: List[Dict[str, Any]], case_num: int) -> Dict[str, Any]:
    """
    Get summary statistics for a sequence.
    """
    if not sequence:
        return {
            'case': case_num,
            'total_passes': 0,
            'first_pass_yield': 0,
            'last_pass_yield': 0,
            'total_traversal_time': 0
        }

    return {
        'case': case_num,
        'total_passes': len(sequence),
        'first_pass_yield': sequence[0]['yield_estimate'],
        'last_pass_yield': sequence[-1]['yield_estimate'],
        'total_traversal_time': round(sum(r['traversal_time'] for r in sequence), 2)
    }
