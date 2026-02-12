import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

export default function Home({ session }) {
  const [providers, setProviders] = useState([])
  const [userLocation, setUserLocation] = useState(null)

  useEffect(() => {
    navigator.geolocation.getCurrentPosition((position) => {
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      })
    })

    const fetchProviders = async () => {
      let query = supabase
        .from('providers')
        .select('*, locations(*), users(full_name, avatar_url)')
        .eq('is_approved', true)
        .eq('is_online', true)

      if (userLocation) {
        // Haversine formula approximation (50km radius)
        query = query.not('latitude', 'is', null)
          .not('longitude', 'is', null)
      }

      const { data } = await query
      setProviders(data)
    }

    fetchProviders()

    // Realtime location updates
    const subscription = supabase
      .channel('public:locations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, 
        payload => fetchProviders())
      .subscribe()

    return () => supabase.removeChannel(subscription)
  }, [userLocation])

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold">Nearby Service Providers</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {providers.map(provider => (
          <Link key={provider.id} href={`/provider/${provider.id}`}>
            <div className="border p-4 rounded-lg shadow hover:shadow-lg">
              <h2 className="text-xl font-semibold">{provider.business_name}</h2>
              <p className="text-gray-600">{provider.service_type}</p>
              <div className="flex items-center mt-2">
                <span className="text-yellow-500">★ {provider.rating_avg.toFixed(1)}</span>
                <span className="ml-2 text-sm">({provider.total_ratings} ratings)</span>
              </div>
              {provider.badge === 'verified' && 
                <span className="bg-blue-500 text-white px-2 py-1 rounded text-xs">Verified</span>
              }
              {userLocation && provider.latitude && provider.longitude && (
                <p className="text-sm text-gray-500 mt-2">
                  📍 Distance: ~{calculateDistance(userLocation.lat, userLocation.lng, provider.latitude, provider.longitude).toFixed(1)} km
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
  }
