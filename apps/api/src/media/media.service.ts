import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class MediaService {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Base64 formatındaki (data:image/...) fotoğrafı diske kaydeder ve erişim URL'sini döner.
   * Eğer girdi zaten bir HTTP/API URL'si ise dokunmadan geri döner.
   */
  async saveBase64Image(dataUrl: string): Promise<string> {
    if (!dataUrl || typeof dataUrl !== 'string') {
      return dataUrl;
    }

    // Zaten kaydedilmiş bir medya URL'si ise işlem yapma
    if (dataUrl.startsWith('/api/media/') || dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
      return dataUrl;
    }

    const matches = dataUrl.match(/^data:([A-Za-z0-9_./+-]+);base64,(.+)$/s);
    if (!matches || matches.length !== 3) {
      throw new BadRequestException('Geçersiz görsel formatı. "data:image/...;base64,..." bekleniyor.');
    }

    const mimeType = matches[1].toLowerCase();
    const base64Data = matches[2];
    const extension = ALLOWED_MIME_TYPES[mimeType];

    if (!extension) {
      throw new BadRequestException(
        `Desteklenmeyen görsel formatı (${mimeType}). Yalnızca JPEG, PNG veya WEBP kabul edilir.`,
      );
    }

    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Yüklenen fotoğraf boyutu 5 MB sınırını aşamaz.');
    }

    const filename = `${randomUUID()}${extension}`;
    const targetPath = path.join(this.uploadDir, filename);

    await fs.promises.writeFile(targetPath, buffer);

    const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, '');
    return publicBase ? `${publicBase}/${filename}` : `/api/media/${filename}`;
  }

  getFilePath(filename: string): { filePath: string; mimeType: string } {
    const safeName = path.basename(filename);
    if (safeName !== filename) {
      throw new BadRequestException('Geçersiz dosya adı.');
    }

    const ext = path.extname(safeName).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';

    const fullPath = path.join(this.uploadDir, safeName);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Fotoğraf bulunamadı.');
    }

    return { filePath: fullPath, mimeType };
  }
}
