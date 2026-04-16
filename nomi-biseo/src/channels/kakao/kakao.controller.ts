import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { IncomingMessage } from '../interfaces';
import { ChannelGatewayService } from '../channel-gateway.service';

// KakaoTalk OpenBuilder Skill Request shape
interface KakaoSkillRequest {
    userRequest: {
        user: { id: string };
        utterance: string;
    };
}

@Controller('webhook')
export class KakaoController {
    constructor(private readonly gateway: ChannelGatewayService) { }

    @Post('kakao')
    @HttpCode(200)
    async handleSkill(@Body() body: KakaoSkillRequest) {
        const incoming: IncomingMessage = {
            channelType: 'kakao',
            channelUserId: body.userRequest.user.id,
            text: body.userRequest.utterance,
            rawEvent: body,
            timestamp: new Date(),
        };

        const result = await this.gateway.handleIncoming(incoming);

        // KakaoTalk Skill Response (v2.0) — required shape
        return {
            version: '2.0',
            template: {
                outputs: [
                    { simpleText: { text: result.response } },
                ],
            },
        };
    }
}