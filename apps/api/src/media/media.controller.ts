import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { IsNotEmpty, IsString } from 'class-validator';
import { Public } from '../auth';
import { MediaService } from './media.service';

export class UploadMediaDto {
  @IsString()
  @IsNotEmpty()
  image: string;
}

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Public()
  @Post('upload')
  async uploadPhoto(@Body() body: UploadMediaDto) {
    if (!body?.image) {
      throw new BadRequestException('Fotoğraf verisi (base64) zorunludur.');
    }
    const url = await this.mediaService.saveBase64Image(body.image);
    return { url, success: true };
  }

  @Public()
  @Get(':filename')
  @Header('Cache-Control', 'public, max-age=604800, immutable')
  getPhoto(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const { filePath, mimeType } = this.mediaService.getFilePath(filename);
    res.set({ 'Content-Type': mimeType });
    const fileStream = createReadStream(filePath);
    return new StreamableFile(fileStream);
  }
}
