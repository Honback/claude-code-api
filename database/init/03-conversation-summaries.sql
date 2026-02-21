-- Conversation Summaries table for context management
CREATE TABLE conversation_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    covered_until_message_id UUID NOT NULL REFERENCES messages(id),
    covered_message_count INT NOT NULL DEFAULT 0,
    covered_token_count INT NOT NULL DEFAULT 0,
    summary_version INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conv_summaries_conv_id ON conversation_summaries(conversation_id);
