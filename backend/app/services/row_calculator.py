import numpy as np
from typing import List, Dict, Any

# Constants
ROWS_PER_PASS = 8  # 8-row combine head
ROW_SPACING_METERS = 0.762  # 30 inches
METERS_PER_DEGREE_LAT = 111000
DEFAULT_COMBINE_SPEED_MPH = 5


def calculate_rows_from_yield_matrix(
    yield_matrix: np.ndarray,
    bounds: Dict[str, float],
    combine_speed_mph: float = DEFAULT_COMBINE_SPEED_MPH
) -> List[Dict[str, Any]]:
    """
    Calculate per-row yield data from a yield matrix.

    Args:
        yield_matrix: 2D numpy array of yield values (Bu/Ac)
        bounds: dict with sw_lat, sw_lon, ne_lat, ne_lon
        combine_speed_mph: combine harvester speed in mph

    Returns:
        List of row dictionaries with row_id, yield_estimate, traversal_time
    """
    if yield_matrix is None or yield_matrix.size == 0:
        return []

    sw_lat = bounds['sw_lat']
    sw_lon = bounds['sw_lon']
    ne_lat = bounds['ne_lat']
    ne_lon = bounds['ne_lon']

    # Calculate field dimensions
    lat_center = (sw_lat + ne_lat) / 2
    meters_per_deg_lon = METERS_PER_DEGREE_LAT * np.cos(np.radians(lat_center))

    height_meters = (ne_lat - sw_lat) * METERS_PER_DEGREE_LAT
    width_meters = (ne_lon - sw_lon) * meters_per_deg_lon

    # Determine orientation - rows run parallel to longest side
    is_vertical = height_meters > width_meters

    # Calculate number of rows based on field width perpendicular to row direction
    if is_vertical:
        perpendicular_meters = width_meters
        row_length_meters = height_meters
    else:
        perpendicular_meters = height_meters
        row_length_meters = width_meters

    num_rows = int(perpendicular_meters / ROW_SPACING_METERS)

    # Group rows into passes (8 rows per pass)
    num_passes = int(np.ceil(num_rows / ROWS_PER_PASS))

    # Get matrix dimensions
    matrix_rows, matrix_cols = yield_matrix.shape

    # Calculate pixel area in acres for converting Bu/Ac to actual bushels
    # Each pixel represents a portion of the field
    pixel_width_meters = width_meters / matrix_cols
    pixel_height_meters = height_meters / matrix_rows
    pixel_area_sq_meters = pixel_width_meters * pixel_height_meters
    pixel_area_acres = pixel_area_sq_meters / 4046.86  # 1 acre = 4046.86 m²


    # Calculate traversal time for one pass (row length / speed)
    # Convert mph to meters per minute: mph * 1609.34 / 60
    speed_meters_per_min = combine_speed_mph * 1609.34 / 60
    traversal_time_minutes = row_length_meters / speed_meters_per_min

    rows = []

    for pass_idx in range(num_passes):
        # Calculate which portion of the yield matrix corresponds to this pass
        start_row_pct = (pass_idx * ROWS_PER_PASS) / num_rows
        end_row_pct = min(((pass_idx + 1) * ROWS_PER_PASS) / num_rows, 1.0)
        center_row_pct = (start_row_pct + end_row_pct) / 2

        if is_vertical:
            # Rows run north-south, passes go east-west
            start_col = int(start_row_pct * matrix_cols)
            end_col = int(end_row_pct * matrix_cols)
            end_col = max(end_col, start_col + 1)  # At least 1 column

            # Get slice of yield matrix for this pass
            pass_yields = yield_matrix[:, start_col:end_col]

            # Calculate pass coordinates (center of the pass strip)
            pass_lon = sw_lon + center_row_pct * (ne_lon - sw_lon)
            # Alternate direction: even passes go south-to-north, odd go north-to-south
            if pass_idx % 2 == 0:
                start_coords = {'lat': sw_lat, 'lon': pass_lon}
                end_coords = {'lat': ne_lat, 'lon': pass_lon}
            else:
                start_coords = {'lat': ne_lat, 'lon': pass_lon}
                end_coords = {'lat': sw_lat, 'lon': pass_lon}
        else:
            # Rows run east-west, passes go north-south
            start_row = int(start_row_pct * matrix_rows)
            end_row = int(end_row_pct * matrix_rows)
            end_row = max(end_row, start_row + 1)  # At least 1 row

            # Get slice of yield matrix for this pass
            pass_yields = yield_matrix[start_row:end_row, :]

            # Calculate pass coordinates (center of the pass strip)
            pass_lat = sw_lat + center_row_pct * (ne_lat - sw_lat)
            # Alternate direction: even passes go west-to-east, odd go east-to-west
            if pass_idx % 2 == 0:
                start_coords = {'lat': pass_lat, 'lon': sw_lon}
                end_coords = {'lat': pass_lat, 'lon': ne_lon}
            else:
                start_coords = {'lat': pass_lat, 'lon': ne_lon}
                end_coords = {'lat': pass_lat, 'lon': sw_lon}

        # Calculate average yield for this pass (excluding NaN)
        valid_yields = pass_yields[~np.isnan(pass_yields)]
        if len(valid_yields) > 0 and np.mean(valid_yields) > 10:
            avg_yield = float(np.mean(valid_yields))  # Bu/Ac average
            # Convert to actual bushels: sum(Bu/Ac * acres_per_pixel)
            total_bushels = float(np.sum(valid_yields * pixel_area_acres))
        else:
            # If no valid yield data or very low yield, estimate based on pass area
            # Assume average yield of 180 Bu/Ac for passes without good satellite data
            avg_yield = 180.0
            # Calculate pass area: pass width * row length
            pass_width_meters = (ROWS_PER_PASS / num_rows) * perpendicular_meters
            pass_area_sq_meters = pass_width_meters * row_length_meters
            pass_area_acres = pass_area_sq_meters / 4046.86
            total_bushels = 180.0 * pass_area_acres

        # Calculate actual rows in this pass (might be less than 8 for last pass)
        rows_in_pass = min(ROWS_PER_PASS, num_rows - (pass_idx * ROWS_PER_PASS))

        rows.append({
            'row_id': pass_idx,
            'pass_number': pass_idx + 1,
            'rows_in_pass': rows_in_pass,
            'yield_estimate': round(avg_yield, 2),  # Bu/Ac average
            'total_yield': round(total_bushels, 2),  # Actual bushels harvested in this pass
            'traversal_time': round(traversal_time_minutes, 2),  # minutes
            'row_length_meters': round(row_length_meters, 2),
            'start_coords': start_coords,
            'end_coords': end_coords
        })

    return rows


def get_row_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Get summary statistics for all rows.
    """
    if not rows:
        return {
            'total_passes': 0,
            'total_rows': 0,
            'total_traversal_time': 0,
            'avg_yield': 0,
            'min_yield': 0,
            'max_yield': 0
        }

    yields = [r['yield_estimate'] for r in rows]
    total_rows = sum(r['rows_in_pass'] for r in rows)

    return {
        'total_passes': len(rows),
        'total_rows': total_rows,
        'total_traversal_time': round(sum(r['traversal_time'] for r in rows), 2),
        'avg_yield': round(np.mean(yields), 2),
        'min_yield': round(min(yields), 2),
        'max_yield': round(max(yields), 2)
    }
