import type { Product, ProductSize } from "./types";

function tier(
  personal: number,
  pequena: number,
  mediana: number,
  grande: number,
  familiar: number,
): ProductSize[] {
  return [
    { size: "personal", price_cents: personal },
    { size: "pequena", price_cents: pequena },
    { size: "mediana", price_cents: mediana },
    { size: "grande", price_cents: grande },
    { size: "familiar", price_cents: familiar },
  ];
}

const TIER_1 = tier(22_000, 33_000, 42_000, 51_000, 63_000);
const TIER_2 = tier(23_000, 34_000, 44_000, 53_000, 65_000);
const TIER_3 = tier(23_000, 35_000, 45_000, 56_000, 68_000);
const TIER_4 = tier(24_000, 36_000, 47_000, 58_000, 70_000);
const TIER_5 = tier(34_000, 47_000, 60_000, 72_000, 93_000);

function pizza(
  slug: string,
  name: string,
  description: string,
  prices: ProductSize[],
): Product {
  return {
    id: `demo-product-${slug}`,
    name,
    category: "pizza",
    description,
    image_url: null,
    max_flavors: 2,
    min_size_for_multiflavor: "pequena",
    active: true,
    sizes: prices.map((p) => ({ ...p })),
  };
}

// Mutable on purpose: demo actions mutan este array para que el CRUD se sienta
// real en dev (ver actions.ts branches de isDemoMode). En prod la fuente de
// verdad es Supabase.
export const DEMO_PRODUCTS: Product[] = [
  // Tier 1 — 22/33/42/51/63
  pizza("hawaiana", "Hawaiana", "Piña, jamón y queso.", TIER_1),
  pizza("jamon-queso", "Jamón y Queso", "Jamón y queso.", TIER_1),
  pizza(
    "vegetariana",
    "Vegetariana",
    "Champiñones, cebolla, pimentón, tomate, especias y queso.",
    TIER_1,
  ),
  pizza(
    "napolitana",
    "Napolitana",
    "Salsa napolitana, tomate, especias y queso.",
    TIER_1,
  ),
  pizza(
    "california-style",
    "California Style",
    "Champiñones, tomate en cuadros, aceitunas, pimentón, albahaca y queso.",
    TIER_1,
  ),
  pizza(
    "aborrajada",
    "Aborrajada",
    "Plátano maduro, bocadillo y queso.",
    TIER_1,
  ),
  pizza("salami", "Salami", "Salami, jamón y queso.", TIER_1),
  pizza("bocadillo", "Bocadillo", "Queso y bocadillo.", TIER_1),
  pizza(
    "florentina",
    "Florentina",
    "Champiñón, tomate, cebolla, jamón y queso.",
    TIER_1,
  ),

  // Tier 2 — 23/34/44/53/65
  pizza("peperoni", "Peperoni", "Peperoni y queso.", TIER_2),
  pizza(
    "ranchera",
    "Ranchera",
    "Jamón, salchicha, tocineta y queso.",
    TIER_2,
  ),
  pizza(
    "paizeta",
    "Paizeta",
    "Jamón, maíz, tocineta, guacamole y queso.",
    TIER_2,
  ),
  pizza("vaticana", "Vaticana", "Tocineta, maíz, tomate y queso.", TIER_2),
  pizza(
    "genovesa",
    "Genovesa",
    "Tocineta, aceitunas, champiñón, tomate y queso.",
    TIER_2,
  ),
  pizza(
    "pepernata",
    "Pepernata",
    "Peperoni, aceitunas, tomate, cebolla, albahaca, pimentón y queso.",
    TIER_2,
  ),
  pizza(
    "bacon-peperoni",
    "Bacon Peperoni",
    "Peperoni, tocineta, cebolla y queso.",
    TIER_2,
  ),
  pizza(
    "mexicana",
    "Mexicana",
    "Carne, cebolla, jalapeños, tomate, guacamole, pimentón y queso.",
    TIER_2,
  ),
  pizza(
    "jalisco",
    "Jalisco",
    "Chorizo, maíz, guacamole, tomate, cebolla, albahaca, jalapeño, pimentón y queso.",
    TIER_2,
  ),
  pizza(
    "pollo-champinon",
    "Pollo Champiñón",
    "Pollo, champiñones y queso.",
    TIER_2,
  ),

  // Tier 3 — 23/35/45/56/68
  pizza("pollo-maiz", "Pollo Maíz", "Pollo, maíz y queso.", TIER_3),
  pizza("pollo-jamon", "Pollo Jamón", "Pollo, jamón y queso.", TIER_3),
  pizza(
    "pollo-tocineta",
    "Pollo Tocineta",
    "Pollo, tocineta y queso.",
    TIER_3,
  ),
  pizza("pollo-bbq", "Pollo BBQ", "Pollo, salsa BBQ, cebolla y queso.", TIER_3),
  pizza(
    "pollo-miel-mostaza",
    "Pollo Miel Mostaza",
    "Pollo, salsa miel mostaza, tocineta y queso.",
    TIER_3,
  ),
  pizza(
    "4-quesos",
    "4 Quesos",
    "Queso mozzarella, queso crema, queso americano y queso parmesano.",
    TIER_3,
  ),
  pizza(
    "costilla",
    "Costilla",
    "Costilla en salsa BBQ, plátano maduro, cebolla puerro y queso.",
    TIER_3,
  ),
  pizza(
    "carnes",
    "Carnes",
    "Carne desmechada en reducción de panela, jamón, cebolla puerro, pimentón y queso.",
    TIER_3,
  ),

  // Tier 4 — 24/36/47/58/70
  pizza(
    "filadelfia",
    "Filadelfia",
    "Pollo, tocineta, maíz tierno, cebolla, aceitunas y queso.",
    TIER_4,
  ),
  pizza(
    "paisa",
    "Paisa",
    "Tocineta, chorizo especial porcionado, maíz tierno, plátano maduro, guacamole y queso.",
    TIER_4,
  ),
  pizza(
    "california",
    "California",
    "Carne molida, chorizo especial, cebolla, pimentón y queso.",
    TIER_4,
  ),
  pizza(
    "especial-carnes",
    "Especial Carnes",
    "Pollo, jamón, chorizo, tocineta y queso.",
    TIER_4,
  ),
  pizza(
    "especial-family",
    "Especial Family",
    "Tomate, cebolla, peperoni, tocineta, chorizo y queso.",
    TIER_4,
  ),

  // Tier 5 — 34/47/60/72/93 (camarones)
  pizza(
    "marinera",
    "Marinera",
    "Camarones, cebolla, tomate en cuadros y queso.",
    TIER_5,
  ),
];
