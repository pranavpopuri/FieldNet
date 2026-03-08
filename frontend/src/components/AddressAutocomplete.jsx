import React, { useState, useEffect, useRef } from 'react'

const AddressAutocomplete = ({ onSelect, placeholder = 'Enter silo address...' }) => {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState(null)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.length < 3) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=us`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'FieldNet/1.0'
            }
          }
        )
        const data = await response.json()
        setSuggestions(data)
        setShowDropdown(data.length > 0)
      } catch (error) {
        console.error('Error fetching suggestions:', error)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query])

  const handleSelect = (suggestion) => {
    setSelectedAddress(suggestion)
    setQuery(suggestion.display_name)
    setShowDropdown(false)
    onSelect?.({
      lat: parseFloat(suggestion.lat),
      lon: parseFloat(suggestion.lon),
      name: suggestion.display_name,
      shortName: suggestion.display_name.split(',')[0]
    })
  }

  const handleClear = () => {
    setQuery('')
    setSelectedAddress(null)
    setSuggestions([])
    onSelect?.(null)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelectedAddress(null)
          }}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: '10px 12px',
            fontSize: 14,
            border: selectedAddress ? '2px solid #4CAF50' : '1px solid #ccc',
            borderRadius: 6,
            outline: 'none',
            fontFamily: 'inherit'
          }}
        />
        {selectedAddress && (
          <button
            onClick={handleClear}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading && (
        <div style={{
          position: 'absolute',
          right: selectedAddress ? 70 : 12,
          top: 10,
          fontSize: 12,
          color: '#666'
        }}>
          Searching...
        </div>
      )}

      {showDropdown && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          background: 'white',
          border: '1px solid #ccc',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          maxHeight: 250,
          overflowY: 'auto'
        }}>
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.place_id}
              onClick={() => handleSelect(suggestion)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
                fontSize: 13,
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
              onMouseLeave={(e) => e.target.style.background = 'white'}
            >
              <div style={{ fontWeight: 500 }}>
                {suggestion.display_name.split(',')[0]}
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                {suggestion.display_name.split(',').slice(1, 4).join(',')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AddressAutocomplete
