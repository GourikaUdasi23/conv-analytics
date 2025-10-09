import { Component, inject, signal } from '@angular/core';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { ChatService } from '../../core/chat.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatListModule, MatSidenavModule, MatIconModule, MatChipsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
  ,
  animations: [
    trigger('listAnimation', [
      transition(':enter', []),
      transition('* => *', [
        query('.msg-animate', [ style({ opacity: 0, transform: 'translateY(8px)' }) ], { optional: true }),
        query('.msg-animate', stagger('40ms', [ animate('360ms cubic-bezier(.2,.9,.2,1)', style({ opacity: 1, transform: 'translateY(0)' })) ]), { optional: true })
      ])
    ])
  ]
})
export class ChatComponent {
  public readonly chatService = inject(ChatService);
  conversationId = 'default';
  input = '';
  isSending = false;
  error = '';
  messages = signal<{ role: 'user' | 'bot'; text: string; createdAt?: any }[]>([]);
  conversations = signal<{ id: string; title?: string; lastMessage?: string; updatedAt?: any }[]>([]);

  constructor() {
    // Try to restore last selected conversation from localStorage
    try {
      const stored = localStorage.getItem('lastConversationId');
      if (stored) this.conversationId = stored;
    } catch (e) {
      // ignore storage errors (e.g., SSR or disabled storage)
    }

    // Subscribe to conversations list. When conversations arrive, if the current
    // conversationId is the default or not present in the list, pick the first one.
    this.chatService.getConversations().subscribe(list => {
      const convs = list as any;
      this.conversations.set(convs);

      const exists = convs.some((c: any) => c.id === this.conversationId);
      if (!exists) {
        // If we had a stored id that no longer exists, fall back to first conversation
        if (convs.length > 0) {
          this.selectChat(convs[0].id);
        } else {
          // no conversations yet; keep current id
          this.messages.set([]);
        }
      } else {
        // load messages for the restored conversation
        this.loadMessagesForCurrentConversation();
      }
    });
    // Inform service of restored conversationId (so dashboard can pick it up)
    try { this.chatService.setCurrentConversation(this.conversationId || null); } catch (e) {}
  }

  async send(): Promise<void> {
    if (!this.input?.trim() || this.isSending) return;
    this.isSending = true;
    this.error = '';
    const text = this.input.trim();
    this.input = '';
    try {
      await this.chatService.sendMessage(this.conversationId, text);
    } finally {
      this.isSending = false;
    }
  }

  async newChat(): Promise<void> {
    const id = await this.chatService.createConversation();
    this.conversationId = id;
    this.messages.set([]);
    try { this.chatService.setCurrentConversation(id); } catch (e) {}
  }

  selectChat(id: string): void {
    this.conversationId = id;
    try { this.chatService.setCurrentConversation(id); } catch (e) {}
    this.loadMessagesForCurrentConversation();
  }

  async deleteConversation(id: string): Promise<void> {
    // Confirm deletion
    const ok = confirm('Delete this conversation? This cannot be undone.');
    if (!ok) return;
    try {
      await this.chatService.deleteConversation(id);
      // If the deleted conversation was selected, clear messages and pick first conv
      if (id === this.conversationId) {
        this.messages.set([]);
        try { localStorage.removeItem('lastConversationId'); } catch (e) {}
        const convs = this.conversations();
        if (convs.length > 0) {
          // pick first remaining (if any)
          const first = convs.find(c => c.id !== id);
          if (first) this.selectChat(first.id);
        }
      }
    } catch (e) {
      console.error('Failed to delete conversation', e);
      alert('Could not delete conversation. Try again.');
    }
  }

  private loadMessagesForCurrentConversation(): void {
      this.chatService.getMessages(this.conversationId).subscribe(list => {
      const sorted = [...list].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      this.messages.set(sorted.map(x => ({ role: x.role, text: x.text, createdAt: x.createdAt })) as any);
    });
  }
}
