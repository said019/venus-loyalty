import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Sparkles, 
  ShoppingBag, 
  Plus, 
  Search,
  Edit,
  Trash2,
  Wand2,
  DollarSign,
  Clock,
  Package
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const mockServices = [
  { id: 1, name: "Facial Premium", category: "Facial", duration: 90, price: 850 },
  { id: 2, name: "Limpieza Facial Profunda", category: "Facial", duration: 60, price: 550 },
  { id: 3, name: "Masaje Relajante", category: "Masaje", duration: 60, price: 600 },
  { id: 4, name: "Masaje Descontracturante", category: "Masaje", duration: 75, price: 750 },
  { id: 5, name: "Manicure Spa", category: "Uñas", duration: 45, price: 350 },
  { id: 6, name: "Pedicure Spa", category: "Uñas", duration: 60, price: 400 },
];

const mockProducts = [
  { id: 1, name: "Sérum Vitamina C", category: "skincare", price: 450, stock: 15, minStock: 5 },
  { id: 2, name: "Crema Hidratante", category: "skincare", price: 380, stock: 8, minStock: 5 },
  { id: 3, name: "Mascarilla Facial", category: "skincare", price: 280, stock: 3, minStock: 5 },
  { id: 4, name: "Base Maquillaje", category: "maquillaje", price: 520, stock: 12, minStock: 3 },
  { id: 5, name: "Aceite Corporal", category: "corporal", price: 320, stock: 0, minStock: 3 },
];

const CatalogPanel = () => {
  const [activeTab, setActiveTab] = useState("services");
  const [searchServices, setSearchServices] = useState("");
  const [searchProducts, setSearchProducts] = useState("");
  const [productFilter, setProductFilter] = useState("all");

  const filteredServices = mockServices.filter(s => 
    s.name.toLowerCase().includes(searchServices.toLowerCase())
  );

  const filteredProducts = mockProducts.filter(p => {
    if (!p.name.toLowerCase().includes(searchProducts.toLowerCase())) return false;
    if (productFilter !== "all" && p.category !== productFilter) return false;
    return true;
  });

  const getStockStatus = (stock: number, minStock: number) => {
    if (stock === 0) return { label: "Agotado", color: "text-red-400 bg-red-500/20" };
    if (stock < minStock) return { label: "Stock bajo", color: "text-yellow-400 bg-yellow-500/20" };
    return { label: "Disponible", color: "text-green-400 bg-green-500/20" };
  };

  const productStats = {
    total: mockProducts.length,
    value: mockProducts.reduce((sum, p) => sum + (p.price * p.stock), 0),
    lowStock: mockProducts.filter(p => p.stock < p.minStock && p.stock > 0).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white font-playfair">Catálogo</h1>
        <p className="text-white/60 text-sm">Gestiona tus servicios y productos</p>
      </div>

      <Card className="bg-[#1a1a1a] border-white/10">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start border-b border-white/10 rounded-none bg-transparent h-auto p-0">
            <TabsTrigger 
              value="services"
              className="flex items-center gap-2 px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-white/60"
            >
              <Sparkles size={18} />
              Servicios
              <span className="ml-2 px-2 py-0.5 rounded-full bg-white/10 text-xs">
                {mockServices.length}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="products"
              className="flex items-center gap-2 px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-white/60"
            >
              <ShoppingBag size={18} />
              Productos
              <span className="ml-2 px-2 py-0.5 rounded-full bg-white/10 text-xs">
                {mockProducts.length}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* Services Tab */}
          <TabsContent value="services" className="p-4 mt-0">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <Input
                  placeholder="Buscar servicio..."
                  value={searchServices}
                  onChange={(e) => setSearchServices(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
              <Button variant="ghost" className="text-white/60 hover:text-white">
                <Wand2 size={16} className="mr-2" />
                Auto-organizar
              </Button>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus size={16} className="mr-2" />
                Nuevo Servicio
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Nombre</th>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Categoría</th>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Duración</th>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Precio</th>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4 w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredServices.map((service, index) => (
                    <motion.tr
                      key={service.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="p-4 text-white font-medium">{service.name}</td>
                      <td className="p-4">
                        <span className="px-2 py-1 rounded-lg bg-primary/20 text-primary text-xs">
                          {service.category}
                        </span>
                      </td>
                      <td className="p-4 text-white/80">
                        <div className="flex items-center gap-1">
                          <Clock size={14} className="text-white/40" />
                          {service.duration} min
                        </div>
                      </td>
                      <td className="p-4 text-white font-medium">
                        <div className="flex items-center gap-1">
                          <DollarSign size={14} className="text-green-400" />
                          {service.price}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white">
                            <Edit size={16} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300">
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="p-4 mt-0">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package size={16} className="text-white/40" />
                  <span className="text-white/60 text-xs">Productos</span>
                </div>
                <p className="text-2xl font-bold text-white">{productStats.total}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={16} className="text-white/40" />
                  <span className="text-white/60 text-xs">Valor inventario</span>
                </div>
                <p className="text-2xl font-bold text-white">${productStats.value.toLocaleString()}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package size={16} className="text-yellow-400" />
                  <span className="text-white/60 text-xs">Stock bajo</span>
                </div>
                <p className="text-2xl font-bold text-yellow-400">{productStats.lowStock}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <Input
                  placeholder="Buscar producto..."
                  value={searchProducts}
                  onChange={(e) => setSearchProducts(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
              <div className="flex gap-2">
                {["all", "skincare", "maquillaje", "corporal"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setProductFilter(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                      productFilter === cat 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {cat === "all" ? "Todos" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus size={16} className="mr-2" />
                Nuevo Producto
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Producto</th>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Categoría</th>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Precio</th>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4">Stock</th>
                    <th className="text-left text-white/60 text-xs font-medium uppercase tracking-wider p-4 w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredProducts.map((product, index) => {
                    const status = getStockStatus(product.stock, product.minStock);
                    return (
                      <motion.tr
                        key={product.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                              <ShoppingBag size={18} className="text-white/60" />
                            </div>
                            <span className="text-white font-medium">{product.name}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 rounded-lg bg-primary/20 text-primary text-xs capitalize">
                            {product.category}
                          </span>
                        </td>
                        <td className="p-4 text-white font-medium">${product.price}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-lg text-xs ${status.color}`}>
                            {product.stock} - {status.label}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white">
                              <Edit size={16} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300">
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

export default CatalogPanel;
