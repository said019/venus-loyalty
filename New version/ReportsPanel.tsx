import { useState } from "react";
import { motion } from "framer-motion";
import { 
  DollarSign, 
  CreditCard,
  Banknote,
  ArrowRightLeft,
  Receipt,
  TrendingUp,
  Download,
  Calendar,
  Plus,
  ChevronDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const months = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const mockSales = [
  { date: "2024-01-15", client: "María García", service: "Facial Premium", type: "servicio", payment: "efectivo", total: 850 },
  { date: "2024-01-14", client: "Laura Pérez", service: "Masaje Relajante", type: "servicio", payment: "tarjeta", total: 600 },
  { date: "2024-01-14", client: "Ana López", service: "Sérum Vitamina C", type: "producto", payment: "transferencia", total: 450 },
  { date: "2024-01-13", client: "Carmen Ruiz", service: "Manicure Spa", type: "servicio", payment: "efectivo", total: 350 },
  { date: "2024-01-12", client: "Sofía Martínez", service: "Limpieza Facial", type: "servicio", payment: "tarjeta", total: 550 },
];

const mockExpenses = [
  { date: "2024-01-10", category: "productos", description: "Compra de cremas", amount: 2500 },
  { date: "2024-01-08", category: "servicios", description: "Luz del mes", amount: 800 },
  { date: "2024-01-05", category: "otros", description: "Mantenimiento equipo", amount: 1200 },
];

const ReportsPanel = () => {
  const [selectedMonth, setSelectedMonth] = useState("01");
  const [selectedYear, setSelectedYear] = useState("2024");

  const totalSales = mockSales.reduce((sum, s) => sum + s.total, 0);
  const totalCash = mockSales.filter(s => s.payment === "efectivo").reduce((sum, s) => sum + s.total, 0);
  const totalCard = mockSales.filter(s => s.payment === "tarjeta").reduce((sum, s) => sum + s.total, 0);
  const totalTransfer = mockSales.filter(s => s.payment === "transferencia").reduce((sum, s) => sum + s.total, 0);
  const totalExpenses = mockExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalSales - totalExpenses;

  const getPaymentBadge = (payment: string) => {
    switch (payment) {
      case "efectivo":
        return <span className="px-2 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs">Efectivo</span>;
      case "tarjeta":
        return <span className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs">Tarjeta</span>;
      case "transferencia":
        return <span className="px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 text-xs">Transferencia</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-playfair">Reportes</h1>
          <p className="text-white/60 text-sm">Analiza los ingresos y gastos de tu negocio</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-white/10">
              {months.map((month, index) => (
                <SelectItem key={index} value={String(index + 1).padStart(2, '0')}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-24 bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-white/10">
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="border-white/10 text-white hover:bg-white/5">
            <Download size={16} className="mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Ventas", value: `$${totalSales.toLocaleString()}`, icon: DollarSign, color: "text-primary", count: `${mockSales.length} ventas` },
          { label: "Efectivo", value: `$${totalCash.toLocaleString()}`, icon: Banknote, color: "text-green-400", count: `${mockSales.filter(s => s.payment === "efectivo").length} ventas` },
          { label: "Tarjeta", value: `$${totalCard.toLocaleString()}`, icon: CreditCard, color: "text-blue-400", count: `${mockSales.filter(s => s.payment === "tarjeta").length} ventas` },
          { label: "Transferencia", value: `$${totalTransfer.toLocaleString()}`, icon: ArrowRightLeft, color: "text-purple-400", count: `${mockSales.filter(s => s.payment === "transferencia").length} ventas` },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-[#1a1a1a] border-white/10">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/60 text-xs uppercase tracking-wider">{stat.label}</span>
                  <stat.icon size={18} className={stat.color} />
                </div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-white/40 text-xs mt-1">{stat.count}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Expenses Section */}
      <Card className="bg-[#1a1a1a] border-red-500/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white font-playfair flex items-center gap-2">
            <Receipt size={20} className="text-red-400" />
            Gastos del Mes
          </CardTitle>
          <Button className="bg-red-500/20 hover:bg-red-500/30 text-red-400">
            <Plus size={16} className="mr-2" />
            Nuevo Gasto
          </Button>
        </CardHeader>
        <CardContent>
          {/* Expense Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Receipt size={16} className="text-red-400" />
                <span className="text-white/60 text-xs uppercase">Total Gastos</span>
              </div>
              <p className="text-2xl font-bold text-red-400">${totalExpenses.toLocaleString()}</p>
              <p className="text-white/40 text-xs mt-1">{mockExpenses.length} gastos</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-green-400" />
                <span className="text-white/60 text-xs uppercase">Utilidad Neta</span>
              </div>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${netProfit.toLocaleString()}
              </p>
              <p className="text-white/40 text-xs mt-1">
                {((netProfit / totalSales) * 100).toFixed(1)}% margen
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-yellow-400">📦</span>
                <span className="text-white/60 text-xs uppercase">Productos</span>
              </div>
              <p className="text-2xl font-bold text-yellow-400">
                ${mockExpenses.filter(e => e.category === "productos").reduce((s, e) => s + e.amount, 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-purple-400">⚡</span>
                <span className="text-white/60 text-xs uppercase">Otros</span>
              </div>
              <p className="text-2xl font-bold text-purple-400">
                ${mockExpenses.filter(e => e.category !== "productos").reduce((s, e) => s + e.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Expenses Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Fecha</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Categoría</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Descripción</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {mockExpenses.map((expense, index) => (
                  <tr key={index} className="hover:bg-white/5">
                    <td className="p-3 text-white/80">{new Date(expense.date).toLocaleDateString('es-MX')}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 rounded-lg bg-white/10 text-white/80 text-xs capitalize">
                        {expense.category}
                      </span>
                    </td>
                    <td className="p-3 text-white">{expense.description}</td>
                    <td className="p-3 text-red-400 font-medium">${expense.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sales Detail */}
      <Card className="bg-[#1a1a1a] border-white/10">
        <CardHeader>
          <CardTitle className="text-white font-playfair flex items-center gap-2">
            <DollarSign size={20} className="text-primary" />
            Detalle de Ventas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Fecha</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Cliente</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Servicio/Producto</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Tipo</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Forma de Pago</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {mockSales.map((sale, index) => (
                  <motion.tr
                    key={index}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-white/5"
                  >
                    <td className="p-3 text-white/80">{new Date(sale.date).toLocaleDateString('es-MX')}</td>
                    <td className="p-3 text-white">{sale.client}</td>
                    <td className="p-3 text-white">{sale.service}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-lg text-xs ${
                        sale.type === "servicio" ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {sale.type === "servicio" ? "Servicio" : "Producto"}
                      </span>
                    </td>
                    <td className="p-3">{getPaymentBadge(sale.payment)}</td>
                    <td className="p-3 text-green-400 font-medium">${sale.total.toLocaleString()}</td>
                  </motion.tr>
                ))}
              </tbody>
              <tfoot className="bg-primary/10">
                <tr>
                  <td colSpan={5} className="p-3 text-right text-white font-medium">Total:</td>
                  <td className="p-3 text-primary font-bold">${totalSales.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPanel;
