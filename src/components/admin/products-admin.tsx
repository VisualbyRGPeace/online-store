"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { deleteProduct, listAdminProducts, setProductStatus } from "@/services/admin-catalog-service";
import { getImageUrls } from "@/services/product-service";
import { ProductImage } from "@/components/product-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FormMessage, secondaryButton } from "@/components/ui/form";
import { adminErrorMessage } from "@/utils/errors";
import { formatVnd } from "@/utils/format";

const statusLabel = { draft: "Nháp (ẩn)", active: "Đang bán", archived: "Lưu trữ" } as const;

export function ProductsAdmin() {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const state = useQuery(`admin-products:${page}:${version}`, () => listAdminProducts(page));

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      setError(adminErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sản phẩm</h1>
        <Link href="/admin/products/new/" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700">Thêm sản phẩm</Link>
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}

      {state.status === "loading" && <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.items.length === 0 && (
        <EmptyState title="Chưa có sản phẩm" description="Bấm “Thêm sản phẩm” để bắt đầu." />
      )}
      {state.status === "success" && state.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="p-3 font-medium">Sản phẩm</th>
                  <th className="p-3 font-medium">Giá</th>
                  <th className="p-3 font-medium">Tồn kho</th>
                  <th className="p-3 font-medium">Trạng thái</th>
                  <th className="p-3 font-medium"><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {state.data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
                          <ProductImage src={getImageUrls(p.product_images)[0]} alt="" />
                        </div>
                        <Link href={`/admin/products/edit/?id=${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      </div>
                    </td>
                    <td className="p-3">{formatVnd(p.price)}</td>
                    <td className={`p-3 ${p.stock <= 5 ? "text-amber-700" : ""}`}>{p.stock}</td>
                    <td className="p-3">{statusLabel[p.status]}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-3 whitespace-nowrap">
                        <Link href={`/admin/products/edit/?id=${p.id}`} className="underline">Sửa</Link>
                        <button type="button" className="underline" onClick={() => run(() => setProductStatus(p.id, p.status === "active" ? "draft" : "active"))}>
                          {p.status === "active" ? "Ẩn" : "Hiện"}
                        </button>
                        <button
                          type="button"
                          className="text-red-600 underline"
                          onClick={() => {
                            if (window.confirm(`Xóa sản phẩm “${p.name}”? Đơn hàng cũ vẫn giữ nguyên thông tin đã mua.`)) {
                              void run(() => deleteProduct(p.id));
                            }
                          }}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={state.data.total} pageSize={state.data.pageSize} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-4 text-sm">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={secondaryButton}>← Trước</button>
      <span>Trang {page} / {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={secondaryButton}>Sau →</button>
    </div>
  );
}
