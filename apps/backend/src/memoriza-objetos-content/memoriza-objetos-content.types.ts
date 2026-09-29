// Entrada del banco curado — palabra + imagen ya resueltas, sin nada que
// buscar en runtime (ver memoriza-objetos-content/analysis.md, "Decisión:
// banco curado, imágenes ya resueltas").
export interface MemorizaObjetosBankEntry {
  id: string;
  palabra: string;
  imagenUrl: string;
}

export const OBJECTS_PER_MATCH = 20;
export const MAX_OBJECTS_PER_REQUEST = 60;
