export type RequestType = 'chat' | 'simple_task' | 'workflow_task';

export interface ClassifiedRequest {
    type: RequestType;
    intent: string;
    confidence: number;
}

export interface ConversationContext {
    userId: string;
    channelUserId: string;
    channelType: string;
    replyToken?: string;
    message: string;
    timestamp: Date;
}

export interface ConversationResult {
    response: string;
    requestType: RequestType;
}