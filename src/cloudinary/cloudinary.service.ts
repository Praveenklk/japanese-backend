import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import cloudinary from './cloudinary.config';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  /**
   * Upload any file (image/audio) to Cloudinary
   */
  async uploadFile(
    fileBuffer: Buffer,
    folder = 'anki',
    filename?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto', // ✅ supports images + audio
          public_id: filename,  // optional: custom filename
          overwrite: false,     // ✅ avoid accidental overwrite
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload failed', error);
            return reject(
              new InternalServerErrorException('Cloudinary upload failed'),
            );
          }

          resolve(result.secure_url);
        },
      ).end(fileBuffer);
    });
  }

  /**
   * Optional: delete file from Cloudinary (useful when user deletes a deck)
   */
  async deleteFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: 'auto',
      });
    } catch (err) {
      this.logger.error('Cloudinary delete failed', err);
      throw new InternalServerErrorException('Cloudinary delete failed');
    }
  }
}
