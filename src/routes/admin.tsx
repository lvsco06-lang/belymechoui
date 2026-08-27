import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fetchMenuForDay } from "@/lib/menu-api";
import { DishManager } from "@/components/belyme/DishManager";
import {
  DAYS,
  ORDER_STATUSES,
  currentDayOfWeek,
  formatFCFA,
  type Dish,
  type MenuEntry,
} from "@/lib/belyme";
import { fetchStockMovements, STOCK_MOVEMENT_REASONS } from "@/lib/stock";
import { buildReportCsv, downloadCsv, fetchDailyReport } from "@/lib/report";
import {
  addExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  fetchExpenses,
  fetchFinanceStats,
} from "@/lib/finance";
import {
  createDeliveryZone,
  deleteDeliveryZone,
  fetchAllDeliveryZones,
  updateDeliveryZone,
} from "@/lib/delivery-admin";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Administration — Belymechoui" },
      { name: "description", content: "Back-office Belymechoui : stocks, menus du jour et suivi des commandes." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Administration — Belymechoui" },
      { property: "og:description", content: "Back-office Belymechoui : stocks, menus et commandes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <p className="p-10 text-muted-foreground">Chargement…</p>;
  if (!session) return <SignIn />;
  return <Dashboard />;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-bronze"
      >
        <h1 className="font-display text-2xl text-sand">Administration Belymechoui</h1>
        <p className="text-sm text-muted-foreground">Accès réservé à l'équipe du restaurant.</p>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy} className="w-full bg-bronze text-primary-foreground">
          {busy ? "Connexion…" : "Se connecter"}
        </Button>
        <Link to="/" className="block text-center text-xs text-muted-foreground hover:text-primary">
          Retour au site
        </Link>
      </form>
    </main>
  );
}

type OrderRow = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  delivery_type: string;
  delivery_zone: string | null;
  total_amount: number;
  payment_method: string;
  status: string;
  order_type: string;
  created_at: string;
  order_items: { id: string; dish_name: string; quantity: number; unit_price: number }[];
};

function Dashboard() {
  const queryClient = useQueryClient();
  const [day, setDay] = useState(() => currentDayOfWeek());
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("role", "admin");
      return (data?.length ?? 0) > 0;
    },
  });

  const { data: menu = [] } = useQuery({
    queryKey: ["admin-menu", day],
    queryFn: () => fetchMenuForDay(day),
  });

  const { data: dishes = [] } = useQuery({
    queryKey: ["admin-dishes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dishes").select("*").order("name");
      if (error) throw error;
      return data as Dish[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, dish_name, quantity, unit_price)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as OrderRow[];
    },
    refetchInterval: 30_000,
  });

  const { data: finance } = useQuery({
    queryKey: ["admin-finance"],
    queryFn: fetchFinanceStats,
    refetchInterval: 60_000,
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["admin-stock-movements"],
    queryFn: () => fetchStockMovements(30),
    refetchInterval: 60_000,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["admin-expenses"],
    queryFn: () => fetchExpenses(30),
  });

  const addExpenseMutation = useMutation({
    mutationFn: addExpense,
    onSuccess: () => {
      toast.success("Dépense enregistrée");
      void queryClient.invalidateQueries({ queryKey: ["admin-expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      toast.success("Dépense supprimée");
      void queryClient.invalidateQueries({ queryKey: ["admin-expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: zones = [] } = useQuery({
    queryKey: ["admin-delivery-zones"],
    queryFn: fetchAllDeliveryZones,
  });

  const createZone = useMutation({
    mutationFn: createDeliveryZone,
    onSuccess: () => {
      toast.success("Zone de livraison ajoutée");
      void queryClient.invalidateQueries({ queryKey: ["admin-delivery-zones"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateZone = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof updateDeliveryZone>[1]) =>
      updateDeliveryZone(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-delivery-zones"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteZone = useMutation({
    mutationFn: deleteDeliveryZone,
    onSuccess: () => {
      toast.success("Zone supprimée");
      void queryClient.invalidateQueries({ queryKey: ["admin-delivery-zones"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function exportDailyReport() {
    setExporting(true);
    try {
      const report = await fetchDailyReport(reportDate);
      downloadCsv(`belymechoui-rapport-${reportDate}.csv`, buildReportCsv(report));
      toast.success(`Rapport du ${reportDate} exporté (${report.orders.length} commande(s))`);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de générer le rapport.");
    } finally {
      setExporting(false);
    }
  }

  const updateStock = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) => {
      const { error } = await supabase
        .from("daily_menus")
        .update({ stock_quantity: stock, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock mis à jour");
      void queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignDish = useMutation({
    mutationFn: async (dishId: string) => {
      const { error } = await supabase
        .from("daily_menus")
        .insert({ day_of_week: day, dish_id: dishId, stock_quantity: 10 });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plat associé au jour");
      void queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeDish = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from("daily_menus").delete().eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plat retiré de ce jour");
      void queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setSpecial = useMutation({
    mutationFn: async (entry: MenuEntry) => {
      const { error } = await supabase
        .from("daily_menus")
        .update({ is_special_today: !entry.is_special_today })
        .eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-menu"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Statut mis à jour");
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const availableDishes = dishes.filter((d) => !menu.some((m) => m.dish_id === d.id));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-sand">Back-office Belymechoui</h1>
          <p className="text-sm text-muted-foreground">Stocks, menus et commandes en temps réel.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/">Voir le site</Link>
          </Button>
          <Button variant="ghost" onClick={() => void supabase.auth.signOut()}>
            Déconnexion
          </Button>
        </div>
      </div>

      {isAdmin === false && (
        <p className="mb-6 rounded-lg border border-ember/50 bg-ember/10 p-4 text-sm text-ember">
          Ce compte n'a pas le rôle administrateur : les modifications seront refusées.
        </p>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <FinanceCard
          label="Aujourd'hui"
          revenue={finance?.revenueToday}
          expenses={finance?.expensesToday}
          net={finance?.netToday}
          orders={finance?.ordersToday}
        />
        <FinanceCard
          label="Cette semaine"
          revenue={finance?.revenueWeek}
          expenses={finance?.expensesWeek}
          net={finance?.netWeek}
          orders={finance?.ordersWeek}
        />
        <FinanceCard
          label="Ce mois"
          revenue={finance?.revenueMonth}
          expenses={finance?.expensesMonth}
          net={finance?.netMonth}
          orders={finance?.ordersMonth}
        />
      </div>

      <Tabs defaultValue="menus">
        <TabsList>
          <TabsTrigger value="menus">Menus & stocks</TabsTrigger>
          <TabsTrigger value="dishes">Carte & photos</TabsTrigger>
          <TabsTrigger value="orders">Commandes</TabsTrigger>
          <TabsTrigger value="delivery">Livraison</TabsTrigger>
          <TabsTrigger value="reports">Stock & rapports</TabsTrigger>
        </TabsList>

        <TabsContent value="menus" className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDay(d.value)}
                className={`rounded-full border px-4 py-1.5 text-sm ${
                  day === d.value
                    ? "border-primary bg-bronze text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
            <div className="min-w-56 flex-1">
              <Label>Associer un plat à ce jour</Label>
              <Select onValueChange={(v) => assignDish.mutate(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un plat" />
                </SelectTrigger>
                <SelectContent>
                  {dishes.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Aucun plat : créez-en un dans « Carte & photos ».
                    </div>
                  )}
                  {availableDishes.length === 0 && dishes.length > 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Tous les plats sont déjà associés à ce jour.
                    </div>
                  )}
                  {availableDishes.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            {menu.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-48 flex-1">
                  <p className="flex items-center gap-2 text-sand">
                    {entry.dish.name}
                    {entry.stock_quantity === 0 && (
                      <Badge variant="destructive">Rupture</Badge>
                    )}
                    {entry.stock_quantity > 0 && entry.stock_quantity <= 3 && (
                      <Badge className="bg-ember text-ember-foreground">Stock bas</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.dish.category} · {formatFCFA(entry.dish.price)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor={`stock-${entry.id}`} className="text-xs text-muted-foreground">
                    Stock
                  </Label>
                  <Input
                    id={`stock-${entry.id}`}
                    type="number"
                    min={0}
                    defaultValue={entry.stock_quantity}
                    className="w-24"
                    onBlur={(e) =>
                      updateStock.mutate({ id: entry.id, stock: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id={`out-${entry.id}`}
                    checked={entry.stock_quantity === 0}
                    onCheckedChange={(checked) =>
                      updateStock.mutate({ id: entry.id, stock: checked ? 0 : 10 })
                    }
                  />
                  <Label htmlFor={`out-${entry.id}`} className="text-xs text-muted-foreground">
                    Rupture
                  </Label>
                </div>

                <Button
                  size="sm"
                  variant={entry.is_special_today ? "default" : "outline"}
                  onClick={() => setSpecial.mutate(entry)}
                  className={entry.is_special_today ? "bg-bronze text-primary-foreground" : ""}
                >
                  {entry.is_special_today ? "Spécial du jour" : "Définir spécial"}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-ember hover:text-ember"
                  onClick={() => removeDish.mutate(entry.id)}
                >
                  Retirer
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="dishes" className="mt-6">
          <DishManager dishes={dishes} />
        </TabsContent>

        <TabsContent value="orders" className="mt-6 space-y-3">
          {orders.length === 0 && <p className="text-muted-foreground">Aucune commande pour l'instant.</p>}
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sand">
                    #{order.order_number} — {order.customer_name}{" "}
                    {order.order_type === "evenement" && (
                      <Badge className="ml-2 bg-ember text-ember-foreground">Événement</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.customer_phone} ·{" "}
                    {order.delivery_type === "livraison"
                      ? `Livraison ${order.delivery_zone ?? ""}`
                      : "À emporter"}{" "}
                    · {new Date(order.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-primary">{formatFCFA(order.total_amount)}</span>
                  <Select
                    value={order.status}
                    onValueChange={(status) => updateStatus.mutate({ id: order.id, status })}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {order.order_items?.map((item) => (
                  <li key={item.id}>
                    {item.quantity} x {item.dish_name} — {formatFCFA(item.unit_price * item.quantity)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="delivery" className="mt-6 space-y-6">
          <div>
            <h2 className="font-display text-lg text-sand">Zones de livraison</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Quartiers proposés à la livraison et frais associés (FCFA). Une zone désactivée
              n'apparaît plus au client mais reste dans l'historique des commandes passées.
            </p>
          </div>

          <DeliveryZoneForm
            onSubmit={(input) => createZone.mutate(input)}
            submitting={createZone.isPending}
          />

          <div className="space-y-3">
            {zones.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune zone configurée.</p>
            )}
            {zones.map((z) => (
              <div
                key={z.id}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-48 flex-1">
                  <p className={z.is_active ? "text-sand" : "text-muted-foreground line-through"}>
                    {z.name}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor={`zone-fee-${z.id}`} className="text-xs text-muted-foreground">
                    Frais (FCFA)
                  </Label>
                  <Input
                    id={`zone-fee-${z.id}`}
                    type="number"
                    min={0}
                    defaultValue={z.fee}
                    className="w-28"
                    onBlur={(e) => {
                      const fee = Number(e.target.value);
                      if (fee !== z.fee) updateZone.mutate({ id: z.id, fee });
                    }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id={`zone-active-${z.id}`}
                    checked={z.is_active}
                    onCheckedChange={(checked) =>
                      updateZone.mutate({ id: z.id, is_active: checked })
                    }
                  />
                  <Label htmlFor={`zone-active-${z.id}`} className="text-xs text-muted-foreground">
                    Active
                  </Label>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-ember hover:text-ember"
                  onClick={() => deleteZone.mutate(z.id)}
                >
                  Supprimer
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-6 space-y-8">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-display text-lg text-sand">Rapport quotidien</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Exporte les commandes, le revenu, les dépenses et les mouvements de stock d'une
              journée, à envoyer au propriétaire.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="report-date">Journée</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button
                onClick={() => void exportDailyReport()}
                disabled={exporting}
                className="bg-ember-gradient text-ember-foreground shadow-ember"
              >
                {exporting ? "Génération…" : "Exporter le rapport (CSV)"}
              </Button>
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg text-sand">Dépenses & achats</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Chaque achat (ingrédients, personnel, loyer…) enregistré ici est retranché du revenu
              pour calculer le bénéfice net réel.
            </p>
            <ExpenseForm
              onSubmit={(input) => addExpenseMutation.mutate(input)}
              submitting={addExpenseMutation.isPending}
            />
            <div className="mt-4 space-y-2">
              {expenses.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune dépense enregistrée.</p>
              )}
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
                >
                  <div>
                    <span className="text-sand">{e.label}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {e.category}
                      {e.supplier ? ` · ${e.supplier}` : ""}
                      {e.quantity ? ` · ${e.quantity} ${e.unit ?? ""}`.trimEnd() : ""} ·{" "}
                      {new Date(e.paid_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-ember">-{formatFCFA(e.amount)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-ember"
                      onClick={() => deleteExpenseMutation.mutate(e.id)}
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg text-sand">Mouvements de stock récents</h2>
            <div className="mt-3 space-y-2">
              {movements.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun mouvement pour l'instant.</p>
              )}
              {movements.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
                >
                  <div>
                    <span className="text-sand">{m.dish_name}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {STOCK_MOVEMENT_REASONS[m.reason] ?? m.reason}
                      {m.note ? ` — ${m.note}` : ""} ·{" "}
                      {new Date(m.created_at).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <span className={m.change > 0 ? "text-primary" : "text-ember"}>
                    {m.change > 0 ? `+${m.change}` : m.change}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function FinanceCard({
  label,
  revenue,
  expenses,
  net,
  orders,
}: {
  label: string;
  revenue: number | undefined;
  expenses: number | undefined;
  net: number | undefined;
  orders: number | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl text-primary">{formatFCFA(revenue ?? 0)}</p>
      <p className="text-xs text-muted-foreground">{orders ?? 0} commande(s)</p>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
        <span className="text-ember">-{formatFCFA(expenses ?? 0)} dépenses</span>
        <span className={`font-medium ${(net ?? 0) >= 0 ? "text-primary" : "text-ember"}`}>
          Net {formatFCFA(net ?? 0)}
        </span>
      </div>
    </div>
  );
}

function DeliveryZoneForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (input: { name: string; fee: number }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const feeNumber = Number(fee);
    if (!name.trim() || Number.isNaN(feeNumber) || feeNumber < 0) {
      toast.error("Indique un nom de quartier et un frais valide");
      return;
    }
    onSubmit({ name: name.trim(), fee: Math.round(feeNumber) });
    setName("");
    setFee("");
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="min-w-48 flex-1">
        <Label htmlFor="zone-name">Quartier</Label>
        <Input
          id="zone-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Magnambougou"
        />
      </div>
      <div>
        <Label htmlFor="zone-new-fee">Frais (FCFA)</Label>
        <Input
          id="zone-new-fee"
          type="number"
          min={0}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className="w-28"
        />
      </div>
      <Button type="submit" disabled={submitting} className="bg-bronze text-primary-foreground">
        {submitting ? "Ajout…" : "Ajouter la zone"}
      </Button>
    </form>
  );
}

function ExpenseForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (input: {
    category: string;
    label: string;
    amount: number;
    quantity: number | null;
    unit: string | null;
    supplier: string | null;
  }) => void;
  submitting: boolean;
}) {
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [supplier, setSupplier] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const amountNumber = Number(amount);
    if (!label.trim() || !amountNumber || amountNumber <= 0) {
      toast.error("Indique au moins un libellé et un montant valide");
      return;
    }
    onSubmit({
      category,
      label: label.trim(),
      amount: Math.round(amountNumber),
      quantity: quantity ? Number(quantity) : null,
      unit: unit.trim() || null,
      supplier: supplier.trim() || null,
    });
    setLabel("");
    setAmount("");
    setQuantity("");
    setUnit("");
    setSupplier("");
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-6"
    >
      <div className="sm:col-span-2">
        <Label>Catégorie</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="exp-label">Achat</Label>
        <Input
          id="exp-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex. Agneau, 3 sacs de riz…"
        />
      </div>
      <div>
        <Label htmlFor="exp-amount">Montant (FCFA)</Label>
        <Input
          id="exp-amount"
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="exp-qty">Quantité</Label>
        <Input
          id="exp-qty"
          type="number"
          min={0}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="exp-unit">Unité</Label>
        <Input
          id="exp-unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="kg, sac…"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="exp-supplier">Fournisseur</Label>
        <Input
          id="exp-supplier"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Optionnel"
        />
      </div>
      <div className="flex items-end sm:col-span-6">
        <Button
          type="submit"
          disabled={submitting}
          className="bg-bronze text-primary-foreground"
        >
          {submitting ? "Enregistrement…" : "Ajouter la dépense"}
        </Button>
      </div>
    </form>
  );
}
