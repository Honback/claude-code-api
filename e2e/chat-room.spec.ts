import { test, expect, Page } from '@playwright/test';

/**
 * Chat Room E2E Test
 *
 * Tests the chat input, message display, streaming, sidebar,
 * and token count functionality.
 */

const RESPONSE_TIMEOUT = 90_000;

async function sendMessageAndWaitForResponse(page: Page, message: string) {
  const input = page.getByTestId('chat-input');
  const sendButton = page.getByTestId('send-button');
  const stopButton = page.getByTestId('stop-button');

  await input.fill(message);
  await sendButton.click();

  // Wait for user message to appear
  const userMessages = page.getByTestId('message-user');
  await expect(userMessages.last()).toContainText(message, { timeout: 5_000 });

  // Wait for streaming to complete
  try {
    await stopButton.waitFor({ state: 'visible', timeout: 5_000 });
    await stopButton.waitFor({ state: 'hidden', timeout: RESPONSE_TIMEOUT });
  } catch {
    // Fast response - stop button may never appear
  }

  await expect(sendButton).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1_000);

  const assistantMessages = page.getByTestId('message-assistant');
  const count = await assistantMessages.count();
  if (count === 0) return '';
  return (await assistantMessages.last().textContent()) ?? '';
}

test.describe('Chat Room', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('1. Page loads with empty state', async ({ page }) => {
    // Empty state text should be visible
    await expect(page.getByText('Send a message to start a conversation')).toBeVisible();

    // Input should be enabled
    const input = page.getByTestId('chat-input');
    await expect(input).toBeEnabled();

    // Send button should be visible
    const sendButton = page.getByTestId('send-button');
    await expect(sendButton).toBeVisible();
  });

  test('2. Can type in chat input', async ({ page }) => {
    const input = page.getByTestId('chat-input');

    // Type a message
    await input.fill('Hello, this is a test message');
    await expect(input).toHaveValue('Hello, this is a test message');

    // Clear and type again
    await input.fill('');
    await expect(input).toHaveValue('');

    await input.fill('Second test message');
    await expect(input).toHaveValue('Second test message');
  });

  test('3. Send button disabled when input is empty', async ({ page }) => {
    const sendButton = page.getByTestId('send-button');

    // Empty input -> button disabled
    await expect(sendButton).toBeDisabled();

    // Type something -> button enabled
    const input = page.getByTestId('chat-input');
    await input.fill('test');
    await expect(sendButton).toBeEnabled();

    // Clear -> button disabled again
    await input.fill('');
    await expect(sendButton).toBeDisabled();
  });

  test('4. Send message and receive response', async ({ page }) => {
    const response = await sendMessageAndWaitForResponse(
      page,
      'Say exactly "PONG" and nothing else.'
    );

    // User message should be visible
    const userMessages = page.getByTestId('message-user');
    expect(await userMessages.count()).toBe(1);

    // Assistant response should exist
    const assistantMessages = page.getByTestId('message-assistant');
    expect(await assistantMessages.count()).toBe(1);
    expect(response.length).toBeGreaterThan(0);
  });

  test('5. Input re-enables after response completes', async ({ page }) => {
    const input = page.getByTestId('chat-input');

    await sendMessageAndWaitForResponse(page, 'Reply with "OK"');

    // Input should be enabled again after streaming completes
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('');

    // Should be able to type a new message
    await input.fill('Follow-up message');
    await expect(input).toHaveValue('Follow-up message');
  });

  test('6. New conversation appears in sidebar', async ({ page }) => {
    // Get sidebar conversation count before
    const sidebar = page.locator('aside');
    const initialItems = await sidebar.locator('[class*="cursor-pointer"]').count();

    await sendMessageAndWaitForResponse(page, 'Hello for sidebar test');

    // After sending a message, sidebar should have a new conversation
    await page.waitForTimeout(2_000); // Wait for sidebar refresh
    const updatedItems = await sidebar.locator('[class*="cursor-pointer"]').count();
    expect(updatedItems).toBeGreaterThanOrEqual(initialItems + 1);
  });

  test('7. Token count displays in sidebar after message', async ({ page }) => {
    await sendMessageAndWaitForResponse(page, 'Token count test message');

    // Wait for sidebar to refresh with token count
    await page.waitForTimeout(2_000);

    // The sidebar should show a token count (e.g., "1.2k" or "500")
    const sidebar = page.locator('aside');
    const tokenBadges = sidebar.locator('span.text-xs.text-gray-500');
    const count = await tokenBadges.count();

    // At least one conversation should have a token count
    expect(count).toBeGreaterThan(0);
  });

  test('8. Multiple messages in same conversation', async ({ page }) => {
    await sendMessageAndWaitForResponse(page, 'First message');
    await sendMessageAndWaitForResponse(page, 'Second message');

    const userMessages = page.getByTestId('message-user');
    const assistantMessages = page.getByTestId('message-assistant');

    expect(await userMessages.count()).toBe(2);
    expect(await assistantMessages.count()).toBe(2);
  });

  test('9. Enter key sends message, Shift+Enter adds newline', async ({ page }) => {
    const input = page.getByTestId('chat-input');

    // Shift+Enter should add newline, not send
    await input.fill('Line 1');
    await input.press('Shift+Enter');
    // Input should still have content (not sent)
    const valueAfterShiftEnter = await input.inputValue();
    expect(valueAfterShiftEnter).toContain('Line 1');

    // Clear and test Enter sends
    await input.fill('Reply with OK');
    await input.press('Enter');

    // Message should be sent (input cleared)
    await expect(input).toHaveValue('', { timeout: 5_000 });

    // User message should appear
    const userMessages = page.getByTestId('message-user');
    await expect(userMessages.last()).toContainText('Reply with OK', { timeout: 5_000 });
  });

  test('10. New Chat button resets conversation', async ({ page }) => {
    // Send a message first
    await sendMessageAndWaitForResponse(page, 'Message before reset');

    // Click New Chat button
    const newChatButton = page.getByRole('button', { name: /New Chat/i });
    await newChatButton.click();

    // Messages should be cleared
    await page.waitForTimeout(500);
    const messageList = page.getByTestId('message-list');
    const messages = messageList.locator('[data-testid^="message-"]');
    expect(await messages.count()).toBe(0);

    // Empty state should show again
    await expect(page.getByText('Send a message to start a conversation')).toBeVisible();
  });
});
