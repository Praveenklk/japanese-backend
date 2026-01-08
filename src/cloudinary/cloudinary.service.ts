import { Injectable, InternalServerErrorException } from '@nestjs/common';
import cloudinary from './cloudinary.config';

@Injectable()
export class CloudinaryService {
  async uploadImage(
    fileBuffer: Buffer,
    folder = 'hiragana',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder },
        (error, result) => {
          if (error || !result) {
            return reject(
              new InternalServerErrorException(
                'Cloudinary upload failed',
              ),
            );
          }

          resolve(result.secure_url);
        },
      ).end(fileBuffer);
    });
  }
}
