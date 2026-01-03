// components/adaptive/AdaptiveDashboardEnhanced.tsx
// Dashboard adaptativo con diseño PREMIUM

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Clock,
  Zap,
  Target,
  ChevronRight,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Award,
  Flame,
} from 'lucide-react';
import { DailyPlan, ControlActionSuggestion, MinimumDefinition } from '@/lib/adaptive-engine';

// ============================================
// TIPOS
// ============================================

interface AdaptiveDashboardEnhancedProps {
  plan: DailyPlan;
  controlCompleted: boolean;
  minimumsCompleted: Record<string, boolean>;
  prioritiesCompleted: number;
  totalPriorities: number;
  onSelectControlAction: (action: ControlActionSuggestion) => void;
  onSelectPriorities: () => void;
  onCompleteMinimum: (module: string) => void;
  onOpenClosure: () => void;
}

// ============================================
// CIRCULAR PROGRESS
// ============================================

function CircularProgress({ value, size = 120, strokeWidth = 8 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-accent"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            className="text-3xl font-bold bg-gradient-to-br from-blue-500 to-purple-500 bg-clip-text text-transparent"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
          >
            {Math.round(value)}%
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function AdaptiveDashboardEnhanced({
  plan,
  controlCompleted,
  minimumsCompleted,
  prioritiesCompleted,
  totalPriorities,
  onSelectControlAction,
  onSelectPriorities,
  onCompleteMinimum,
  onOpenClosure,
}: AdaptiveDashboardEnhancedProps) {
  const { mode, controlActions, minimums, maxPriorities } = plan;
  const [hoveredAction, setHoveredAction] = useState<number | null>(null);

  // ============================================
  // CALCULAR PROGRESO
  // ============================================

  const totalMinimums = minimums.filter((m) => m.required).length;
  const completedMinimums = Object.values(minimumsCompleted).filter(Boolean).length;
  const overallProgress =
    ((controlCompleted ? 1 : 0) + prioritiesCompleted + completedMinimums) /
    (1 + maxPriorities + totalMinimums) * 100;

  // ============================================
  // CONFIGURACIÓN VISUAL POR MODO
  // ============================================

  const modeConfig = {
    SUPERVIVENCIA: {
      gradient: 'from-red-500/20 via-orange-500/20 to-red-500/20',
      glowColor: 'shadow-red-500/20',
      badge: 'bg-gradient-to-r from-red-500 to-orange-500',
      icon: '🔴',
      textGradient: 'from-red-500 to-orange-500',
    },
    RECUPERACIÓN: {
      gradient: 'from-yellow-500/20 via-amber-500/20 to-yellow-500/20',
      glowColor: 'shadow-yellow-500/20',
      badge: 'bg-gradient-to-r from-yellow-500 to-amber-500',
      icon: '🟡',
      textGradient: 'from-yellow-500 to-amber-500',
    },
    PRODUCTIVO: {
      gradient: 'from-green-500/20 via-emerald-500/20 to-green-500/20',
      glowColor: 'shadow-green-500/20',
      badge: 'bg-gradient-to-r from-green-500 to-emerald-500',
      icon: '🟢',
      textGradient: 'from-green-500 to-emerald-500',
    },
    ÓPTIMO: {
      gradient: 'from-blue-500/20 via-purple-500/20 to-blue-500/20',
      glowColor: 'shadow-blue-500/20',
      badge: 'bg-gradient-to-r from-blue-500 to-purple-500',
      icon: '🔵',
      textGradient: 'from-blue-500 to-purple-500',
    },
  };

  const config = modeConfig[mode.mode];

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 space-y-6 pb-32">
      {/* Header con efecto glassmorphism */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        {/* Glow effect */}
        <div className={`absolute inset-0 bg-gradient-to-r ${config.gradient} blur-3xl opacity-30 rounded-3xl`} />

        {/* Content */}
        <div className="relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-start justify-between mb-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-white">
                Mi Agenda
              </h1>
              <p className="text-lg text-white/60">
                {new Date().toLocaleDateString('es-MX', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            </div>

            {/* Modo badge con efecto brillante */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`relative ${config.badge} text-white px-6 py-3 rounded-2xl font-bold text-lg shadow-lg ${config.glowColor} shadow-2xl`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{config.icon}</span>
                <span>Modo: {mode.mode}</span>
              </div>
              {/* Buffer badge */}
              <div className="absolute -top-2 -right-2 bg-white/90 text-slate-900 text-xs px-2 py-1 rounded-full font-semibold">
                Buffer: +25%
              </div>
            </motion.div>
          </div>

          {/* Mensaje motivacional con gradiente */}
          <div className="space-y-2">
            <p className={`text-xl font-semibold bg-gradient-to-r ${config.textGradient} bg-clip-text text-transparent`}>
              {mode.message}
            </p>
            <p className="text-white/60">{mode.description}</p>
          </div>

          {/* Progreso circular */}
          <div className="flex justify-center mt-8">
            <CircularProgress value={overallProgress} />
          </div>
        </div>
      </motion.div>

      {/* Grid de secciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECCIÓN 1: Control Mínimo */}
        {!controlCompleted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1"
          >
            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-primary/30 backdrop-blur-xl shadow-2xl shadow-primary/10 overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary to-purple-500 rounded-xl shadow-lg">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-white text-xl">Acciones de Control</CardTitle>
                    <p className="text-sm text-white/60 mt-1">
                      Tareas pequeñas para recuperar control
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-white/10 text-white border-0">
                    0/3
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-6">
                {controlActions.map((action, index) => (
                  <motion.button
                    key={index}
                    onClick={() => onSelectControlAction(action)}
                    onHoverStart={() => setHoveredAction(index)}
                    onHoverEnd={() => setHoveredAction(null)}
                    whileHover={{ scale: 1.02, x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full group relative"
                  >
                    {/* Glow on hover */}
                    {hoveredAction === index && (
                      <motion.div
                        layoutId="actionGlow"
                        className="absolute inset-0 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-xl blur-xl"
                      />
                    )}
                    
                    {/* Card content */}
                    <div className="relative bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/50 group-hover:border-primary/50 rounded-xl p-4 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="text-4xl">{action.icon}</div>
                        <div className="flex-1 text-left">
                          <div className="font-semibold text-white group-hover:text-primary transition-colors">
                            {action.action}
                          </div>
                          <div className="text-sm text-white/60 mt-1">
                            {action.description}
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <Badge variant="outline" className="border-white/20 text-white/80 text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              {action.duration} min
                            </Badge>
                            <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                              {action.area}
                            </Badge>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          // Control completado
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="lg:col-span-1"
          >
            <Card className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 border-green-500/30 backdrop-blur-xl">
              <CardContent className="p-8 text-center space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                >
                  <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
                </motion.div>
                <div>
                  <p className="text-2xl font-bold text-white">¡Control recuperado!</p>
                  <p className="text-white/60 mt-2">
                    Ya puedes continuar con tus prioridades
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* SECCIÓN 2: Prioridades */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-1"
        >
          <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-purple-500/30 backdrop-blur-xl shadow-2xl shadow-purple-500/10">
            <CardHeader className="bg-gradient-to-r from-purple-500/10 to-transparent pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-white text-xl">Prioridades del Día</CardTitle>
                  <p className="text-sm text-white/60 mt-1">
                    Máximo {maxPriorities} prioridades hoy
                  </p>
                </div>
                <Badge variant="secondary" className="bg-white/10 text-white border-0">
                  0/0 · Máx {maxPriorities}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {maxPriorities === 0 ? (
                <div className="text-center py-8 space-y-4">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
                  <div>
                    <p className="font-semibold text-white">Sin prioridades hoy</p>
                    <p className="text-sm text-white/60 mt-2">
                      En modo {mode.mode}, enfócate en recuperarte
                    </p>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={onSelectPriorities}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/30"
                  size="lg"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  + Agregar Prioridad
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* SECCIÓN 3: Mínimos */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-1"
        >
          <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-emerald-500/30 backdrop-blur-xl shadow-2xl shadow-emerald-500/10">
            <CardHeader className="bg-gradient-to-r from-emerald-500/10 to-transparent pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-lg">
                  <Award className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-white text-xl">Mínimos Diarios</CardTitle>
                  <p className="text-sm text-white/60 mt-1">Hábitos básicos para hoy</p>
                </div>
                <Badge variant="secondary" className="bg-white/10 text-white border-0">
                  0/4
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-6">
              {minimums.slice(0, 5).map((minimum, index) => {
                const isCompleted = minimumsCompleted[minimum.module] || false;
                return (
                  <motion.button
                    key={index}
                    onClick={() => !isCompleted && onCompleteMinimum(minimum.module)}
                    disabled={isCompleted}
                    whileHover={!isCompleted ? { scale: 1.02, x: 4 } : {}}
                    whileTap={!isCompleted ? { scale: 0.98 } : {}}
                    className={`w-full text-left rounded-xl p-3 transition-all ${
                      isCompleted
                        ? 'bg-green-500/10 border border-green-500/30'
                        : 'bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{minimum.icon}</div>
                      <div className="flex-1">
                        <div
                          className={`font-medium ${
                            isCompleted ? 'line-through text-white/40' : 'text-white'
                          }`}
                        >
                          {minimum.action}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {minimum.duration > 0 && (
                            <span className="text-xs text-white/60">
                              {minimum.duration} min
                            </span>
                          )}
                          <span className="text-xs text-white/40">·</span>
                          <span className="text-xs text-emerald-400 capitalize">
                            {minimum.module}
                          </span>
                          {!minimum.required && (
                            <>
                              <span className="text-xs text-white/40">·</span>
                              <span className="text-xs text-white/40">Opcional</span>
                            </>
                          )}
                        </div>
                      </div>
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      ) : (
                        <Circle className="w-5 h-5 text-white/30" />
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Botón flotante de finalizar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="fixed bottom-8 right-8"
      >
        <Button
          onClick={onOpenClosure}
          size="lg"
          className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 hover:from-green-600 hover:via-emerald-600 hover:to-teal-600 text-white shadow-2xl shadow-green-500/30 rounded-2xl px-8 py-6 text-lg font-semibold"
        >
          <Flame className="w-5 h-5 mr-2" />
          Finalizar el Día
        </Button>
      </motion.div>
    </div>
  );
}

export default AdaptiveDashboardEnhanced;
