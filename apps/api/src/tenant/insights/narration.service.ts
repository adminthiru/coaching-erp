import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { loadEnv } from '../../common/config/env';

/**
 * Spec §§69–71 — the only place in this product that calls an LLM.
 *
 * The division of labour is deliberate and load-bearing: **every number is
 * computed from the database by `InsightsService`; Claude only writes the
 * sentence about them.** A model asked to calculate "attendance is 68%" can be
 * wrong in a way nobody catches, and §71 is explicit that AI output is
 * advisory. So the model receives findings that are already true and is asked
 * to explain what they suggest — never to derive them.
 *
 * Narration is optional. With no `ANTHROPIC_API_KEY` the insight endpoints
 * still return their findings; `narrative` is simply null, with a reason. The
 * product degrades to "no prose", not to "no insights" and never to invented
 * ones.
 */
@Injectable()
export class NarrationService {
  private readonly logger = new Logger(NarrationService.name);
  private readonly env = loadEnv();
  private readonly client = this.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY })
    : null;

  get enabled() {
    return this.client !== null;
  }

  /**
   * Turns a set of already-computed findings into a short written summary.
   *
   * Returns `null` rather than throwing: an insight page must still render its
   * findings when the model is unreachable, rate-limited or unconfigured. A
   * failed narration is a missing paragraph, not a failed request.
   */
  async narrate(input: {
    subject: string;
    audience: 'student' | 'batch' | 'organization';
    findings: unknown;
  }): Promise<{ text: string; model: string } | null> {
    if (!this.client) return null;

    const guidance: Record<typeof input.audience, string> = {
      student: 'You are writing for a teacher about one student. Be specific and practical about what to do next.',
      batch: 'You are writing for a branch head about one batch. Focus on what the batch as a whole needs.',
      organization: 'You are writing for an organization owner comparing branches. Be even-handed; do not single out staff.',
    };

    const system = [
      'You write short advisory notes for staff at an Indian NEET/JEE coaching centre.',
      guidance[input.audience],
      '',
      'The findings you are given are already computed from the database and are correct.',
      'Rules:',
      '- Never state a number that is not in the findings, and never recompute one.',
      '- Explain what the findings suggest and what to do about it.',
      '- 2 to 4 sentences. Plain British English. No headings, no bullet points, no preamble.',
      '- If the findings are thin or unremarkable, say so plainly rather than inventing concern.',
    ].join('\n');

    try {
      const response = await this.client.messages.create({
        model: this.env.ANTHROPIC_MODEL,
        max_tokens: 1000,
        // Adaptive thinking with low effort: this is a short writing task, and
        // the analysis it would otherwise redo has already been done in SQL.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        system,
        messages: [
          {
            role: 'user',
            content: `Findings about ${input.subject}:\n\n${JSON.stringify(input.findings, null, 2)}`,
          },
        ],
      });

      // A safety decline is a 200 with stop_reason "refusal" — content is not
      // the thing to read in that case.
      if (response.stop_reason === 'refusal') {
        this.logger.warn(`Narration declined for ${input.audience}: ${response.stop_details?.category ?? 'unknown'}`);
        return null;
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      return text ? { text, model: response.model } : null;
    } catch (err) {
      // Never surface an LLM outage as a failed insight request.
      if (err instanceof Anthropic.RateLimitError) {
        this.logger.warn('Narration rate-limited; returning findings without prose.');
      } else if (err instanceof Anthropic.APIError) {
        this.logger.warn(`Narration unavailable (${err.status}): ${err.message}`);
      } else {
        this.logger.warn(`Narration failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return null;
    }
  }
}
