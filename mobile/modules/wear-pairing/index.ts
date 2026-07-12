import { requireOptionalNativeModule } from 'expo-modules-core';

export type WearNode = {
    id: string;
    displayName: string;
    isNearby: boolean;
};

export type WearPairingMessage = {
    id: string;
    nodeId: string;
    path: string;
    payload: string;
    receivedAt: number;
};

type CalibrateWearPairingModule = {
    getPairingNodes(): Promise<WearNode[]>;
    sendMessage(nodeId: string, path: string, payload: string): Promise<number>;
    listMessages(): WearPairingMessage[];
    acknowledgeMessages(messageIds: string[]): void;
};

export default requireOptionalNativeModule<CalibrateWearPairingModule>('CalibrateWearPairing');
