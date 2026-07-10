import { useQuery } from '@tanstack/react-query'
import { salesApi } from '../../services/salesApi'

export function useSalesTrend(period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily') {
  return useQuery({
    queryKey: ['sales', 'trend', period],
    queryFn: () => salesApi.getOverview(period),
  })
}

export function useSalesByCategory() {
  return useQuery({ queryKey: ['sales', 'category'], queryFn: salesApi.getByCategory })
}

export function useSalesByPayment() {
  return useQuery({ queryKey: ['sales', 'payment'], queryFn: salesApi.getByPaymentMethod })
}

export function useTopProducts() {
  return useQuery({ queryKey: ['sales', 'topProducts'], queryFn: () => salesApi.getTopProducts(10) })
}
