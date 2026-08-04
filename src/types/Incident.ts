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
}
