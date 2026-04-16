
export type ChannelType = 'line' | 'kakao';

export interface IncomingMessage {
    channelType: ChannelType;
    channelUserId: string;
    text: string;
    replyToken?: string;
    rawEvent?: unknown;
    timestamp: Date;
}

export interface OutgoingMessage {
    channelType: ChannelType;
    channelUserId: string;
    text: string;
    replyToken?: string;
}

export interface IChannelAdapter {
    readonly channelType: ChannelType;
    sendMessage(message: OutgoingMessage): Promise<void>;
    validateWebhook?(request: unknown): boolean;
}