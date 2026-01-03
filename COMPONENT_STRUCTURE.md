# Estructura del AdaptiveDashboardEnhanced

```
┌─────────────────────────────────────────────────────────────────┐
│                   AdaptiveDashboardEnhanced                      │
│                    (Componente Principal)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Header     │     │    Grid      │     │ Float Button │
│ (Glassmorphism)│   │  (3 Cards)   │     │  "Finalizar" │
└──────────────┘     └──────────────┘     └──────────────┘
        │                     │
        │                     │
        ├─ Título            ├─ Control Actions Card
        ├─ Fecha             │   └─ Acciones de control (3)
        ├─ Modo Badge        │
        ├─ Mensaje           ├─ Priorities Card
        └─ Progreso Circular │   └─ Agregar prioridad
                             │
                             └─ Minimums Card
                                 └─ Hábitos diarios (5)

┌─────────────────────────────────────────────────────────────────┐
│                      Componentes UI Base                         │
├─────────────────────────────────────────────────────────────────┤
│  • Card (CardHeader, CardContent, CardTitle)                    │
│  • Button (variants: default, outline, secondary)               │
│  • Badge (variants: default, outline, secondary)                │
│  • Progress (barra de progreso)                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Tipos y Interfaces                            │
├─────────────────────────────────────────────────────────────────┤
│  • DailyPlan - Plan diario completo                             │
│  • Mode - Modo actual (SUPERVIVENCIA, RECUPERACIÓN, etc.)       │
│  • ControlActionSuggestion - Acciones de control                │
│  • MinimumDefinition - Definición de mínimos diarios            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Animaciones y Efectos                         │
├─────────────────────────────────────────────────────────────────┤
│  • Framer Motion - Animaciones de entrada/salida                │
│  • Hover Effects - Feedback visual interactivo                  │
│  • Gradientes - Transiciones de color suaves                    │
│  • Glassmorphism - Efecto de vidrio con backdrop-blur          │
│  • Circular Progress - Progreso animado con SVG                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Modos Visuales                              │
├─────────────────────────────────────────────────────────────────┤
│  🔴 SUPERVIVENCIA  → Rojo/Naranja   → 0 prioridades             │
│  🟡 RECUPERACIÓN   → Amarillo/Ámbar → 1-2 prioridades           │
│  🟢 PRODUCTIVO     → Verde/Esmeralda → 3 prioridades            │
│  🔵 ÓPTIMO         → Azul/Morado    → 5 prioridades             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Flujo de Interacción                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Usuario ve el dashboard según su modo actual                │
│  2. Selecciona acción de control → onSelectControlAction()      │
│  3. Completa acción → controlCompleted = true                   │
│  4. Agrega prioridades → onSelectPriorities()                   │
│  5. Completa mínimos → onCompleteMinimum(module)                │
│  6. Finaliza el día → onOpenClosure()                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Dependencias Clave                            │
├─────────────────────────────────────────────────────────────────┤
│  • react@^18.2.0           - Framework                          │
│  • framer-motion@^11.0.0   - Animaciones                        │
│  • lucide-react@^0.344.0   - Iconos                             │
│  • tailwindcss             - Estilos (peer dependency)          │
└─────────────────────────────────────────────────────────────────┘
```

## Árbol de Archivos

```
venus-loyalty/
├── components/
│   ├── README.md                        📖 Documentación
│   ├── adaptive/
│   │   ├── AdaptiveDashboardEnhanced.tsx  ⭐ Componente principal
│   │   ├── example-usage.tsx              💡 Ejemplo completo
│   │   └── index.ts                       📦 Exports
│   └── ui/
│       ├── card.tsx                       🎴 Componente Card
│       ├── button.tsx                     🔘 Componente Button
│       ├── badge.tsx                      🏷️ Componente Badge
│       ├── progress.tsx                   📊 Componente Progress
│       └── index.ts                       📦 Exports
├── lib/
│   ├── adaptive-engine.ts                 🧠 Tipos TypeScript
│   └── index.ts                           📦 Exports
├── tsconfig.json                          ⚙️ Config TypeScript
├── package.json                           📦 Dependencias
├── IMPLEMENTATION_GUIDE.md                📚 Guía completa
└── quick-start.sh                         🚀 Script de inicio
```

## Características Destacadas

### 🎨 Diseño Premium
- Dark theme con glassmorphism
- Gradientes animados
- Efectos de hover suaves
- Responsive (mobile-first)

### ⚡ Performance
- Animaciones optimizadas con GPU
- Lazy rendering de componentes
- Memoization donde es necesario

### 🔧 Personalizable
- 4 modos adaptativos
- Colores configurables
- Animaciones ajustables
- Layouts flexibles

### 📱 Responsive
- Grid adaptativo (1 col mobile, 3 cols desktop)
- Touch-friendly en móvil
- Breakpoints optimizados

### ♿ Accesibilidad
- Botones con estados claros
- Contraste de colores adecuado
- Feedback visual en interacciones
- Estructura semántica HTML

## Líneas de Código

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| AdaptiveDashboardEnhanced.tsx | ~570 | Componente principal |
| example-usage.tsx | ~220 | Ejemplo de uso |
| card.tsx | ~80 | Componente Card |
| button.tsx | ~50 | Componente Button |
| badge.tsx | ~30 | Componente Badge |
| progress.tsx | ~25 | Componente Progress |
| adaptive-engine.ts | ~35 | Tipos TypeScript |
| **TOTAL** | **~1010** | **Total de líneas** |
