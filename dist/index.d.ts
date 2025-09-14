export declare class Emulator {
    memory: Uint8Array;
    V: Uint8Array;
    PC: number;
    keyStatus: {
        [key: string]: boolean;
    };
    waitingForKeyPress: null | number;
    keyJustPressed: null | string;
    private registerI;
    private stack;
    private delayTimer;
    private soundTimer;
    private canvasCtx;
    private canvasBuffer;
    private loop;
    private audioContext;
    private audioBuffer;
    private isMuted;
    constructor(canvasCtx: CanvasRenderingContext2D);
    loadSprites(): void;
    reset(): void;
    fetchOpCode(): {
        opcode: number;
        firstNibble: number;
        X: number;
        Y: number;
        N: number;
        NN: number;
        NNN: number;
        VX: number | undefined;
        VY: number | undefined;
    };
    decodeAndExecuteOpCode(args: {
        opcode: number;
        firstNibble: number;
        X: number;
        Y: number;
        N: number;
        NN: number;
        NNN: number;
        VX: number;
        VY: number;
    }): void;
    initAudio(): Promise<void>;
    soundBeep(): void;
    toggleMute(): boolean;
    drawGraphics(): void;
    loadBuffer(buffer: Uint8Array): void;
    start(): void;
    stop(): void;
}
//# sourceMappingURL=index.d.ts.map