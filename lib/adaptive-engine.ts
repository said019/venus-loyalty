// lib/adaptive-engine.ts
// Tipos y definiciones para el motor adaptativo

export type ModeType = 'SUPERVIVENCIA' | 'RECUPERACIÓN' | 'PRODUCTIVO' | 'ÓPTIMO';

export interface Mode {
  mode: ModeType;
  message: string;
  description: string;
}

export interface ControlActionSuggestion {
  action: string;
  description: string;
  duration: number;
  area: string;
  icon: string;
}

export interface MinimumDefinition {
  module: string;
  action: string;
  duration: number;
  required: boolean;
  icon: string;
}

export interface DailyPlan {
  mode: Mode;
  controlActions: ControlActionSuggestion[];
  minimums: MinimumDefinition[];
  maxPriorities: number;
}
