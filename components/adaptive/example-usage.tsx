// components/adaptive/example-usage.tsx
// Ejemplo de uso del AdaptiveDashboardEnhanced

import React, { useState } from 'react';
import { AdaptiveDashboardEnhanced } from './AdaptiveDashboardEnhanced';
import { DailyPlan, ControlActionSuggestion } from '@/lib/adaptive-engine';

// Datos de ejemplo para diferentes modos
const examplePlans: Record<string, DailyPlan> = {
  SUPERVIVENCIA: {
    mode: {
      mode: 'SUPERVIVENCIA',
      message: 'Hoy solo lo básico',
      description: 'Enfócate en recuperar el control. No te exijas más de lo necesario.'
    },
    controlActions: [
      {
        action: 'Organizar escritorio',
        description: 'Despeja tu espacio físico para pensar mejor',
        duration: 10,
        area: 'Ambiente',
        icon: '🗂️'
      },
      {
        action: 'Revisar pendientes urgentes',
        description: 'Identifica qué necesita atención inmediata',
        duration: 15,
        area: 'Organización',
        icon: '📋'
      },
      {
        action: 'Responder 3 mensajes',
        description: 'Comunica tu situación a quien necesite saberlo',
        duration: 10,
        area: 'Comunicación',
        icon: '💬'
      }
    ],
    minimums: [
      {
        module: 'salud',
        action: 'Comer algo nutritivo',
        duration: 20,
        required: true,
        icon: '🥗'
      },
      {
        module: 'salud',
        action: 'Dormir 7+ horas',
        duration: 0,
        required: true,
        icon: '😴'
      },
      {
        module: 'bienestar',
        action: 'Salir a caminar',
        duration: 15,
        required: false,
        icon: '🚶'
      }
    ],
    maxPriorities: 0
  },
  PRODUCTIVO: {
    mode: {
      mode: 'PRODUCTIVO',
      message: '¡Buen día productivo!',
      description: 'Puedes manejar tus prioridades habituales con confianza.'
    },
    controlActions: [
      {
        action: 'Revisar calendario',
        description: 'Planifica las próximas horas',
        duration: 5,
        area: 'Planificación',
        icon: '📅'
      },
      {
        action: 'Inbox Zero',
        description: 'Procesa tu bandeja de entrada',
        duration: 15,
        area: 'Email',
        icon: '📧'
      },
      {
        action: 'Quick sync',
        description: 'Actualiza al equipo sobre tu progreso',
        duration: 10,
        area: 'Comunicación',
        icon: '💬'
      }
    ],
    minimums: [
      {
        module: 'salud',
        action: 'Hacer ejercicio',
        duration: 30,
        required: true,
        icon: '🏃'
      },
      {
        module: 'salud',
        action: 'Comer saludable',
        duration: 0,
        required: true,
        icon: '🥗'
      },
      {
        module: 'desarrollo',
        action: 'Aprender algo nuevo',
        duration: 20,
        required: false,
        icon: '📚'
      },
      {
        module: 'bienestar',
        action: 'Meditar',
        duration: 10,
        required: false,
        icon: '🧘'
      }
    ],
    maxPriorities: 3
  },
  ÓPTIMO: {
    mode: {
      mode: 'ÓPTIMO',
      message: '¡Estás en tu mejor momento!',
      description: 'Aprovecha esta energía para tus proyectos más importantes.'
    },
    controlActions: [
      {
        action: 'Planificación estratégica',
        description: 'Define objetivos para la semana',
        duration: 20,
        area: 'Estrategia',
        icon: '🎯'
      },
      {
        action: 'Review de proyectos',
        description: 'Evalúa el progreso de tus iniciativas',
        duration: 15,
        area: 'Gestión',
        icon: '📊'
      },
      {
        action: 'Mentoría',
        description: 'Ayuda a alguien de tu equipo',
        duration: 30,
        area: 'Liderazgo',
        icon: '🤝'
      }
    ],
    minimums: [
      {
        module: 'salud',
        action: 'Ejercicio intenso',
        duration: 45,
        required: true,
        icon: '💪'
      },
      {
        module: 'salud',
        action: 'Alimentación óptima',
        duration: 0,
        required: true,
        icon: '🥗'
      },
      {
        module: 'desarrollo',
        action: 'Deep work',
        duration: 90,
        required: true,
        icon: '🧠'
      },
      {
        module: 'bienestar',
        action: 'Meditación',
        duration: 15,
        required: false,
        icon: '🧘'
      },
      {
        module: 'social',
        action: 'Conectar con otros',
        duration: 30,
        required: false,
        icon: '👥'
      }
    ],
    maxPriorities: 5
  }
};

export function ExampleAdaptiveDashboard() {
  const [selectedMode, setSelectedMode] = useState<keyof typeof examplePlans>('PRODUCTIVO');
  const [controlCompleted, setControlCompleted] = useState(false);
  const [minimumsCompleted, setMinimumsCompleted] = useState<Record<string, boolean>>({});
  const [prioritiesCompleted, setPrioritiesCompleted] = useState(0);
  const [totalPriorities, setTotalPriorities] = useState(0);

  const currentPlan = examplePlans[selectedMode];

  const handleSelectControlAction = (action: ControlActionSuggestion) => {
    console.log('Acción de control seleccionada:', action);
    // Aquí podrías abrir un modal, navegar a otra página, etc.
    alert(`Acción seleccionada: ${action.action}\n${action.description}`);
  };

  const handleSelectPriorities = () => {
    console.log('Abrir selector de prioridades');
    alert('Aquí se abriría el selector de prioridades');
  };

  const handleCompleteMinimum = (module: string) => {
    console.log('Mínimo completado:', module);
    setMinimumsCompleted(prev => ({
      ...prev,
      [module]: true
    }));
  };

  const handleOpenClosure = () => {
    console.log('Abrir cierre del día');
    alert('Aquí se abriría el resumen y cierre del día');
  };

  return (
    <div>
      {/* Selector de modo para demo */}
      <div className="fixed top-4 left-4 z-50 bg-white/10 backdrop-blur-xl p-4 rounded-xl border border-white/20">
        <p className="text-white text-sm mb-2">Modo de ejemplo:</p>
        <select
          value={selectedMode}
          onChange={(e) => {
            setSelectedMode(e.target.value as keyof typeof examplePlans);
            setControlCompleted(false);
            setMinimumsCompleted({});
            setPrioritiesCompleted(0);
            setTotalPriorities(0);
          }}
          className="bg-slate-800 text-white px-3 py-2 rounded-lg border border-white/20"
        >
          <option value="SUPERVIVENCIA">🔴 Supervivencia</option>
          <option value="RECUPERACIÓN">🟡 Recuperación</option>
          <option value="PRODUCTIVO">🟢 Productivo</option>
          <option value="ÓPTIMO">🔵 Óptimo</option>
        </select>
        <button
          onClick={() => setControlCompleted(!controlCompleted)}
          className="mt-2 w-full bg-green-500 text-white px-3 py-2 rounded-lg text-sm"
        >
          {controlCompleted ? 'Desmarcar' : 'Marcar'} Control
        </button>
      </div>

      {/* Dashboard */}
      <AdaptiveDashboardEnhanced
        plan={currentPlan}
        controlCompleted={controlCompleted}
        minimumsCompleted={minimumsCompleted}
        prioritiesCompleted={prioritiesCompleted}
        totalPriorities={totalPriorities}
        onSelectControlAction={handleSelectControlAction}
        onSelectPriorities={handleSelectPriorities}
        onCompleteMinimum={handleCompleteMinimum}
        onOpenClosure={handleOpenClosure}
      />
    </div>
  );
}

export default ExampleAdaptiveDashboard;
