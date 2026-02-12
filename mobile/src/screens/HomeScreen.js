import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import * as Location from 'expo-location'
import { supabase } from '../lib/supabaseClient'

export default function HomeScreen({ navigation }) {
  const [providers, setProviders] = useState([])
  const [location, setLocation] = useState(null)

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      let loc = await Location.getCurrentPositionAsync({})
      setLocation(loc.coords)

      // Realtime location subscription
      supabase
        .channel('public:locations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchProviders)
        .subscribe()

      fetchProviders()
    })()
  }, [])

  const fetchProviders = async () => {
    const { data } = await supabase
      .from('providers')
      .select('*, locations(*), users(full_name)')
      .eq('is_approved', true)
      .eq('is_online', true)
    setProviders(data)
  }

  return (
    <View style={styles.container}>
      {location && (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {providers.map(provider => (
            provider.locations && (
              <Marker
                key={provider.id}
                coordinate={{
                  latitude: provider.locations.latitude,
                  longitude: provider.locations.longitude
                }}
                title={provider.business_name}
                onCalloutPress={() => navigation.navigate('ProviderDetail', { provider })}
              />
            )
          ))}
        </MapView>
      )}
      <FlatList
        style={styles.list}
        data={providers}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('ProviderDetail', { provider: item })}>
            <Text style={styles.name}>{item.business_name}</Text>
            <Text>{item.service_type}</Text>
            <Text>★ {item.rating_avg} ({item.total_ratings})</Text>
            {item.badge === 'verified' && <Text style={styles.badge}>Verified</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  list: { flex: 1, padding: 10 },
  card: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  name: { fontSize: 18, fontWeight: 'bold' },
  badge: { backgroundColor: 'blue', color: 'white', padding: 2, alignSelf: 'flex-start' }
})
