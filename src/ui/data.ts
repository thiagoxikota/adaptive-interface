/**
 * Fictional operations data for "Northbound Ops". Every derived number on the
 * dashboard (totals, peak hour, delta) is computed from these arrays so the
 * chart, the KPIs and the plain-language explanation can never disagree.
 */

/** completed deliveries per hour, last 24 h (index 0 = 00:00) */
export const HOURLY_TODAY: readonly number[] = [
  6, 4, 3, 2, 3, 8, 22, 48, 74, 92, 105, 118, 126, 131, 142, 128, 110, 96, 71, 52, 33, 18, 9, 5,
]

/** same hours, 7-day average */
export const HOURLY_AVG: readonly number[] = [
  5, 4, 3, 3, 3, 7, 19, 42, 68, 85, 98, 110, 117, 122, 130, 121, 104, 90, 66, 48, 30, 16, 8, 5,
]

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

export const TOTAL_TODAY = sum(HOURLY_TODAY)
export const TOTAL_AVG = sum(HOURLY_AVG)
export const DELTA_PCT = Math.round((TOTAL_TODAY / TOTAL_AVG - 1) * 100)

export const PEAK = HOURLY_TODAY.reduce(
  (best, value, hour) => (value > best.value ? { hour, value } : best),
  { hour: 0, value: -1 },
)

export const PENDING_ROUTES = 12

export const fmtInt = (n: number) => n.toLocaleString('en-US')
export const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`

export interface Kpi {
  id: string
  label: string
  value: string
  unit?: string
  note?: string
  tone?: 'ok' | 'accent' | 'plain'
}

export const KPI_NORMAL: readonly Kpi[] = [
  { id: 'delivered', label: 'Delivered, last 24 h', value: fmtInt(TOTAL_TODAY), note: `+${DELTA_PCT}% vs 7-day average`, tone: 'ok' },
  { id: 'ontime', label: 'On-time rate', value: '94.2', unit: '%', note: 'Target 95%', tone: 'plain' },
  { id: 'vehicles', label: 'Active vehicles', value: '38', unit: 'of 42', note: '4 idle', tone: 'plain' },
  { id: 'pending', label: 'Routes waiting for dispatch', value: String(PENDING_ROUTES), note: 'Oldest waiting 18 min', tone: 'accent' },
]

export const KPI_ONE: readonly Kpi[] = [
  { id: 'pending', label: 'Routes waiting for dispatch', value: String(PENDING_ROUTES), note: 'Oldest waiting 18 min', tone: 'accent' },
]

export const KPI_EXPERT: readonly Kpi[] = [
  { id: 'p95', label: 'p95 dispatch latency', value: '4.8', unit: 's', note: 'p50 1.9 s', tone: 'plain' },
  { id: 'ontime', label: 'On-time rate', value: '94.2', unit: '%', note: 'Target 95%', tone: 'plain' },
  { id: 'cost', label: 'Cost per stop', value: '$3.42', note: 'Budget $3.60', tone: 'ok' },
  { id: 'util', label: 'Utilization', value: '87', unit: '%', note: 'Fleet capacity', tone: 'plain' },
  { id: 'idle', label: 'Idle vehicles', value: '4', note: 'NB-088, NB-093 +2', tone: 'plain' },
  { id: 'exceptions', label: 'Exceptions', value: '7', note: '3 address, 4 access', tone: 'plain' },
  { id: 'sla', label: 'SLA breaches', value: '2', note: 'Both on R-22', tone: 'accent' },
  { id: 'hours', label: 'Driver hours', value: '312.5', unit: 'h', note: 'Today, all depots', tone: 'plain' },
]

export type FleetStatus = 'On route' | 'Loading' | 'Delayed' | 'Idle'

export interface FleetRow {
  vehicle: string
  driver: string
  route: string
  status: FleetStatus
  eta: string
  stops: number
  load: number
  ping: string
}

export const FLEET: readonly FleetRow[] = [
  { vehicle: 'NB-104', driver: 'Ana Ruiz', route: 'R-17 Harbor', status: 'On route', eta: '14:32', stops: 9, load: 72, ping: '8 s' },
  { vehicle: 'NB-118', driver: 'Tomas Lind', route: 'R-03 Uptown', status: 'Loading', eta: '15:05', stops: 14, load: 95, ping: '3 s' },
  { vehicle: 'NB-097', driver: 'Priya Nair', route: 'R-22 Airport', status: 'Delayed', eta: '15:40', stops: 6, load: 40, ping: '41 s' },
  { vehicle: 'NB-121', driver: 'Marco Ferri', route: 'R-09 Riverside', status: 'On route', eta: '14:50', stops: 11, load: 68, ping: '5 s' },
  { vehicle: 'NB-088', driver: 'Lea Novak', route: 'R-14 East Yard', status: 'Idle', eta: '-', stops: 0, load: 0, ping: '12 s' },
  { vehicle: 'NB-132', driver: 'Sam Okoro', route: 'R-31 Westgate', status: 'On route', eta: '16:10', stops: 17, load: 88, ping: '2 s' },
  { vehicle: 'NB-110', driver: 'Ines Duarte', route: 'R-05 Old Town', status: 'On route', eta: '14:25', stops: 4, load: 22, ping: '6 s' },
  { vehicle: 'NB-075', driver: 'Kofi Mensah', route: 'R-19 North Loop', status: 'On route', eta: '15:55', stops: 13, load: 80, ping: '4 s' },
  { vehicle: 'NB-140', driver: 'Yuki Sato', route: 'R-27 Docklands', status: 'Loading', eta: '16:30', stops: 15, load: 100, ping: '9 s' },
  { vehicle: 'NB-093', driver: 'Elif Kaya', route: 'R-11 Midtown', status: 'Idle', eta: '-', stops: 0, load: 0, ping: '27 s' },
]

/** rows shown in NORMAL; EXPERT shows the whole list */
export const FLEET_ROWS_NORMAL = 7

export interface ActivityItem {
  id: string
  time: string
  text: string
  tone?: 'accent' | 'ok' | 'plain'
}

export const ACTIVITY: readonly ActivityItem[] = [
  { id: 'a1', time: '14:21', text: 'R-22 Airport flagged delayed at the checkpoint', tone: 'accent' },
  { id: 'a2', time: '14:18', text: 'NB-118 finished loading at Depot North, 14 stops', tone: 'plain' },
  { id: 'a3', time: '14:12', text: '3 routes merged into R-31 Westgate', tone: 'plain' },
  { id: 'a4', time: '14:04', text: 'NB-088 went idle at East Yard', tone: 'plain' },
  { id: 'a5', time: '13:57', text: 'SLA breach cleared on R-09 Riverside', tone: 'ok' },
  { id: 'a6', time: '13:49', text: 'Depot South reported 2 access exceptions', tone: 'plain' },
]

/** rows shown in NORMAL; EXPERT shows the whole list */
export const ACTIVITY_ROWS_NORMAL = 5
