export type Role = 'SuperAdmin' | 'Admin' | 'User'

export interface User {
  id: string
  email: string
  fullName: string
  isActive: boolean
  createdAt: string
  roles: Role[]
}

export interface AuthResponse {
  token: string
  expiresAt: string
  user: User
}

export type AuctionType = 'Annual' | 'LongTerm' | 'Monthly'
export type UploadDataType = 'AuctionNodalPrices' | 'DaHourlyLmp'

export interface UploadBatch {
  id: number
  dataType: UploadDataType
  auctionType: AuctionType | null
  auctionPeriod: string | null
  round: number | null
  originalFileName: string
  sheetName: string | null
  rowCount: number
  ftrRowCount: number | null
  coverageStart: string | null
  coverageEnd: string | null
  status: 'Processing' | 'Completed' | 'Failed'
  errorMessage: string | null
  uploadedBy: string
  uploadedAt: string
}

export interface DashboardSummary {
  users: number
  auctionUploads: number
  daLmpUploads: number
  auctionRows: number
  ftrRows: number
  daLmpRows: number
  latestDaLmpHour: string | null
}

export interface NetworkNode {
  id: number
  name: string
  type: string
  zone: string | null
  avgLmp: number
  avgCongestion: number
  hourly: number[]
}

export interface AuctionOption {
  id: number
  label: string
  auctionType: AuctionType
  period: string | null
  round: number | null
  coverageStart: string | null
  coverageEnd: string | null
  ftrRowCount: number
}

export interface NetworkOptions {
  auctions: AuctionOption[]
  classTypes: string[]
  hedgeTypes: string[]
  daFirstDay: string | null
  daLastDay: string | null
}

export interface NodeMatch {
  pnodeId: number
  name: string
  totalMw: number
}

export interface PathNode {
  pnodeId: number
  name: string
  totalMw: number
  nodalPrice: number | null
  daAvgLmp: number | null
  daAvgCongestion: number | null
}

export interface FtrPath {
  sourcePnodeId: number
  sourceNode: string
  sinkPnodeId: number
  sinkNode: string
  clearedMw: number
  netMw: number
  ftrCount: number
  avgMcp: number | null
  daSpread: number | null
}

export interface PathsResponse {
  auction: AuctionOption | null
  message?: string
  periodType: string | null
  coversDate: boolean
  window: { start: string; end: string; granularity: 'month' | 'day' } | null
  daNodes: number
  totalPaths: number
  nodes: PathNode[]
  paths: FtrPath[]
}

export interface AnnualAnalysisOptions {
  auctions: { id: number; label: string; auctionPeriod: string; round: number; coverageStart: string; coverageEnd: string }[]
  rounds: number[]
  daFirstMonth: string | null
  daLastMonth: string | null
}

export interface AnalysisSegment {
  from: string
  to: string
  planningYear: string
  auctionId: number | null
  auctionLabel: string | null
  daHours: number
  calendarHours: number
}

export interface AnalysisPath {
  from: string
  to: string
  auction: string
  sourcePnodeId: number
  sourceNode: string
  sinkPnodeId: number
  sinkNode: string
  classType: string
  hours: number
  clearedMw: number
  auctionPrice: number
  actualPrice: number
  error: number
}

export interface AnalysisNode {
  pnodeId: number
  name: string
  classType: string
  hours: number
  auctionPrice: number
  actualPrice: number
  error: number
}

export interface AnalysisMonth {
  month: string
  classType: string
  hours: number
  auctionPrice: number
  actualPrice: number
  error: number
}

export interface AnnualAnalysisResult {
  segments: AnalysisSegment[]
  summary: {
    pathCount: number
    totalAuction: number
    totalActual: number
    totalError: number
    meanAbsError: number
    directionHitRate: number
    truncated: boolean
  }
  paths: AnalysisPath[]
  nodes: AnalysisNode[]
  seriesLabel: string | null
  series: AnalysisMonth[]
}
