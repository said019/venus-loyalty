import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  Users,
  Calendar,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
  Smartphone
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DashboardPanel = () => {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/admin/metrics');
      const data = await res.json();
      setMetrics(data);
    } catch (error) {
      console.error("Error fetching metrics:", error);
    }
  };

  const stats = [
    {
      label: "Ingresos del Mes",
      value: "$0", // TODO: Implement sales endpoint
      change: "+0%",
      isPositive: true,
      icon: DollarSign,
      color: "text-green-400",
      bgColor: "bg-green-500/10"
    },
    {
      label: "Citas Hoy",
      value: metrics?.stampsToday?.toString() || "0",
      change: "",
      isPositive: true,
      icon: Calendar,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10"
    },
    {
      label: "Total Tarjetas",
      value: metrics?.total?.toString() || "0",
      change: "",
      isPositive: true,
      icon: Users,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10"
    },
    {
      label: "Sellos Hoy",
      value: metrics?.stampsToday?.toString() || "0",
      change: "",
      isPositive: true,
      icon: CreditCard,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10"
    },
  ];

  const recentAppointments = [
    { client: "María García", service: "Facial Premium", time: "10:00 AM", status: "confirmed" },
    { client: "Laura Pérez", service: "Masaje Relajante", time: "11:30 AM", status: "pending" },
    { client: "Ana López", service: "Manicure Spa", time: "1:00 PM", status: "confirmed" },
    { client: "Carmen Ruiz", service: "Limpieza Facial", time: "3:30 PM", status: "confirmed" },
  ];

  const topClients = [
    { name: "María García", visits: 24, stamps: 8 },
    { name: "Laura Pérez", visits: 18, stamps: 6 },
    { name: "Ana López", visits: 15, stamps: 5 },
    { name: "Carmen Ruiz", visits: 12, stamps: 4 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white font-playfair">Dashboard</h1>
        <p className="text-white/60 text-sm">Resumen de tu negocio</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-[#1a1a1a] border-white/10 hover:border-white/20 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white/60 text-xs font-medium uppercase tracking-wider">{stat.label}</p>
                    <p className="text-3xl font-bold text-white mt-2">{stat.value}</p>
                    <div className={`flex items-center gap-1 mt-2 ${stat.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {stat.isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      <span className="text-xs font-medium">{stat.change}</span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon size={22} className={stat.color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Appointments */}
        <Card className="lg:col-span-2 bg-[#1a1a1a] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-white text-lg font-playfair flex items-center gap-2">
              <Calendar size={20} className="text-primary" />
              Citas de Hoy
            </CardTitle>
            <span className="text-primary text-sm font-medium">{recentAppointments.length} citas</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAppointments.map((apt, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-primary font-semibold">{apt.client.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{apt.client}</p>
                    <p className="text-white/60 text-sm">{apt.service}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-medium">{apt.time}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${apt.status === 'confirmed'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                    {apt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                  </span>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Top Clients */}
          <Card className="bg-[#1a1a1a] border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-lg font-playfair flex items-center gap-2">
                <Trophy size={20} className="text-yellow-400" />
                Top Clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topClients.map((client, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-yellow-500 text-black' :
                      index === 1 ? 'bg-gray-400 text-black' :
                        index === 2 ? 'bg-amber-600 text-white' :
                          'bg-white/10 text-white'
                      }`}>
                      {index + 1}
                    </span>
                    <span className="text-white text-sm">{client.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm font-medium">{client.visits} visitas</p>
                    <p className="text-white/60 text-xs">{client.stamps} sellos</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Wallets */}
          <Card className="bg-[#1a1a1a] border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-lg font-playfair flex items-center gap-2">
                <Smartphone size={20} className="text-primary" />
                Wallets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-2">🍎</div>
                  <p className="text-2xl font-bold text-white">23</p>
                  <p className="text-white/60 text-xs">Apple Wallet</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-2">🤖</div>
                  <p className="text-2xl font-bold text-white">18</p>
                  <p className="text-white/60 text-xs">Google Wallet</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPanel;
