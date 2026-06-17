import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { LockGate } from '@/components/LockGate'
import { Dashboard } from '@/screens/Dashboard'
import { BuildingsList } from '@/screens/buildings/BuildingsList'
import { BuildingDetail } from '@/screens/buildings/BuildingDetail'
import { BuildingForm } from '@/screens/buildings/BuildingForm'
import { MoldDetail } from '@/screens/molds/MoldDetail'
import { MoldForm } from '@/screens/molds/MoldForm'
import { WorkersList } from '@/screens/workers/WorkersList'
import { WorkerDetail } from '@/screens/workers/WorkerDetail'
import { WorkerForm } from '@/screens/workers/WorkerForm'
import { OwnersList } from '@/screens/owners/OwnersList'
import { OwnerDetail } from '@/screens/owners/OwnerDetail'
import { OwnerForm } from '@/screens/owners/OwnerForm'
import { AttendanceList } from '@/screens/attendance/AttendanceList'
import { AttendanceForm } from '@/screens/attendance/AttendanceForm'
import { Payments } from '@/screens/payments/Payments'
import { SyncScreen } from '@/screens/payments/SyncScreen'
import { Weekly } from '@/screens/Weekly'
import { More } from '@/screens/More'
import { Settings } from '@/screens/Settings'

export default function App() {
  return (
    <LockGate>
      <Routes>
        {/* Browsing screens — bottom nav present */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/buildings" element={<BuildingsList />} />
          <Route path="/buildings/:id" element={<BuildingDetail />} />
          <Route path="/molds/:id" element={<MoldDetail />} />
          <Route path="/workers" element={<WorkersList />} />
          <Route path="/workers/:id" element={<WorkerDetail />} />
          <Route path="/owners" element={<OwnersList />} />
          <Route path="/owners/:id" element={<OwnerDetail />} />
          <Route path="/attendance" element={<AttendanceList />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/weekly" element={<Weekly />} />
          <Route path="/more" element={<More />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Focused full-screen flows — no bottom nav */}
        <Route path="/buildings/new" element={<BuildingForm />} />
        <Route path="/buildings/:id/edit" element={<BuildingForm />} />
        <Route path="/buildings/:buildingId/molds/new" element={<MoldForm />} />
        <Route path="/molds/:id/edit" element={<MoldForm />} />
        <Route path="/workers/new" element={<WorkerForm />} />
        <Route path="/workers/:id/edit" element={<WorkerForm />} />
        <Route path="/owners/new" element={<OwnerForm />} />
        <Route path="/owners/:id/edit" element={<OwnerForm />} />
        <Route path="/attendance/new" element={<AttendanceForm />} />
        <Route path="/attendance/:id/edit" element={<AttendanceForm />} />
        <Route path="/payments/sync" element={<SyncScreen />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LockGate>
  )
}
