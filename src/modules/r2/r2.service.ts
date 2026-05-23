import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);

  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });

    this.logger.log('Cloudinary Service initialized');
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ url: string; key: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto', // handles pdf, doc, images, etc
          use_filename: true,
          unique_filename: true,
        },
        (error, result: UploadApiResponse) => {
          if (error) {
            this.logger.error(`Error uploading file to Cloudinary: ${error.message}`);
            return reject(error);
          }
          this.logger.log(`File uploaded successfully: ${result.secure_url}`);
          resolve({
            url: result.secure_url,
            key: result.public_id, // public_id is used to delete later
          });
        },
      );

      // Convert buffer to stream and pipe to cloudinary
      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(key, { resource_type: 'raw' });
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting file from Cloudinary: ${error.message}`, error.stack);
      throw error;
    }
  }
}