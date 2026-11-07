/**
 * Tipos de negocio: definen qué íconos se sugieren al crear categorías en el
 * Catálogo. Lo elige el super administrador al configurar la organización.
 * "general" sirve para cualquier negocio y siempre se puede escribir un emoji
 * propio en el formulario de categoría.
 */
export const BUSINESS_TYPES = {
  general: {
    label: "General / otro",
    icons: ["📦", "🛒", "🏷️", "⭐", "🎁", "🧾", "🧴", "🧰", "🪑", "🔌", "📱", "👕"],
  },
  ferreteria: {
    label: "Ferretería",
    icons: ["🛠️", "🔩", "🪛", "🎨", "🧱", "🚰", "💡", "🧰", "🔌", "🪚", "🧯", "📦"],
  },
  petshop: {
    label: "Pet shop / veterinaria",
    icons: ["🐶", "🐱", "🦴", "🐟", "🐦", "🐹", "🐾", "🍖", "🧸", "🛁", "💊", "🦮"],
  },
  panaderia: {
    label: "Panadería / cafetería",
    icons: ["🍞", "🥐", "🧁", "🍰", "🥖", "🍩", "☕", "🥤", "🍪", "🥪", "🍕", "🥛"],
  },
  restaurante: {
    label: "Restaurante / comidas rápidas",
    icons: ["🍔", "🍟", "🌭", "🍕", "🍗", "🥗", "🍝", "🍣", "🥤", "🍺", "🍨", "🍽️"],
  },
  supermercado: {
    label: "Tienda / supermercado",
    icons: ["🥫", "🍎", "🥦", "🥩", "🥛", "🧃", "🍚", "🧼", "🧻", "🍬", "🍪", "🛒"],
  },
  ropa: {
    label: "Ropa y calzado",
    icons: ["👕", "👖", "👗", "🧥", "👟", "👠", "🧢", "🧦", "👜", "🕶️", "🩳", "🎒"],
  },
  farmacia: {
    label: "Farmacia / droguería",
    icons: ["💊", "💉", "🩺", "🩹", "🧴", "🌡️", "🧪", "😷", "🦷", "👶", "🧼", "🌿"],
  },
  papeleria: {
    label: "Papelería / librería",
    icons: ["📚", "✏️", "🖊️", "📒", "📎", "✂️", "🖍️", "📐", "🗂️", "🎒", "🖨️", "🎨"],
  },
  tecnologia: {
    label: "Tecnología / celulares",
    icons: ["📱", "💻", "🎧", "🔌", "🔋", "⌚", "🖥️", "🎮", "📷", "🖱️", "💾", "📡"],
  },
  belleza: {
    label: "Belleza / peluquería",
    icons: ["💄", "💅", "💇", "🧴", "🪮", "🧼", "🌸", "🪞", "🧖", "✂️", "🕯️", "🧽"],
  },
  hogar: {
    label: "Hogar y muebles",
    icons: ["🛋️", "🛏️", "🪑", "🚪", "🪟", "🍳", "🧹", "🧺", "💡", "🖼️", "🪴", "🧊"],
  },
} as const;

export type BusinessTypeKey = keyof typeof BUSINESS_TYPES;

export const BUSINESS_TYPE_KEYS = Object.keys(BUSINESS_TYPES) as BusinessTypeKey[];

export function isBusinessType(value: string): value is BusinessTypeKey {
  return value in BUSINESS_TYPES;
}

export function iconsForBusiness(type: string | null | undefined): readonly string[] {
  return (type && isBusinessType(type) ? BUSINESS_TYPES[type] : BUSINESS_TYPES.general).icons;
}
