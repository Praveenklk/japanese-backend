// src/notifications/telegram.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;
  private readonly chatId = process.env.TELEGRAM_CHAT_ID;

  async send(message: string) {
    if (!this.token || !this.chatId) {
      this.logger.warn('Telegram bot token or chat ID not configured');
      return { ok: false, error: 'Telegram not configured' };
    }

    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;

    try {
      const res = await axios.post(url, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });

      return res.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to send Telegram message',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // ✅ Axios-based sendPhoto (no bot instance needed)
  async sendPhoto(photoUrl: string, caption?: string) {
    if (!this.token || !this.chatId) {
      this.logger.warn('Telegram bot token or chat ID not configured');
      return { ok: false, error: 'Telegram not configured' };
    }

    const url = `https://api.telegram.org/bot${this.token}/sendPhoto`;

    try {
      const res = await axios.post(url, {
        chat_id: this.chatId,
        photo: photoUrl,       // public image URL
        caption: caption || '',
        parse_mode: 'HTML',
      });

      return res.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to send Telegram photo',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }
}
