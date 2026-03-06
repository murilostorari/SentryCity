import { useState } from 'react';
import { Incident } from '../types/Incident';

const INITIAL_INCIDENTS: Incident[] = [
  { 
    id: 'INC-001', 
    lat: -21.6820, 
    lng: -51.0737, 
    type: 'accident', 
    severity: 'critical', 
    status: 'active', 
    title: 'Colisão Grave', 
    description: 'Acidente com múltiplos veículos bloqueando duas faixas.', 
    address: 'Av. Rio Branco, 500 - Centro, Adamantina - SP',
    time: '12m atrás', 
    radius: 300, 
    timestamp: Date.now() - 12 * 60 * 1000,
    news: [
      {
        source: 'G1 Presidente Prudente',
        title: 'Acidente grave bloqueia trânsito no centro de Adamantina',
        description: 'Uma colisão envolvendo três veículos causou um grande congestionamento na manhã desta terça-feira. Equipes de resgate estão no local.',
        imageUrl: 'https://picsum.photos/seed/accident/300/200',
        url: 'https://g1.globo.com/sp/presidente-prudente-regiao/',
        time: '10 min atrás'
      }
    ]
  },
  { 
    id: 'INC-002', 
    lat: -21.6850, 
    lng: -51.0700, 
    type: 'power', 
    severity: 'high', 
    status: 'active', 
    title: 'Queda de Energia', 
    description: 'Falha de energia em todo o bairro relatada.', 
    address: 'Rua Osvaldo Cruz, 200 - Vila Cicma, Adamantina - SP',
    time: '45m atrás', 
    radius: 1200, 
    timestamp: Date.now() - 45 * 60 * 1000,
    news: []
  },
  { id: 'INC-003', lat: -21.6880, lng: -51.0750, type: 'pothole', severity: 'medium', status: 'investigating', title: 'Perigo na Estrada', description: 'Buraco profundo causando danos aos pneus.', address: 'Av. Adhemar de Barros, 150 - Centro, Adamantina - SP', time: '2h atrás', radius: 50, timestamp: Date.now() - 2 * 60 * 60 * 1000 },
  { id: 'INC-004', lat: -21.6790, lng: -51.0780, type: 'weather', severity: 'high', status: 'active', title: 'Alagamento', description: 'Ponto de alagamento devido à chuva forte.', address: 'Via de Acesso, km 2 - Adamantina - SP', time: '5m atrás', radius: 800, timestamp: Date.now() - 5 * 60 * 1000 },
  { id: 'INC-005', lat: -21.6810, lng: -51.0720, type: 'accident', severity: 'low', status: 'cleared', title: 'Acidente Leve', description: 'Colisão traseira, liberada.', address: 'Rua Fioravante Spósito, 100 - Centro, Adamantina - SP', time: '3h atrás', radius: 100, timestamp: Date.now() - 3 * 60 * 60 * 1000 },
];

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>(INITIAL_INCIDENTS);

  const addIncident = (eventData: any) => {
    const newEvent: Incident = {
      id: `INC-${Date.now()}`,
      ...eventData,
      timestamp: Date.now(),
      time: 'Agora',
      radius: 100
    };
    setIncidents(prev => [newEvent, ...prev]);
    return newEvent;
  };

  const generateMockEvents = (lat: number, lng: number) => {
    const types = ['show', 'party', 'noise', 'inauguration', 'other'];
    const newEvents: Incident[] = Array.from({ length: 5 }).map((_, i) => {
      const type = types[Math.floor(Math.random() * types.length)];
      return {
        id: `LOC-${Date.now()}-${i}`,
        lat: lat + (Math.random() - 0.5) * 0.03,
        lng: lng + (Math.random() - 0.5) * 0.03,
        type,
        severity: Math.random() > 0.7 ? 'high' : 'medium',
        status: 'active',
        title: `Evento Local #${i + 1}`,
        description: `Evento do tipo ${type} detectado nesta região.`,
        address: `Rua Exemplo, ${100 + i * 50} - Bairro Local`,
        time: 'Agora',
        radius: 100 + Math.random() * 300,
        timestamp: Date.now()
      };
    });
    setIncidents(prev => [...newEvents, ...prev]);
  };

  return {
    incidents,
    addIncident,
    generateMockEvents
  };
}
