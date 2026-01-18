import { useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  CreditCard,
  Check,
  X,
  Clock,
  User,
  Phone,
  MessageSquare,
  Filter,
  Search,
  Bell,
  Gift,
  Stamp,
  UserPlus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface AppointmentRequest {
  id: number;
  client: string;
  phone: string;
  service: string;
  requestedDate: string;
  requestedTime: string;
  notes: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface StampRequest {
  id: number;
  client: string;
  phone: string;
  currentStamps: number;
  service: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
}

interface RegistrationRequest {
  id: number;
  name: string;
  email: string;
  phone: string;
  birthday: string;
  registeredAt: string;
  status: "pending" | "approved" | "rejected";
}

const mockAppointmentRequests: AppointmentRequest[] = [
  {
    id: 1,
    client: "María García",
    phone: "427 123 4567",
    service: "Facial Premium",
    requestedDate: "20 Enero 2024",
    requestedTime: "10:00 AM",
    notes: "Primera vez",
    status: "pending",
    createdAt: "Hace 5 min"
  },
  {
    id: 2,
    client: "Laura Pérez",
    phone: "427 234 5678",
    service: "Masaje Relajante",
    requestedDate: "21 Enero 2024",
    requestedTime: "3:00 PM",
    notes: "",
    status: "pending",
    createdAt: "Hace 15 min"
  },
  {
    id: 3,
    client: "Ana López",
    phone: "427 345 6789",
    service: "Manicure Spa",
    requestedDate: "22 Enero 2024",
    requestedTime: "11:00 AM",
    notes: "Prefiere color rosa",
    status: "pending",
    createdAt: "Hace 1 hora"
  },
];

const mockStampRequests: StampRequest[] = [
  {
    id: 1,
    client: "Carmen Ruiz",
    phone: "427 456 7890",
    currentStamps: 9,
    service: "Limpieza Facial",
    requestedAt: "Hace 2 min",
    status: "pending"
  },
  {
    id: 2,
    client: "Sofía Martínez",
    phone: "427 567 8901",
    currentStamps: 5,
    service: "Pedicure",
    requestedAt: "Hace 10 min",
    status: "pending"
  },
];

const mockRegistrationRequests: RegistrationRequest[] = [
  {
    id: 1,
    name: "Elena Torres",
    email: "elena@email.com",
    phone: "427 678 9012",
    birthday: "15 de Mayo",
    registeredAt: "Hace 3 min",
    status: "pending"
  },
  {
    id: 2,
    name: "Patricia Sánchez",
    email: "patricia@email.com",
    phone: "427 789 0123",
    birthday: "22 de Agosto",
    registeredAt: "Hace 20 min",
    status: "pending"
  },
];

const RequestsPanel = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [appointmentRequests, setAppointmentRequests] = useState(mockAppointmentRequests);
  const [stampRequests, setStampRequests] = useState(mockStampRequests);
  const [registrationRequests, setRegistrationRequests] = useState(mockRegistrationRequests);

  const handleApproveAppointment = (id: number) => {
    setAppointmentRequests(prev =>
      prev.map(req => req.id === id ? { ...req, status: "approved" as const } : req)
    );
    toast.success("Cita aprobada y confirmada");
  };

  const handleRejectAppointment = (id: number) => {
    setAppointmentRequests(prev =>
      prev.map(req => req.id === id ? { ...req, status: "rejected" as const } : req)
    );
    toast.info("Cita rechazada");
  };

  const handleApproveStamp = (id: number) => {
    setStampRequests(prev =>
      prev.map(req => req.id === id ? { ...req, status: "approved" as const } : req)
    );
    toast.success("Sello agregado exitosamente");
  };

  const handleRejectStamp = (id: number) => {
    setStampRequests(prev =>
      prev.map(req => req.id === id ? { ...req, status: "rejected" as const } : req)
    );
    toast.info("Solicitud de sello rechazada");
  };

  const handleApproveRegistration = (id: number) => {
    setRegistrationRequests(prev =>
      prev.map(req => req.id === id ? { ...req, status: "approved" as const } : req)
    );
    toast.success("Cliente registrado y tarjeta creada");
  };

  const handleRejectRegistration = (id: number) => {
    setRegistrationRequests(prev =>
      prev.map(req => req.id === id ? { ...req, status: "rejected" as const } : req)
    );
    toast.info("Registro rechazado");
  };

  const pendingAppointments = appointmentRequests.filter(r => r.status === "pending").length;
  const pendingStamps = stampRequests.filter(r => r.status === "pending").length;
  const pendingRegistrations = registrationRequests.filter(r => r.status === "pending").length;
  const totalPending = pendingAppointments + pendingStamps + pendingRegistrations;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-playfair flex items-center gap-3">
            <Bell className="w-7 h-7 text-primary" />
            Solicitudes
            {totalPending > 0 && (
              <span className="px-3 py-1 bg-red-500 text-white text-sm rounded-full animate-pulse">
                {totalPending} pendientes
              </span>
            )}
          </h1>
          <p className="text-white/60 text-sm">Gestiona las solicitudes de citas, sellos y registros</p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <Input
            placeholder="Buscar solicitud..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full sm:w-64 bg-white/5 border-white/10 text-white placeholder:text-white/40"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <Calendar className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wider">Citas Pendientes</p>
              <p className="text-3xl font-bold text-white">{pendingAppointments}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-500/10 border-yellow-500/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-yellow-500/20 rounded-xl">
              <Stamp className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wider">Sellos Pendientes</p>
              <p className="text-3xl font-bold text-white">{pendingStamps}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-green-500/20 rounded-xl">
              <UserPlus className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wider">Nuevos Registros</p>
              <p className="text-3xl font-bold text-white">{pendingRegistrations}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="appointments" className="space-y-6">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger
            value="appointments"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
          >
            <Calendar size={16} />
            Citas
            {pendingAppointments > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingAppointments}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="stamps"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
          >
            <Stamp size={16} />
            Sellos
            {pendingStamps > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingStamps}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="registrations"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
          >
            <UserPlus size={16} />
            Registros
            {pendingRegistrations > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingRegistrations}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Appointment Requests */}
        <TabsContent value="appointments" className="space-y-4">
          {appointmentRequests.filter(r => r.status === "pending").length === 0 ? (
            <Card className="bg-[#1a1a1a] border-white/10">
              <CardContent className="py-12 text-center">
                <Calendar className="w-12 h-12 mx-auto text-white/20 mb-4" />
                <p className="text-white/40">No hay solicitudes de citas pendientes</p>
              </CardContent>
            </Card>
          ) : (
            appointmentRequests.filter(r => r.status === "pending").map((request, index) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="bg-[#1a1a1a] border-white/10 border-l-4 border-l-blue-500">
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-semibold">{request.client}</h3>
                            <span className="text-xs text-white/40">{request.createdAt}</span>
                          </div>
                          <p className="text-primary font-medium">{request.service}</p>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-white/60">
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {request.requestedDate}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={14} />
                              {request.requestedTime}
                            </span>
                            <span className="flex items-center gap-1">
                              <Phone size={14} />
                              {request.phone}
                            </span>
                          </div>
                          {request.notes && (
                            <p className="text-sm text-white/40 mt-2 flex items-center gap-1">
                              <MessageSquare size={14} />
                              {request.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleApproveAppointment(request.id)}
                          className="bg-green-500 hover:bg-green-600 text-white"
                          size="sm"
                        >
                          <Check size={16} className="mr-1" />
                          Aprobar
                        </Button>
                        <Button
                          onClick={() => handleRejectAppointment(request.id)}
                          variant="outline"
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                          size="sm"
                        >
                          <X size={16} className="mr-1" />
                          Rechazar
                        </Button>
                        <a href={`https://wa.me/52${request.phone.replace(/\s/g, '')}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="text-green-400 hover:bg-green-500/10">
                            <Phone size={18} />
                          </Button>
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>

        {/* Stamp Requests */}
        <TabsContent value="stamps" className="space-y-4">
          {stampRequests.filter(r => r.status === "pending").length === 0 ? (
            <Card className="bg-[#1a1a1a] border-white/10">
              <CardContent className="py-12 text-center">
                <Stamp className="w-12 h-12 mx-auto text-white/20 mb-4" />
                <p className="text-white/40">No hay solicitudes de sellos pendientes</p>
              </CardContent>
            </Card>
          ) : (
            stampRequests.filter(r => r.status === "pending").map((request, index) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`bg-[#1a1a1a] border-white/10 border-l-4 ${request.currentStamps === 7 ? 'border-l-yellow-500' : 'border-l-primary'
                  }`}>
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${request.currentStamps === 7 ? 'bg-yellow-500/20' : 'bg-primary/20'
                          }`}>
                          {request.currentStamps === 7 ? (
                            <Gift className="w-6 h-6 text-yellow-400" />
                          ) : (
                            <Stamp className="w-6 h-6 text-primary" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-semibold">{request.client}</h3>
                            <span className="text-xs text-white/40">{request.requestedAt}</span>
                          </div>
                          <p className="text-primary font-medium">{request.service}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-sm text-white/60 flex items-center gap-1">
                              <Phone size={14} />
                              {request.phone}
                            </span>
                            <span className={`text-sm font-medium ${request.currentStamps === 7 ? 'text-yellow-400' : 'text-white/60'
                              }`}>
                              {request.currentStamps}/8 sellos
                            </span>
                          </div>
                          {request.currentStamps === 7 && (
                            <p className="text-yellow-400 text-sm mt-2 flex items-center gap-1">
                              🎉 ¡Con este sello completa la tarjeta!
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleApproveStamp(request.id)}
                          className="bg-green-500 hover:bg-green-600 text-white"
                          size="sm"
                        >
                          <Check size={16} className="mr-1" />
                          Agregar Sello
                        </Button>
                        <Button
                          onClick={() => handleRejectStamp(request.id)}
                          variant="outline"
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                          size="sm"
                        >
                          <X size={16} className="mr-1" />
                          Rechazar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>

        {/* Registration Requests */}
        <TabsContent value="registrations" className="space-y-4">
          {registrationRequests.filter(r => r.status === "pending").length === 0 ? (
            <Card className="bg-[#1a1a1a] border-white/10">
              <CardContent className="py-12 text-center">
                <UserPlus className="w-12 h-12 mx-auto text-white/20 mb-4" />
                <p className="text-white/40">No hay solicitudes de registro pendientes</p>
              </CardContent>
            </Card>
          ) : (
            registrationRequests.filter(r => r.status === "pending").map((request, index) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="bg-[#1a1a1a] border-white/10 border-l-4 border-l-green-500">
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                          <UserPlus className="w-6 h-6 text-green-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-semibold">{request.name}</h3>
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                              Nuevo cliente
                            </span>
                            <span className="text-xs text-white/40">{request.registeredAt}</span>
                          </div>
                          <p className="text-white/60 text-sm">{request.email}</p>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-white/60">
                            <span className="flex items-center gap-1">
                              <Phone size={14} />
                              {request.phone}
                            </span>
                            <span className="flex items-center gap-1">
                              🎂 {request.birthday}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleApproveRegistration(request.id)}
                          className="bg-green-500 hover:bg-green-600 text-white"
                          size="sm"
                        >
                          <Check size={16} className="mr-1" />
                          Crear Tarjeta
                        </Button>
                        <Button
                          onClick={() => handleRejectRegistration(request.id)}
                          variant="outline"
                          className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                          size="sm"
                        >
                          <X size={16} className="mr-1" />
                          Rechazar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RequestsPanel;
