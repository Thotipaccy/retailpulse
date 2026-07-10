import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../services/dashboardApi'
import { salesApi } from '../../services/salesApi'

export function useDashboardKPIs() {
  return useQuery({ queryKey: ['dashboard', 'kpis'], queryFn: () => dashboardApi.getSummary() })
}

export function useSalesTrend() {
  return useQuery({ queryKey: ['dashboard', 'salesTrend'], queryFn: () => salesApi.getOverview('daily') })
}

export function useTopCategories() {
  return useQuery({ queryKey: ['dashboard', 'topCategories'], queryFn: () => salesApi.getByCategory() })
}

export function useRecentTransactions() {
  return useQuery({ queryKey: ['dashboard', 'transactions'], queryFn: dashboardApi.getRecentTransactions })
}
