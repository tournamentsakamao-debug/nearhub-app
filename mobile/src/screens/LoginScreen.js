import React, { useState } from 'react'
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native'
import { supabase } from '../lib/supabaseClient'

export default function LoginScreen() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [showOtpInput, setShowOtpInput] = useState(false)

  const sendOtp = async () => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) Alert.alert(error.message)
    else setShowOtpInput(true)
  }

  const verifyOtp = async () => {
    const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' })
    if (error) Alert.alert(error.message)
  }

  const signInWithGoogle = async () => {
    // Use WebBrowser and AuthSession – standard Expo flow
    // Implementation omitted for brevity; see Supabase docs
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Localseva</Text>
      {!showOtpInput ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Phone Number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Button title="Send OTP" onPress={sendOtp} />
          <View style={{ height: 20 }} />
          <Button title="Sign in with Google" onPress={signInWithGoogle} />
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
          />
          <Button title="Verify OTP" onPress={verifyOtp} />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 20, borderRadius: 5 }
})
