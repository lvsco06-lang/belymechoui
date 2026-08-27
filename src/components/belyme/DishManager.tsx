// Back-office : création et édition des plats de la carte, avec photo.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MENU_CATEGORIES, formatFCFA, type Dish } from "@/lib/belyme";
import { createDish, deleteDish, updateDish } from "@/lib/dish-admin";

const MAX_IMAGE_MB = 5;

function validateImage(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Le fichier doit être une image.";
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return `Image trop lourde (max ${MAX_IMAGE_MB} Mo).`;
  return null;
}

export function DishManager({ dishes }: { dishes: Dish[] }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(MENU_CATEGORIES[1]);
  const [price, setPrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin-dishes"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    void queryClient.invalidateQueries({ queryKey: ["menu"] });
  }

  function pickFile(selected: File | null) {
    if (!selected) {
      setFile(null);
      setPreview(null);
      return;
    }
    const problem = validateImage(selected);
    if (problem) {
      toast.error(problem);
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  function resetForm() {
    setName("");
    setDescription("");
    setCategory(MENU_CATEGORIES[1]);
    setPrice("");
    setIsActive(true);
    setFile(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const create = useMutation({
    mutationFn: () =>
      createDish(
        {
          name: name.trim(),
          description: description.trim(),
          category,
          price: Number(price) || 0,
          is_active: isActive,
        },
        file,
      ),
    onSuccess: () => {
      toast.success("Plat ajouté à la carte");
      resetForm();
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: ({
      id,
      input,
      image,
    }: {
      id: string;
      input: Partial<Dish> | undefined;
      image: File | undefined;
    }) => updateDish(id, input ?? {}, image ?? null),
    onSuccess: () => {
      toast.success("Plat mis à jour");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDish(id),
    onSuccess: () => {
      toast.success("Plat supprimé");
      refresh();
    },
    onError: () =>
      toast.error(
        "Suppression impossible : ce plat figure déjà dans des commandes. Désactivez-le.",
      ),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Le nom du plat est obligatoire.");
      return;
    }
    if (!Number(price)) {
      toast.error("Indiquez un prix en FCFA.");
      return;
    }
    create.mutate();
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-[200px_1fr]"
      >
        <div>
          <Label className="mb-2 block">Photo du plat</Label>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {preview ? (
              <img src={preview} alt="Aperçu du plat" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-xs">
                <ImagePlus className="h-6 w-6" />
                Ajouter une photo
              </span>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-xs"
              onClick={() => pickFile(null)}
            >
              Retirer la photo
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-sand">Ajouter un plat à la carte</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dish-name">Nom du plat</Label>
              <Input
                id="dish-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Méchoui Royal (part)"
              />
            </div>
            <div>
              <Label htmlFor="dish-price">Prix (FCFA)</Label>
              <Input
                id="dish-price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="9000"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="dish-description">Description</Label>
            <Textarea
              id="dish-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agneau rôti lentement aux braises, épices sahéliennes, pain traditionnel."
              rows={2}
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-48 flex-1">
              <Label>Catégorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MENU_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="dish-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="dish-active" className="text-xs text-muted-foreground">
                Visible sur le site
              </Label>
            </div>
            <Button
              type="submit"
              disabled={create.isPending}
              className="bg-bronze text-primary-foreground"
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ajouter le plat
            </Button>
          </div>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="font-display text-xl text-sand">Carte actuelle ({dishes.length})</h2>
        {dishes.map((dish) => (
          <DishRow
            key={dish.id}
            dish={dish}
            onPatch={(input, image) => patch.mutate({ id: dish.id, input, image })}
            onDelete={() => remove.mutate(dish.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DishRow({
  dish,
  onPatch,
  onDelete,
}: {
  dish: Dish;
  onPatch: (input: Partial<Dish> | undefined, image?: File) => void;
  onDelete: () => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => photoInput.current?.click()}
        title="Changer la photo"
        className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary"
      >
        {dish.image_url ? (
          <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="mx-auto h-5 w-5" />
        )}
      </button>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (!selected) return;
          const problem = validateImage(selected);
          if (problem) {
            toast.error(problem);
            return;
          }
          onPatch(undefined, selected);
        }}
      />

      <div className="min-w-48 flex-1">
        <Input
          defaultValue={dish.name}
          className="border-none bg-transparent px-0 text-sand focus-visible:ring-0"
          onBlur={(e) => e.target.value !== dish.name && onPatch({ name: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {dish.category} · {formatFCFA(dish.price)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Prix</Label>
        <Input
          type="number"
          min={0}
          defaultValue={dish.price}
          className="w-28"
          onBlur={(e) =>
            Number(e.target.value) !== dish.price && onPatch({ price: Number(e.target.value) })
          }
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={dish.is_active}
          onCheckedChange={(checked) => onPatch({ is_active: checked })}
        />
        <Label className="text-xs text-muted-foreground">Visible</Label>
      </div>

      <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Supprimer le plat">
        <Trash2 className="h-4 w-4 text-ember" />
      </Button>
    </div>
  );
}
