import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticatedUser, JwtAuthGuard, Roles, RolesGuard } from './auth';
import { CreatePushSubscriptionDto } from './dto';
import { NotificationsService } from './notifications.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list() {
    return this.notifications.listRecent();
  }

  @Get('stream')
  stream(@Req() request: AuthenticatedRequest, @Res() response: Response): void {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    response.write('retry: 5000\n\n');
    const remove = this.notifications.addStream(response);
    const heartbeat = setInterval(() => {
      if (!response.destroyed && !response.writableEnded) response.write(': heartbeat\n\n');
    }, 25_000);
    response.on('close', () => {
      clearInterval(heartbeat);
      remove();
    });
  }

  @Post('subscriptions')
  async subscribe(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreatePushSubscriptionDto,
  ): Promise<{ subscribed: true }> {
    await this.notifications.saveSubscription(request.user.id, body);
    return { subscribed: true };
  }
}
