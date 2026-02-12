import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/router'

export default function Admin({ session }) {
  const router = useRouter()
  const [pendingPayments, setPendingPayments] = useState([])
  const [reports, setReports] = useState([])
  const [settings, setSettings] = useState({})

  useEffect(() => {
    if (!session) router.push('/login')
    else checkAdmin()
  }, [session])

  const checkAdmin = async () => {
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()
    
    if (user?.role !== 'admin') router.push('/')
    else {
      fetchPendingPayments()
      fetchReports()
      fetchSettings()
    }
  }

  const fetchPendingPayments = async () => {
    const { data } = await supabase
      .from('payment_transactions')
      .select('*, users(full_name)')
      .eq('status', 'pending')
    setPendingPayments(data || [])
  }

  const fetchReports = async () => {
    const { data } = await supabase
      .from('reports')
      .select('*, reporter:reporter_id(full_name), reported:reported_user_id(full_name)')
      .eq('status', 'pending')
    setReports(data || [])
  }

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('id', 1)
      .single()
    setSettings(data || {})
  }

  const approvePayment = async (paymentId) => {
    await supabase
      .from('payment_transactions')
      .update({ status: 'approved' })
      .eq('id', paymentId)
    fetchPendingPayments()
  }

  const updateSettings = async (e) => {
    e.preventDefault()
    const form = e.target
    await supabase
      .from('admin_settings')
      .update({ upi_id: form.upi_id.value, qr_code_url: form.qr_code_url.value })
      .eq('id', 1)
    fetchSettings()
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      
      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Pending Payments</h2>
        {pendingPayments.map(p => (
          <div key={p.id} className="border p-4 my-2">
            <p>User: {p.users?.full_name}</p>
            <p>Amount: ₹{p.amount}</p>
            <p>Purpose: {p.purpose}</p>
            {p.screenshot_url && 
              <img src={p.screenshot_url} alt="payment" className="w-32 h-32 object-cover" />
            }
            <button onClick={() => approvePayment(p.id)} className="bg-green-500 text-white px-4 py-2 rounded">
              Approve
            </button>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Payment Settings</h2>
        <form onSubmit={updateSettings} className="mt-4">
          <input name="upi_id" defaultValue={settings.upi_id} placeholder="UPI ID" className="border p-2 mr-2" />
          <input name="qr_code_url" defaultValue={settings.qr_code_url} placeholder="QR Code URL" className="border p-2 mr-2" />
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">Update</button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Pending Reports</h2>
        {reports.map(r => (
          <div key={r.id} className="border p-4 my-2">
            <p>Reporter: {r.reporter?.full_name}</p>
            <p>Reported: {r.reported?.full_name}</p>
            <p>Reason: {r.reason}</p>
            <p>Description: {r.description}</p>
            <button className="bg-red-500 text-white px-4 py-2 rounded mr-2">Ban User</button>
            <button className="bg-gray-500 text-white px-4 py-2 rounded">Dismiss</button>
          </div>
        ))}
      </section>
    </div>
  )
    }
