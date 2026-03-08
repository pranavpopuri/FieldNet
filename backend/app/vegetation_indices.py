import ee
import geemap
import numpy as np

def get_current_vegetation_indices(roi, target_date, days_back=30):
    """
    Retrieves the most recent clear-sky NDVI, EVI, and SAVI for a current prediction window.
    
    Args:
        roi (ee.Geometry): The region of interest.
        target_date (str): The target date in YYYY-MM-DD format.
        days_back (int): The number of days back to search for clear pixels.
        
    Returns:
        tuple[ee.Image, ee.Geometry]: The recent composite image containing NDVI, EVI, SAVI, and WDRVI, 
                                      and the region of interest.
    """
    # Create a dynamic window ending on your target date (e.g., today)
    start_date = ee.Date(target_date).advance(-days_back, 'day')
    
    def mask_and_scale(image):
        # 1. Cloud Masking using Scene Classification Layer (SCL)
        # SCL Class 4 is Vegetation, 5 is Bare Soils, 6 is Water, 1 is Unclassified,
        # 2 is Dark Area, 3 is Cloud Shadow, 7 is Unclassified, 8 is Cloud Medium Probability,
        # 9 is Cloud High Probability, 10 is Thin Cirrus, 11 is Snow/Ice.
        # We explicitly WANT to keep valid land classes (4, 5, 6, 7) and mask out the rest (Clouds, Shadows, Snow).
        scl = image.select('SCL')
        
        # Create a mask that is 1 where the pixel is valid (not cloud, shadow, snow, etc), and 0 elsewhere.
        # Good classes: 4 (vegetation), 5 (bare soils), 6 (water), 7 (unclassified - usually valid land)
        valid_mask = scl.eq(4).Or(scl.eq(5)).Or(scl.eq(6)).Or(scl.eq(7))
        
        # 2. Scale to 0-1 Reflectance (CRITICAL for EVI/SAVI constants)
        # We also apply the valid_mask we just created.
        return image.updateMask(valid_mask).divide(10000)
        
    def add_indices(image):
        # NDVI
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        
        # EVI
        evi = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
                'NIR': image.select('B8'),
                'RED': image.select('B4'),
                'BLUE': image.select('B2')
            }).rename('EVI')
            
        # SAVI (using L = 0.5)
        savi = image.expression(
            '((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {
                'NIR': image.select('B8'),
                'RED': image.select('B4')
            }).rename('SAVI')
            
        # WDRVI (Wide Dynamic Range Vegetation Index) using alpha = 0.1
        wdrvi = image.expression(
            '(0.1 * NIR - RED) / (0.1 * NIR + RED)', {
                'NIR': image.select('B8'),
                'RED': image.select('B4')
            }).rename('WDRVI')
            
        return image.addBands([ndvi, evi, savi, wdrvi])

    # Build and process the collection
    collection = (
        ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(start_date, target_date)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) # Added aggressive overall cloud percentage filter
        .map(mask_and_scale)
        .map(add_indices)
    )
    
    # OPTIMIZATION: Sort by time descending and mosaic.
    # This puts the absolute newest clear pixels on top, filling in any 
    # cloud gaps with the next most recent clear pixel within your 30-day window.
    recent_composite = collection.sort('system:time_start', False).mosaic().clip(roi)
    
    # Return just the indices
    return recent_composite.select(['NDVI', 'EVI', 'SAVI', 'WDRVI']), roi


def extract_vi_array(image, region, resolution_m=10):
    """
    Extracts an Earth Engine Image into a local 3D NumPy array.
    
    Args:
        image (ee.Image): The Earth Engine Image to extract.
        region (ee.Geometry): The region to extract data for.
        resolution_m (int): The square pixel resolution in meters. Defaults to 10.
        
    Returns:
        np.ndarray: A 3D NumPy array containing the values (height, width, bands), 
                    or None if the extraction fails.
    """
    # geemap.ee_to_numpy returns data as (height, width, bands)
    # Using scale=resolution_m ensures each pixel represents a resolution_m x resolution_m area
    vi_array = geemap.ee_to_numpy(image, region=region, scale=resolution_m)
    
    if vi_array is not None:
        return vi_array
    else:
        print("Failed to download array. The requested region might be too large.")
        return None

def get_vi_arrays_for_region(roi, target_date, resolution_m=10, days_back=30):
    """
    Convenience function that takes a region of interest, target date, and resolution, 
    and returns the numpy array of vegetation indices directly.
    
    Args:
        roi (ee.Geometry): The rectangular geometry or region of interest.
        target_date (str): The target date in YYYY-MM-DD format.
        resolution_m (int): The square pixel resolution in meters. Defaults to 10.
        days_back (int): The number of days back to search for clear pixels.
        
    Returns:
        np.ndarray: A 3D NumPy array holding the [NDVI, EVI, SAVI, WDRVI] values.
    """
    # 1. Get the Earth Engine Image for the indices
    vi_image, active_roi = get_current_vegetation_indices(roi, target_date, days_back)
    
    # 2. Extract that image into a NumPy array
    vi_array = extract_vi_array(vi_image, active_roi, resolution_m)
    
    return vi_array
