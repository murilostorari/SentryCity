export type ReportType = 'confirm' | 'deny' | 'resolved' | 'update';

export interface IncidentReport {
  id: string;
  incident_id: string;
  user_id: string | null;
  type: ReportType;
  comment: string | null;
  created_at: string;
}

export interface ReportCounts {
  confirm: number;
  deny: number;
  resolved: number;
  update: number;
  total: number;
}

export interface TimelineItem {
  id: string;
  type: 'system' | 'user_report';
  event_type: string;
  description: string;
  created_at: string;
  report_type?: ReportType;
  comment?: string;
  user_id?: string | null;
}

export interface Incident {
  id: string;
  lat: number;
  lng: number;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  address: string;
  time: string;
  radius: number;
  timestamp: number;
  news?: {
    source: string;
    title: string;
    description: string;
    imageUrl: string;
    url: string;
    time: string;
  }[];
  reportCounts?: ReportCounts;
}
