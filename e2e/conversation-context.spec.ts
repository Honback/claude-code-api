import { test, expect, Page } from '@playwright/test';

/**
 * Conversation Context Memory E2E Test
 *
 * Verifies that Claude remembers previous messages in the same chat room.
 * The context management system should include earlier conversation history
 * in the prompt sent to Claude, so it can reference prior messages.
 */

const RESPONSE_TIMEOUT = 90_000;

/** Type a message and send it, then wait for the assistant to finish responding. */
async function sendMessageAndWaitForResponse(page: Page, message: string) {
  const input = page.getByTestId('chat-input');
  const sendButton = page.getByTestId('send-button');
  const stopButton = page.getByTestId('stop-button');

  // Fill input and send
  await input.fill(message);
  await sendButton.click();

  // Wait for our user message to appear
  const userMessages = page.getByTestId('message-user');
  const lastUserMsg = userMessages.last();
  await expect(lastUserMsg).toContainText(message, { timeout: 5_000 });

  // Wait for streaming to complete:
  // Option A: Stop button appears then disappears
  // Option B: Stop button never appeared (instant error response)
  // We handle both by waiting for the send button to be visible again
  // (During streaming, Stop button replaces Send button entirely)
  try {
    // If stop button appears, wait for it to disappear
    await stopButton.waitFor({ state: 'visible', timeout: 5_000 });
    await stopButton.waitFor({ state: 'hidden', timeout: RESPONSE_TIMEOUT });
  } catch {
    // Stop button may never appear for very fast responses — that's OK
  }

  // Ensure send button is back (streaming is done)
  await expect(sendButton).toBeVisible({ timeout: 10_000 });

  // Small delay for DOM to settle
  await page.waitForTimeout(1_000);

  // Return the last assistant message text
  const assistantMessages = page.getByTestId('message-assistant');
  const count = await assistantMessages.count();
  if (count === 0) return '';
  return (await assistantMessages.last().textContent()) ?? '';
}

/** Get count of assistant messages on page. */
async function getAssistantMessageCount(page: Page): Promise<number> {
  return page.getByTestId('message-assistant').count();
}

test.describe('Conversation Context Memory', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app and start a fresh chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('should remember a unique keyword from a previous message', async ({ page }) => {
    // Use a random keyword that Claude wouldn't know otherwise
    const uniqueKeyword = `Zypherix${Date.now()}`;

    // Step 1: Send a message with the unique keyword
    await sendMessageAndWaitForResponse(
      page,
      `Remember this keyword: "${uniqueKeyword}". This is very important. Just acknowledge you received it.`
    );

    // Verify we got a response
    const count1 = await getAssistantMessageCount(page);
    expect(count1).toBe(1);

    // Step 2: Ask Claude to recall the keyword WITHOUT mentioning it
    const response = await sendMessageAndWaitForResponse(
      page,
      'What was the keyword I told you to remember in my previous message? Please repeat it exactly.'
    );

    // Step 3: Verify Claude's response contains the keyword
    const count2 = await getAssistantMessageCount(page);
    expect(count2).toBe(2);

    expect(response.toLowerCase()).toContain(uniqueKeyword.toLowerCase());
  });

  test('should maintain context across 3+ messages', async ({ page }) => {
    // Step 1: Introduce a topic
    await sendMessageAndWaitForResponse(
      page,
      'I am building a project called "MoonbaseAlpha". It is a space station management simulator. Just confirm you understand.'
    );

    // Step 2: Add more context
    await sendMessageAndWaitForResponse(
      page,
      'The main feature of MoonbaseAlpha is oxygen recycling. The target platform is WebGL. Confirm you got it.'
    );

    // Step 3: Ask about earlier context
    const response = await sendMessageAndWaitForResponse(
      page,
      'What is the name of my project and what is its main feature? Answer briefly.'
    );

    // Verify both pieces of information are remembered
    const lower = response.toLowerCase();
    expect(lower).toContain('moonbasealpha');
    expect(lower).toContain('oxygen');
  });
});
