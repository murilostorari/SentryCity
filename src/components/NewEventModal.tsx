import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { motion } from 'motion/react';

interface NewEventModalProps {
  onClose: () => void;
  onSave: (event: any) => void;
  isDarkMode: boolean;
}

export default function NewEventModal({ onClose, onSave, isDarkMode }: NewEventModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('accident');
  const [severity, setSeverity] = useState('medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title,
      description,
      type,
      severity,
      status: 'active',
      timestamp: Date.now(),
      lat: 52.3676 + (Math.random() - 0.5) * 0.05, // Random location near Amsterdam
      lng: 4.9041 + (Math.random() - 0.5) * 0.05,
      radius: 100 + Math.random() * 500,
      time: 'Agora'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`w-full max-w-md rounded-xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-[#1E1E1E] text-white' : 'bg-white text-gray-900'}`}
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-[#333]' : 'border-gray-200'}`}>
          <h2 className="text-lg font-semibold">Novo Evento</h2>
          <button onClick={onClose} className={`p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-[#333] transition-colors`}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 opacity-70">Título</label>
            <input 
              type="text" 
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} outline-none transition-colors`}
              placeholder="Ex: Acidente na via principal"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 opacity-70">Descrição</label>
            <textarea 
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} outline-none transition-colors`}
              placeholder="Descreva o evento..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Tipo</label>
              <select 
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} outline-none transition-colors`}
              >
                <option value="accident">Acidente</option>
                <option value="power">Energia</option>
                <option value="weather">Clima</option>
                <option value="pothole">Buraco</option>
                <option value="show">Show/Concerto</option>
                <option value="party">Festa/Evento</option>
                <option value="noise">Barulho/Reclamação</option>
                <option value="inauguration">Inauguração</option>
                <option value="other">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Severidade</label>
              <select 
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} outline-none transition-colors`}
              >
                <option value="low">Baixo</option>
                <option value="medium">Médio</option>
                <option value="high">Alto</option>
                <option value="critical">Crítico</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${isDarkMode ? 'hover:bg-[#333]' : 'hover:bg-gray-100'} transition-colors`}
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
            >
              <Save size={16} />
              Salvar Evento
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
