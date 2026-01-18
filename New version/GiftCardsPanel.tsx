import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Gift, 
  Clock, 
  CheckCircle, 
  XCircle,
  QrCode,
  Search,
  Plus,
  Download,
  Link,
  Share2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const services = [
  { id: 1, name: "Facial Premium", price: 850 },
  { id: 2, name: "Masaje Relajante", price: 600 },
  { id: 3, name: "Manicure Spa", price: 350 },
  { id: 4, name: "Limpieza Facial Profunda", price: 550 },
];

const mockGiftCards = [
  { 
    id: "GC001", 
    recipient: "Ana López", 
    service: "Facial Premium", 
    status: "pending", 
    createdAt: "2024-01-10",
    expiresAt: "2024-02-10",
    message: "¡Feliz cumpleaños!"
  },
  { 
    id: "GC002", 
    recipient: "María García", 
    service: "Masaje Relajante", 
    status: "redeemed", 
    createdAt: "2024-01-05",
    expiresAt: "2024-02-05",
    redeemedAt: "2024-01-15"
  },
  { 
    id: "GC003", 
    recipient: "Laura Pérez", 
    service: "Manicure Spa", 
    status: "expired", 
    createdAt: "2023-12-01",
    expiresAt: "2024-01-01"
  },
];

const GiftCardsPanel = () => {
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedService, setSelectedService] = useState("");

  const stats = {
    total: mockGiftCards.length,
    pending: mockGiftCards.filter(gc => gc.status === "pending").length,
    redeemed: mockGiftCards.filter(gc => gc.status === "redeemed").length,
    expired: mockGiftCards.filter(gc => gc.status === "expired").length,
  };

  const filteredCards = mockGiftCards.filter(gc => {
    if (filter !== "all" && gc.status !== filter) return false;
    if (searchTerm && !gc.recipient.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="bg-primary/20 text-primary text-xs px-2 py-1 rounded-full flex items-center gap-1"><Clock size={12} />Pendiente</span>;
      case "redeemed":
        return <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full flex items-center gap-1"><CheckCircle size={12} />Canjeada</span>;
      case "expired":
        return <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-full flex items-center gap-1"><XCircle size={12} />Expirada</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-playfair">Gift Cards</h1>
          <p className="text-white/60 text-sm">Gestiona las tarjetas de regalo</p>
        </div>
        <Button variant="ghost" className="text-white/60 hover:text-white">
          <QrCode size={18} className="mr-2" />
          Escanear QR
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, icon: Gift, color: "text-white" },
          { label: "Pendientes", value: stats.pending, icon: Clock, color: "text-primary" },
          { label: "Canjeadas", value: stats.redeemed, icon: CheckCircle, color: "text-green-400" },
          { label: "Expiradas", value: stats.expired, icon: XCircle, color: "text-red-400" },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-[#1a1a1a] border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <stat.icon size={20} className={stat.color} />
                  <div>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-white/60 text-xs">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Create Form */}
        <Card className="lg:col-span-2 bg-[#1a1a1a] border-white/10">
          <CardHeader>
            <CardTitle className="text-white font-playfair flex items-center gap-2">
              <Plus size={20} className="text-primary" />
              Crear Gift Card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-white/80 text-sm">Para quién es (opcional)</Label>
              <Input 
                placeholder="Nombre del destinatario"
                className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <div>
              <Label className="text-white/80 text-sm">Servicio a regalar</Label>
              <Select value={selectedService} onValueChange={setSelectedService}>
                <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Seleccionar servicio..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10">
                  {services.map(service => (
                    <SelectItem key={service.id} value={service.id.toString()}>
                      {service.name} - ${service.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white/80 text-sm">Mensaje personalizado (opcional)</Label>
              <Input 
                placeholder="Ej: ¡Feliz cumpleaños!"
                maxLength={100}
                className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <div>
              <Label className="text-white/80 text-sm">Vigencia</Label>
              <Select defaultValue="30">
                <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10">
                  <SelectItem value="30">30 días</SelectItem>
                  <SelectItem value="60">60 días</SelectItem>
                  <SelectItem value="90">90 días</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              <Gift size={18} className="mr-2" />
              Generar Gift Card
            </Button>

            {/* Preview */}
            <div className="mt-6 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl p-6 text-center border border-primary/20">
              <div className="text-4xl mb-2">🎁</div>
              <h3 className="text-primary font-playfair text-lg">Gift Card Venus</h3>
              <p className="text-white mt-2">
                {selectedService ? services.find(s => s.id.toString() === selectedService)?.name : "Selecciona un servicio"}
              </p>
              <div className="w-20 h-20 mx-auto mt-4 bg-white rounded-xl flex items-center justify-center">
                <QrCode size={40} className="text-gray-800" />
              </div>
              <p className="text-white/60 text-xs mt-3">Válida por 30 días</p>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card className="lg:col-span-3 bg-[#1a1a1a] border-white/10">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-white font-playfair">Gift Cards</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-40 bg-white/5 border-white/10 text-white text-sm placeholder:text-white/40"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filter Tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { id: "all", label: "Todas", count: stats.total },
                { id: "pending", label: "Pendientes", count: stats.pending },
                { id: "redeemed", label: "Canjeadas", count: stats.redeemed },
                { id: "expired", label: "Expiradas", count: stats.expired },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                    filter === tab.id 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {tab.label}
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    filter === tab.id ? "bg-white/20" : "bg-white/10"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Gift Cards List */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {filteredCards.length === 0 ? (
                <div className="text-center py-10 text-white/40">
                  <Gift size={40} className="mx-auto mb-3 opacity-50" />
                  <p>No hay gift cards</p>
                </div>
              ) : (
                filteredCards.map((gc, index) => (
                  <motion.div
                    key={gc.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 transition-colors ${
                      gc.status === "expired" ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                          gc.status === "pending" ? "bg-gradient-to-br from-primary to-primary/60 text-white" :
                          gc.status === "redeemed" ? "bg-green-500/20 text-green-400" :
                          "bg-red-500/10 text-red-400"
                        }`}>
                          <Gift size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-white font-medium">{gc.recipient || "Sin destinatario"}</h4>
                            {getStatusBadge(gc.status)}
                          </div>
                          <p className="text-primary text-sm mt-0.5">{gc.service}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                            <span>Creada: {new Date(gc.createdAt).toLocaleDateString('es-MX')}</span>
                            <span>Expira: {new Date(gc.expiresAt).toLocaleDateString('es-MX')}</span>
                          </div>
                          {gc.message && (
                            <p className="text-white/60 text-sm mt-2 italic">"{gc.message}"</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="text-white/40 hover:text-white h-8 w-8">
                          <Download size={16} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-white/40 hover:text-white h-8 w-8">
                          <Link size={16} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-green-400 hover:text-green-300 h-8 w-8">
                          <Share2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GiftCardsPanel;
