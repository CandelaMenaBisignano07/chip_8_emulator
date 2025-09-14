import { fontset, keyMap, keyMapReverse } from './utils.js';

export class Emulator {

    memory: Uint8Array;
    V: Uint8Array;
    PC: number;
    keyStatus: { [key: string]: boolean };
    waitingForKeyPress: null | number;
    keyJustPressed: null | string;
    private registerI: number;
    private stack: Array<number>;
    private delayTimer: number;
    private soundTimer: number;
    private canvasCtx: CanvasRenderingContext2D;
    private canvasBuffer: Uint8ClampedArray<ArrayBufferLike>;
    private loop: null | NodeJS.Timeout
    private audioContext: AudioContext | null = null;
    private audioBuffer: AudioBuffer | null = null;
    private isMuted: boolean = false;

    constructor(canvasCtx: CanvasRenderingContext2D) {
        this.memory = new Uint8Array(4096);
        this.V = new Uint8Array([
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000,
            0x000
        ])
        this.registerI = 0; 
        this.PC = 0x200;
        this.stack = [];
        this.keyStatus = {
            '1': false, 
            '2': false,   
            '3': false, 
            '4': false, 
            'q': false, 
            'w': false, 
            'e': false, 
            'r': false, 
            'a': false, 
            's': false, 
            'd': false, 
            'f': false, 
            'z': false, 
            'x': false, 
            'c': false, 
            'v': false  
        };
        this.delayTimer = 0;
        this.soundTimer = 0;
        this.canvasCtx = canvasCtx;
        this.canvasBuffer = new Uint8ClampedArray(64 * 32 * 4);
        this.waitingForKeyPress = null;
        this.keyJustPressed = null;
        this.loop = null;
        this.initAudio();
    }
    loadSprites() {
        for (let i = 0; i < fontset.length; i++) {
            const fontStartAddress = 0x050 + (i * 5);
            const sprite = fontset[i];
            if (sprite) {
                for (let j = 0; j < sprite.length; j++) {
                    this.memory[fontStartAddress + j] = sprite[j] ?? 0;
                }
            }
        }
    }

    reset() {
        this.memory.fill(0)
        this.V.fill(0)
        this.registerI = 0
        this.PC = 0x200
        this.stack = []
        this.delayTimer = 0
        this.soundTimer = 0
        this.canvasBuffer.fill(0)
        Object.keys(this.keyStatus).forEach(key => {
            this.keyStatus[key] = false;
        })
        this.loadSprites()
    }

    public fetchOpCode() {
        const opcode = ((this.memory[this.PC] ?? 0) << 8) | (this.memory[this.PC + 1] ?? 0)
        const firstNibble = (opcode & 0xF000) >> 12
        const X = (opcode & 0x0F00) >> 8 
        const Y = (opcode & 0x00F0) >> 4
        const N = (opcode & 0x000F)
        const NN = (opcode & 0x00FF)
        const NNN = (opcode & 0x0FFF)
        const VX = this.V[X];
        const VY = this.V[Y];
        return { opcode, firstNibble, X, Y, N, NN, NNN, VX, VY }
    }

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
    }) {
        const { opcode, firstNibble, X, Y, N, NN, NNN, VX, VY } = args;
        switch (firstNibble) {
            case 0:
                switch (opcode) {
                    case 0x00E0:
                        this.canvasBuffer.fill(0);
                        break;
                    case 0x00EE:
                        const lastAdress = this.stack.pop() as number;
                        this.PC = lastAdress;
                }
                this.PC += 2
                break;
            case 1:
                this.PC = NNN;
                break;
            case 2:
                this.stack.push(this.PC);
                this.PC = NNN;
                break;
            case 3:
                if (VX === NN) {
                    this.PC += 4
                } else {
                    this.PC += 2
                }
                break;
            case 4:
                if (VX != NN) {
                    this.PC += 4
                } else {
                    this.PC += 2
                }
                break;
            case 5:
                if (VX === VY) {
                    this.PC += 4
                } else {
                    this.PC += 2
                }
                break;
            case 6:
                this.V[X] = NN;
                this.PC += 2;
                break;
            case 7:
                this.V[X] = ((this.V[X] ?? 0) + NN) & 0xFF;
                this.PC += 2;
                break;
            case 8:
                switch (N) {
                    case 0:
                        this.V[X] = VY;
                        break;
                    case 1:
                        this.V[X] = VX | VY
                        break;
                    case 2:
                        this.V[X] = VX & VY
                        break;
                    case 3:
                        this.V[X] = VX ^ VY;
                        break;
                    case 4:
                        this.V[X] = (VX + VY);
                        if ((VX + VY) > 255) {
                            this.V[0xF] = 1
                        } else {
                            this.V[0xF] = 0
                        }
                        break;
                    case 5:
                        this.V[X] = VX - VY
                        if (VX >= VY) {
                            this.V[0xF] = 1
                        } else {
                            this.V[0xF] = 0
                        }
                        break;
                    case 6:
                        this.V[X] = VY
                        const shiftedOutBit = this.V[X] & 0x1
                        this.V[X] = this.V[X] >> 1
                        this.V[0xF] = shiftedOutBit
                        break;
                    case 7:
                        this.V[X] = VY - VX
                        if (VY >= VX) {
                            this.V[0xF] = 1
                        } else {
                            this.V[0xF] = 0
                        }
                        break;
                    case 0xE:
                        this.V[X] = VY
                        const shiftedOutBit2 = (this.V[X] & 0x80 /* mascara para quedar solo con el bit significativo, ya que es 10000000 en binario. */) >> 7
                        this.V[X] = this.V[X] << 1
                        this.V[0xF] = shiftedOutBit2
                        break;
                }
                this.PC += 2;
                break;
            case 9:
                if (VX != VY) {
                    this.PC += 4
                } else {
                    this.PC += 2
                }
                break;
            case 0xA:
                this.registerI = NNN;
                this.PC += 2;
                break;
            case 0xB:
                this.PC = NNN + (this.V[0] ?? 0);
                break;
            case 0xC:
                const randomByte = Math.floor(Math.random() * 256)
                this.V[X] = randomByte & NN;
                this.PC += 2;
                break;
            case 0xD:
                // modularizamos las coordenadas para "wrappear" los pixeles desbordados en la pantalla.
                const coordinateX = (VX ?? 0) % 64
                const coordinateY = (VY ?? 0) % 32
                for (let row = 0; row < N; row++) {
                    const currSpriteByte = this.memory[this.registerI + row] ?? 0 
                    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
                        const bit = (currSpriteByte >> (7 - bitIndex)) & 1;
                        //000001
                        const pixelX = coordinateX + bitIndex;
                        const pixelY = coordinateY + row;
                        const index = (pixelY * 64 + pixelX) * 4;
                        if (pixelX >= 64) continue;
                        if (pixelY >= 32) continue;
                        if (bit) {
                            if ((this.canvasBuffer[index] ?? 0) > 0) {
                                this.V[0xF] = 1;
                                this.canvasBuffer[index] = 0;
                                this.canvasBuffer[index + 1] = 0;
                                this.canvasBuffer[index + 2] = 0;
                                this.canvasBuffer[index + 3] = 255;
                            } else {
                                this.V[0xF] = 0

                                this.canvasBuffer[index] = 255;
                                this.canvasBuffer[index + 1] = 255;
                                this.canvasBuffer[index + 2] = 255;
                                this.canvasBuffer[index + 3] = 255;
                            }
                        }

                    }

                }
                this.PC += 2;
                break;
            case 0xE:
                const chipKey = keyMapReverse[(this.V[X] ?? 0)];
                if (!chipKey) break;
                switch (NN) {
                    case 0x009E:
                        if (this.keyStatus[chipKey]) {
                            this.PC += 2
                        }
                        break;
                    case 0x00A1:
                        if (!this.keyStatus[chipKey]) {
                            this.PC += 2
                        }
                        break;
                }
                this.PC += 2;
                break;
            case 0xF:
                switch (NN) {
                    case 0x0007:
                        this.V[X] = this.delayTimer;
                        this.PC += 2
                        break;
                    case 0x0015:
                        this.delayTimer = (this.V[X] ?? 0);
                        this.PC += 2
                        break;
                    case 0x0018:
                        this.soundTimer = (this.V[X] ?? 0);
                        this.PC += 2
                        break;
                    case 0x001E:
                        this.registerI += (this.V[X] ?? 0);
                        this.PC += 2
                        break;
                    case 0x000A:
                        // codigo para pasar pruebas de hatchling y release
                        if (this.waitingForKeyPress === null) {
                            this.waitingForKeyPress = X;
                            this.keyJustPressed = null;
                            return;
                        }
                        if (this.keyJustPressed === null) return;
                        const pressedEntry = Object.entries(this.keyStatus).find(([_, pressed]) => pressed);
                        if (pressedEntry) {
                            const [pressedKey] = pressedEntry;
                            this.V[this.waitingForKeyPress] = keyMap[pressedKey as keyof typeof keyMap];
                            this.waitingForKeyPress = null; 
                            this.PC += 2;
                        }
                        return;
                    case 0x0029:
                        this.registerI = 0x050 + ((this.V[X] ?? 0) * 5)
                        this.PC += 2
                        break;
                    case 0x0033:
                        this.memory[this.registerI] = Math.floor((this.V[X] ?? 0) / 100);
                        this.memory[this.registerI + 1] = Math.floor(((this.V[X] ?? 0) % 100) / 10);
                        this.memory[this.registerI + 2] = (this.V[X] ?? 0) % 10;
                        this.PC += 2;
                        break;
                    case 0x0055:
                        for (let i = 0; i <= X; i++) {
                            this.memory[this.registerI + i] = this.V[i] ?? 0;
                        }
                        this.PC += 2
                        break;
                    case 0x0065:
                        for (let i = 0; i <= X; i++) {
                            this.V[i] = this.memory[this.registerI + i] ?? 0;
                        }
                        this.PC += 2
                        break;
                }
                break;
        }
    }

    async initAudio() {
        try {
            this.audioContext = new AudioContext()
            const response = await fetch('assets/audio/8-bit-game-2-186976.mp3');
            const arrayBuffer = await response.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error('error al cargar el audio:', error);
        }
    }

    soundBeep() {
        if (this.isMuted || !this.audioContext || !this.audioBuffer) return;

        try {
            const source = this.audioContext.createBufferSource();
            source.buffer = this.audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();
        } catch (error) {
            console.error('error al reproducir sonido:', error);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }

    drawGraphics() {
        const imageData = this.canvasCtx.createImageData(64, 32);
        imageData.data.set(this.canvasBuffer);
        this.canvasCtx.putImageData(imageData, 0, 0);
    }
    loadBuffer(buffer: Uint8Array): void {
        try {
            // carga el contenido del rom memoria empezando desde 0x200
            for (let i = 0; i < buffer.length; i++) {
                this.memory[0x200 + i] = buffer[i] as number;
            }
        } catch (error) {
            console.error('error al cargar el rom en memoria:', error);
        }
    }


    start() {
        /**
         * 
         * frame: dibujo que se dibuja en la pantalla
         CPU HACE 2 COSAS EN PARALELO:
         1. ejecuta las instrucciones a cierta velocidad (ej chip 8 ejecutaba 500 insturcciones x seg.)
         2. actualiza timers y carga frames (o sea actualiza pantalla) a 60hz, o sea 60 veces por segundo, entonces si dividimos
         1000 ms(un segundo)/60 (veces que se actualizan en un segundo estas dos cosas) =16,67ms (cada este tiempo se actualizan ambos)
        
         pero estas dos cosas tienen que estar sincronizadas, por que sabemos que los frames se pintan en base a las instrucciones, y si ejecutamos mas instrucciones por segundo de las que deberiamos el juego iria como acelerado ya que las instrucciones se ejecutan antes de que se pinte el frame, pero si ejecutamos menos instruccionws que los frames por segundo entonces el juego iria lento.

         por esto dividimos las instrucciones por segundo por los frames por segundo, para poder sincronizar las instrucciones con cuantos frames se corren
         por segundo.

         entonces, con esto decimos que se deben ejecutar 8 instrucciones por ciclo, en las cuales se ejecuten el fetch, decode y execute y
         luego se pinte el frame en pantalla.
         instrucciones por frame
         const INSTR_PER_SECOND = 500; // como va a 500hz, signfica que tiene 500 instrucciones por segundo
         const FPS = 60; // FPS: frames per second, y en un segundo sabemos que tiene 60 frames
         const instrPerFrame = Math.floor(INSTR_PER_SECOND / FPS); // ≈8
         */
        for (let i = 0; i < 8; i++) {
            if (this.waitingForKeyPress !== null) break;
            const { opcode, firstNibble, X, Y, N, NN, NNN, VX, VY } = this.fetchOpCode();
            this.decodeAndExecuteOpCode({ opcode, firstNibble, X, Y, N, NN, NNN, VX: VX ?? 0, VY: VY ?? 0 });
        }
        if (this.delayTimer > 0) this.delayTimer--;
        if (this.soundTimer > 0) {
            this.soundTimer--;
            this.soundBeep();
            if (this.soundTimer === 0) console.log("PAUSE BEEP");
        }
        this.drawGraphics();
        this.loop = setTimeout(() => this.start(), 16);
    }
    stop() {
        if (this.loop !== null) {
            clearTimeout(this.loop);
            this.loop = null;
        }
    }
}

const canvas = document.getElementById("renderCanvas")

if (!canvas || !(canvas instanceof HTMLCanvasElement)) throw new Error("canvas not found")
const ctx = canvas.getContext("2d")

if (!ctx) throw new Error("no context")

const emulator = new Emulator(ctx);


document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (!Object.keys(emulator.keyStatus).includes(key)) return;

    e.preventDefault();
    e.stopPropagation();
    emulator.keyStatus[key] = true;
    if (emulator.waitingForKeyPress !== null && emulator.keyJustPressed === null) {
        emulator.keyJustPressed = key;
    }
});

document.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (!Object.keys(emulator.keyStatus).includes(key)) return;
    e.preventDefault();
    e.stopPropagation();
    emulator.keyStatus[key] = false;
    if (emulator.waitingForKeyPress !== null && emulator.keyJustPressed === key) {
        // codigo necesario para pasar las pruebas de release y hatchling.
        emulator.V[emulator.waitingForKeyPress] = keyMap[key as keyof typeof keyMap];
        emulator.waitingForKeyPress = null;
        emulator.keyJustPressed = null;
        emulator.PC += 2;
    }
});


let currRom: null | Uint8Array = null;
const romSelect = document.getElementById('romSelect')
if (romSelect) {
    romSelect.addEventListener('change', async function (event) {
        const selectedRom = (event.target as HTMLSelectElement).value
        if (!selectedRom) return;

        try {
            const response = await fetch(`assets/roms/${selectedRom}`);
            const arrayBuffer = await response.arrayBuffer();
            currRom = new Uint8Array(arrayBuffer);
            emulator.stop()
            emulator.reset();
            emulator.loadBuffer(currRom);
            emulator.start();
        } catch (error) {
            console.error('error al cargar rom:', error);
        }
    });
}

const resetBtn = document.getElementById('resetBtn')
if (resetBtn) {
    resetBtn.addEventListener('click', function () {
        if (currRom) {
            emulator.stop()
            emulator.reset();
            emulator.loadBuffer(currRom);
            emulator.start();
        }
    });
}
const muteBtn = document.getElementById('muteBtn')
if (muteBtn) {
    muteBtn.addEventListener('click', function () {
        const isMuted = emulator.toggleMute();
        muteBtn.textContent = isMuted ? '🔇' : '🔊';
    });
}