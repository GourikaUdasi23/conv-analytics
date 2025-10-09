import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import type { Chart, ChartConfiguration } from 'chart.js';
import { AnalyticsService, ConversationAnalytics, MessageItem } from '../../core/analytics.service';
import { ChatService } from '../../core/chat.service';

// Chart.js will be dynamically imported in renderCharts() to keep it out of the initial bundle

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatChipsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly chatService = inject(ChatService);
  private readonly analytics = inject(AnalyticsService);
  conversationId = 'default';

  messages = signal<MessageItem[]>([]);
  summary = computed<ConversationAnalytics>(() => this.analytics.analyze(this.messages()));

  constructor() {
    // react to current conversation selected in chat
    this.chatService.currentConversationId.subscribe(id => {
      const cid = id || this.conversationId;
      this.conversationId = cid || 'default';
      this.chatService.getMessages(this.conversationId).subscribe(list => {
        const sorted = [...list].sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        this.messages.set(sorted as MessageItem[]);
        // DEBUG: log messages + computed summary to help diagnose sentiment=0
        try {
          console.debug('Dashboard: messages updated', this.messages());
          console.debug('Dashboard: computed summary', this.summary());
        } catch (e) {}
        this.renderCharts();
      });
    });
  }

  private chartRef: any = null;

  private async renderCharts(): Promise<void> {
    const ctx = document.getElementById('msgChart') as HTMLCanvasElement | null;
    if (!ctx) return;
    const data = this.messages();
    const user = data.filter(d => d.role === 'user').length;
    const bot = data.filter(d => d.role === 'bot').length;

    // dynamic import of chart.js and registerables
    const chartModule = await import('chart.js');
    const ChartLib = chartModule.Chart || (chartModule as any).default || chartModule;
    const registerables = chartModule.registerables || (chartModule as any).registerables || [];
    try { ChartLib.register(...registerables); } catch (e) { /* ignore if already registered */ }

    const config: ChartConfiguration<'doughnut', number[], string> = {
      type: 'doughnut',
      data: {
        labels: ['User', 'Bot'],
        datasets: [{ data: [user, bot], backgroundColor: ['#42a5f5', '#66bb6a'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    };

    // destroy previous chart if exists
    try { this.chartRef?.destroy(); } catch (e) {}
    this.chartRef = new ChartLib(ctx, config);
  }

  async downloadPdf(): Promise<void> {
    // Lazy-load jspdf and autotable to keep them out of the initial bundle
    const [{ default: jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ] as any);

    const pdf: any = new jsPDF();
    const s = this.summary();
    pdf.setFontSize(16);
    pdf.text('Conversation Analytics Report', 14, 16);
    pdf.setFontSize(11);
    pdf.text(`User messages: ${s.userCount}`, 14, 26);
    pdf.text(`Bot messages: ${s.botCount}`, 14, 32);
    pdf.text(`Sentiment: ${s.sentimentScore.toFixed(2)}`, 14, 38);
  if (s.userMoodLabel) pdf.text(`User mood: ${s.userMoodEmoji || ''} ${s.userMoodLabel} (${(s.userMoodScore || 0).toFixed(2)})`, 14, 44);
  if (s.averageResponseMs) pdf.text(`Avg response: ${s.averageResponseMs} ms`, 14, 50);
  if (s.tokensUsed !== undefined) pdf.text(`Estimated tokens: ${s.tokensUsed}`, 14, 56);

    const autoTable = (autoTableModule && autoTableModule.default) || (autoTableModule && (autoTableModule as any));
    const tableStart = 66;
    autoTable(pdf, {
      startY: tableStart,
      head: [['Role', 'Message']],
      body: this.messages().map(m => [m.role, m.text])
    });
    pdf.save('conversation-report.pdf');
  }
}
