import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Items, Product } from '@qabnah/shared';
import { merchantApi } from '../api';
import { useSession } from './session';

/** productId → imageUrl for the active store (order items only carry the product id). */
export function useProductImages() {
  const { merchantId, can } = useSession();
  const q = useQuery({
    queryKey: ['m', 'products', merchantId, '', ''],
    queryFn: () => merchantApi.get<Items<Product>>(`/merchants/${merchantId}/products`),
    enabled: !!merchantId && can('merchant.store:read'),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => new Map((q.data?.items ?? []).map((p) => [p.id, p.imageUrl])), [q.data]);
}
