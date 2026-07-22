'use client';

import React, { useState, useRef, useEffect } from 'react';
import { sendMessage } from '@/lib/actions/communications';
import type { Event } from '@/lib/types/engine';
import { Send } from 'lucide-react';

interface MessageThreadProps {
  organizationId: string;
  entityType: string;
  entityId: string;
  currentUserId: string;
  initialMessages: Event[];
}

export function MessageThread({
  organizationId,
  entityType,
  entityId,
  currentUserId,
  initialMessages
}: MessageThreadProps) {
  const [messages, setMessages] = useState<Event[]>(initialMessages);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setIsSending(true);
    try {
      // Optimistic update
      const tempId = `temp-${Date.now()}`;
      const tempMessage: any = {
        id: tempId,
        organization_id: organizationId,
        entity_type: entityType,
        entity_id: entityId,
        action: 'message_sent',
        actor_id: currentUserId,
        payload: { text: inputText, senderRole: 'studio' },
        created_at: new Date().toISOString(),
        person: { display_name: 'You' }
      };

      setMessages((prev) => [...prev, tempMessage]);
      setInputText('');

      await sendMessage({
        organizationId,
        entityType,
        entityId,
        actorId: currentUserId,
        text: tempMessage.payload.text,
        senderRole: 'studio'
      });
      // In a real app we might fetch the latest messages here or rely on the server action revalidation
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="q-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '500px' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--q-color-ink-100)', fontWeight: 600 }}>
        Communications
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--q-color-ink-500)', textAlign: 'center', margin: 'auto' }}>
            No messages yet. Start the conversation.
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.actor_id === currentUserId || !msg.actor_id; // Simple fallback
            const payload = msg.payload as any;
            
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', marginBottom: '4px', padding: '0 4px' }}>
                  {(msg as any).person?.display_name || 'System'} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{
                  background: isMe ? 'var(--q-color-primary)' : 'var(--q-color-paper-subtle)',
                  color: isMe ? 'white' : 'var(--q-color-ink-900)',
                  padding: '12px 16px',
                  borderRadius: '16px',
                  borderBottomRightRadius: isMe ? '4px' : '16px',
                  borderBottomLeftRadius: isMe ? '16px' : '4px',
                  maxWidth: '85%',
                  lineHeight: 1.5,
                  fontSize: '0.9375rem'
                }}>
                  {payload?.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid var(--q-color-ink-100)' }}>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            disabled={isSending}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid var(--q-color-ink-200)',
              borderRadius: '24px',
              outline: 'none',
              fontSize: '0.9375rem'
            }}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            style={{
              background: 'var(--q-color-primary)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputText.trim() && !isSending ? 'pointer' : 'not-allowed',
              opacity: inputText.trim() && !isSending ? 1 : 0.6
            }}
          >
            <Send size={18} style={{ marginLeft: '2px' }} />
          </button>
        </form>
      </div>
    </div>
  );
}
