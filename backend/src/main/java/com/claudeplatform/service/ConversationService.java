package com.claudeplatform.service;

import com.claudeplatform.exception.ForbiddenException;
import com.claudeplatform.exception.NotFoundException;
import com.claudeplatform.model.dto.ConversationDto;
import com.claudeplatform.model.entity.Conversation;
import com.claudeplatform.model.entity.Message;
import com.claudeplatform.repository.ConversationRepository;
import com.claudeplatform.repository.ConversationSummaryRepository;
import com.claudeplatform.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ConversationSummaryRepository summaryRepository;

    public List<ConversationDto> getUserConversations(UUID userId) {
        return conversationRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                .stream()
                .map(c -> ConversationDto.builder()
                        .id(c.getId())
                        .title(c.getTitle())
                        .model(c.getModel())
                        .createdAt(c.getCreatedAt())
                        .updatedAt(c.getUpdatedAt())
                        .hasSummary(summaryRepository
                                .findTopByConversationIdAndStatusOrderBySummaryVersionDesc(
                                        c.getId(), "COMPLETED")
                                .isPresent())
                        .totalTokens(messageRepository.sumTokenCount(c.getId()))
                        .build())
                .toList();
    }

    public ConversationDto getConversation(UUID conversationId, UUID userId) {
        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new NotFoundException("Conversation not found"));

        if (!conversation.getUserId().equals(userId)) {
            throw new ForbiddenException("Access denied");
        }

        List<ConversationDto.MessageDto> messages = messageRepository
                .findByConversationIdOrderByCreatedAtAsc(conversationId)
                .stream()
                .map(m -> ConversationDto.MessageDto.builder()
                        .id(m.getId())
                        .role(m.getRole())
                        .content(m.getContent())
                        .tokenCount(m.getTokenCount())
                        .createdAt(m.getCreatedAt())
                        .build())
                .toList();

        return ConversationDto.builder()
                .id(conversation.getId())
                .title(conversation.getTitle())
                .model(conversation.getModel())
                .createdAt(conversation.getCreatedAt())
                .updatedAt(conversation.getUpdatedAt())
                .messages(messages)
                .totalTokens(messageRepository.sumTokenCount(conversationId))
                .build();
    }

    public ConversationDto createConversation(UUID userId, String title, String model) {
        Conversation conversation = Conversation.builder()
                .userId(userId)
                .title(title != null ? title : "New Conversation")
                .model(model != null ? model : "claude-haiku-4-5-20251001")
                .build();

        conversation = conversationRepository.save(conversation);

        return ConversationDto.builder()
                .id(conversation.getId())
                .title(conversation.getTitle())
                .model(conversation.getModel())
                .createdAt(conversation.getCreatedAt())
                .updatedAt(conversation.getUpdatedAt())
                .build();
    }

    @Transactional
    public ConversationDto updateConversation(UUID conversationId, UUID userId, String title) {
        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new NotFoundException("Conversation not found"));

        if (!conversation.getUserId().equals(userId)) {
            throw new ForbiddenException("Access denied");
        }

        if (title != null) {
            conversation.setTitle(title);
        }

        conversation = conversationRepository.save(conversation);

        return ConversationDto.builder()
                .id(conversation.getId())
                .title(conversation.getTitle())
                .model(conversation.getModel())
                .createdAt(conversation.getCreatedAt())
                .updatedAt(conversation.getUpdatedAt())
                .build();
    }

    @Transactional
    public void deleteConversation(UUID conversationId, UUID userId) {
        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new NotFoundException("Conversation not found"));

        if (!conversation.getUserId().equals(userId)) {
            throw new ForbiddenException("Access denied");
        }

        conversationRepository.delete(conversation);
    }

    public Message saveMessage(UUID conversationId, String role, String content) {
        Message message = Message.builder()
                .conversationId(conversationId)
                .role(role)
                .content(content)
                .tokenCount(estimateTokens(content))
                .build();
        return messageRepository.save(message);
    }

    private int estimateTokens(String text) {
        // Rough estimation: ~4 chars per token
        return text != null ? text.length() / 4 : 0;
    }
}
