# Componentes Adaptativos - Venus Loyalty

## AdaptiveDashboardEnhanced

Dashboard adaptativo con diseño premium que se ajusta al estado del usuario (Supervivencia, Recuperación, Productivo, Óptimo).

### Ubicación
- **Componente principal**: `components/adaptive/AdaptiveDashboardEnhanced.tsx`
- **Tipos e interfaces**: `lib/adaptive-engine.ts`
- **Componentes UI**: `components/ui/`

### Características

#### 1. **Modos Adaptativos**
El dashboard se adapta visualmente según el modo del usuario:
- 🔴 **SUPERVIVENCIA**: Rojo/Naranja - Enfoque en recuperación básica
- 🟡 **RECUPERACIÓN**: Amarillo/Ámbar - Reconstruyendo momentum
- 🟢 **PRODUCTIVO**: Verde/Esmeralda - Funcionamiento normal
- 🔵 **ÓPTIMO**: Azul/Morado - Máximo rendimiento

#### 2. **Secciones del Dashboard**

##### Control Mínimo
- Acciones rápidas para recuperar control (5-15 min)
- Visualización con iconos y badges
- Efectos de hover con gradientes
- Se oculta cuando se completa

##### Prioridades del Día
- Máximo de prioridades según el modo
- Botón para agregar nuevas prioridades
- Mensaje informativo cuando no hay prioridades disponibles

##### Mínimos Diarios
- Hábitos básicos requeridos/opcionales
- Checkbox interactivo para marcar como completado
- Muestra duración y módulo
- Efectos visuales al completar

#### 3. **Características Visuales**

- **Glassmorphism**: Efecto de vidrio con backdrop-blur
- **Gradientes animados**: Transiciones suaves de color
- **Progreso circular**: Indicador visual del progreso general
- **Animaciones con Framer Motion**: Movimientos fluidos y naturales
- **Efectos de hover**: Feedback visual interactivo
- **Dark theme premium**: Diseño oscuro con acentos brillantes

### Uso

```tsx
import { AdaptiveDashboardEnhanced } from '@/components/adaptive/AdaptiveDashboardEnhanced';
import { DailyPlan } from '@/lib/adaptive-engine';

function MyApp() {
  const plan: DailyPlan = {
    mode: {
      mode: 'PRODUCTIVO',
      message: '¡Buen día! Estás en modo productivo',
      description: 'Puedes manejar tus prioridades habituales'
    },
    controlActions: [
      {
        action: 'Revisar mensajes',
        description: 'Responde mensajes urgentes',
        duration: 10,
        area: 'Comunicación',
        icon: '📧'
      }
    ],
    minimums: [
      {
        module: 'salud',
        action: 'Hacer ejercicio',
        duration: 30,
        required: true,
        icon: '🏃'
      }
    ],
    maxPriorities: 3
  };

  return (
    <AdaptiveDashboardEnhanced
      plan={plan}
      controlCompleted={false}
      minimumsCompleted={{}}
      prioritiesCompleted={0}
      totalPriorities={0}
      onSelectControlAction={(action) => console.log('Control action:', action)}
      onSelectPriorities={() => console.log('Select priorities')}
      onCompleteMinimum={(module) => console.log('Complete minimum:', module)}
      onOpenClosure={() => console.log('Open closure')}
    />
  );
}
```

### Dependencias

```json
{
  "framer-motion": "^11.0.0",
  "lucide-react": "^0.344.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0"
}
```

### Componentes UI incluidos

- **Card**: Componente base para tarjetas
- **Button**: Botones con múltiples variantes
- **Badge**: Etiquetas informativas
- **Progress**: Barra de progreso

### Personalización

Los colores y estilos se pueden ajustar modificando:
- `modeConfig`: Configuración visual por modo
- Clases de Tailwind CSS en el componente
- Animaciones de Framer Motion

### Tailwind CSS

Asegúrate de tener Tailwind CSS configurado con las siguientes extensiones:
- `backdrop-blur`
- `bg-clip-text`
- `text-transparent`
- Gradientes (`from-`, `via-`, `to-`)

### Notas de Implementación

1. El componente usa `'use client'` para Next.js App Router
2. Los imports usan alias `@/` que deben estar configurados en `tsconfig.json`
3. Las animaciones son performantes usando GPU acceleration
4. El diseño es totalmente responsive (mobile-first)
