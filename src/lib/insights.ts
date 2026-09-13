import Anthropic from "@anthropic-ai/sdk";
import { getDailyAggregates, getRecentWorkouts, getRecentFasting, saveInsight } from "./queries";

const SYSTEM_PROMPT = `You are a sharp, evidence-based personal health data analyst. The user aggregates data from Apple Health (fed by Garmin, MyFitnessPal, Trainiac and Apple Watch) plus a direct Garmin Connect sync, and wants a coherent daily strategy instead of guesswork about a stalled weight-loss goal.

Given the JSON metrics below (daily rollups for the last few weeks, recent workouts, recent fasting sessions), write a concise daily briefing in markdown:

1. **What's actually happening** - 2-4 sentences on the real trend in weight, energy balance, sleep and recovery, calling out specific numbers and correlations (e.g. "your 3 highest calories-in days each followed under 6h sleep" or "steps drop the day after a logged >2500 kcal day"). Calories in (dietaryEnergyKcal, from MyFitnessPal) and active energy burned are two different things - don't conflate them into a precise net-calorie number since resting/basal burn isn't in this data, but do reason qualitatively about the relationship between logged intake, activity and the weight trend.
2. **Most likely reason weight isn't moving** - your best single hypothesis given the data, stated plainly, not hedged into uselessness.
3. **Today's 1-3 concrete actions** - specific and testable, not generic ("walk 20 more minutes before 6pm" not "be more active").
4. **Data gaps** - name anything you can't assess yet (e.g. no calories logged in MyFitnessPal for several days, no HRV) and the one thing that would fix it.

Be direct and specific. Do not pad with disclaimers or generic wellness advice. If the data genuinely shows nothing actionable, say so rather than inventing a pattern.`;

export interface InsightResult {
  markdown: string;
  model: string;
}

export async function generateDailyInsight(): Promise<InsightResult> {
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 27);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  const dailyAggregates = getDailyAggregates(startDate, endDate);
  const recentWorkouts = getRecentWorkouts(20);
  const recentFasting = getRecentFasting(20);

  const inputSummary = { dailyAggregates, recentWorkouts, recentFasting };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  const client = new Anthropic();

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the last 28 days of aggregated daily metrics, recent workouts and recent fasting sessions as JSON:\n\n${JSON.stringify(
          inputSummary
        )}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  const markdown = textBlock?.text ?? "_No insight generated._";

  saveInsight(endDate, markdown, model, inputSummary);

  return { markdown, model };
}
