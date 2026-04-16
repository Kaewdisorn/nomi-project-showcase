import { Injectable } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { IChannelAdapter, OutgoingMessage } from '../interfaces';


@Injectable()
export class KakaoAdapter implements IChannelAdapter {
    readonly channelType = 'kakao' as const;

    constructor(
        @InjectPinoLogger(KakaoAdapter.name)
        private readonly logger: PinoLogger,
    ) { }

    // KakaoTalk responses are returned as the HTTP response body.
    // The controller owns delivery; this method is a no-op for kakao.
    async sendMessage(message: OutgoingMessage): Promise<void> {
        this.logger.debug({
            channelUserId: message.channelUserId,
            msg: 'KakaoTalk response queued for HTTP delivery',
        });
    }
}
