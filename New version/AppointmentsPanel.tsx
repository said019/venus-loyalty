import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  Phone,
  Check,
  X,
  MoreHorizontal
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const weekDays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const mockAppointments = [
  { id: 1, date: "2024-01-15", time: "10:00", client: "María García", service: "Facial Premium", status: "confirmed", phone: "4271234567" },
  { id: 2, date: "2024-01-15", time: "11:30", client: "Laura Pérez", service: "Masaje Relajante", status: "pending", phone: "4271234568" },
  { id: 3, date: "2024-01-15", time: "14:00", client: "Ana López", service: "Manicure Spa", status: "confirmed", phone: "4271234569" },
  { id: 4, date: "2024-01-16", time: "09:00", client: "Carmen Ruiz", service: "Limpieza Facial", status: "confirmed", phone: "4271234570" },
  { id: 5, date: "2024-01-17", time: "16:00", client: "Sofía Martínez", service: "Pedicure", status: "cancelled", phone: "4271234571" },
];

const AppointmentsPanel = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [newAppointment, setNewAppointment] = useState({
    clientName: "",
    clientPhone: "",
    serviceName: "",
    date: "",
    time: "",
  });

  const month = currentDate.toLocaleString('es-MX', { month: 'long', year: 'numeric' });

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    // Add padding for days before the first day of month
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    // Add all days in month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }

    return days;
  };

  const [appointments, setAppointments] = useState<any[]>([]);

  useEffect(() => {
    fetchAppointments();
  }, [currentDate, view]);

  const fetchAppointments = async () => {
    try {
      // Logic for view-based fetching could be added here, currently simplified to fetch all or by month if endpoint supports it
      // For now we'll fetch a broad range or just use query params if supported
      const dateStr = currentDate.toISOString().split('T')[0];
      const res = await fetch(`/api/appointments/month?year=${currentDate.getFullYear()}&month=${currentDate.getMonth() + 1}`);
      const data = await res.json();
      if (data.success && data.data) {
        setAppointments(data.data);
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
    }
  };

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(a => a.date === dateStr);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-500";
      case "pending": return "bg-yellow-500";
      case "cancelled": return "bg-red-500";
      default: return "bg-primary";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs">Confirmada</span>;
      case "pending": return <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs">Pendiente</span>;
      case "cancelled": return <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs">Cancelada</span>;
    }
  };

  const todayAppointments = appointments.filter(a => a.date === new Date().toISOString().split('T')[0]);

  const handleCreateAppointment = async () => {
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAppointment)
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success("Cita creada exitosamente");
        setIsNewAppointmentOpen(false);
        setNewAppointment({
          clientName: "",
          clientPhone: "",
          serviceName: "",
          date: "",
          time: "",
        });
        fetchAppointments();
      } else {
        toast.error(data.error || "Error al crear la cita");
      }
    } catch (error) {
      console.error("Error creating appointment:", error);
      toast.error("Error al crear la cita");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-playfair">Citas</h1>
          <p className="text-white/60 text-sm">Gestiona tu agenda de citas</p>
        </div>
        <Button 
          onClick={() => setIsNewAppointmentOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus size={16} className="mr-2" />
          Nueva Cita
        </Button>
      </div>

      {/* Dialog Nueva Cita */}
      <Dialog open={isNewAppointmentOpen} onOpenChange={setIsNewAppointmentOpen}>
        <DialogContent className="bg-[#1a1a1a] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white font-playfair">Nueva Cita</DialogTitle>
            <DialogDescription className="text-white/60">
              Crea una nueva cita para un cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="clientName" className="text-white/80">Nombre del Cliente</Label>
              <Input
                id="clientName"
                value={newAppointment.clientName}
                onChange={(e) => setNewAppointment({ ...newAppointment, clientName: e.target.value })}
                placeholder="Ej: María García"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>
            <div>
              <Label htmlFor="clientPhone" className="text-white/80">Teléfono</Label>
              <Input
                id="clientPhone"
                value={newAppointment.clientPhone}
                onChange={(e) => setNewAppointment({ ...newAppointment, clientPhone: e.target.value })}
                placeholder="4271234567"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>
            <div>
              <Label htmlFor="serviceName" className="text-white/80">Servicio</Label>
              <Input
                id="serviceName"
                value={newAppointment.serviceName}
                onChange={(e) => setNewAppointment({ ...newAppointment, serviceName: e.target.value })}
                placeholder="Ej: Facial Premium"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date" className="text-white/80">Fecha</Label>
                <Input
                  id="date"
                  type="date"
                  value={newAppointment.date}
                  onChange={(e) => setNewAppointment({ ...newAppointment, date: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <Label htmlFor="time" className="text-white/80">Hora</Label>
                <Input
                  id="time"
                  type="time"
                  value={newAppointment.time}
                  onChange={(e) => setNewAppointment({ ...newAppointment, time: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => setIsNewAppointmentOpen(false)}
                className="border-white/10 text-white hover:bg-white/5"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateAppointment}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={!newAppointment.clientName || !newAppointment.clientPhone || !newAppointment.date || !newAppointment.time}
              >
                Crear Cita
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2 bg-[#1a1a1a] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-4">
              <CardTitle className="text-white font-playfair capitalize">{month}</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)} className="h-8 w-8 text-white/60 hover:text-white">
                  <ChevronLeft size={18} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)} className="h-8 w-8 text-white/60 hover:text-white">
                  <ChevronRight size={18} />
                </Button>
              </div>
            </div>
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              {["month", "week", "day"].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v as any)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"
                    }`}
                >
                  {v === "month" ? "Mes" : v === "week" ? "Semana" : "Día"}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {/* Week header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-primary uppercase py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {getDaysInMonth().map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="min-h-[80px] bg-black/20 rounded-lg opacity-50" />;
                }

                const appointments = getAppointmentsForDate(date);
                const dateStr = date.toISOString().split('T')[0];
                const isSelected = selectedDate === dateStr;

                return (
                  <motion.div
                    key={dateStr}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`min-h-[80px] p-2 rounded-lg cursor-pointer transition-colors ${isToday(date) ? "bg-primary/15 border border-primary/30" :
                      isSelected ? "bg-white/10 border border-white/20" :
                        "bg-white/5 hover:bg-white/10"
                      }`}
                  >
                    <span className={`text-sm font-medium ${isToday(date) ? "text-primary" : "text-white"
                      }`}>
                      {date.getDate()}
                    </span>
                    <div className="mt-1 space-y-1">
                      {appointments.slice(0, 2).map((apt, i) => (
                        <div
                          key={apt.id}
                          className={`h-1.5 rounded-full ${getStatusColor(apt.status)}`}
                        />
                      ))}
                      {appointments.length > 2 && (
                        <span className="text-[10px] text-white/40">+{appointments.length - 2}</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Today's appointments */}
        <Card className="bg-[#1a1a1a] border-white/10">
          <CardHeader>
            <CardTitle className="text-white font-playfair flex items-center gap-2">
              <Clock size={20} className="text-primary" />
              Citas de Hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayAppointments.length === 0 ? (
              <div className="text-center py-8 text-white/40">
                <Calendar size={40} className="mx-auto mb-3 opacity-50" />
                <p>No hay citas para hoy</p>
              </div>
            ) : (
              todayAppointments.map((apt, index) => (
                <motion.div
                  key={apt.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`p-4 rounded-xl bg-white/5 border-l-4 ${apt.status === "confirmed" ? "border-green-500" :
                    apt.status === "pending" ? "border-yellow-500" :
                      "border-red-500"
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium">{apt.time}</span>
                        {getStatusBadge(apt.status)}
                      </div>
                      <p className="text-white font-medium">{apt.clientName || apt.client}</p>
                      <p className="text-primary text-sm">{apt.serviceName || apt.service}</p>
                      <div className="flex items-center gap-1 mt-2 text-white/40 text-xs">
                        <Phone size={12} />
                        {apt.clientPhone || apt.phone}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white">
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10">
                        <DropdownMenuItem className="text-white hover:bg-white/10 cursor-pointer">
                          <Check size={14} className="mr-2 text-green-400" />
                          Confirmar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-white hover:bg-white/10 cursor-pointer">
                          <X size={14} className="mr-2 text-red-400" />
                          Cancelar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-white hover:bg-white/10 cursor-pointer">
                          <Phone size={14} className="mr-2 text-green-400" />
                          WhatsApp
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* All appointments list */}
      <Card className="bg-[#1a1a1a] border-white/10">
        <CardHeader>
          <CardTitle className="text-white font-playfair">Próximas Citas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Fecha</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Hora</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Cliente</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Servicio</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3">Estado</th>
                  <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-3 w-20">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {appointments.map((apt, index) => (
                  <motion.tr
                    key={apt.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-white/5"
                  >
                    <td className="p-3 text-white/80">{new Date(apt.date).toLocaleDateString('es-MX')}</td>
                    <td className="p-3 text-white font-medium">{apt.time}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-primary text-sm font-semibold">{(apt.clientName || apt.client || "C").charAt(0)}</span>
                        </div>
                        <span className="text-white">{apt.clientName || apt.client}</span>
                      </div>
                    </td>
                    <td className="p-3 text-white">{apt.serviceName || apt.service}</td>
                    <td className="p-3">{getStatusBadge(apt.status)}</td>
                    <td className="p-3">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white">
                        <MoreHorizontal size={16} />
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AppointmentsPanel;
