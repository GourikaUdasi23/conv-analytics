import { Injectable } from '@angular/core';

export interface MessageItem {
  role: 'user' | 'bot';
  text: string;
  createdAt?: { seconds: number } | Date | null;
}

export interface ConversationAnalytics {
  userCount: number;
  botCount: number;
  sentimentScore: number; // -1..1
  topKeywords: string[];
  averageResponseMs?: number;
  tokensUsed?: number;
  userMoodScore?: number; // -1..1, computed from user messages only
  userMoodLabel?: string; // friendly label for dashboard/report
  userMoodEmoji?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  constructor() { }

  analyze(messages: MessageItem[]): ConversationAnalytics {
    const userCount = messages.filter(m => m.role === 'user').length;
    const botCount = messages.filter(m => m.role === 'bot').length;

    const allText = messages.map(m => m.text).join(' ');
    const sentimentScore = this.basicSentiment(allText);
    const topKeywords = this.extractKeywords(messages.map(m => m.text).join(' '));
    const averageResponseMs = this.computeAvgResponse(messages);
    const tokensUsed = this.estimateTokens(messages.map(m => m.text).join(' '));

    // compute mood from user messages only
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.text).join(' ');
    const userMoodScore = userMessages ? this.basicSentiment(userMessages) : 0;
    const userMoodLabel = this.labelForMood(userMoodScore);
    const userMoodEmoji = this.emojiForMood(userMoodScore, userMoodLabel);

    return { userCount, botCount, sentimentScore, topKeywords, averageResponseMs, tokensUsed, userMoodScore, userMoodLabel, userMoodEmoji };
  }

  private labelForMood(score: number): string {
    if (score >= 0.6) return 'very positive';
    if (score >= 0.2) return 'positive';
    if (score > -0.2 && score < 0.2) return 'neutral';
    if (score <= -0.6) return 'very negative';
    return 'negative';
  }

  private emojiForMood(score: number, label?: string): string {
    // prefer label-based mapping for more stable emoji choices
    const key = (label || this.labelForMood(score)).toLowerCase();
    switch (key) {
      case 'very positive': return '😄';
      case 'positive': return '🙂';
      case 'neutral': return '😐';
      case 'negative': return '☹️';
      case 'very negative': return '😡';
      default: return '🤔';
    }
  }

  // Rough token estimate: assume ~0.75 words per token => tokens ~= words * 1.33
  private estimateTokens(text: string): number {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    // keep it conservative and integer
    return Math.max(0, Math.round(words * 1.33));
  }

  private basicSentiment(text: string): number {
  const positive = new Set(['good', 'great', 'awesome', 'love', 'happy', 'thanks', 'nice', 'excellent', 'amazing', 'fantastic', 'working', 'fixed']);
  const negative = new Set(['bad', 'terrible', 'hate', 'sad', 'angry', 'problem', 'awful', 'worst', 'poor', 'broken', 'damage', 'damaged', 'defect', 'defective', 'faulty', 'notworking', 'missing', 'broke', 'cracked', 'scratched', 'malfunction']);
  const negators = new Set(['not', "don't", 'never', "isn't", "aren't", 'no']);
  const words = text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
    let score = 0;
    let sentimentWords = 0;
    // Also handle simple roots and compound phrases
    const textLower = text.toLowerCase();
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const prev = words[i - 1];
      const negated = prev && negators.has(prev);

      // direct match
      if (positive.has(w)) { score += negated ? -1 : 1; sentimentWords++; continue; }
      if (negative.has(w)) { score += negated ? 1 : -1; sentimentWords++; continue; }

      // root / substring matches for variations (e.g., 'damaged', 'damage')
      if (/^damag/.test(w) || /^break/.test(w) || /^defec/.test(w) || /^fault/.test(w) || /^malfunct/.test(w)) {
        score += negated ? 1 : -1; sentimentWords++; continue;
      }

      // short phrase checks (e.g., 'not working') in the raw text
      if (textLower.includes('not working') || textLower.includes("doesn't work") || textLower.includes('did not work')) {
        score -= 1; sentimentWords++; break; // phrase-level detection, count once
      }
    }
    if (sentimentWords === 0) return 0;
    // normalize to -1..1 by dividing by number of sentiment words
    const normalized = score / sentimentWords;
    return Math.max(-1, Math.min(1, normalized));
  }

  private extractKeywords(text: string, limit = 10): string[] {
    const stop = new Set(['the','is','a','an','and','or','to','of','in','for','on','with','you','i','it','this','that','we','our','be','are','was','if','but','so','as','at','by','from']);
    const words = text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
    const counts = new Map<string, number>();

    // unigrams
    for (const w of words) {
      if (stop.has(w) || w.length < 3) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }

    // bigrams (prefer meaningful pairs)
    for (let i = 0; i < words.length - 1; i++) {
      const a = words[i];
      const b = words[i+1];
      if (!a || !b) continue;
      if (stop.has(a) || stop.has(b)) continue;
      const bigram = `${a} ${b}`;
      if (bigram.length < 5) continue;
      counts.set(bigram, (counts.get(bigram) || 0) + 2); // weight bigrams slightly higher
    }

    // rank by score and return top terms
    return [...counts.entries()]
      .sort((a,b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term]) => term);
  }

  private computeAvgResponse(messages: MessageItem[]): number | undefined {
    const items = [...messages].sort((a: any, b: any) => (this.toMs(a.createdAt) - this.toMs(b.createdAt)));
    let total = 0; let count = 0;
    for (let i = 0; i < items.length - 1; i++) {
      if (items[i].role === 'user') {
        for (let j = i + 1; j < items.length; j++) {
          if (items[j].role === 'bot') {
            total += this.toMs(items[j].createdAt) - this.toMs(items[i].createdAt);
            count++;
            break;
          }
        }
      }
    }
    return count ? Math.round(total / count) : undefined;
  }

  private toMs(t: any): number {
    if (!t) return 0;
    if (t instanceof Date) return t.getTime();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
    return Number(t) || 0;
  }
}
