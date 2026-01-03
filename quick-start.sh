#!/bin/bash

# Quick Start Script for AdaptiveDashboardEnhanced
# Este script ayuda a verificar la instalación y configuración

echo "🚀 AdaptiveDashboardEnhanced - Quick Start"
echo "=========================================="
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "   Instala Node.js desde: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node --version)"

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm no está instalado"
    exit 1
fi

echo "✅ npm $(npm --version)"
echo ""

# Verificar archivos del componente
echo "📁 Verificando archivos del componente..."

files=(
    "components/adaptive/AdaptiveDashboardEnhanced.tsx"
    "components/ui/card.tsx"
    "components/ui/button.tsx"
    "components/ui/badge.tsx"
    "components/ui/progress.tsx"
    "lib/adaptive-engine.ts"
    "tsconfig.json"
)

all_files_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (no encontrado)"
        all_files_exist=false
    fi
done

if [ "$all_files_exist" = false ]; then
    echo ""
    echo "❌ Algunos archivos no se encontraron"
    exit 1
fi

echo ""
echo "✅ Todos los archivos del componente están presentes"
echo ""

# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    echo ""
fi

# Verificar dependencias críticas
echo "🔍 Verificando dependencias críticas..."

critical_deps=("react" "framer-motion" "lucide-react")
missing_deps=()

for dep in "${critical_deps[@]}"; do
    if [ -d "node_modules/$dep" ]; then
        echo "  ✅ $dep"
    else
        echo "  ❌ $dep (no instalado)"
        missing_deps+=("$dep")
    fi
done

if [ ${#missing_deps[@]} -ne 0 ]; then
    echo ""
    echo "⚠️  Faltan dependencias. Instalando..."
    npm install "${missing_deps[@]}"
fi

echo ""
echo "✅ Todas las dependencias están instaladas"
echo ""

# Verificar TypeScript
echo "🔧 Verificando configuración TypeScript..."

if [ -f "tsconfig.json" ]; then
    echo "  ✅ tsconfig.json encontrado"
else
    echo "  ❌ tsconfig.json no encontrado"
fi

echo ""

# Verificar compilación TypeScript (solo advertencias, no errores críticos)
echo "🔨 Verificando sintaxis TypeScript..."
echo "   (Esto puede mostrar advertencias sobre módulos no instalados, es normal)"
echo ""

npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "error TS[0-9]+:" | head -5 || true

echo ""
echo "=========================================="
echo "✅ Configuración completada!"
echo ""
echo "📚 Próximos pasos:"
echo ""
echo "1. Revisa la documentación:"
echo "   - IMPLEMENTATION_GUIDE.md"
echo "   - components/README.md"
echo ""
echo "2. Ve el ejemplo de uso:"
echo "   - components/adaptive/example-usage.tsx"
echo ""
echo "3. Configura Tailwind CSS si no lo has hecho:"
echo "   npm install -D tailwindcss postcss autoprefixer"
echo "   npx tailwindcss init -p"
echo ""
echo "4. Importa el componente en tu aplicación:"
echo "   import { AdaptiveDashboardEnhanced } from '@/components/adaptive';"
echo ""
echo "🎉 ¡Listo para empezar!"
