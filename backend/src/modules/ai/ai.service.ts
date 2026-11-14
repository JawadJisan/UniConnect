import type { EventDescriptionDraft, GenerateEventDescriptionInput } from '@uniconnect/shared';
import { aiConfigured, generateText } from '../../lib/gemini.js';
import { logger } from '../../lib/logger.js';
import { notConfigured, unavailable } from '../chatbot/chatbot.service.js';
import { DESCRIPTION_SYSTEM, descriptionPrompt } from '../chatbot/chatbot.prompt.js';

// FR-AI-003 (DECISIONS D44): a 2–3 sentence draft the organizer edits before saving. Reads no
// data and writes nothing: no ChatLog row, no audit row.

export const aiService = {
  async eventDescription(input: GenerateEventDescriptionInput): Promise<EventDescriptionDraft> {
    if (!aiConfigured()) throw notConfigured();
    let text: string;
    try {
      text = await generateText({
        system: DESCRIPTION_SYSTEM,
        prompt: descriptionPrompt(input),
        maxOutputTokens: 300,
        temperature: 0.7,
      });
    } catch (err) {
      logger.error(`event description failed: ${(err as Error).message}`);
      throw unavailable();
    }
    if (!text) throw unavailable();
    return { description: text };
  },
};
