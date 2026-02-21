import { useCallback, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { streamChat, abortChat } from '../api/chat';
import * as convApi from '../api/conversations';
import type { Message } from '../types';

/** Generate UUID that works on both HTTP and HTTPS. */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useChat() {
  const {
    conversations,
    currentConversationId,
    messages,
    isStreaming,
    streamingContent,
    selectedModel,
    setConversations,
    setCurrentConversation,
    setMessages,
    addMessage,
    setStreaming,
    appendStreamingContent,
    resetStreamingContent,
  } = useChatStore();

  const loadConversations = useCallback(async () => {
    try {
      const data = await convApi.getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [setConversations]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const data = await convApi.getConversation(id);
      setCurrentConversation(id);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  }, [setCurrentConversation, setMessages]);

  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    addMessage(userMessage);
    setStreaming(true);
    resetStreamingContent();

    streamChat(
      content,
      currentConversationId,
      selectedModel,
      (chunk) => {
        // chunk is raw JSON string from SSE data field
        try {
          const parsed = JSON.parse(chunk);
          // Handle metadata events (conversationId from backend)
          if (parsed.metadata?.conversationId) {
            setCurrentConversation(parsed.metadata.conversationId);
            return;
          }
          // Extract delta.content from OpenAI-compatible SSE chunks
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            appendStreamingContent(delta.content);
          }
        } catch {
          // Not valid JSON, append as-is
          appendStreamingContent(chunk);
        }
      },
      () => {
        const finalContent = useChatStore.getState().streamingContent;
        if (finalContent) {
          const assistantMessage: Message = {
            id: generateId(),
            role: 'assistant',
            content: finalContent,
            createdAt: new Date().toISOString(),
          };
          addMessage(assistantMessage);
        }
        resetStreamingContent();
        setStreaming(false);
        loadConversations();
      },
      (error) => {
        console.error('Stream error:', error);
        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: `Error: ${error.message}`,
          createdAt: new Date().toISOString(),
        };
        addMessage(errorMessage);
        resetStreamingContent();
        setStreaming(false);
      }
    );
  }, [
    isStreaming, currentConversationId, selectedModel,
    addMessage, setStreaming, setCurrentConversation, appendStreamingContent, resetStreamingContent, loadConversations,
  ]);

  const stopStreaming = useCallback(() => {
    abortChat();
    resetStreamingContent();
    setStreaming(false);
  }, [resetStreamingContent, setStreaming]);

  const newConversation = useCallback(() => {
    abortChat();
    setCurrentConversation(null);
    setMessages([]);
  }, [setCurrentConversation, setMessages]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await convApi.deleteConversation(id);
      if (currentConversationId === id) {
        newConversation();
      }
      loadConversations();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }, [currentConversationId, newConversation, loadConversations]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return {
    conversations,
    currentConversationId,
    messages,
    isStreaming,
    streamingContent,
    sendMessage,
    stopStreaming,
    loadConversation,
    newConversation,
    deleteConversation,
  };
}
