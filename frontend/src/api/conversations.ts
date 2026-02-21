import { apiFetch } from './client';
import type { Conversation } from '../types';

export async function getConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>('/conversations');
}

export async function getConversation(id: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/conversations/${id}`);
}

export async function createConversation(title?: string, model?: string): Promise<Conversation> {
  return apiFetch<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, model }),
  });
}

export async function updateConversation(id: string, title: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  return apiFetch<void>(`/conversations/${id}`, {
    method: 'DELETE',
  });
}
