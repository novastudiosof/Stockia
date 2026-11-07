"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PageResult } from "@/lib/actions/informes";

export interface PreviewColumn<Row> {
  header: string;
  cell: (row: Row) => React.ReactNode;
  className?: string;
}

interface ReportPreviewDialogProps<Row> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Cambia cada vez que cambian los filtros: reinicia la lista. */
  resetKey: string;
  loadPage: (cursor: string | null) => Promise<PageResult<Row>>;
  columns: PreviewColumn<Row>[];
  rowKey: (row: Row) => string;
  /** Botones de cada fila (por ejemplo reenviar la factura). */
  renderActions?: (row: Row) => React.ReactNode;
  /** Si se define, cada fila se puede expandir para ver su detalle. */
  renderExpanded?: (row: Row) => React.ReactNode;
  rowClassName?: (row: Row) => string | undefined;
  /** Contenido extra bajo la tabla (por ejemplo un botón de exportar). */
  footer?: React.ReactNode;
}

/**
 * Vista previa paginada de un informe. Carga solo la primera página al abrir y
 * las demás bajo demanda ("Cargar más"), con cursor, para que funcione igual
 * de rápido con una base de datos enorme.
 */
export function ReportPreviewDialog<Row>({
  open,
  onOpenChange,
  title,
  description,
  resetKey,
  loadPage,
  columns,
  rowKey,
  renderActions,
  renderExpanded,
  rowClassName,
  footer,
}: ReportPreviewDialogProps<Row>) {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  // Evita que una respuesta lenta de filtros viejos pise a la más reciente.
  const requestId = React.useRef(0);
  const loadPageRef = React.useRef(loadPage);
  React.useEffect(() => {
    loadPageRef.current = loadPage;
  });

  const fetchPage = React.useCallback(async (cursor: string | null) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loadPageRef.current(cursor);
      if (id !== requestId.current) return;
      if (result.error) {
        setError(result.error);
        return;
      }
      setRows((prev) => (cursor ? [...prev, ...result.rows] : result.rows));
      setNextCursor(result.nextCursor);
      if (result.total !== undefined) setTotal(result.total);
    } catch {
      if (id === requestId.current) setError("No se pudo cargar la información");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setRows([]);
    setNextCursor(null);
    setTotal(null);
    setExpanded(null);
    void fetchPage(null);
  }, [open, resetKey, fetchPage]);

  const hasActions = Boolean(renderActions || renderExpanded);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-xs text-brand-muted">
            {total === null
              ? loading
                ? "Cargando..."
                : ""
              : `Mostrando ${rows.length} de ${total} registro${total === 1 ? "" : "s"}`}
          </p>

          {error && <p className="text-sm text-brand-danger">{error}</p>}

          {!error && !loading && rows.length === 0 && total !== null && (
            <p className="rounded-[var(--radius-brand-sm)] border border-brand-border p-6 text-center text-sm text-brand-muted">
              No hay registros para esos filtros.
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-[var(--radius-brand-sm)] border border-brand-border">
              <table className="table-stack w-full min-w-[640px] text-sm">
                <thead className="bg-black/5 text-left text-xs text-brand-muted">
                  <tr>
                    {columns.map((column) => (
                      <th key={column.header} className={`p-2.5 font-medium ${column.className ?? ""}`}>
                        {column.header}
                      </th>
                    ))}
                    {hasActions && <th className="p-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {rows.map((row) => {
                    const key = rowKey(row);
                    const isOpen = expanded === key;
                    return (
                      <React.Fragment key={key}>
                        <tr className={rowClassName?.(row)}>
                          {columns.map((column) => (
                            <td
                              key={column.header}
                              data-label={column.header}
                              className={`p-2.5 ${column.className ?? ""}`}
                            >
                              {column.cell(row)}
                            </td>
                          ))}
                          {hasActions && (
                            <td data-label="" className="p-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {renderExpanded && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpanded(isOpen ? null : key)}
                                    aria-expanded={isOpen}
                                  >
                                    {isOpen ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                    Detalle
                                  </Button>
                                )}
                                {renderActions?.(row)}
                              </div>
                            </td>
                          )}
                        </tr>
                        {renderExpanded && isOpen && (
                          <tr>
                            <td colSpan={columns.length + 1} className="bg-black/[0.03] p-3">
                              {renderExpanded(row)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {nextCursor ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchPage(nextCursor)}
                disabled={loading}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Cargar más
              </Button>
            ) : (
              loading && <Loader2 className="h-4 w-4 animate-spin text-brand-muted" />
            )}
            {footer}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
