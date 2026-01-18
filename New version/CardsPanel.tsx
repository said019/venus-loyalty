import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  RefreshCw,
  QrCode,
  Star,
  Phone,
  Calendar,
  MoreHorizontal,
  Gift,
  Send,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mockCards = [
  { id: 1, name: "María García", phone: "4271234567", lastVisit: "2024-01-10", stamps: 8, maxStamps: 10 },
  { id: 2, name: "Laura Pérez", phone: "4271234568", lastVisit: "2024-01-08", stamps: 5, maxStamps: 10 },
  { id: 3, name: "Ana López", phone: "4271234569", lastVisit: "2024-01-05", stamps: 10, maxStamps: 10 },
  { id: 4, name: "Carmen Ruiz", phone: "4271234570", lastVisit: "2024-01-03", stamps: 3, maxStamps: 10 },
  { id: 5, name: "Sofía Martínez", phone: "4271234571", lastVisit: "2024-01-01", stamps: 7, maxStamps: 10 },
];

const CardsPanel = () => {
  const [cards, setCards] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("created_at:desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Fetch cards on mount and when filters change
  useEffect(() => {
    fetchCards();
  }, [currentPage, sortBy, searchTerm]);

  const fetchCards = async () => {
    setLoading(true);
    try {
      const q = encodeURIComponent(searchTerm);
      const res = await fetch(`/api/cards?page=${currentPage}&q=${q}&sortBy=${sortBy.split(':')[0]}&sortOrder=${sortBy.split(':')[1]}`);
      const data = await res.json();
      if (data.items) {
        setCards(data.items);
      }
    } catch (error) {
      console.error("Error fetching cards:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'stamp' | 'redeem', cardId: string) => {
    try {
      const url = action === 'stamp' ? `/api/cards/${cardId}/stamp` : `/api/cards/${cardId}/redeem`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Refresh cards
        fetchCards();
        // TODO: Show success toast
      } else {
        console.error("Action error:", data.error);
      }
    } catch (error) {
      console.error("Action failed:", error);
    }
  };

  const filteredCards = cards; // Filter is handled by API now

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white font-playfair">Tarjetas de Lealtad</h1>
        <p className="text-white/60 text-sm">Gestiona todas las tarjetas de tus clientes</p>
      </div>

      {/* Birthday Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎂</span>
            <div>
              <h3 className="text-yellow-400 font-semibold">Cumpleaños Cercanos</h3>
              <p className="text-white/60 text-sm">2 clientes cumplen años en los próximos 7 días</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10">
            <Gift size={16} className="mr-2" />
            Enviar felicitaciones
          </Button>
        </div>
      </motion.div>

      {/* Search & Filters */}
      <Card className="bg-[#1a1a1a] border-white/10">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
              <Input
                placeholder="Buscar por nombre o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-white/10">
                <SelectItem value="created_at:desc">Recientes</SelectItem>
                <SelectItem value="created_at:asc">Antiguos</SelectItem>
                <SelectItem value="name:asc">Nombre (A-Z)</SelectItem>
                <SelectItem value="stamps:desc">Más sellos</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
              <Search size={16} className="mr-2" />
              Buscar
            </Button>

            <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5">
              <RefreshCw size={16} className="mr-2" />
              Recargar
            </Button>

            <Button variant="ghost" size="sm" className="text-white/60 hover:text-white">
              <QrCode size={16} className="mr-2" />
              Escanear QR
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards Table */}
      <Card className="bg-[#1a1a1a] border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Cliente</th>
                <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Teléfono</th>
                <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Última Visita</th>
                <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Sellos</th>
                <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4 w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredCards.map((card, index) => (
                <motion.tr
                  key={card.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="hover:bg-white/5 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-semibold">{card.name.charAt(0)}</span>
                      </div>
                      <span className="text-white font-medium">{card.name}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-white/80">
                      <Phone size={14} />
                      {card.phone}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-white/60">
                      <Calendar size={14} />
                      {card.lastVisit ? new Date(card.lastVisit).toLocaleDateString('es-MX') : new Date(card.updatedAt).toLocaleDateString('es-MX')}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {Array.from({ length: card.maxStamps || card.max || 10 }).map((_, i) => (
                          <Star
                            key={i}
                            size={16}
                            className={i < card.stamps ? "text-yellow-400 fill-yellow-400" : "text-white/20"}
                          />
                        ))}
                      </div>
                      <span className="text-white/60 text-sm ml-2">
                        {card.stamps}/{card.maxStamps || card.max}
                      </span>
                      {card.stamps === (card.maxStamps || card.max) && (
                        <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">
                          ¡Premio!
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-white/60 hover:text-white">
                          <MoreHorizontal size={18} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10">
                        <DropdownMenuItem className="text-white hover:bg-white/10 cursor-pointer" onClick={() => handleAction('stamp', card.id)}>
                          <Star size={14} className="mr-2" />
                          Agregar sello
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-white hover:bg-white/10 cursor-pointer">
                          <QrCode size={14} className="mr-2" />
                          Ver QR
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-white hover:bg-white/10 cursor-pointer">
                          <Send size={14} className="mr-2" />
                          Enviar WhatsApp
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="text-white/60 hover:text-white"
          >
            <ChevronLeft size={16} className="mr-1" />
            Anterior
          </Button>
          <span className="text-white/60 text-sm">Página {currentPage}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(p => p + 1)}
            className="text-white/60 hover:text-white"
          >
            Siguiente
            <ChevronRight size={16} className="ml-1" />
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default CardsPanel;
