import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Search, User, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface Client {
    id: string;
    name: string;
    phone: string;
}

interface ClientSearchProps {
    onSelect: (client: Client | null) => void;
    selectedClientName?: string;
    className?: string;
}

export function ClientSearch({ onSelect, selectedClientName, className }: ClientSearchProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(false);
    const [displayText, setDisplayText] = useState(selectedClientName || "");

    // Update display text when prop changes
    useEffect(() => {
        if (selectedClientName) {
            setDisplayText(selectedClientName);
        }
    }, [selectedClientName]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim().length >= 2) {
                searchClients(query);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const searchClients = async (searchQuery: string) => {
        setLoading(true);
        try {
            // Endpoint expects query param 'q'
            const res = await fetch(`/api/admin/cards?q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            if (data.items) {
                setClients(data.items);
            }
        } catch (error) {
            console.error("Error searching clients:", error);
            setClients([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={cn("relative w-full", className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white"
                    >
                        {displayText ? (
                            <span className="truncate">{displayText}</span>
                        ) : (
                            <span className="text-white/40">Buscar cliente...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0 bg-[#1a1a1a] border-white/10 text-white">
                    <Command className="bg-transparent">
                        {/* Custom input handling to avoid shadcn/cmdk default filtering conflict with server-side search if needed, 
                but here we use CommandInput which filters internally. 
                For server-side search with cmdk, we often use a controlled input outside or handle filtering carefully.
                However, for simplicity with this UI library: */}
                        <div className="flex items-center border-b border-white/10 px-3" cmdk-input-wrapper="">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <input
                                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Escribe nombre o teléfono..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>

                        <CommandList>
                            <CommandEmpty>
                                {loading ? "Buscando..." : "No se encontraron clientes."}
                            </CommandEmpty>

                            <CommandGroup heading="Resultados">
                                {clients.map((client) => (
                                    <CommandItem
                                        key={client.id}
                                        value={client.name + " " + client.phone} // Value for internal filtering if we kept it
                                        onSelect={() => {
                                            onSelect(client);
                                            setDisplayText(client.name);
                                            setOpen(false);
                                            setQuery("");
                                        }}
                                        className="cursor-pointer aria-selected:bg-white/10"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                displayText === client.name ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <div className="flex flex-col">
                                            <span>{client.name}</span>
                                            <span className="text-xs text-white/50 flex items-center gap-1">
                                                <Phone size={10} /> {client.phone}
                                            </span>
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {/* Fallback/Correction: Allow manual editing if needed, but for now we focus on search.
          If user wants to create new, they might need a "Create" button or just type.
          Integrating a way to just type a name is tricky with ComboBox.
          Let's verify if we need that.
          The user complaint is "no me deja seleccionar", implying they want selection.
      */}
        </div>
    );
}
