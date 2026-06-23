import { client } from './client';
import type { Category } from './types';

export const categoriesApi = {
  list: () => client.get<{ categories: Category[]; total: number }>('/categories'),

  create: (data: { name: string; slug: string; description: string }) =>
    client.post<{ category: Category }>('/admin/categories', data),

  update: (id: number, data: { name: string; slug: string; description: string }) =>
    client.put<{ category: Category }>(`/admin/categories/${id}`, data),

  delete: (id: number) => client.delete<{ message: string }>(`/admin/categories/${id}`),
};
