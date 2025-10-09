import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Firestore, addDoc, collection, collectionData, doc, serverTimestamp, setDoc, query, orderBy, getDocs, writeBatch, deleteDoc } from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly firestore = inject(Firestore);
  private readonly http = inject(HttpClient);
  // Expose the currently selected conversation id so other components (Dashboard) can react
  public readonly currentConversationId = new BehaviorSubject<string | null>(null);

  getMessages(conversationId: string): Observable<any[]> {
    const ref = collection(this.firestore, 'conversations', conversationId, 'messages');
    return collectionData(ref, { idField: 'id' }) as Observable<any[]>;
  }

  getConversations(): Observable<any[]> {
    const ref = collection(this.firestore, 'conversations');
    const q = query(ref, orderBy('updatedAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<any[]>;
  }

  async createConversation(): Promise<string> {
    const ref = collection(this.firestore, 'conversations');
    const created = await addDoc(ref, { title: 'New Chat', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    const id = created.id;
    try { localStorage.setItem('lastConversationId', id); } catch (e) {}
    this.currentConversationId.next(id);
    return id;
  }

  setCurrentConversation(id: string | null): void {
    try { if (id) localStorage.setItem('lastConversationId', id); else localStorage.removeItem('lastConversationId'); } catch (e) {}
    this.currentConversationId.next(id);
  }

  async sendMessage(conversationId: string, text: string): Promise<void> {
    const messagesRef = collection(this.firestore, 'conversations', conversationId, 'messages');
    await addDoc(messagesRef, {
      role: 'user',
      text,
      createdAt: serverTimestamp()
    });
    // If conversation has no title yet, use the first user message (truncated)
    const title = text.length > 40 ? text.slice(0, 40) + '…' : text;
    await setDoc(doc(this.firestore, 'conversations', conversationId), { title, lastMessage: text, updatedAt: serverTimestamp() }, { merge: true });

    let botText = '';
    try {
      const resp = await this.http.post<{ text: string }>(`${environment.apiBase}/api/chat`, { message: text }).toPromise();
      botText = resp?.text || '';
    } catch (e) {
      botText = 'Error: Could not reach the AI service. Is the backend running?';
    }

    await addDoc(messagesRef, {
      role: 'bot',
      text: botText,
      createdAt: serverTimestamp()
    });
    await setDoc(doc(this.firestore, 'conversations', conversationId), { lastMessage: botText, updatedAt: serverTimestamp() }, { merge: true });
  }

  /**
   * Delete a conversation and its messages (client-side batch).
   * Note: firestore doesn't cascade delete subcollections automatically; this
   * deletes messages in a batch and then deletes the conversation doc.
   */
  async deleteConversation(conversationId: string): Promise<void> {
    // Delete messages in batches
    const messagesRef = collection(this.firestore, 'conversations', conversationId, 'messages');
    const snap = await getDocs(messagesRef);
    if (!snap.empty) {
      const batch = writeBatch(this.firestore);
      snap.forEach(d => batch.delete(doc(this.firestore, 'conversations', conversationId, 'messages', d.id)));
      batch.delete(doc(this.firestore, 'conversations', conversationId));
      await batch.commit();
    } else {
      // no messages, just delete conversation doc
      try {
        await deleteDoc(doc(this.firestore, 'conversations', conversationId));
      } catch (e) {
        // best-effort; swallow errors
      }
    }
  }
}
